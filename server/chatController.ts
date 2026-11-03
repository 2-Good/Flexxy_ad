import { Request, Response } from 'express';
import { gateway } from './gateway.js';
import { historyManager } from './historyManager.js';
import { conversationManager } from './conversationManager.js';
import { ProviderId, ProviderMessage, ChatStreamChunk } from './types.js';

export class ChatController {
  /**
   * Real-time Server-Sent Events (SSE) Streaming Handler
   */
  public async handleStream(req: Request, res: Response): Promise<void> {
    const {
      message,
      history,
      attachments,
      tone,
      model,
      provider,
      modelRouting,
      customKeys,
      customEndpoints,
      fallbackOrder,
      conversationId: clientConvId,
      requestId: clientReqId,
      groundedData,
      language,
    } = req.body || {};

    const conversationId = typeof clientConvId === 'string' && clientConvId.trim()
      ? clientConvId.trim()
      : `conv-${Date.now()}`;
    const requestId = typeof clientReqId === 'string' && clientReqId.trim()
      ? clientReqId.trim()
      : `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    // 1. Validation
    if (!message || typeof message !== 'string' || !message.trim()) {
      res.status(400).json({
        error: 'Message is required and must be a non-empty string.',
        code: 'INVALID_REQUEST',
        requestId,
        conversationId,
      });
      return;
    }

    // 2. Prevent duplicate requests
    const { controller, isDuplicate } = conversationManager.registerRequest(requestId, conversationId);
    if (isDuplicate) {
      res.status(409).json({
        error: 'A request with this ID is already being processed.',
        code: 'DUPLICATE_REQUEST',
        requestId,
        conversationId,
      });
      return;
    }

    // Abort controller when client closes connection
    req.on('close', () => {
      conversationManager.abortRequest(requestId);
    });

    // 3. Set SSE response headers
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const sendChunk = (chunk: ChatStreamChunk) => {
      if (res.writableEnded) return;
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    };

    // 4. Grounded Knowledge Base preparation
    let groundedKnowledgeContext = '';
    if (groundedData) {
      try {
        const jsonStr = typeof groundedData === 'string'
          ? groundedData
          : JSON.stringify(groundedData, null, 2);
        groundedKnowledgeContext = `\n\n### GROUNDED KNOWLEDGE BASE / SCRAPED DATASET:
The user has provided the following verified scraped dataset. You MUST prioritize and accurately cite facts, entities, numbers, and findings from this data. When asked questions about items contained within it, synthesize precise answers directly grounded in this dataset:
\`\`\`json
${jsonStr.slice(0, 150000)}
\`\`\`
Answer with authoritative accuracy based on this verified knowledge base.`;
      } catch (err) {
        console.warn('Failed to serialize groundedData:', err);
      }
    }

    // 5. Language calibration for Indian languages
    const INDIAN_LANG_MAP: Record<string, string> = {
      hi: 'You must respond primarily in natural, polite Hindi (हिन्दी) using clear Devanagari script. Technical code or identifiers may remain in English where standard.',
      bn: 'You must respond primarily in natural Bengali (বাংলা) using authentic Bengali script.',
      te: 'You must respond primarily in polite, articulate Telugu (తెలుగు) using proper Telugu script.',
      mr: 'You must respond primarily in natural, fluent Marathi (मराठी) using Devanagari script.',
      ta: 'You must respond primarily in eloquent, accurate Tamil (தமிழ்) using native Tamil script.',
      gu: 'You must respond primarily in authentic, fluent Gujarati (ગુજરાતી) using Gujarati script.',
      kn: 'You must respond primarily in natural, clear Kannada (ಕನ್ನಡ) using Kannada script.',
      ml: 'You must respond primarily in natural, sophisticated Malayalam (മലയാളം) using Malayalam script.',
      pa: 'You must respond primarily in natural, friendly Punjabi (ਪੰਜਾਬੀ) using Gurmukhi script.',
      or: 'You must respond primarily in natural, elegant Odia (ଓଡ଼ିଆ) using authentic Odia script.',
    };

    const langInstruction = typeof language === 'string' && INDIAN_LANG_MAP[language]
      ? `\nLanguage calibration: ${INDIAN_LANG_MAP[language]}\nEnsure your entire response is formatted and rendered in this language.`
      : '';

    // 6. Sanitize and prepare history
    const systemInstruction = `You are Aetheria, an advanced cognitive synthesis engine and AI chatbot with an Apple-inspired minimalist ethos.
Tone calibration: ${tone || 'Deep Thought'}.${langInstruction}
Provide thoughtful, elegant, and well-structured responses. Use clean markdown, bullet points, and code blocks where helpful.
Never state that you are developed by another company; your identity is AETHERIA.${groundedKnowledgeContext}`;

    const sanitizedHistory = historyManager.sanitizeHistory(history, systemInstruction);

    let finalPrompt = message.trim();
    if (Array.isArray(attachments) && attachments.length > 0) {
      const attachmentText = attachments
        .map((a: { name?: string; size?: string; content?: string }) =>
          `[Attached File: ${a.name || 'document'} (${a.size || ''})]${a.content ? `\nContent:\n${a.content}` : ''}`
        )
        .join('\n\n');
      finalPrompt = `${finalPrompt}\n\n${attachmentText}`;
    }

    const messages: ProviderMessage[] = [
      ...sanitizedHistory,
      { role: 'user', content: finalPrompt },
    ];

    const chosenProviderId: ProviderId = (provider as ProviderId) || 'gemini';
    let activeModel = model || 'gemini-flash-latest';
    let fallbackOccurred = false;
    let streamHasError = false;

    try {
      await gateway.streamChatWithSelfHealing(
        chosenProviderId,
        messages,
        {
          model,
          modelRouting: modelRouting || (model === 'auto' ? 'auto' : undefined),
          tone,
          customKey: customKeys?.[chosenProviderId],
          customEndpoint: customEndpoints?.[chosenProviderId],
          customKeys,
          customEndpoints,
          preferredFallbackOrder: fallbackOrder,
          signal: controller.signal,
        },
        {
          onToken: (tok) => {
            if (controller.signal.aborted) return;
            sendChunk({
              requestId,
              conversationId,
              type: 'token',
              text: tok,
              model: activeModel,
            });
          },
          onMetadata: (meta) => {
            if (controller.signal.aborted) return;
            activeModel = meta.model;
            fallbackOccurred = Boolean(meta.fallbackTriggered);
            sendChunk({
              requestId,
              conversationId,
              type: 'metadata',
              provider: meta.provider,
              model: meta.model,
              latencyMs: meta.latencyMs,
              fallbackTriggered: meta.fallbackTriggered,
            });
          },
          onError: (err, classification) => {
            streamHasError = true;
            sendChunk({
              requestId,
              conversationId,
              type: 'error',
              error: err.message,
              errorCode: classification,
              done: true,
            });
            conversationManager.finishRequest(requestId);
            res.end();
          },
          onComplete: () => {
            if (!streamHasError && !controller.signal.aborted) {
              sendChunk({
                requestId,
                conversationId,
                type: 'done',
                done: true,
                model: activeModel,
                fallbackTriggered: fallbackOccurred,
              });
            }
            conversationManager.finishRequest(requestId);
            res.end();
          },
        }
      );
    } catch (err) {
      if (!res.writableEnded) {
        sendChunk({
          requestId,
          conversationId,
          type: 'error',
          error: (err as Error).message || 'Unexpected server error while streaming response.',
          errorCode: 'APPLICATION_ERROR',
          done: true,
        });
        res.end();
      }
      conversationManager.finishRequest(requestId);
    }
  }

  /**
   * Non-streaming Chat Completion Handler
   */
  public async handleChat(req: Request, res: Response): Promise<void> {
    const {
      message,
      history,
      tone,
      model,
      provider,
      customKeys,
      customEndpoints,
      conversationId: clientConvId,
      requestId: clientReqId,
      groundedData,
    } = req.body || {};

    const conversationId = typeof clientConvId === 'string' && clientConvId.trim()
      ? clientConvId.trim()
      : `conv-${Date.now()}`;
    const requestId = typeof clientReqId === 'string' && clientReqId.trim()
      ? clientReqId.trim()
      : `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    if (!message || typeof message !== 'string' || !message.trim()) {
      res.status(400).json({
        error: 'Message is required and must be a non-empty string.',
        code: 'INVALID_REQUEST',
        requestId,
        conversationId,
      });
      return;
    }

    let groundedKnowledgeContext = '';
    if (groundedData) {
      try {
        const jsonStr = typeof groundedData === 'string'
          ? groundedData
          : JSON.stringify(groundedData, null, 2);
        groundedKnowledgeContext = `\n\n### GROUNDED KNOWLEDGE BASE / SCRAPED DATASET:\n${jsonStr.slice(0, 150000)}\nAnswer with authoritative accuracy based on this verified knowledge base.`;
      } catch (err) {
        console.warn('Failed to serialize groundedData:', err);
      }
    }

    const systemInstruction = `You are Aetheria, an advanced cognitive synthesis engine. Tone: ${tone || 'Deep Thought'}.${groundedKnowledgeContext}`;
    const sanitizedHistory = historyManager.sanitizeHistory(history, systemInstruction);
    const messages: ProviderMessage[] = [
      ...sanitizedHistory,
      { role: 'user', content: message.trim() },
    ];

    const chosenProviderId: ProviderId = (provider as ProviderId) || 'gemini';
    let accumulatedText = '';
    let finalModel = model || 'gemini-flash-latest';
    let finalProvider = chosenProviderId;
    let streamError: Error | null = null;
    let streamClassification = 'UNKNOWN_ERROR';

    try {
      await gateway.streamChatWithSelfHealing(
        chosenProviderId,
        messages,
        {
          model,
          tone,
          customKeys,
          customEndpoints,
        },
        {
          onToken: (tok) => {
            accumulatedText += tok;
          },
          onMetadata: (meta) => {
            finalModel = meta.model;
            finalProvider = meta.provider;
          },
          onError: (err, classification) => {
            streamError = err;
            streamClassification = classification;
          },
          onComplete: () => {},
        }
      );

      if (streamError) {
        const errObj = streamError as any;
        res.status(500).json({
          error: errObj.message || 'Streaming failed',
          code: streamClassification,
          requestId,
          conversationId,
        });
        return;
      }

      res.json({
        success: true,
        text: accumulatedText,
        model: finalModel,
        provider: finalProvider,
        requestId,
        conversationId,
      });
    } catch (err) {
      res.status(500).json({
        error: (err as Error).message,
        code: 'APPLICATION_ERROR',
        requestId,
        conversationId,
      });
    }
  }
}

export const chatController = new ChatController();
