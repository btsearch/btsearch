type TTLCacheEntry<Value> = {
  value: Value;
  expiresAt: number;
  size: number;
};

export type TTLCacheHit<Value> = {
  value: Value;
  remainingTtlMs: number;
};

export class BoundedTTLCache<Key, Value> {
  private readonly entries = new Map<Key, TTLCacheEntry<Value>>();
  private totalSize = 0;

  constructor(
    private readonly maxEntries: number,
    private readonly maxSize: number,
    private readonly getSize: (value: Value) => number,
  ) {
    if (!Number.isSafeInteger(maxEntries) || maxEntries < 1) throw new RangeError("Cache entry limit must be a positive integer");
    if (!Number.isSafeInteger(maxSize) || maxSize < 1) throw new RangeError("Cache size limit must be a positive integer");
  }

  get(key: Key, now = Date.now()): TTLCacheHit<Value> | null {
    const entry = this.entries.get(key);
    if (!entry) return null;

    const remainingTtlMs = entry.expiresAt - now;
    if (remainingTtlMs <= 0) {
      this.remove(key, entry);
      return null;
    }

    this.entries.delete(key);
    this.entries.set(key, entry);
    return { value: entry.value, remainingTtlMs };
  }

  set(key: Key, value: Value, ttlMs: number, now = Date.now()): void {
    if (ttlMs <= 0) return;

    const size = this.getSize(value);
    if (!Number.isSafeInteger(size) || size < 0 || size > this.maxSize) return;

    const existing = this.entries.get(key);
    if (existing) this.remove(key, existing);

    while (this.entries.size >= this.maxEntries || this.totalSize + size > this.maxSize) {
      const oldest = this.entries.entries().next();
      if (oldest.done) break;
      this.remove(...oldest.value);
    }

    this.entries.set(key, { value, size, expiresAt: now + ttlMs });
    this.totalSize += size;
  }

  private remove(key: Key, entry: TTLCacheEntry<Value>): void {
    if (!this.entries.delete(key)) return;
    this.totalSize -= entry.size;
  }
}
