/**
 * Encryption utility tests
 * Tests for AES-256-GCM field-level encryption
 */
import { describe, it, expect, afterAll } from '@jest/globals';

// Set up test encryption key before importing encryption module
const TEST_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;

// Import after setting environment
import {
  encrypt,
  decrypt,
  createBlindIndex,
  encryptFields,
  decryptFields,
  isEncryptionConfigured,
  generateEncryptionKey,
  encryptUserData,
  decryptUserData
} from '../../utils/encryption.js';

describe('Encryption Utility', () => {
  describe('Configuration', () => {
    it('should detect when encryption is configured', () => {
      expect(isEncryptionConfigured()).toBe(true);
    });

    it('should generate valid encryption keys', () => {
      const key = generateEncryptionKey();
      expect(key).toHaveLength(64); // 32 bytes = 64 hex characters
      expect(/^[a-f0-9]+$/i.test(key)).toBe(true);
    });
  });

  describe('encrypt()', () => {
    it('should encrypt a plain string', () => {
      const plaintext = 'test@example.com';
      const encrypted = encrypt(plaintext);
      
      expect(encrypted).not.toBe(plaintext);
      expect(encrypted).toContain(':'); // Format: iv:authTag:ciphertext
    });

    it('should produce encrypted output in correct format', () => {
      const encrypted = encrypt('hello world');
      const parts = encrypted.split(':');
      
      expect(parts).toHaveLength(3);
      // All parts should be base64 encoded
      parts.forEach(part => {
        expect(() => Buffer.from(part, 'base64')).not.toThrow();
      });
    });

    it('should return empty/null values unchanged', () => {
      expect(encrypt('')).toBe('');
      expect(encrypt(null as unknown as string)).toBe(null);
      expect(encrypt(undefined as unknown as string)).toBe(undefined);
    });

    it('should produce different ciphertext for same plaintext (due to random IV)', () => {
      const plaintext = 'same text';
      const encrypted1 = encrypt(plaintext);
      const encrypted2 = encrypt(plaintext);
      
      expect(encrypted1).not.toBe(encrypted2);
    });

    it('should handle unicode and special characters', () => {
      const special = 'Test 🔐 日本語 émojis & <special> "chars"';
      const encrypted = encrypt(special);
      const decrypted = decrypt(encrypted);
      
      expect(decrypted).toBe(special);
    });

    it('should handle very long strings', () => {
      const longText = 'a'.repeat(10000);
      const encrypted = encrypt(longText);
      const decrypted = decrypt(encrypted);
      
      expect(decrypted).toBe(longText);
    });
  });

  describe('decrypt()', () => {
    it('should decrypt an encrypted string', () => {
      const plaintext = 'secret data';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);
      
      expect(decrypted).toBe(plaintext);
    });

    it('should return unencrypted strings unchanged (backward compatibility)', () => {
      const plain = 'plain@email.com';
      expect(decrypt(plain)).toBe(plain);
    });

    it('should return empty/null values unchanged', () => {
      expect(decrypt('')).toBe('');
      expect(decrypt(null as unknown as string)).toBe(null);
    });

    it('should handle malformed encrypted data gracefully', () => {
      // Invalid format - should return as-is
      expect(decrypt('not:valid:format:extra')).toBe('not:valid:format:extra');
      expect(decrypt('singlepart')).toBe('singlepart');
    });

    it('should handle tampered data gracefully', () => {
      const encrypted = encrypt('original');
      // Tamper with the ciphertext portion
      const parts = encrypted.split(':');
      parts[2] = 'dGFtcGVyZWQ='; // 'tampered' in base64
      const tampered = parts.join(':');
      
      // Should return tampered string (decryption fails, returns original)
      const result = decrypt(tampered);
      expect(result).toBe(tampered);
    });
  });

  describe('createBlindIndex()', () => {
    it('should create consistent hash for same input', () => {
      const email = 'test@example.com';
      const hash1 = createBlindIndex(email);
      const hash2 = createBlindIndex(email);
      
      expect(hash1).toBe(hash2);
    });

    it('should normalize input (lowercase, trim)', () => {
      const hash1 = createBlindIndex('TEST@EXAMPLE.COM');
      const hash2 = createBlindIndex('  test@example.com  ');
      
      expect(hash1).toBe(hash2);
    });

    it('should produce hex string output', () => {
      const hash = createBlindIndex('test@example.com');
      
      expect(hash).toHaveLength(64); // SHA-256 = 64 hex chars
      expect(/^[a-f0-9]+$/i.test(hash)).toBe(true);
    });

    it('should return empty string for empty input', () => {
      expect(createBlindIndex('')).toBe('');
    });

    it('should produce different hashes for different inputs', () => {
      const hash1 = createBlindIndex('user1@example.com');
      const hash2 = createBlindIndex('user2@example.com');
      
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('encryptFields()', () => {
    it('should encrypt specified fields in an object', () => {
      const obj: Record<string, string> = {
        email: 'test@example.com',
        name: 'John',
        password: 'secret123'
      };
      
      const encrypted = encryptFields(obj, ['email', 'password']);
      
      expect(encrypted.email).not.toBe('test@example.com');
      expect(encrypted.email).toContain(':');
      expect(encrypted.password).not.toBe('secret123');
      expect(encrypted.password).toContain(':');
      expect(encrypted.name).toBe('John'); // Not in list, unchanged
    });

    it('should not modify original object', () => {
      const original: Record<string, string> = { email: 'test@example.com' };
      encryptFields(original, ['email']);
      
      expect(original.email).toBe('test@example.com');
    });

    it('should handle missing fields gracefully', () => {
      const obj: Record<string, string> = { name: 'John' };
      const encrypted = encryptFields(obj, ['email', 'name']);
      
      expect(encrypted.name).toContain(':'); // encrypted
      expect(encrypted.email).toBeUndefined();
    });
  });

  describe('decryptFields()', () => {
    it('should decrypt specified fields in an object', () => {
      const original = {
        email: 'test@example.com',
        password: 'secret123',
        name: 'John'
      };
      
      const encrypted = encryptFields(original, ['email', 'password']);
      const decrypted = decryptFields(encrypted, ['email', 'password']);
      
      expect(decrypted.email).toBe('test@example.com');
      expect(decrypted.password).toBe('secret123');
      expect(decrypted.name).toBe('John');
    });
  });

  describe('encryptUserData()', () => {
    it('should encrypt email and create emailHash', () => {
      const userData = {
        email: 'user@example.com',
        credits: 100
      };
      
      const encrypted = encryptUserData(userData);
      
      expect(encrypted.email).not.toBe('user@example.com');
      expect(encrypted.email).toContain(':');
      expect(encrypted.emailHash).toBeDefined();
      expect(encrypted.emailHash).toHaveLength(64);
      expect(encrypted.credits).toBe(100);
    });

    it('should handle missing email gracefully', () => {
      const userData = { credits: 50 };
      const encrypted = encryptUserData(userData);
      
      expect(encrypted.credits).toBe(50);
      expect(encrypted.emailHash).toBeUndefined();
    });
  });

  describe('decryptUserData()', () => {
    it('should decrypt email in user data', () => {
      const original = {
        email: 'user@example.com',
        credits: 100
      };
      
      const encrypted = encryptUserData(original);
      const decrypted = decryptUserData(encrypted);
      
      expect(decrypted.email).toBe('user@example.com');
      expect(decrypted.credits).toBe(100);
    });
  });

  describe('Round-trip encryption', () => {
    it('should handle email encryption/decryption cycle', () => {
      const emails = [
        'simple@example.com',
        'user+tag@example.org',
        'unicode.日本語@example.com',
        'very.long.email.address.with.many.parts@subdomain.example.com'
      ];
      
      emails.forEach(email => {
        const encrypted = encrypt(email);
        const decrypted = decrypt(encrypted);
        expect(decrypted).toBe(email);
      });
    });

    it('should handle prompt encryption/decryption cycle', () => {
      const prompts = [
        'A simple prompt',
        'A prompt with "quotes" and \'apostrophes\'',
        'A prompt with emoji 🎨🖼️🎬',
        'A very long prompt that contains many details about the image generation request including style, composition, lighting, and other artistic elements that the user wants to see in their generated artwork'
      ];
      
      prompts.forEach(prompt => {
        const encrypted = encrypt(prompt);
        const decrypted = decrypt(encrypted);
        expect(decrypted).toBe(prompt);
      });
    });
  });
});

describe('Encryption without key', () => {
  const originalKey = process.env.ENCRYPTION_KEY;
  
  afterAll(() => {
    // Restore key after tests
    process.env.ENCRYPTION_KEY = originalKey;
  });

  it('should throw when encrypting without key configured', () => {
    delete process.env.ENCRYPTION_KEY;
    
    // Force re-check of configuration
    expect(isEncryptionConfigured()).toBe(false);
    expect(() => encrypt('test')).toThrow('Encryption failed');
    
    // Restore for other tests
    process.env.ENCRYPTION_KEY = originalKey;
  });
});
