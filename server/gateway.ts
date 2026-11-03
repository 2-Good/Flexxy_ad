import {
  AetheriaAIProvider,
  ProviderId,
  HealthCheckResult,
  ChatRequestOptions,
  ProviderMessage,
  StreamCallbacks,
  GatewayTelemetryEvent,
  ErrorClassification,
  BenchmarkItemResult,
  BenchmarkReport,
} from './types.js';
import { GeminiProvider } from './providers/gemini.js';
import { OpenAICompatibleProvider } from './providers/openaiCompat.js';
import { OllamaProvider } from './providers/ollama.js';
import { gatewayCache } from './cache.js';
import { historyManager } from './historyManager.js';

interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  isOpen: boolean;
  cooldownMs: number;
}

export class AetheriaAIGateway {
  private providers = new Map<ProviderId, AetheriaAIProvider>();
  private circuitBreakers = new Map<ProviderId, CircuitBreakerState>();
  private telemetry: GatewayTelemetryEvent[] = [];
  private readonly maxTelemetry = 50;

  constructor() {
    this.registerProviders();
  }

  private registerProviders() {
    // 1. Google Gemini (Flagship / P1)
    this.register(new GeminiProvider());

    // 2. Groq (High-Speed LPU / P2)
    this.register(
      new OpenAICompatibleProvider({
        id: 'groq',
        displayName: 'Groq Cloud (LPU)',
        defaultEndpoint: 'https://api.groq.com/openai/v1',
        defaultModel: 'llama-3.3-70b-versatile',
        supportedModels: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'],
        envKeyName: 'GROQ_API_KEY',
      })
    );

    // 3. OpenAI
    this.register(
      new OpenAICompatibleProvider({
        id: 'openai',
        displayName: 'OpenAI',
        defaultEndpoint: 'https://api.openai.com/v1',
        defaultModel: 'gpt-4o-mini',
        supportedModels: ['gpt-4o', 'gpt-4o-mini', 'o3-mini'],
        envKeyName: 'OPENAI_API_KEY',
      })
    );

    // 4. OpenRouter (Universal AI Gateway)
    this.register(
      new OpenAICompatibleProvider({
        id: 'openrouter',
        displayName: 'OpenRouter',
        defaultEndpoint: 'https://openrouter.ai/api/v1',
        defaultModel: 'meta-llama/llama-3.3-70b-instruct',
        supportedModels: [
          'meta-llama/llama-3.3-70b-instruct',
          'anthropic/claude-3.5-sonnet',
          'deepseek/deepseek-r1',
        ],
        envKeyName: 'OPENROUTER_API_KEY',
      })
    );

    // 5. Local Ollama Node
    this.register(new OllamaProvider());
  }

  private register(provider: AetheriaAIProvider) {
    this.providers.set(provider.id, provider);
    this.circuitBreakers.set(provider.id, {
      failures: 0,
      lastFailure: 0,
      isOpen: false,
      cooldownMs: 45000,
    });
  }

  getProvider(id: ProviderId): AetheriaAIProvider | undefined {
    return this.providers.get(id);
  }

  isCircuitOpen(id: ProviderId): boolean {
    const cb = this.circuitBreakers.get(id);
    if (!cb || !cb.isOpen) return false;
    if (Date.now() - cb.lastFailure > cb.cooldownMs) {
      cb.isOpen = false;
      cb.failures = 0;
      return false;
    }
    return true;
  }

  recordSuccess(id: ProviderId) {
    const cb = this.circuitBreakers.get(id);
    if (cb) {
      cb.failures = 0;
      cb.isOpen = false;
    }
  }

  recordFailure(id: ProviderId, classification?: ErrorClassification) {
    const cb = this.circuitBreakers.get(id);
    if (!cb) return;

    // Fast-trip on fatal authentication or scope restrictions
    if (classification === 'AUTHENTICATION_ERROR' || classification === 'QUOTA_ERROR') {
      cb.isOpen = true;
      cb.failures += 3;
      cb.lastFailure = Date.now();
      return;
    }

    cb.failures += 1;
    cb.lastFailure = Date.now();
    if (cb.failures >= 3) {
      cb.isOpen = true;
    }
  }

  logTelemetry(event: GatewayTelemetryEvent) {
    this.telemetry.unshift(event);
    if (this.telemetry.length > this.maxTelemetry) {
      this.telemetry.pop();
    }
  }

  getTelemetry(): GatewayTelemetryEvent[] {
    return this.telemetry;
  }

  async testProvider(
    id: ProviderId,
    customKey?: string,
    customEndpoint?: string,
    model?: string
  ): Promise<HealthCheckResult> {
    const provider = this.providers.get(id);
    if (!provider) {
      return {
        providerId: id,
        model: model || 'unknown',
        status: 'failed',
        latencyMs: 0,
        message: `Provider ${id} is not registered in the gateway.`,
        errorClassification: 'CONFIGURATION_ERROR',
        capabilities: { streaming: false, vision: false, systemInstruction: false },
        timestamp: Date.now(),
      };
    }

    const result = await provider.testConnection(customKey, customEndpoint, model);
    if (result.status === 'operational') {
      this.recordSuccess(id);
    } else {
      this.recordFailure(id, result.errorClassification);
    }
    return result;
  }

  async getCatalog(customKeys: Partial<Record<ProviderId, string>> = {}): Promise<
    Array<{
      id: ProviderId;
      displayName: string;
      defaultModel: string;
      supportedModels: string[];
      capabilities: import('./types.js').ProviderCapabilities;
      isConfigured: boolean;
      circuitOpen: boolean;
    }>
  > {
    const list = [];
    for (const [id, provider] of this.providers.entries()) {
      list.push({
        id,
        displayName: provider.displayName,
        defaultModel: provider.defaultModel,
        supportedModels: provider.supportedModels,
        capabilities: provider.capabilities,
        isConfigured: provider.isConfigured(customKeys[id]),
        circuitOpen: this.isCircuitOpen(id),
      });
    }
    return list;
  }

  getModelLatencyProfiles() {
    return GeminiProvider.getModelLatencyProfile();
  }

  getCacheStats() {
    return gatewayCache.getStats();
  }

  clearCache() {
    gatewayCache.clear();
  }

  /**
   * Phase 9: Real-time Multi-Provider Speed Benchmark Suite
   */
  async runBenchmarkSuite(customKeys: Partial<Record<ProviderId, string>> = {}): Promise<BenchmarkReport> {
    const probePrompt = 'Synthesize the three core tenets of high-throughput distributed systems in under 35 words.';
    const messages: ProviderMessage[] = [
      { role: 'system', content: 'You are Aetheria. Provide concise, high-speed synthesis in under 35 words.' },
      { role: 'user', content: probePrompt },
    ];

    const results: BenchmarkItemResult[] = [];
    const providersToTest: ProviderId[] = ['gemini', 'groq', 'openai', 'openrouter', 'ollama'];

    for (const pid of providersToTest) {
      const prov = this.providers.get(pid);
      if (!prov) continue;

      const isConfigured = prov.isConfigured(customKeys[pid]);
      if (!isConfigured) {
        results.push({
          providerId: pid,
          providerName: prov.displayName,
          model: prov.defaultModel,
          status: 'unconfigured',
          ttftMs: 0,
          totalTimeMs: 0,
          tokensCount: 0,
          tokensPerSec: 0,
          snippet: 'API key not configured in vault',
        });
        continue;
      }

      const startTime = Date.now();
      let firstTokenTime = 0;
      let tokens = 0;
      let textAccum = '';
      let hasError = false;
      let errorMsg = '';

      try {
        await prov.streamChat(
          messages,
          {
            model: prov.defaultModel,
            customKey: customKeys[pid],
          },
          {
            onToken: (tok) => {
              if (tokens === 0) {
                firstTokenTime = Date.now() - startTime;
              }
              tokens++;
              textAccum += tok;
            },
            onError: (err) => {
              hasError = true;
              errorMsg = err.message;
            },
            onComplete: () => {},
          }
        );

        const totalDuration = Date.now() - startTime;
        const tps = totalDuration > 0 ? Math.round((tokens / (totalDuration / 1000)) * 10) / 10 : 0;

        results.push({
          providerId: pid,
          providerName: prov.displayName,
          model: prov.defaultModel,
          status: hasError ? 'failed' : firstTokenTime > 1500 ? 'degraded' : 'operational',
          ttftMs: firstTokenTime || totalDuration,
          totalTimeMs: totalDuration,
          tokensCount: tokens,
          tokensPerSec: tps,
          snippet: textAccum.slice(0, 90) + (textAccum.length > 90 ? '...' : ''),
          error: errorMsg || undefined,
        });
      } catch (err) {
        results.push({
          providerId: pid,
          providerName: prov.displayName,
          model: prov.defaultModel,
          status: 'failed',
          ttftMs: 0,
          totalTimeMs: Date.now() - startTime,
          tokensCount: 0,
          tokensPerSec: 0,
          snippet: 'Execution failed',
          error: (err as Error).message,
        });
      }
    }

    const operationalResults = results.filter((r) => r.status === 'operational' && r.ttftMs > 0);
    operationalResults.sort((a, b) => a.ttftMs - b.ttftMs);
    const fastest = operationalResults[0];

    return {
      timestamp: Date.now(),
      probePrompt,
      results,
      fastestProvider: fastest?.providerName || 'N/A',
      lowestTtftMs: fastest?.ttftMs || 0,
    };
  }

  /**
   * Dispatches chat request with automatic capability-aware failover cascade and smart caching
   */
  async streamChatWithSelfHealing(
    requestedProviderId: ProviderId,
    messages: ProviderMessage[],
    options: ChatRequestOptions & {
      customKeys?: Partial<Record<ProviderId, string>>;
      customEndpoints?: Partial<Record<ProviderId, string>>;
      preferredFallbackOrder?: ProviderId[];
    },
    callbacks: StreamCallbacks
  ): Promise<void> {
    const userPromptMsg = messages.filter((m) => m.role === 'user').slice(-1)[0]?.content || '';
    const contextHash = historyManager.computeContextHash(messages, options.tone, options.model);
    const cacheKey = gatewayCache.generateKey(userPromptMsg, options.model || 'auto', options.tone, contextHash);

    // Phase 8: Smart Gateway Cache Check (Sub-millisecond retrieval)
    if (!options.attachments?.length) {
      const cached = gatewayCache.get(cacheKey);
      if (cached) {
        callbacks.onMetadata?.({
          provider: cached.provider as ProviderId,
          model: `${cached.model} (⚡ Cached)`,
          latencyMs: 1,
          fallbackTriggered: false,
          originalProvider: requestedProviderId,
          reason: 'Instant sub-millisecond retrieval from Aetheria Smart Gateway Cache',
        });

        // Fast chunk streaming for cached responses in natural batches
        const tokens = cached.response.split(/(\s+)/);
        for (const t of tokens) {
          if (options.signal?.aborted) return;
          callbacks.onToken(t);
        }
        callbacks.onComplete();

        this.logTelemetry({
          id: `tel-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp: Date.now(),
          provider: cached.provider as ProviderId,
          model: cached.model,
          status: 'success',
          latencyMs: 1,
          tokensStreamed: tokens.length,
        });
        return;
      }
    }

    const rawCascade: ProviderId[] = [
      requestedProviderId,
      ...(options.preferredFallbackOrder || [
        'gemini' as const,
        'groq' as const,
        'openai' as const,
        'openrouter' as const,
        'ollama' as const,
      ]),
    ];
    const uniqueCascade: ProviderId[] = Array.from(new Set(rawCascade));

    // Zero-latency pre-filter: Keep only providers that are registered, configured, and non-tripped
    const fallbackCascade = uniqueCascade.filter((id) => {
      const prov = this.providers.get(id);
      if (!prov) return false;
      if (options.attachments && options.attachments.length > 0 && !prov.capabilities.vision) {
        return false;
      }
      if (this.isCircuitOpen(id)) return false;
      const customKey = options.customKeys?.[id] || (id === requestedProviderId ? options.customKey : undefined);
      return prov.isConfigured(customKey);
    });

    if (fallbackCascade.length === 0) {
      callbacks.onError(
        new Error('AI provider is not configured. Connect an AI provider to start chatting.'),
        'CONFIGURATION_ERROR'
      );
      return;
    }

    let streamAttemptIndex = 0;
    let lastAttemptError = '';
    const startGatewayTime = Date.now();

    const tryProvider = async (providerId: ProviderId): Promise<boolean> => {
      const provider = this.providers.get(providerId);
      if (!provider) return false;

      let tokensReceived = 0;
      let streamFailed = false;
      let metadataEmitted = false;
      let accumulatedResponseText = '';

      const isAutoRouting = options.modelRouting === 'auto' || options.model === 'auto' || !options.model;
      const model = (!isAutoRouting && options.model && provider.supportedModels.includes(options.model))
        ? options.model
        : (isAutoRouting ? 'auto' : provider.defaultModel);

      let effectiveModel = model === 'auto' ? provider.defaultModel : model;

      const customKey = options.customKeys?.[providerId] || (providerId === requestedProviderId ? options.customKey : undefined);
      const customEndpoint = options.customEndpoints?.[providerId] || (providerId === requestedProviderId ? options.customEndpoint : undefined);

      await new Promise<void>((resolve) => {
        const streamOptions: ChatRequestOptions = {
          ...options,
          model,
          customKey,
          customEndpoint,
        };

        const isFallback = providerId !== requestedProviderId;

        provider.streamChat(
          messages,
          streamOptions,
          {
            onMetadata: (meta) => {
              metadataEmitted = true;
              effectiveModel = meta.model || effectiveModel;
              callbacks.onMetadata?.({
                ...meta,
                latencyMs: Date.now() - startGatewayTime,
                fallbackTriggered: isFallback || meta.fallbackTriggered,
                originalProvider: requestedProviderId,
              });
            },
            onToken: (tok) => {
              if (tokensReceived === 0 && !metadataEmitted) {
                metadataEmitted = true;
                callbacks.onMetadata?.({
                  provider: providerId,
                  model: effectiveModel,
                  latencyMs: Date.now() - startGatewayTime,
                  fallbackTriggered: isFallback,
                  originalProvider: requestedProviderId,
                  reason: isFallback ? `Cascaded to ${provider.displayName} for resilient continuity` : undefined,
                });
              }
              tokensReceived++;
              accumulatedResponseText += tok;
              callbacks.onToken(tok);
            },
            onError: (err, classification) => {
              streamFailed = true;
              lastAttemptError = err.message;
              this.recordFailure(providerId, classification);
              this.logTelemetry({
                id: `tel-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                timestamp: Date.now(),
                provider: providerId,
                model: effectiveModel,
                status: 'failed',
                latencyMs: Date.now() - startGatewayTime,
                errorDetails: err.message,
                errorClassification: classification,
              });
              resolve();
            },
            onComplete: () => {
              if (!streamFailed && tokensReceived > 0) {
                this.recordSuccess(providerId);
                // Phase 8: Store in Smart Gateway Cache for future sub-millisecond retrieval
                if (!options.attachments?.length && accumulatedResponseText.trim().length > 0) {
                  gatewayCache.set(cacheKey, userPromptMsg, accumulatedResponseText, effectiveModel, providerId);
                }

                this.logTelemetry({
                  id: `tel-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                  timestamp: Date.now(),
                  provider: providerId,
                  model,
                  status: isFallback ? 'fallback' : 'success',
                  latencyMs: Date.now() - startGatewayTime,
                  tokensStreamed: tokensReceived,
                  fallbackTo: isFallback ? providerId : undefined,
                });
                callbacks.onComplete();
              }
              resolve();
            },
          }
        ).catch(() => {
          streamFailed = true;
          this.recordFailure(providerId, 'UNKNOWN_ERROR');
          resolve();
        });
      });

      return !streamFailed && tokensReceived > 0;
    };

    for (const candidateId of fallbackCascade) {
      streamAttemptIndex++;
      const succeeded = await tryProvider(candidateId);
      if (succeeded) {
        return;
      }
    }

    const detailMsg = lastAttemptError ? `: ${lastAttemptError}` : '. Please check your API key in the AI Gateway Hub.';
    callbacks.onError(
      new Error(`All configured AI providers (${fallbackCascade.join(', ')}) failed to respond${detailMsg}`),
      'TEMPORARY_PROVIDER_ERROR'
    );
  }
}

export const gateway = new AetheriaAIGateway();
