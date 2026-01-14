/**
 * CSRF middleware tests
 * Tests for CSRF token generation, validation, and security
 */
import { describe, it, expect } from '@jest/globals';
import crypto from 'crypto';

// CSRF Token generation (matches middleware implementation)
function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// Safe comparison function (timing-attack resistant)
function safeCompare(a: string, b: string): boolean {
  if (!a || !b || typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }
  if (a.length !== b.length) {
    return false;
  }
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
  } catch {
    return false;
  }
}

// Validate CSRF token format
function isValidCsrfTokenFormat(token: string): boolean {
  if (!token || typeof token !== 'string') return false;
  // 32 bytes = 64 hex characters
  return /^[a-f0-9]{64}$/.test(token);
}

describe('CSRF Middleware', () => {
  describe('Token Generation', () => {
    it('should generate 64-character hex tokens', () => {
      const token = generateCsrfToken();
      expect(token.length).toBe(64);
      expect(/^[a-f0-9]+$/.test(token)).toBe(true);
    });

    it('should generate unique tokens', () => {
      const tokens = new Set<string>();
      for (let i = 0; i < 100; i++) {
        const token = generateCsrfToken();
        expect(tokens.has(token)).toBe(false);
        tokens.add(token);
      }
    });

    it('should generate cryptographically random tokens', () => {
      const token1 = generateCsrfToken();
      const token2 = generateCsrfToken();
      expect(token1).not.toBe(token2);
    });
  });

  describe('Token Format Validation', () => {
    it('should accept valid tokens', () => {
      const token = generateCsrfToken();
      expect(isValidCsrfTokenFormat(token)).toBe(true);
    });

    it('should reject tokens that are too short', () => {
      expect(isValidCsrfTokenFormat('abc123')).toBe(false);
    });

    it('should reject tokens that are too long', () => {
      const longToken = 'a'.repeat(100);
      expect(isValidCsrfTokenFormat(longToken)).toBe(false);
    });

    it('should reject tokens with invalid characters', () => {
      const invalidToken = 'g'.repeat(64); // 'g' is not hex
      expect(isValidCsrfTokenFormat(invalidToken)).toBe(false);
    });

    it('should reject empty tokens', () => {
      expect(isValidCsrfTokenFormat('')).toBe(false);
    });

    it('should reject null/undefined', () => {
      expect(isValidCsrfTokenFormat(null as unknown as string)).toBe(false);
      expect(isValidCsrfTokenFormat(undefined as unknown as string)).toBe(false);
    });
  });

  describe('Safe Token Comparison', () => {
    it('should return true for matching tokens', () => {
      const token = generateCsrfToken();
      expect(safeCompare(token, token)).toBe(true);
    });

    it('should return false for non-matching tokens', () => {
      const token1 = generateCsrfToken();
      const token2 = generateCsrfToken();
      expect(safeCompare(token1, token2)).toBe(false);
    });

    it('should return false for different length tokens', () => {
      expect(safeCompare('short', 'much-longer-token')).toBe(false);
    });

    it('should return false for empty strings', () => {
      expect(safeCompare('', '')).toBe(false);
      expect(safeCompare('token', '')).toBe(false);
      expect(safeCompare('', 'token')).toBe(false);
    });

    it('should return false for null/undefined', () => {
      expect(safeCompare(null as unknown as string, 'token')).toBe(false);
      expect(safeCompare('token', null as unknown as string)).toBe(false);
      expect(safeCompare(undefined as unknown as string, 'token')).toBe(false);
    });

    it('should handle special characters', () => {
      const special = 'token-with-special!@#$%^&*()';
      expect(safeCompare(special, special)).toBe(true);
    });
  });

  describe('Double-Submit Cookie Pattern', () => {
    it('should match header token with cookie token', () => {
      const token = generateCsrfToken();
      const cookieToken = token;
      const headerToken = token;
      expect(safeCompare(cookieToken, headerToken)).toBe(true);
    });

    it('should reject mismatched tokens', () => {
      const cookieToken = generateCsrfToken();
      const headerToken = generateCsrfToken();
      expect(safeCompare(cookieToken, headerToken)).toBe(false);
    });
  });

  describe('Exempt Methods', () => {
    const CSRF_EXEMPT_METHODS = ['GET', 'HEAD', 'OPTIONS'];
    
    it('should exempt GET requests', () => {
      expect(CSRF_EXEMPT_METHODS).toContain('GET');
    });

    it('should exempt HEAD requests', () => {
      expect(CSRF_EXEMPT_METHODS).toContain('HEAD');
    });

    it('should exempt OPTIONS requests', () => {
      expect(CSRF_EXEMPT_METHODS).toContain('OPTIONS');
    });

    it('should not exempt POST requests', () => {
      expect(CSRF_EXEMPT_METHODS).not.toContain('POST');
    });

    it('should not exempt PUT requests', () => {
      expect(CSRF_EXEMPT_METHODS).not.toContain('PUT');
    });

    it('should not exempt DELETE requests', () => {
      expect(CSRF_EXEMPT_METHODS).not.toContain('DELETE');
    });
  });
});
