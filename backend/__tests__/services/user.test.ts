/**
 * User service tests
 * Tests for user lookup, creation, and encryption handling
 */
import { describe, it, expect } from '@jest/globals';

// Set up test encryption key before imports
const TEST_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
process.env.NODE_ENV = 'test';

import { buildUserUpdateQuery } from '../../services/user.js';
import { normalizeWalletAddress } from '../../utils/validation.js';
import { createEmailHash } from '../../utils/emailHash.js';

describe('User Service', () => {
  describe('buildUserUpdateQuery()', () => {
    it('should build query with walletAddress', () => {
      const user = { walletAddress: '0x1234567890abcdef1234567890abcdef12345678' };
      const query = buildUserUpdateQuery(user);
      
      expect(query).not.toBeNull();
      expect(query?.walletAddress).toBe(user.walletAddress.toLowerCase());
    });

    it('should normalize wallet address to lowercase', () => {
      const user = { walletAddress: '0xABCDEF1234567890ABCDEF1234567890ABCDEF12' };
      const query = buildUserUpdateQuery(user);
      
      expect(query?.walletAddress).toBe(user.walletAddress.toLowerCase());
    });

    it('should build query with userId', () => {
      const user = { userId: 'email_abc123def456' };
      const query = buildUserUpdateQuery(user);
      
      expect(query).not.toBeNull();
      expect(query?.userId).toBe('email_abc123def456');
    });

    it('should build query with emailHash if provided', () => {
      const emailHash = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
      const user = { emailHash };
      const query = buildUserUpdateQuery(user);
      
      expect(query).not.toBeNull();
      expect(query?.emailHash).toBe(emailHash);
    });

    it('should create emailHash from email', () => {
      const user = { email: 'test@example.com' };
      const query = buildUserUpdateQuery(user);
      
      expect(query).not.toBeNull();
      expect(query?.emailHash).toBeDefined();
      expect(query?.emailHash).toHaveLength(64);
    });

    it('should return null for empty user object', () => {
      const query = buildUserUpdateQuery({});
      expect(query).toBeNull();
    });

    it('should accept any non-empty wallet string (validation is separate)', () => {
      // normalizeWalletAddress doesn't validate format, only normalizes
      // Validation is done by isValidWalletAddress
      const query = buildUserUpdateQuery({ walletAddress: 'invalid' });
      // Since 'invalid' doesn't start with 0x, it's treated as potential Solana address
      expect(query).not.toBeNull();
      expect(query?.walletAddress).toBe('invalid');
    });

    it('should prioritize walletAddress over userId', () => {
      const user = { 
        walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
        userId: 'email_abc123' 
      };
      const query = buildUserUpdateQuery(user);
      
      expect(query).toHaveProperty('walletAddress');
      expect(query).not.toHaveProperty('userId');
    });

    it('should prioritize userId over email', () => {
      const user = { 
        userId: 'email_abc123',
        email: 'test@example.com'
      };
      const query = buildUserUpdateQuery(user);
      
      expect(query).toHaveProperty('userId');
      expect(query).not.toHaveProperty('emailHash');
    });
  });

  describe('normalizeWalletAddress()', () => {
    it('should normalize Ethereum addresses to lowercase', () => {
      const address = '0xABCDEF1234567890ABCDEF1234567890ABCDEF12';
      const normalized = normalizeWalletAddress(address);
      
      expect(normalized).toBe(address.toLowerCase());
    });

    it('should accept valid 40-character hex addresses', () => {
      const address = '0x1234567890abcdef1234567890abcdef12345678';
      const normalized = normalizeWalletAddress(address);
      
      expect(normalized).toBe(address);
    });

    it('should accept Solana-style addresses', () => {
      const solanaAddress = 'DRpbCBMxVnDK7maPM5tGv6MvB3v1sRMC86PZ8okm21hy';
      const normalized = normalizeWalletAddress(solanaAddress);
      
      expect(normalized).toBe(solanaAddress);
    });

    it('should handle non-0x addresses as Solana-style', () => {
      // normalizeWalletAddress doesn't validate - it's a normalization function
      // For non-0x addresses, it returns them as-is (potential Solana addresses)
      expect(normalizeWalletAddress('invalid')).toBe('invalid');
      expect(normalizeWalletAddress('0x123')).toBe('0x123'); // Returns as-is (lowercased)
    });

    it('should return null for empty/null inputs', () => {
      expect(normalizeWalletAddress('')).toBeNull();
    });

    it('should handle null and undefined', () => {
      expect(normalizeWalletAddress(null as unknown as string)).toBeNull();
      expect(normalizeWalletAddress(undefined as unknown as string)).toBeNull();
    });
  });

  describe('createEmailHash()', () => {
    it('should create consistent hash for same email', () => {
      const email = 'test@example.com';
      const hash1 = createEmailHash(email);
      const hash2 = createEmailHash(email);
      
      expect(hash1).toBe(hash2);
    });

    it('should normalize email before hashing', () => {
      const hash1 = createEmailHash('TEST@EXAMPLE.COM');
      const hash2 = createEmailHash('test@example.com');
      const hash3 = createEmailHash('  Test@Example.COM  ');
      
      expect(hash1).toBe(hash2);
      expect(hash2).toBe(hash3);
    });

    it('should produce 64-character hex hash', () => {
      const hash = createEmailHash('user@domain.com');
      
      expect(hash).toHaveLength(64);
      expect(/^[a-f0-9]+$/i.test(hash)).toBe(true);
    });
  });
});

describe('Email Lookup Robustness', () => {
  describe('Multiple fallback methods', () => {
    it('should support emailHash for HMAC-based lookup', () => {
      const email = 'test@example.com';
      const hash = createEmailHash(email);
      
      // Hash should be usable for database lookup
      expect(hash).toHaveLength(64);
      expect(typeof hash).toBe('string');
    });

    it('should create consistent hashes across sessions', () => {
      // Simulate multiple lookups that should find the same user
      const email = 'user@example.com';
      const hashes = [
        createEmailHash(email),
        createEmailHash(email.toUpperCase()),
        createEmailHash('  ' + email + '  ')
      ];
      
      // All hashes should be identical
      expect(new Set(hashes).size).toBe(1);
    });
  });
});
