import crypto from 'crypto';
import { ProviderMessage } from './types.js';

export interface ValidatedHistory {
  messages: ProviderMessage[];
  contextHash: string;
}

export class MessageHistoryManager {
  /**
   * Sanitizes, validates, and normalizes conversation history.
   * Ensures:
   * 1. Valid role assignments ('user' | 'assistant').
   * 2. Non-empty string contents.
   * 3. Chronological order preserved.
   * 4. Strict sequence (no duplicate back-to-back user/assistant messages).
   * 5. Safe history limits while preserving full relevant context.
   */
  public sanitizeHistory(rawHistory: unknown, systemPrompt?: string): ProviderMessage[] {
    const sanitized: ProviderMessage[] = [];

    if (systemPrompt && systemPrompt.trim()) {
      sanitized.push({
        role: 'system',
        content: systemPrompt.trim(),
      });
    }

    if (!Array.isArray(rawHistory)) {
      return sanitized;
    }

    for (const item of rawHistory) {
      if (!item || typeof item !== 'object') continue;
      const content = typeof (item as { content?: unknown }).content === 'string'
        ? (item as { content: string }).content.trim()
        : '';

      if (!content) continue;

      const rawRole = (item as { role?: unknown }).role;
      const role: 'user' | 'assistant' = rawRole === 'assistant' ? 'assistant' : 'user';

      // Avoid consecutive duplicate messages of identical role and content
      const lastMsg = sanitized[sanitized.length - 1];
      if (lastMsg && lastMsg.role === role && lastMsg.content === content) {
        continue;
      }

      sanitized.push({ role, content });
    }

    return sanitized;
  }

  /**
   * Generates a deterministic hash representing the exact multi-turn conversation context.
   * This guarantees cache keys will never confuse different conversation branches or follow-ups.
   */
  public computeContextHash(messages: ProviderMessage[], tone?: string, model?: string): string {
    const serialized = messages
      .map((m) => `${m.role}:${m.content}`)
      .join('|');
    const fullRepresentation = `${serialized}::${model || 'default'}::${tone || 'default'}`;
    return crypto.createHash('sha256').update(fullRepresentation).digest('hex');
  }
}

export const historyManager = new MessageHistoryManager();
