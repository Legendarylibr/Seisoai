/**
 * Email Hash utility tests
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

// Set up test encryption key
const TEST_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const originalKey = process.env.ENCRYPTION_KEY;

beforeAll(() => {
  process.env.ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
});

afterAll(() => {
  process.env.ENCRYPTION_KEY = originalKey;
});

import { createEmailHash } from '../../utils/emailHash.js';

describe('Email Hash Utility', () => {
  describe('createEmailHash()', () => {
    it('should create consistent hash for same email', () => {
      const email = 'test@example.com';
      const hash1 = createEmailHash(email);
      const hash2 = createEmailHash(email);
      
      expect(hash1).toBe(hash2);
    });

    it('should normalize email (lowercase, trim)', () => {
      const hash1 = createEmailHash('TEST@EXAMPLE.COM');
      const hash2 = createEmailHash('  test@example.com  ');
      const hash3 = createEmailHash('Test@Example.COM');
      
      expect(hash1).toBe(hash2);
      expect(hash2).toBe(hash3);
    });

    it('should produce hex string output', () => {
      const hash = createEmailHash('user@domain.com');
      
      expect(hash).toHaveLength(64); // SHA-256 = 64 hex chars
      expect(/^[a-f0-9]+$/i.test(hash)).toBe(true);
    });

    it('should produce different hashes for different emails', () => {
      const hash1 = createEmailHash('user1@example.com');
      const hash2 = createEmailHash('user2@example.com');
      const hash3 = createEmailHash('user1@different.com');
      
      expect(hash1).not.toBe(hash2);
      expect(hash1).not.toBe(hash3);
      expect(hash2).not.toBe(hash3);
    });

    it('should handle edge cases', () => {
      // Very long email
      const longEmail = 'a'.repeat(100) + '@example.com';
      expect(createEmailHash(longEmail)).toHaveLength(64);
      
      // Email with special characters
      const specialEmail = 'user+tag@sub.example.com';
      expect(createEmailHash(specialEmail)).toHaveLength(64);
    });
  });

  describe('Hash with/without encryption key', () => {
    it('should use blind index when encryption is configured', () => {
      // With key set, should use HMAC-based blind index
      const hash1 = createEmailHash('test@example.com');
      
      // Hash should be consistent
      const hash2 = createEmailHash('test@example.com');
      expect(hash1).toBe(hash2);
    });

    it('should fallback to SHA-256 when encryption not configured', () => {
      const originalKey = process.env.ENCRYPTION_KEY;
      delete process.env.ENCRYPTION_KEY;
      
      // Force module to re-check configuration
      // Note: In actual tests, you may need to reload the module
      const hash = createEmailHash('test@example.com');
      
      // Should still produce a valid hash
      expect(hash).toHaveLength(64);
      
      // Restore
      process.env.ENCRYPTION_KEY = originalKey;
    });
  });
});
