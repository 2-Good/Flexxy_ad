import crypto from 'crypto';

export interface CacheEntry {
  key: string;
  hash: string;
  promptSnippet: string;
  response: string;
  model: string;
  provider: string;
  createdAt: number;
  expiresAt: number;
  hits: number;
  byteSize: number;
}

export interface CacheStats {
  enabled: boolean;
  entriesCount: number;
  maxEntries: number;
  hits: number;
  misses: number;
  hitRatio: number;
  memoryUsageKb: number;
  ttlSeconds: number;
  recentEntries: Array<{
    hash: string;
    promptSnippet: string;
    model: string;
    provider: string;
    hits: number;
    ageSeconds: number;
  }>;
}

export class SmartGatewayCache {
  private cache = new Map<string, CacheEntry>();
  private readonly maxEntries: number;
  private readonly defaultTtlMs: number;
  private hits = 0;
  private misses = 0;
  private enabled = true;

  constructor(maxEntries = 200, defaultTtlSeconds = 3600) {
    this.maxEntries = maxEntries;
    this.defaultTtlMs = defaultTtlSeconds * 1000;
  }

  public setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Generates a deterministic hash for a chat request including full conversation context
   */
  public generateKey(prompt: string, model: string, tone?: string, contextHash?: string): string {
    const raw = `${prompt.trim()}::${model.toLowerCase()}::${(tone || 'Deep Thought').toLowerCase()}::context:${contextHash || 'none'}`;
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  /**
   * Get cached entry if valid and not expired
   */
  public get(key: string): CacheEntry | null {
    if (!this.enabled) {
      this.misses++;
      return null;
    }

    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    entry.hits++;
    this.hits++;

    // Refresh position for LRU
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry;
  }

  /**
   * Set cached response with LRU eviction
   */
  public set(
    key: string,
    prompt: string,
    response: string,
    model: string,
    provider: string,
    customTtlMs?: number
  ) {
    if (!this.enabled || !response || response.trim().length === 0) return;

    // Evict oldest if reached capacity
    if (this.cache.size >= this.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    const now = Date.now();
    const ttl = customTtlMs ?? this.defaultTtlMs;
    const promptSnippet = prompt.length > 70 ? prompt.slice(0, 67) + '...' : prompt;
    const byteSize = Buffer.byteLength(response, 'utf8') + Buffer.byteLength(prompt, 'utf8');

    this.cache.set(key, {
      key,
      hash: key.slice(0, 10),
      promptSnippet,
      response,
      model,
      provider,
      createdAt: now,
      expiresAt: now + ttl,
      hits: 0,
      byteSize,
    });
  }

  /**
   * Clear all entries
   */
  public clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Diagnostic statistics
   */
  public getStats(): CacheStats {
    const totalRequests = this.hits + this.misses;
    const hitRatio = totalRequests > 0 ? Math.round((this.hits / totalRequests) * 100) : 0;

    let totalBytes = 0;
    const recent: CacheStats['recentEntries'] = [];
    const now = Date.now();

    for (const entry of Array.from(this.cache.values()).reverse().slice(0, 15)) {
      totalBytes += entry.byteSize;
      recent.push({
        hash: entry.hash,
        promptSnippet: entry.promptSnippet,
        model: entry.model,
        provider: entry.provider,
        hits: entry.hits,
        ageSeconds: Math.floor((now - entry.createdAt) / 1000),
      });
    }

    return {
      enabled: this.enabled,
      entriesCount: this.cache.size,
      maxEntries: this.maxEntries,
      hits: this.hits,
      misses: this.misses,
      hitRatio,
      memoryUsageKb: Math.round(totalBytes / 1024),
      ttlSeconds: Math.floor(this.defaultTtlMs / 1000),
      recentEntries: recent,
    };
  }
}

export const gatewayCache = new SmartGatewayCache(200, 3600);
