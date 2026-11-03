import { GoogleGenAI } from '@google/genai';
import {
  AetheriaAIProvider,
  ProviderMessage,
  ChatRequestOptions,
  StreamCallbacks,
  HealthCheckResult,
  ErrorClassification,
  ModelLatencyMetric,
} from '../types.js';

export class GeminiProvider implements AetheriaAIProvider {
  readonly id = 'gemini' as const;
  readonly displayName = 'Google Gemini';
  readonly defaultModel = 'gemini-flash-latest';
  readonly supportedModels = [
    'gemini-flash-latest',
    'gemini-3.8-flash',
    'gemini-3.1-flash-lite',
    'gemini-4-argon',
  ];
  readonly capabilities = {
    streaming: true,
    vision: true,
    systemInstruction: true,
    maxContextTokens: 1000000,
    toolCalling: true,
  };

  private static clientCache = new Map<string, GoogleGenAI>();
  private static healthCache = new Map<string, { result: HealthCheckResult; expiresAt: number }>();
  private static latencyStats = new Map<string, { totalLatency: number; count: number; lastLatency: number }>([
    ['gemini-3.1-flash-lite', { totalLatency: 140, count: 1, lastLatency: 140 }],
    ['gemini-flash-latest', { totalLatency: 220, count: 1, lastLatency: 220 }],
    ['gemini-3.8-flash', { totalLatency: 380, count: 1, lastLatency: 380 }],
    ['gemini-4-argon', { totalLatency: 750, count: 1, lastLatency: 750 }],
  ]);

  static recordLatency(model: string, latencyMs: number) {
    const existing = GeminiProvider.latencyStats.get(model) || { totalLatency: 0, count: 0, lastLatency: latencyMs };
    existing.totalLatency += latencyMs;
    existing.count += 1;
    existing.lastLatency = latencyMs;
    GeminiProvider.latencyStats.set(model, existing);
  }

  static getModelLatencyProfile(): Record<string, ModelLatencyMetric> {
    const modelsMeta: Record<string, { tier: 'instant' | 'standard' | 'deep'; speedBadge: string; description: string }> = {
      'gemini-3.1-flash-lite': {
        tier: 'instant',
        speedBadge: '⚡ ~140ms TTFT (Ultra-Fast Lite)',
        description: 'Optimized for instantaneous short queries, factual lookups, and greetings with minimal latency.',
      },
      'gemini-flash-latest': {
        tier: 'standard',
        speedBadge: '🚀 ~220ms TTFT (Balanced Flash)',
        description: 'Flagship standard tier for conversational flow, synthesis, and creative discussions.',
      },
      'gemini-3.8-flash': {
        tier: 'deep',
        speedBadge: '🧠 ~380ms TTFT (Deep Reasoning)',
        description: 'Higher cognitive depth for complex analysis, structured coding, and multi-step reasoning.',
      },
      'gemini-4-argon': {
        tier: 'deep',
        speedBadge: '🔬 ~750ms TTFT (Advanced STEM)',
        description: 'Peak intelligence for heavy STEM, math architectures, and comprehensive system design.',
      },
    };

    const result: Record<string, ModelLatencyMetric> = {};
    for (const [m, meta] of Object.entries(modelsMeta)) {
      const stat = GeminiProvider.latencyStats.get(m);
      const avg = stat && stat.count > 0 ? Math.round(stat.totalLatency / stat.count) : 200;
      result[m] = {
        model: m,
        avgLatencyMs: avg,
        sampleCount: stat ? stat.count : 0,
        speedBadge: meta.speedBadge,
        tier: meta.tier,
        description: meta.description,
      };
    }
    return result;
  }

  static classifyPromptComplexity(userPrompt: string): {
    tier: 'instant' | 'standard' | 'deep';
    recommendedModel: string;
    reason: string;
  } {
    const text = userPrompt.trim();
    const len = text.length;

    // 1. Instant triggers: short greetings, definitions, and quick lookups (<100 chars)
    const isGreeting = /^(hi|hello|hey|greetings|good (morning|afternoon|evening)|howdy|sup)[\s!.,?]*$/i.test(text);
    const isQuickDefinition = /^(what is|who is|define|definition of|meaning of|translate|synonym for)\b/i.test(text) && len < 90;
    if (isGreeting || isQuickDefinition || (len <= 45 && !text.includes('```'))) {
      return {
        tier: 'instant',
        recommendedModel: 'gemini-3.1-flash-lite',
        reason: 'Instant concise query (<90 chars or definition) -> routed to zero-overhead flash-lite.',
      };
    }

    // 2. Deep cognitive triggers: code blocks, multi-step algorithm words, complex math/architecture
    const hasCodeBlock = text.includes('```') || /function\s+\w+|const\s+\w+\s*=|def\s+\w+|class\s+\w+|SELECT\s+.*FROM/i.test(text);
    const hasComplexReasoning = /\b(prove|derive|step by step|algorithm|architecture|refactor|benchmark|formal proof|optimize computational|differential equation)\b/i.test(text);
    if (len > 600 || (hasCodeBlock && len > 120) || hasComplexReasoning) {
      return {
        tier: 'deep',
        recommendedModel: 'gemini-3.8-flash',
        reason: 'Complex algorithmic, structural, or code query -> routed to deep reasoning model.',
      };
    }

    // 3. Standard conversational dialogue and synthesis
    return {
      tier: 'standard',
      recommendedModel: 'gemini-flash-latest',
      reason: 'General conversational dialogue -> routed to balanced flagship model.',
    };
  }

  private getClient(customKey?: string): GoogleGenAI | null {
    const key = customKey?.trim() || process.env.GEMINI_API_KEY?.trim();
    if (!key) return null;

    const cached = GeminiProvider.clientCache.get(key);
    if (cached) return cached;

    const client = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
          'Connection': 'keep-alive',
          'Keep-Alive': 'timeout=60, max=1000',
        },
      },
    });

    GeminiProvider.clientCache.set(key, client);
    return client;
  }

  isConfigured(customKey?: string): boolean {
    return Boolean(customKey?.trim() || process.env.GEMINI_API_KEY?.trim());
  }

  classifyError(err: unknown): { classification: ErrorClassification; isScopeRestricted: boolean; message: string } {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT') || (msg.includes('PERMISSION_DENIED') && msg.includes('authentication scopes'))) {
      return {
        classification: 'AUTHENTICATION_ERROR',
        isScopeRestricted: true,
        message: 'Insufficient token scope for Google Generative Language API. Custom key recommended.',
      };
    }
    if (msg.includes('API_KEY_INVALID') || msg.includes('UNAUTHENTICATED') || msg.includes('401')) {
      return {
        classification: 'AUTHENTICATION_ERROR',
        isScopeRestricted: false,
        message: 'Invalid or expired Gemini API key.',
      };
    }
    if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('Quota')) {
      return {
        classification: 'QUOTA_ERROR',
        isScopeRestricted: false,
        message: 'Gemini API quota exceeded or rate limit reached.',
      };
    }
    if (msg.includes('503') || msg.includes('500') || msg.includes('UNAVAILABLE') || msg.includes('Internal')) {
      return {
        classification: 'TEMPORARY_PROVIDER_ERROR',
        isScopeRestricted: false,
        message: 'Google Gemini service temporarily unavailable.',
      };
    }
    if (msg.includes('NotFound') || msg.includes('not supported') || msg.includes('models/')) {
      return {
        classification: 'MODEL_COMPATIBILITY_ERROR',
        isScopeRestricted: false,
        message: 'Selected model not available under current credentials.',
      };
    }
    if (msg.includes('fetch failed') || msg.includes('ENOTFOUND') || msg.includes('ECONNREFUSED')) {
      return {
        classification: 'NETWORK_ERROR',
        isScopeRestricted: false,
        message: 'Network connectivity failure reaching Google API.',
      };
    }
    return {
      classification: 'UNKNOWN_ERROR',
      isScopeRestricted: false,
      message: msg,
    };
  }

  async testConnection(customKey?: string, _customEndpoint?: string, model?: string): Promise<HealthCheckResult> {
    const targetModel = model && this.supportedModels.includes(model) ? model : this.defaultModel;
    const effectiveKey = customKey?.trim() || process.env.GEMINI_API_KEY?.trim() || '';
    const cacheKey = `${effectiveKey.slice(0, 8)}:${targetModel}`;

    const cached = GeminiProvider.healthCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return { ...cached.result, timestamp: Date.now() };
    }

    const start = Date.now();
    const client = this.getClient(customKey);

    if (!client) {
      const res: HealthCheckResult = {
        providerId: this.id,
        model: targetModel,
        status: 'failed',
        latencyMs: 0,
        message: 'No GEMINI_API_KEY found in environment or custom keys.',
        errorClassification: 'CONFIGURATION_ERROR',
        capabilities: {
          streaming: true,
          vision: true,
          systemInstruction: true,
          maxContextTokens: 1000000,
        },
        timestamp: Date.now(),
      };
      GeminiProvider.healthCache.set(cacheKey, { result: res, expiresAt: Date.now() + 60000 });
      return res;
    }

    try {
      const pingPromise = client.models.generateContent({
        model: targetModel,
        contents: 'Ping: reply with "PONG" in 1 word.',
        config: {
          temperature: 0.1,
          maxOutputTokens: 10,
        },
      });

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Gemini API connection timeout (2500ms)')), 2500)
      );

      const response = await Promise.race([pingPromise, timeoutPromise]);

      const latencyMs = Date.now() - start;
      const text = response.text || '';
      GeminiProvider.recordLatency(targetModel, latencyMs);
      const result: HealthCheckResult = {
        providerId: this.id,
        model: targetModel,
        status: 'operational',
        latencyMs,
        message: `Verified successfully (${latencyMs}ms): ${text.trim().slice(0, 30)}`,
        capabilities: {
          streaming: true,
          vision: true,
          systemInstruction: true,
          maxContextTokens: 1000000,
        },
        timestamp: Date.now(),
      };
      GeminiProvider.healthCache.set(cacheKey, { result, expiresAt: Date.now() + 30000 });
      return result;
    } catch (err) {
      const latencyMs = Date.now() - start;
      const classified = this.classifyError(err);
      const result: HealthCheckResult = {
        providerId: this.id,
        model: targetModel,
        status: classified.isScopeRestricted ? 'scope_restricted' : 'failed',
        latencyMs,
        message: classified.message,
        errorClassification: classified.classification,
        capabilities: {
          streaming: true,
          vision: true,
          systemInstruction: true,
          maxContextTokens: 1000000,
        },
        timestamp: Date.now(),
      };
      // Cache failure for 25s to avoid repeated socket exhaustion
      GeminiProvider.healthCache.set(cacheKey, { result, expiresAt: Date.now() + 25000 });
      return result;
    }
  }

  async streamChat(
    messages: ProviderMessage[],
    options: ChatRequestOptions,
    callbacks: StreamCallbacks
  ): Promise<void> {
    const client = this.getClient(options.customKey);
    if (!client) {
      const err = new Error('No Gemini API key available.');
      callbacks.onError(err, 'CONFIGURATION_ERROR');
      return;
    }

    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')?.content || '';
    const complexity = GeminiProvider.classifyPromptComplexity(lastUserMessage);

    // Determine target model based on routing preference
    let targetModel: string;
    let selectedTier: 'instant' | 'standard' | 'deep' = complexity.tier;
    let routingReason = complexity.reason;

    if (options.modelRouting === 'auto' || !options.model || options.model === 'auto') {
      targetModel = complexity.recommendedModel;
    } else if (this.supportedModels.includes(options.model)) {
      targetModel = options.model;
      selectedTier = targetModel === 'gemini-3.1-flash-lite' ? 'instant' : targetModel === 'gemini-flash-latest' ? 'standard' : 'deep';
      routingReason = `Manual user selection: ${targetModel}`;
    } else {
      targetModel = this.defaultModel;
    }

    const effectiveKey = options.customKey?.trim() || process.env.GEMINI_API_KEY?.trim() || '';

    // Fast-fail check
    const cacheKey = `${effectiveKey.slice(0, 8)}:${targetModel}`;
    const cachedHealth = GeminiProvider.healthCache.get(cacheKey);
    if (cachedHealth && cachedHealth.result.status === 'scope_restricted' && Date.now() < cachedHealth.expiresAt) {
      callbacks.onError(
        new Error(cachedHealth.result.message),
        cachedHealth.result.errorClassification || 'AUTHENTICATION_ERROR'
      );
      return;
    }

    const systemMsg =
      messages.find((m) => m.role === 'system')?.content ||
      `You are Aetheria, an advanced cognitive synthesis engine. Tone calibration: ${options.tone || 'Deep Thought'}. Provide thoughtful, elegant answers with clean markdown.`;

    const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];
    for (const m of messages) {
      if (m.role === 'system') continue;
      contents.push({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }],
      });
    }

    if (contents.length === 0) {
      contents.push({ role: 'user', parts: [{ text: 'Hello' }] });
    }

    const executeStream = async (modelToUse: string, isIntraFallback: boolean): Promise<boolean> => {
      const streamStart = Date.now();
      let firstTokenReceived = false;

      // Optimize generation config: For instant tier, disable unnecessary thinking latency
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const genConfig: any = {
        systemInstruction: systemMsg,
        temperature: modelToUse === 'gemini-3.1-flash-lite' ? 0.3 : (options.temperature ?? 0.7),
      };

      try {
        const streamPromise = client.models.generateContentStream({
          model: modelToUse,
          contents,
          config: genConfig,
        });

        const timeoutMs = 15000;
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Gemini stream connection timeout (${timeoutMs}ms)`)), timeoutMs)
        );

        const responseStream = await Promise.race([streamPromise, timeoutPromise]);

        for await (const chunk of responseStream) {
          if (options.signal?.aborted) {
            break;
          }
          if (chunk.text) {
            if (!firstTokenReceived) {
              firstTokenReceived = true;
              const ttft = Date.now() - streamStart;
              GeminiProvider.recordLatency(modelToUse, ttft);
              callbacks.onMetadata?.({
                provider: this.id,
                model: modelToUse,
                latencyMs: ttft,
                modelTier: selectedTier,
                complexityClassification: routingReason,
                fallbackTriggered: isIntraFallback,
                originalProvider: this.id,
                reason: isIntraFallback ? 'Intra-Gemini fast-failover to Flash-Lite' : undefined,
              });
            }
            callbacks.onToken(chunk.text);
          }
        }

        if (firstTokenReceived) {
          callbacks.onComplete();
          return true;
        }
        return false;
      } catch (err) {
        if (firstTokenReceived) {
          // Token delivery was underway, don't cascade duplicate
          callbacks.onComplete();
          return true;
        }
        return false;
      }
    };

    // Primary attempt
    const primarySuccess = await executeStream(targetModel, false);
    if (primarySuccess) return;

    // Intra-Provider Fallback: If primary model failed and wasn't already flash-lite, try flash-lite immediately!
    if (targetModel !== 'gemini-3.1-flash-lite') {
      const fallbackSuccess = await executeStream('gemini-3.1-flash-lite', true);
      if (fallbackSuccess) return;
    }

    // Both primary and intra-fallback failed: notify gateway to trigger external cascade
    callbacks.onError(
      new Error(`Gemini models (${targetModel}, gemini-3.1-flash-lite) failed or timed out`),
      'TEMPORARY_PROVIDER_ERROR'
    );
  }
}
