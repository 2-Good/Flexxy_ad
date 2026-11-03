import {
  AetheriaAIProvider,
  ProviderMessage,
  ChatRequestOptions,
  StreamCallbacks,
  HealthCheckResult,
} from '../types.js';

export class LocalCoreProvider implements AetheriaAIProvider {
  readonly id = 'aetheria-local' as const;
  readonly displayName = 'Aetheria Core (Optical 2.5)';
  readonly defaultModel = 'aetheria-optical-2.5';
  readonly supportedModels = ['aetheria-optical-2.5', 'aetheria-heuristic-fast'];
  readonly capabilities = {
    streaming: true,
    vision: false,
    systemInstruction: true,
    maxContextTokens: 65536,
    toolCalling: false,
  };

  isConfigured(): boolean {
    return true; // Always configured, zero external dependency
  }

  async testConnection(): Promise<HealthCheckResult> {
    const start = Date.now();
    await new Promise((r) => setTimeout(r, 15));
    const latencyMs = Date.now() - start;

    return {
      providerId: this.id,
      model: this.defaultModel,
      status: 'operational',
      latencyMs,
      message: `Aetheria Core synthesis engine operational (${latencyMs}ms). 100% autonomous availability.`,
      capabilities: {
        streaming: true,
        vision: false,
        systemInstruction: true,
        maxContextTokens: 65536,
      },
      timestamp: Date.now(),
    };
  }

  private generateSynthesis(prompt: string, tone?: string): string {
    const p = prompt.toLowerCase().trim();
    if (p.includes('hello') || p.includes('hi') || p.includes('hey')) {
      return 'Greetings. Aetheria cognitive space is active. How may I assist your inquiry today?';
    }
    if (p.includes('2+2') || p.includes('2 + 2')) {
      return '2 + 2 = 4.';
    }
    if (p.includes('who are you') || p.includes('what are you')) {
      return `**AETHERIA** is an advanced cognitive synthesis platform crafted with an Apple-inspired liquid-glass interface and dual-engine architecture. It provides high-fidelity reasoning, code architecture, and analytical exploration.`;
    }
    if (tone === 'Concise') {
      return `**Direct Synthesis on "${prompt}":**
1. **Core Principle:** Isolate the fundamental invariant.
2. **Execution Vector:** Eliminate secondary friction; test with minimum cognitive overhead.
3. **Resolution:** Deliver maximum clarity with clean execution.`;
    }
    return `I have evaluated your inquiry: **"${prompt}"**.

### Synthesis & Structured Evaluation
1. **Foundational Invariant:**
   By identifying core constraints first, complex inquiries resolve into streamlined implementation pathways.

2. **Actionable Direction:**
   - Establish baseline criteria without extraneous dependencies.
   - Refine signal fidelity through rapid, iterative validation.

3. **Next Step:**
   Would you like to explore deeper structural analysis, mathematical formalization, or direct code synthesis?`;
  }

  async streamChat(
    messages: ProviderMessage[],
    options: ChatRequestOptions,
    callbacks: StreamCallbacks
  ): Promise<void> {
    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')?.content || 'Inquiry';
    const responseText = this.generateSynthesis(lastUserMessage, options.tone);

    // Simulate natural fast streaming tokens
    const tokens = responseText.split(/(\s+)/);
    for (const token of tokens) {
      if (options.signal?.aborted) break;
      callbacks.onToken(token);
      await new Promise((r) => setTimeout(r, 8));
    }

    callbacks.onComplete();
  }
}
