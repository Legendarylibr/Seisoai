/**
 * Authentication middleware tests
 */
import { describe, it, expect } from '@jest/globals';
import { isTokenBlacklisted, blacklistToken } from '../../middleware/auth.js';

describe('Auth Middleware', () => {
  describe('Token Blacklisting', () => {
    it('should return false for non-blacklisted tokens', async () => {
      const result = await isTokenBlacklisted('valid-token-123');
      expect(result).toBe(false);
    });

    it('should return true for blacklisted tokens', async () => {
      const token = 'token-to-blacklist-' + Date.now();
      await blacklistToken(token);
      const result = await isTokenBlacklisted(token);
      expect(result).toBe(true);
    });

    it('should handle undefined tokens', async () => {
      const result = await isTokenBlacklisted(undefined);
      expect(result).toBe(false);
    });

    it('should handle empty string tokens', async () => {
      const result = await isTokenBlacklisted('');
      expect(result).toBe(false);
    });
  });
});

