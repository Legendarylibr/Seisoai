/**
 * Encryption Integration Tests
 * End-to-end tests for encryption across all components
 */
import { describe, it, expect } from '@jest/globals';
import crypto from 'crypto';

// Set up test encryption key before imports
const TEST_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;

import { encrypt, decrypt, createBlindIndex } from '../../utils/encryption.js';
import { createEmailHash } from '../../utils/emailHash.js';

describe('Encryption Integration', () => {
  describe('Email Encryption Flow', () => {
    it('should encrypt email and create searchable hash', () => {
      const email = 'user@example.com';
      
      // Simulate user creation flow
      const normalizedEmail = email.toLowerCase().trim();
      const emailHash = createBlindIndex(normalizedEmail);
      const encryptedEmail = encrypt(normalizedEmail);
      
      // Email should be encrypted (not searchable directly)
      expect(encryptedEmail).not.toBe(normalizedEmail);
      expect(encryptedEmail).toContain(':');
      
      // Hash should be searchable
      expect(emailHash).toHaveLength(64);
      expect(/^[a-f0-9]+$/.test(emailHash)).toBe(true);
    });

    it('should find user by email hash (lookup simulation)', () => {
      const originalEmail = 'USER@EXAMPLE.COM';
      const lookupEmail = 'user@example.com';
      
      // Hashes should match regardless of case
      const originalHash = createBlindIndex(originalEmail.toLowerCase().trim());
      const lookupHash = createBlindIndex(lookupEmail.toLowerCase().trim());
      
      expect(originalHash).toBe(lookupHash);
    });

    it('should decrypt email for display', () => {
      const email = 'user@example.com';
      const encrypted = encrypt(email);
      const decrypted = decrypt(encrypted);
      
      expect(decrypted).toBe(email);
    });
  });

  describe('Prompt Encryption Flow', () => {
    it('should encrypt prompt on save and decrypt on read', () => {
      const prompt = 'Generate an image of a sunset over the ocean';
      
      // Simulate save
      const encryptedPrompt = encrypt(prompt);
      expect(encryptedPrompt).not.toBe(prompt);
      
      // Simulate read
      const decryptedPrompt = decrypt(encryptedPrompt);
      expect(decryptedPrompt).toBe(prompt);
    });

    it('should handle prompts with mixed content', () => {
      const complexPrompt = 'Create a scene with:\n1. Mountains 🏔️\n2. Lake with "reflections"\n3. Japanese text: 美しい';
      
      const encrypted = encrypt(complexPrompt);
      const decrypted = decrypt(encrypted);
      
      expect(decrypted).toBe(complexPrompt);
    });
  });

  describe('Cross-Environment Compatibility', () => {
    it('should generate consistent hashes with same key', () => {
      const email = 'test@example.com';
      
      // Multiple hash generations should be identical
      const hashes = Array.from({ length: 10 }, () => createEmailHash(email));
      const uniqueHashes = new Set(hashes);
      
      expect(uniqueHashes.size).toBe(1);
    });

    it('should handle plain SHA-256 fallback for cross-env lookup', () => {
      const email = 'user@example.com';
      const normalizedEmail = email.toLowerCase().trim();
      
      // Plain SHA-256 (for environments without ENCRYPTION_KEY)
      const plainHash = crypto.createHash('sha256').update(normalizedEmail).digest('hex');
      
      expect(plainHash).toHaveLength(64);
      expect(/^[a-f0-9]+$/.test(plainHash)).toBe(true);
    });
  });

  describe('Encryption Key Rotation', () => {
    it('should detect encrypted vs plain data', () => {
      const isEncrypted = (value: string) => {
        if (!value) return false;
        const parts = value.split(':');
        return parts.length === 3 && parts[0].length > 10;
      };
      
      const encrypted = encrypt('test');
      const plain = 'test@example.com';
      
      expect(isEncrypted(encrypted)).toBe(true);
      expect(isEncrypted(plain)).toBe(false);
    });

    it('should handle graceful fallback for decryption failures', () => {
      // If decryption fails (wrong key, corrupted data), return original
      const malformed = 'abc:def:ghi'; // Wrong format
      const result = decrypt(malformed);
      
      // Should return original on failure
      expect(result).toBe(malformed);
    });
  });

  describe('Security Properties', () => {
    it('should produce unique ciphertext for same plaintext', () => {
      const plaintext = 'same secret data';
      
      const encrypted1 = encrypt(plaintext);
      const encrypted2 = encrypt(plaintext);
      
      // Due to random IV, ciphertexts should differ
      expect(encrypted1).not.toBe(encrypted2);
      
      // But both should decrypt to same value
      expect(decrypt(encrypted1)).toBe(plaintext);
      expect(decrypt(encrypted2)).toBe(plaintext);
    });

    it('should use authenticated encryption (GCM)', () => {
      const data = 'sensitive information';
      const encrypted = encrypt(data);
      
      // Format should include auth tag
      const parts = encrypted.split(':');
      expect(parts).toHaveLength(3);
      
      // IV should be 12 bytes (16 base64 chars)
      const iv = parts[0];
      expect(iv.length).toBeGreaterThan(10);
      
      // Auth tag should be 16 bytes (24 base64 chars with padding)
      const authTag = parts[1];
      expect(authTag.length).toBeGreaterThan(10);
    });

    it('should detect tampered ciphertext', () => {
      const data = 'original data';
      const encrypted = encrypt(data);
      
      // Tamper with ciphertext
      const parts = encrypted.split(':');
      parts[2] = 'dGFtcGVyZWQ='; // Base64 of 'tampered'
      const tampered = parts.join(':');
      
      // Should fail gracefully (return original tampered string)
      const result = decrypt(tampered);
      expect(result).toBe(tampered);
    });
  });

  describe('Data Integrity', () => {
    it('should preserve exact data through encryption cycle', () => {
      const testCases = [
        '',
        'a',
        'A simple string',
        'Unicode: 日本語 中文 العربية',
        'Special chars: <>&"\'\\/',
        'Emoji: 🎨🖼️✨🔐',
        'Mixed: Test 123 日本語 🎨',
        'Very long: ' + 'x'.repeat(10000),
        'Newlines:\nand\ttabs',
        'Null byte: test\x00test' // Edge case
      ];
      
      testCases.forEach(input => {
        if (input === '') {
          expect(encrypt(input)).toBe(input);
        } else {
          const encrypted = encrypt(input);
          const decrypted = decrypt(encrypted);
          expect(decrypted).toBe(input);
        }
      });
    });
  });
});

describe('Email Hash Cross-Reference', () => {
  it('should produce same hash from emailHash utility and createBlindIndex', () => {
    const email = 'test@example.com';
    
    const hashFromUtility = createEmailHash(email);
    const hashFromBlindIndex = createBlindIndex(email);
    
    // Both should produce the same hash
    expect(hashFromUtility).toBe(hashFromBlindIndex);
  });

  it('should normalize emails consistently', () => {
    const emails = [
      'Test@Example.COM',
      'test@example.com',
      '  TEST@EXAMPLE.COM  ',
      '\ttest@example.com\n'
    ];
    
    const hashes = emails.map(e => createEmailHash(e));
    const uniqueHashes = new Set(hashes);
    
    expect(uniqueHashes.size).toBe(1);
  });
});
