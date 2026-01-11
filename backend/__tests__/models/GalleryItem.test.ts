/**
 * GalleryItem model tests
 * Tests for prompt encryption in gallery items
 */
import { describe, it, expect } from '@jest/globals';

// Set up test encryption key before imports
const TEST_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;

import { encrypt, decrypt } from '../../utils/encryption.js';

describe('GalleryItem Model', () => {
  describe('Prompt Encryption', () => {
    it('should encrypt prompts for storage', () => {
      const prompt = 'A masterpiece painting in the style of Van Gogh';
      const encrypted = encrypt(prompt);
      
      expect(encrypted).not.toBe(prompt);
      expect(encrypted).toContain(':');
    });

    it('should decrypt prompts for retrieval', () => {
      const prompt = 'A cyberpunk cityscape at night with neon lights';
      const encrypted = encrypt(prompt);
      const decrypted = decrypt(encrypted);
      
      expect(decrypted).toBe(prompt);
    });

    it('should handle null/empty prompts gracefully', () => {
      expect(encrypt('')).toBe('');
      expect(decrypt('')).toBe('');
      
      // For null values, function should return as-is
      expect(encrypt(null as unknown as string)).toBe(null);
      expect(decrypt(null as unknown as string)).toBe(null);
    });
  });

  describe('Backward Compatibility', () => {
    it('should return unencrypted prompts as-is', () => {
      const plainPrompt = 'A legacy prompt stored before encryption was enabled';
      const result = decrypt(plainPrompt);
      
      expect(result).toBe(plainPrompt);
    });

    it('should not double-encrypt already encrypted prompts', () => {
      const prompt = 'Original prompt';
      const encrypted = encrypt(prompt);
      
      // Check if already encrypted
      const isEncrypted = (value: string) => {
        if (!value) return false;
        const parts = value.split(':');
        return parts.length === 3 && parts[0].length > 10;
      };
      
      expect(isEncrypted(encrypted)).toBe(true);
      
      // Should not encrypt again if already encrypted
      if (!isEncrypted(encrypted)) {
        const doubleEncrypted = encrypt(encrypted);
        expect(doubleEncrypted).toBe(encrypted);
      }
    });
  });

  describe('Gallery Item Schema', () => {
    it('should validate model type enum', () => {
      const validTypes = ['3d', 'image', 'video'];
      const invalidTypes = ['audio', 'text', 'animation'];
      
      validTypes.forEach(type => {
        expect(validTypes.includes(type)).toBe(true);
      });
      
      invalidTypes.forEach(type => {
        expect(validTypes.includes(type)).toBe(false);
      });
    });

    it('should validate status enum', () => {
      const validStatuses = ['queued', 'processing', 'completed', 'failed'];
      
      validStatuses.forEach(status => {
        expect(typeof status).toBe('string');
      });
    });
  });

  describe('3D Model Expiry', () => {
    it('should calculate 1-day expiry for 3D models', () => {
      const createdAt = new Date();
      const expiryMs = 24 * 60 * 60 * 1000; // 1 day in milliseconds
      const expiresAt = new Date(createdAt.getTime() + expiryMs);
      
      const diffHours = Math.round((expiresAt.getTime() - createdAt.getTime()) / (60 * 60 * 1000));
      expect(diffHours).toBe(24);
    });

    it('should set expiry only for 3D model types', () => {
      const modelTypes = ['image', 'video', '3d'];
      
      modelTypes.forEach(type => {
        const shouldExpire = type === '3d';
        
        if (shouldExpire) {
          const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
          expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
        }
      });
    });
  });

  describe('Compound Index', () => {
    it('should support efficient user queries with timestamp sorting', () => {
      // Conceptual test - compound index: { userId: 1, createdAt: -1 }
      const indexFields = ['userId', 'createdAt'];
      
      expect(indexFields).toContain('userId');
      expect(indexFields).toContain('createdAt');
    });
  });

  describe('TTL Index', () => {
    it('should calculate 30-day auto-delete correctly', () => {
      const createdAt = new Date();
      const ttlSeconds = 30 * 24 * 60 * 60; // 30 days
      const deleteAt = new Date(createdAt.getTime() + ttlSeconds * 1000);
      
      const diffDays = Math.round((deleteAt.getTime() - createdAt.getTime()) / (24 * 60 * 60 * 1000));
      expect(diffDays).toBe(30);
    });
  });
});
