import {
  AetheriaAIProvider,
  ProviderId,
  ProviderMessage,
  ChatRequestOptions,
  StreamCallbacks,
  HealthCheckResult,
  ErrorClassification,
} from '../types.js';

interface ProviderConfig {
  id: ProviderId;
  displayName: string;
  defaultEndpoint: string;
  defaultModel: string;
  supportedModels: string[];
  envKeyName: string;
}

export class OpenAICompatibleProvider implements AetheriaAIProvider {
  readonly id: ProviderId;
  readonly displayName: string;
  readonly defaultModel: string;
  readonly supportedModels: string[];
  readonly capabilities = {
    streaming: true,
    vision: true,
    systemInstruction: true,
    maxContextTokens: 128000,
    toolCalling: true,
  };
  private readonly defaultEndpoint: string;
  private readonly envKeyName: string;
  private static healthCache = new Map<string, { result: HealthCheckResult; expiresAt: number }>();

  constructor(config: ProviderConfig) {
    this.id = config.id;
    this.displayName = config.displayName;
    this.defaultEndpoint = config.defaultEndpoint;
    this.defaultModel = config.defaultModel;
    this.supportedModels = config.supportedModels;
    this.envKeyName = config.envKeyName;
  }

  private getKey(customKey?: string): string | undefined {
    return customKey?.trim() || process.env[this.envKeyName]?.trim();
  }

  private getEndpoint(customEndpoint?: string): string {
    const raw = customEndpoint?.trim() || this.defaultEndpoint;
    return raw.replace(/\/+$/, '');
  }

  isConfigured(customKey?: string): boolean {
    return Boolean(this.getKey(customKey));
  }

  classifyHttpError(status: number, message: string): ErrorClassification {
    if (status === 401 || status === 403) return 'AUTHENTICATION_ERROR';
    if (status === 429) return 'QUOTA_ERROR';
    if (status === 404 || message.toLowerCase().includes('model_not_found')) return 'MODEL_COMPATIBILITY_ERROR';
    if (status >= 500) return 'TEMPORARY_PROVIDER_ERROR';
    return 'UNKNOWN_ERROR';
  }

  async testConnection(customKey?: string, customEndpoint?: string, model?: string): Promise<HealthCheckResult> {
    const key = this.getKey(customKey);
    const endpoint = this.getEndpoint(customEndpoint);
    const targetModel = model && this.supportedModels.includes(model) ? model : this.defaultModel;
    const cacheKey = `${this.id}:${key ? key.slice(0, 8) : 'nokey'}:${endpoint}:${targetModel}`;

    const cached = OpenAICompatibleProvider.healthCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return { ...cached.result, timestamp: Date.now() };
    }

    const start = Date.now();

    if (!key) {
      const res: HealthCheckResult = {
        providerId: this.id,
        model: targetModel,
        status: 'untested',
        latencyMs: 0,
        message: `No API key configured for ${this.displayName}. Add custom key in Connection Manager.`,
        errorClassification: 'CONFIGURATION_ERROR',
        capabilities: {
          streaming: true,
          vision: true,
          systemInstruction: true,
          maxContextTokens: 128000,
        },
        timestamp: Date.now(),
      };
      OpenAICompatibleProvider.healthCache.set(cacheKey, { result: res, expiresAt: Date.now() + 60000 });
      return res;
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);

      const res = await fetch(`${endpoint}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
          Connection: 'keep-alive',
          'Keep-Alive': 'timeout=60, max=1000',
        },
        body: JSON.stringify({
          model: targetModel,
          messages: [{ role: 'user', content: 'Ping. Respond with "PONG".' }],
          max_tokens: 5,
        }),
        signal: controller.signal,
      });

      clearTimeout(timer);
      const latencyMs = Date.now() - start;

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const errMsg = (errJson as any)?.error?.message || `HTTP ${res.status}: ${res.statusText}`;
        const classification = this.classifyHttpError(res.status, errMsg);
        return {
          providerId: this.id,
          model: targetModel,
          status: 'failed',
          latencyMs,
          message: `${this.displayName} error: ${errMsg}`,
          errorClassification: classification,
          capabilities: { streaming: true, vision: true, systemInstruction: true },
          timestamp: Date.now(),
        };
      }

      const data = await res.json();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const reply = (data as any)?.choices?.[0]?.message?.content || 'OK';

      return {
        providerId: this.id,
        model: targetModel,
        status: 'operational',
        latencyMs,
        message: `Connected successfully (${latencyMs}ms): ${reply.trim().slice(0, 30)}`,
        capabilities: {
          streaming: true,
          vision: true,
          systemInstruction: true,
          maxContextTokens: 128000,
        },
        timestamp: Date.now(),
      };
    } catch (err) {
      const latencyMs = Date.now() - start;
      const isAbort = (err as Error)?.name === 'AbortError';
      return {
        providerId: this.id,
        model: targetModel,
        status: 'failed',
        latencyMs,
        message: isAbort ? 'Connection timed out (>8s).' : ((err as Error)?.message || 'Network error'),
        errorClassification: isAbort ? 'TEMPORARY_PROVIDER_ERROR' : 'NETWORK_ERROR',
        capabilities: { streaming: true, vision: true, systemInstruction: true },
        timestamp: Date.now(),
      };
    }
  }

  async streamChat(
    messages: ProviderMessage[],
    options: ChatRequestOptions,
    callbacks: StreamCallbacks
  ): Promise<void> {
    const key = this.getKey(options.customKey);
    const endpoint = this.getEndpoint(options.customEndpoint);
    const targetModel = options.model && this.supportedModels.includes(options.model)
      ? options.model
      : this.defaultModel;

    if (!key) {
      callbacks.onError(new Error(`API key required for ${this.displayName}`), 'CONFIGURATION_ERROR');
      return;
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      if (options.signal) {
        options.signal.addEventListener('abort', () => controller.abort());
      }

      const res = await fetch(`${endpoint}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
          Connection: 'keep-alive',
          'Keep-Alive': 'timeout=60, max=1000',
        },
        body: JSON.stringify({
          model: targetModel,
          messages,
          temperature: options.temperature ?? 0.7,
          stream: true,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const errMsg = (errJson as any)?.error?.message || `HTTP ${res.status}: ${res.statusText}`;
        const classification = this.classifyHttpError(res.status, errMsg);
        callbacks.onError(new Error(errMsg), classification);
        return;
      }

      if (!res.body) {
        callbacks.onError(new Error('No response stream returned'), 'APPLICATION_ERROR');
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue;
          if (trimmed === 'data: [DONE]') {
            callbacks.onComplete();
            return;
          }
          if (trimmed.startsWith('data: ')) {
            try {
              const json = JSON.parse(trimmed.slice(6));
              const token = json.choices?.[0]?.delta?.content;
              if (token) {
                callbacks.onToken(token);
              }
            } catch {
              // Ignore partial JSON chunks
            }
          }
        }
      }

      callbacks.onComplete();
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') {
        callbacks.onComplete();
        return;
      }
      callbacks.onError(err as Error, 'NETWORK_ERROR');
    }
  }
}
