/**
 * Authentication middleware tests
 */
import { describe, it, expect } from '@jest/globals';
import { isTokenBlacklisted, blacklistToken } from '../../middleware/auth.js';

describe('Auth Middleware', () => {
  describe('Token Blacklisting', () => {
    it('should return false for non-blacklisted tokens', () => {
      const result = isTokenBlacklisted('valid-token-123');
      expect(result).toBe(false);
    });

    it('should return true for blacklisted tokens', () => {
      const token = 'token-to-blacklist-' + Date.now();
      blacklistToken(token);
      expect(isTokenBlacklisted(token)).toBe(true);
    });

    it('should handle undefined tokens', () => {
      expect(isTokenBlacklisted(undefined)).toBe(false);
    });

    it('should handle empty string tokens', () => {
      expect(isTokenBlacklisted('')).toBe(false);
    });
  });
});

