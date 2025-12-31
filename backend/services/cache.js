/**
 * Cache utilities
 * LRU and TTL caches for various purposes
 */

/**
 * LRU (Least Recently Used) Cache
 * Automatically evicts oldest entries when full
 */
export class LRUCache {
  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  set(key, value) {
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

  get(key) {
    if (this.cache.has(key)) {
      const value = this.cache.get(key);
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
      return value;
    }
    return undefined;
  }

  has(key) {
    return this.cache.has(key);
  }

  delete(key) {
    return this.cache.delete(key);
  }

  get size() {
    return this.cache.size;
  }

  clear() {
    this.cache.clear();
  }

  prune(keepCount = this.maxSize) {
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
export class TTLCache {
  constructor(defaultTTL = 60000) {
    this.cache = new Map();
    this.defaultTTL = defaultTTL;
  }

  set(key, value, ttl = this.defaultTTL) {
    const expiresAt = Date.now() + ttl;
    this.cache.set(key, { value, expiresAt });
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.value;
  }

  has(key) {
    return this.get(key) !== undefined;
  }

  delete(key) {
    return this.cache.delete(key);
  }

  cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }
}

export default { LRUCache, TTLCache };



