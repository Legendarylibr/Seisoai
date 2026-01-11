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
      const firstKey = this.cache.keys().next().value as K | undefined;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
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
      const key = keysIterator.next().value as K | undefined;
      if (key !== undefined) {
        this.cache.delete(key);
      }
    }
  }
}

/**
 * TTL (Time To Live) Cache
 * Automatically expires entries after specified time
 * Memory-optimized with max size limit and automatic eviction
 */
interface TTLValue<T> {
  value: T;
  expiresAt: number;
}

export class TTLCache<K, V> {
  private cache: Map<K, TTLValue<V>>;
  private defaultTTL: number;
  private maxSize: number;

  constructor(defaultTTL: number = 60000, maxSize: number = 10000) {
    this.cache = new Map();
    this.defaultTTL = defaultTTL;
    this.maxSize = maxSize;
  }

  set(key: K, value: V, ttl: number = this.defaultTTL): void {
    // Evict oldest entries if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictOldest();
    }
    
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

  get size(): number {
    return this.cache.size;
  }

  clear(): void {
    this.cache.clear();
  }

  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Evict oldest/expired entries when cache is full
   * First removes expired, then oldest entries if still over limit
   */
  private evictOldest(): void {
    const now = Date.now();
    let evicted = 0;
    const targetEvictions = Math.ceil(this.maxSize * 0.1); // Evict 10% when full

    // First pass: remove expired entries
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        evicted++;
        if (evicted >= targetEvictions) return;
      }
    }

    // Second pass: remove oldest entries (first inserted due to Map ordering)
    const keysIterator = this.cache.keys();
    while (evicted < targetEvictions) {
      const result = keysIterator.next();
      if (result.done) break;
      this.cache.delete(result.value);
      evicted++;
    }
  }
}

export default { LRUCache, TTLCache };

