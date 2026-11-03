import {
  AetheriaAIProvider,
  ProviderMessage,
  ChatRequestOptions,
  StreamCallbacks,
  HealthCheckResult,
} from '../types.js';

export class OllamaProvider implements AetheriaAIProvider {
  readonly id = 'ollama' as const;
  readonly displayName = 'Local Ollama';
  readonly defaultModel = 'llama3.2';
  readonly supportedModels = ['llama3.2', 'deepseek-r1', 'mistral', 'phi4', 'qwen2.5-coder'];
  readonly capabilities = {
    streaming: true,
    vision: false,
    systemInstruction: true,
    maxContextTokens: 32768,
    toolCalling: false,
  };
  private readonly defaultEndpoint = 'http://127.0.0.1:11434';
  private static healthCache = new Map<string, { result: HealthCheckResult; expiresAt: number }>();

  private getEndpoint(customEndpoint?: string): string {
    const raw = customEndpoint?.trim() || process.env.OLLAMA_ENDPOINT?.trim() || this.defaultEndpoint;
    return raw.replace(/\/+$/, '');
  }

  isConfigured(customKey?: string): boolean {
    return Boolean(customKey?.trim() || process.env.OLLAMA_ENDPOINT?.trim());
  }

  async testConnection(_customKey?: string, customEndpoint?: string, model?: string): Promise<HealthCheckResult> {
    const endpoint = this.getEndpoint(customEndpoint);
    const targetModel = model || this.defaultModel;
    const cacheKey = `${endpoint}:${targetModel}`;

    const cached = OllamaProvider.healthCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return { ...cached.result, timestamp: Date.now() };
    }

    const start = Date.now();

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 750);

      const res = await fetch(`${endpoint}/api/tags`, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timer);
      const latencyMs = Date.now() - start;

      if (!res.ok) {
        const result: HealthCheckResult = {
          providerId: this.id,
          model: targetModel,
          status: 'failed',
          latencyMs,
          message: `Ollama node responded with HTTP ${res.status}`,
          errorClassification: 'TEMPORARY_PROVIDER_ERROR',
          capabilities: { streaming: true, vision: true, systemInstruction: true },
          timestamp: Date.now(),
        };
        OllamaProvider.healthCache.set(cacheKey, { result, expiresAt: Date.now() + 10000 });
        return result;
      }

      const data = await res.json().catch(() => ({ models: [] }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const installed = (data as any)?.models?.map((m: any) => m.name) || [];

      const result: HealthCheckResult = {
        providerId: this.id,
        model: targetModel,
        status: 'operational',
        latencyMs,
        message: installed.length > 0
          ? `Local node online (${latencyMs}ms). Installed: ${installed.slice(0, 3).join(', ')}`
          : `Local node online (${latencyMs}ms). No models pulled yet.`,
        capabilities: {
          streaming: true,
          vision: true,
          systemInstruction: true,
          maxContextTokens: 32768,
        },
        timestamp: Date.now(),
      };
      OllamaProvider.healthCache.set(cacheKey, { result, expiresAt: Date.now() + 20000 });
      return result;
    } catch {
      const latencyMs = Date.now() - start;
      const result: HealthCheckResult = {
        providerId: this.id,
        model: targetModel,
        status: 'untested',
        latencyMs,
        message: `Local Ollama node not detected at ${endpoint}. Run 'ollama serve' to enable.`,
        errorClassification: 'NETWORK_ERROR',
        capabilities: { streaming: true, vision: false, systemInstruction: true },
        timestamp: Date.now(),
      };
      OllamaProvider.healthCache.set(cacheKey, { result, expiresAt: Date.now() + 15000 });
      return result;
    }
  }

  async streamChat(
    messages: ProviderMessage[],
    options: ChatRequestOptions,
    callbacks: StreamCallbacks
  ): Promise<void> {
    const endpoint = this.getEndpoint(options.customEndpoint);
    const targetModel = options.model || this.defaultModel;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 800);
      if (options.signal) {
        options.signal.addEventListener('abort', () => controller.abort());
      }

      const res = await fetch(`${endpoint}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: targetModel,
          messages,
          stream: true,
          options: {
            temperature: options.temperature ?? 0.7,
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        callbacks.onError(new Error(`Ollama returned HTTP ${res.status}`), 'TEMPORARY_PROVIDER_ERROR');
        return;
      }

      if (!res.body) {
        callbacks.onError(new Error('No response stream from Ollama'), 'APPLICATION_ERROR');
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
          if (!trimmed) continue;
          try {
            const parsed = JSON.parse(trimmed);
            if (parsed.message?.content) {
              callbacks.onToken(parsed.message.content);
            }
            if (parsed.done) {
              callbacks.onComplete();
              return;
            }
          } catch {
            // Ignore incomplete chunks
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
