/**
 * Cache utilities
 * LRU and TTL caches for various purposes
 */

/**
 * LRU (Least Recently Used) Cache
 * Automatically evicts oldest entries when full
 */
export class LRUCache<K, V> {
  private maxSize: number;
  private cache: Map<K, V>;

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      // Move to end (most recently used)
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Remove least recently used (first item)
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  get(key: K): V | undefined {
    if (this.cache.has(key)) {
      const value = this.cache.get(key)!;
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
      return value;
    }
    return undefined;
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  get size(): number {
    return this.cache.size;
  }

  clear(): void {
    this.cache.clear();
  }

  prune(keepCount: number = this.maxSize): void {
    if (this.cache.size <= keepCount) return;
    const toRemove = this.cache.size - keepCount;
    const keysIterator = this.cache.keys();
    for (let i = 0; i < toRemove; i++) {
      const key = keysIterator.next().value;
      this.cache.delete(key);
    }
  }
}

/**
 * TTL (Time To Live) Cache
 * Automatically expires entries after specified time
 */
interface TTLValue<T> {
  value: T;
  expiresAt: number;
}

export class TTLCache<K, V> {
  private cache: Map<K, TTLValue<V>>;
  private defaultTTL: number;

  constructor(defaultTTL: number = 60000) {
    this.cache = new Map();
    this.defaultTTL = defaultTTL;
  }

  set(key: K, value: V, ttl: number = this.defaultTTL): void {
    const expiresAt = Date.now() + ttl;
    this.cache.set(key, { value, expiresAt });
  }

  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.value;
  }

  has(key: K): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }
}

export default { LRUCache, TTLCache };

