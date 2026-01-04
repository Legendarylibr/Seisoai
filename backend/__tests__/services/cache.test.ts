/**
 * Cache service tests
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import { LRUCache, TTLCache } from '../../services/cache.js';

describe('LRUCache', () => {
  let cache: LRUCache<string, number>;

  beforeEach(() => {
    cache = new LRUCache<string, number>(3);
  });

  describe('set and get', () => {
    it('should store and retrieve values', () => {
      cache.set('a', 1);
      expect(cache.get('a')).toBe(1);
    });

    it('should return undefined for missing keys', () => {
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('should update existing values', () => {
      cache.set('a', 1);
      cache.set('a', 2);
      expect(cache.get('a')).toBe(2);
    });
  });

  describe('LRU eviction', () => {
    it('should evict least recently used item when full', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      cache.set('d', 4); // Should evict 'a'

      expect(cache.get('a')).toBeUndefined();
      expect(cache.get('b')).toBe(2);
      expect(cache.get('c')).toBe(3);
      expect(cache.get('d')).toBe(4);
    });

    it('should move accessed items to end', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      
      cache.get('a'); // Access 'a', making it most recently used
      cache.set('d', 4); // Should evict 'b' now, not 'a'

      expect(cache.get('a')).toBe(1);
      expect(cache.get('b')).toBeUndefined();
    });
  });

  describe('has', () => {
    it('should return true for existing keys', () => {
      cache.set('a', 1);
      expect(cache.has('a')).toBe(true);
    });

    it('should return false for missing keys', () => {
      expect(cache.has('nonexistent')).toBe(false);
    });
  });

  describe('delete', () => {
    it('should remove items', () => {
      cache.set('a', 1);
      cache.delete('a');
      expect(cache.has('a')).toBe(false);
    });
  });

  describe('size', () => {
    it('should return correct size', () => {
      expect(cache.size).toBe(0);
      cache.set('a', 1);
      expect(cache.size).toBe(1);
      cache.set('b', 2);
      expect(cache.size).toBe(2);
    });
  });

  describe('clear', () => {
    it('should remove all items', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.clear();
      expect(cache.size).toBe(0);
    });
  });

  describe('prune', () => {
    it('should prune to specified count', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      cache.prune(1);
      expect(cache.size).toBe(1);
    });
  });
});

describe('TTLCache', () => {
  let cache: TTLCache<string, number>;

  beforeEach(() => {
    cache = new TTLCache<string, number>(1000); // 1 second default TTL
  });

  describe('set and get', () => {
    it('should store and retrieve values', () => {
      cache.set('a', 1);
      expect(cache.get('a')).toBe(1);
    });

    it('should return undefined for missing keys', () => {
      expect(cache.get('nonexistent')).toBeUndefined();
    });
  });

  describe('TTL expiration', () => {
    it('should expire items after TTL', async () => {
      cache.set('a', 1, 50); // 50ms TTL
      expect(cache.get('a')).toBe(1);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(cache.get('a')).toBeUndefined();
    });

    it('should respect custom TTL', async () => {
      cache.set('short', 1, 50);
      cache.set('long', 2, 200);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(cache.get('short')).toBeUndefined();
      expect(cache.get('long')).toBe(2);
    });
  });

  describe('has', () => {
    it('should return false for expired items', async () => {
      cache.set('a', 1, 50);
      expect(cache.has('a')).toBe(true);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(cache.has('a')).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('should remove expired items', async () => {
      cache.set('a', 1, 50);
      cache.set('b', 2, 50);
      cache.set('c', 3, 200);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      cache.cleanup();
      
      expect(cache.get('a')).toBeUndefined();
      expect(cache.get('b')).toBeUndefined();
      expect(cache.get('c')).toBe(3);
    });
  });
});

