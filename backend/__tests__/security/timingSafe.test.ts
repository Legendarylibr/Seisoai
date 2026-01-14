/**
 * Timing-safe comparison tests
 * Ensures constant-time comparisons are used for sensitive data
 */
import { describe, it, expect } from '@jest/globals';
import crypto from 'crypto';

describe('Timing-Safe Comparisons', () => {
  describe('crypto.timingSafeEqual behavior', () => {
    it('should return true for equal buffers', () => {
      const a = Buffer.from('secret-value');
      const b = Buffer.from('secret-value');
      
      expect(crypto.timingSafeEqual(a, b)).toBe(true);
    });

    it('should return false for different buffers', () => {
      const a = Buffer.from('secret-value-a');
      const b = Buffer.from('secret-value-b');
      
      expect(crypto.timingSafeEqual(a, b)).toBe(false);
    });

    it('should throw for different length buffers', () => {
      const a = Buffer.from('short');
      const b = Buffer.from('much-longer-string');
      
      expect(() => crypto.timingSafeEqual(a, b)).toThrow();
    });

    it('should work with hex strings converted to buffers', () => {
      const secret = crypto.randomBytes(32).toString('hex');
      const a = Buffer.from(secret, 'utf8');
      const b = Buffer.from(secret, 'utf8');
      
      expect(crypto.timingSafeEqual(a, b)).toBe(true);
    });
  });

  describe('Safe comparison pattern', () => {
    function safeCompare(a: string, b: string): boolean {
      if (!a || !b || a.length !== b.length) {
        return false;
      }
      try {
        const bufA = Buffer.from(a, 'utf8');
        const bufB = Buffer.from(b, 'utf8');
        return crypto.timingSafeEqual(bufA, bufB);
      } catch {
        return false;
      }
    }

    it('should return true for matching strings', () => {
      const secret = 'my-secret-token-12345';
      expect(safeCompare(secret, secret)).toBe(true);
    });

    it('should return false for non-matching strings', () => {
      expect(safeCompare('secret-a', 'secret-b')).toBe(false);
    });

    it('should return false for different lengths', () => {
      expect(safeCompare('short', 'much-longer')).toBe(false);
    });

    it('should return false for empty strings', () => {
      expect(safeCompare('', '')).toBe(false);
      expect(safeCompare('value', '')).toBe(false);
      expect(safeCompare('', 'value')).toBe(false);
    });

    it('should handle unicode correctly', () => {
      const a = 'password-with-émoji-🔐';
      const b = 'password-with-émoji-🔐';
      expect(safeCompare(a, b)).toBe(true);
    });
  });
});
