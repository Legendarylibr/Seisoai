/**
 * Input validation security tests
 * Tests for NoSQL injection, XSS, and other input validation
 */
import { describe, it, expect } from '@jest/globals';
import { 
  isValidEmail, 
  isValidWalletAddress, 
  isValidRequestId,
  deepSanitize,
  sanitizeString
} from '../../utils/validation.js';

describe('Input Validation Security', () => {
  describe('Email Validation', () => {
    describe('Valid emails', () => {
      const validEmails = [
        'test@example.com',
        'user.name@domain.com',
        'user+tag@example.org',
        'user123@sub.domain.co.uk',
        'a@b.co'
      ];

      validEmails.forEach(email => {
        it(`should accept valid email: ${email}`, () => {
          expect(isValidEmail(email)).toBe(true);
        });
      });
    });

    describe('Invalid emails', () => {
      const invalidEmails = [
        '',
        'notanemail',
        '@nodomain.com',
        'noat.com',
        'spaces in@email.com',
        'missing@.com',
        'a'.repeat(255) + '@toolong.com', // Too long
        null,
        undefined,
        123,
        {},
        []
      ];

      invalidEmails.forEach(email => {
        it(`should reject invalid email: ${String(email)}`, () => {
          expect(isValidEmail(email)).toBe(false);
        });
      });
    });
  });

  describe('Wallet Address Validation', () => {
    describe('Valid addresses', () => {
      it('should accept valid Ethereum address', () => {
        expect(isValidWalletAddress('0x1234567890123456789012345678901234567890')).toBe(true);
      });

      it('should accept valid Ethereum address with mixed case', () => {
        expect(isValidWalletAddress('0xAbCdEf1234567890123456789012345678901234')).toBe(true);
      });
    });

    describe('Invalid addresses', () => {
      const invalidAddresses = [
        '',
        '0x123', // Too short
        '0x' + 'g'.repeat(40), // Invalid hex
        'not-an-address',
        null,
        undefined,
        123
      ];

      invalidAddresses.forEach(address => {
        it(`should reject invalid address: ${String(address)}`, () => {
          expect(isValidWalletAddress(address)).toBe(false);
        });
      });
    });
  });

  describe('Request ID Validation', () => {
    describe('Valid request IDs', () => {
      const validIds = [
        'abc123',
        'request-id-123',
        'req_12345',
        'a.b.c',
        'ABC-123_456.789'
      ];

      validIds.forEach(id => {
        it(`should accept valid request ID: ${id}`, () => {
          expect(isValidRequestId(id)).toBe(true);
        });
      });
    });

    describe('Invalid request IDs', () => {
      const invalidIds = [
        '',
        'a'.repeat(201), // Too long
        'has spaces',
        'has<script>',
        'has$special',
        null,
        undefined
      ];

      invalidIds.forEach(id => {
        it(`should reject invalid request ID: ${String(id)}`, () => {
          expect(isValidRequestId(id)).toBe(false);
        });
      });
    });
  });

  describe('Deep Sanitize - NoSQL Injection Prevention', () => {
    it('should remove MongoDB operators from objects', () => {
      const malicious = {
        username: 'admin',
        password: { $ne: '' } // NoSQL injection attempt
      };
      
      const sanitized = deepSanitize(malicious) as Record<string, unknown>;
      expect(sanitized.username).toBe('admin');
      expect(sanitized.password).toEqual({});
    });

    it('should remove $gt operator', () => {
      const input = { amount: { $gt: 0 } };
      const result = deepSanitize(input) as Record<string, unknown>;
      expect(result.amount).toEqual({});
    });

    it('should remove $where operator', () => {
      const input = { $where: 'this.password == this.passwordConfirm' };
      const result = deepSanitize(input) as Record<string, unknown>;
      expect(result.$where).toBeUndefined();
    });

    it('should remove $regex operator', () => {
      const input = { email: { $regex: '.*' } };
      const result = deepSanitize(input) as Record<string, unknown>;
      expect(result.email).toEqual({});
    });

    it('should handle nested objects', () => {
      const input = {
        user: {
          profile: {
            role: { $ne: 'user' }
          }
        }
      };
      const result = deepSanitize(input) as { user: { profile: { role: unknown } } };
      expect(result.user.profile.role).toEqual({});
    });

    it('should handle arrays', () => {
      const input = [
        { name: 'valid' },
        { role: { $in: ['admin'] } }
      ];
      const result = deepSanitize(input) as Array<{ name?: string; role?: unknown }>;
      expect(result[0].name).toBe('valid');
      expect(result[1].role).toEqual({});
    });

    it('should block prototype pollution attempts', () => {
      const input = {
        '__proto__': { isAdmin: true },
        'constructor': { prototype: { isAdmin: true } },
        'prototype': { isAdmin: true },
        'normalKey': 'normalValue'
      };
      const result = deepSanitize(input) as Record<string, unknown>;
      // Dangerous keys should be stripped - only normalKey should remain
      expect(Object.keys(result)).not.toContain('__proto__');
      expect(Object.keys(result)).not.toContain('constructor');
      expect(Object.keys(result)).not.toContain('prototype');
      expect(result['normalKey']).toBe('normalValue');
    });

    it('should preserve valid data URIs', () => {
      const input = { image: 'data:image/png;base64,iVBORw0KGgo...' };
      const result = deepSanitize(input) as { image: string };
      expect(result.image).toBe('data:image/png;base64,iVBORw0KGgo...');
    });

    it('should limit recursion depth', () => {
      let deepObject: Record<string, unknown> = { value: 'deep' };
      for (let i = 0; i < 15; i++) {
        deepObject = { nested: deepObject };
      }
      
      // Should not throw
      const result = deepSanitize(deepObject);
      expect(result).toBeDefined();
    });
  });

  describe('String Sanitization', () => {
    it('should trim whitespace', () => {
      expect(sanitizeString('  hello  ')).toBe('hello');
    });

    it('should limit length', () => {
      const longString = 'a'.repeat(2000);
      const result = sanitizeString(longString, 100);
      expect(result.length).toBe(100);
    });

    it('should handle non-strings', () => {
      expect(sanitizeString(null)).toBe('');
      expect(sanitizeString(undefined)).toBe('');
      expect(sanitizeString(123)).toBe('');
      expect(sanitizeString({})).toBe('');
    });
  });
});
