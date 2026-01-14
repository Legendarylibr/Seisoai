/**
 * Email service tests
 */
import { describe, it, expect } from '@jest/globals';
import { generateResetToken, hashResetToken } from '../../services/email.js';

describe('Email Service', () => {
  describe('generateResetToken', () => {
    it('should generate a token and hash pair', () => {
      const result = generateResetToken();
      
      expect(result).toHaveProperty('token');
      expect(result).toHaveProperty('hash');
      expect(typeof result.token).toBe('string');
      expect(typeof result.hash).toBe('string');
    });

    it('should generate 64-character hex tokens', () => {
      const { token } = generateResetToken();
      
      expect(token.length).toBe(64);
      expect(/^[a-f0-9]+$/.test(token)).toBe(true);
    });

    it('should generate 64-character hex hashes', () => {
      const { hash } = generateResetToken();
      
      expect(hash.length).toBe(64);
      expect(/^[a-f0-9]+$/.test(hash)).toBe(true);
    });

    it('should generate unique tokens each time', () => {
      const tokens = new Set<string>();
      
      for (let i = 0; i < 100; i++) {
        const { token } = generateResetToken();
        expect(tokens.has(token)).toBe(false);
        tokens.add(token);
      }
    });

    it('should generate unique hashes each time', () => {
      const hashes = new Set<string>();
      
      for (let i = 0; i < 100; i++) {
        const { hash } = generateResetToken();
        expect(hashes.has(hash)).toBe(false);
        hashes.add(hash);
      }
    });

    it('should generate different hash from token', () => {
      const { token, hash } = generateResetToken();
      expect(token).not.toBe(hash);
    });
  });

  describe('hashResetToken', () => {
    it('should produce consistent hashes for same input', () => {
      const token = 'test-token-12345';
      const hash1 = hashResetToken(token);
      const hash2 = hashResetToken(token);
      
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different inputs', () => {
      const hash1 = hashResetToken('token-a');
      const hash2 = hashResetToken('token-b');
      
      expect(hash1).not.toBe(hash2);
    });

    it('should produce 64-character hex hashes', () => {
      const hash = hashResetToken('any-token');
      
      expect(hash.length).toBe(64);
      expect(/^[a-f0-9]+$/.test(hash)).toBe(true);
    });

    it('should match the hash from generateResetToken', () => {
      const { token, hash } = generateResetToken();
      const recomputedHash = hashResetToken(token);
      
      expect(recomputedHash).toBe(hash);
    });

    it('should handle empty string', () => {
      const hash = hashResetToken('');
      expect(hash.length).toBe(64);
    });

    it('should handle special characters', () => {
      const hash = hashResetToken('token-with-special-chars!@#$%^&*()');
      expect(hash.length).toBe(64);
    });
  });
});
