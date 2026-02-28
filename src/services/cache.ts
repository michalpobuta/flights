interface CacheEntry<T> {
  value: T;
  expires_at: number;
}

export class TTLCache {
  private store = new Map<string, CacheEntry<unknown>>();
  private readonly default_ttl_ms: number;

  constructor(ttl_seconds = 300) {
    this.default_ttl_ms = ttl_seconds * 1000;
  }

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expires_at) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttl_ms?: number): void {
    this.store.set(key, {
      value,
      expires_at: Date.now() + (ttl_ms ?? this.default_ttl_ms),
    });
  }

  buildKey(...parts: unknown[]): string {
    return parts.map((p) => JSON.stringify(p)).join(":");
  }

  clear(): void {
    this.store.clear();
  }
}
