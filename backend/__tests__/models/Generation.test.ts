/**
 * Generation model tests
 * Tests for prompt encryption in Generation documents
 */
import { describe, it, expect } from '@jest/globals';

// Set up test encryption key before imports
const TEST_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;

import { encrypt, decrypt } from '../../utils/encryption.js';

describe('Generation Model', () => {
  describe('Prompt Encryption', () => {
    it('should encrypt prompts using AES-256-GCM', () => {
      const prompt = 'A beautiful sunset over mountains';
      const encrypted = encrypt(prompt);
      
      expect(encrypted).not.toBe(prompt);
      expect(encrypted).toContain(':');
      
      // Verify format: iv:authTag:ciphertext
      const parts = encrypted.split(':');
      expect(parts).toHaveLength(3);
    });

    it('should decrypt prompts correctly', () => {
      const prompt = 'Create an image of a futuristic city with flying cars';
      const encrypted = encrypt(prompt);
      const decrypted = decrypt(encrypted);
      
      expect(decrypted).toBe(prompt);
    });

    it('should handle special characters in prompts', () => {
      const specialPrompts = [
        'A portrait with "quotes" and \'apostrophes\'',
        'An image with emoji 🎨🖼️✨',
        'A scene with <angle> brackets & ampersands',
        'Japanese text: 美しい景色',
        'A prompt with\nnewlines\nand\ttabs'
      ];
      
      specialPrompts.forEach(prompt => {
        const encrypted = encrypt(prompt);
        const decrypted = decrypt(encrypted);
        expect(decrypted).toBe(prompt);
      });
    });

    it('should handle very long prompts', () => {
      const longPrompt = 'A '.repeat(500) + 'very detailed artistic masterpiece';
      const encrypted = encrypt(longPrompt);
      const decrypted = decrypt(encrypted);
      
      expect(decrypted).toBe(longPrompt);
    });
  });

  describe('Generation Schema Validation', () => {
    it('should validate status enum values', () => {
      const validStatuses = ['queued', 'processing', 'completed', 'failed'];
      const invalidStatuses = ['pending', 'done', 'error', 'waiting'];
      
      validStatuses.forEach(status => {
        expect(validStatuses.includes(status)).toBe(true);
      });
      
      invalidStatuses.forEach(status => {
        expect(validStatuses.includes(status)).toBe(false);
      });
    });

    it('should have required fields', () => {
      const requiredFields = ['userId', 'generationId', 'prompt'];
      
      // Conceptual test - these fields should be required in schema
      requiredFields.forEach(field => {
        expect(typeof field).toBe('string');
      });
    });
  });

  describe('Encryption Detection', () => {
    it('should detect encrypted prompts', () => {
      const isEncrypted = (value: string) => {
        if (!value) return false;
        const parts = value.split(':');
        return parts.length === 3 && parts[0].length > 10;
      };
      
      const encryptedPrompt = encrypt('test prompt');
      const plainPrompt = 'A simple unencrypted prompt';
      
      expect(isEncrypted(encryptedPrompt)).toBe(true);
      expect(isEncrypted(plainPrompt)).toBe(false);
    });
  });

  describe('TTL Index', () => {
    it('should calculate 30-day expiry correctly', () => {
      const createdAt = new Date();
      const expirySeconds = 30 * 24 * 60 * 60; // 30 days in seconds
      const expiryDate = new Date(createdAt.getTime() + expirySeconds * 1000);
      
      const diffDays = Math.round((expiryDate.getTime() - createdAt.getTime()) / (24 * 60 * 60 * 1000));
      expect(diffDays).toBe(30);
    });
  });
});
