/**
 * Password strength validation tests
 */
import { describe, it, expect } from '@jest/globals';

// Password regex from auth.ts
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{12,}$/;

function isStrongPassword(password: string): boolean {
  if (!password || typeof password !== 'string') return false;
  return PASSWORD_REGEX.test(password);
}

describe('Password Strength Validation', () => {
  describe('Strong passwords (should pass)', () => {
    const strongPasswords = [
      'MyP@ssword123!',
      'SecureP@ss1234',
      'C0mplex!Pass#word',
      'Abcdef123456!@',
      'Test123!Test456@',
      '12CharPass!A1',
      'VeryL0ng&SecurePassword!'
    ];

    strongPasswords.forEach(password => {
      it(`should accept: ${password.substring(0, 8)}...`, () => {
        expect(isStrongPassword(password)).toBe(true);
      });
    });
  });

  describe('Weak passwords (should fail)', () => {
    const weakPasswords = [
      { password: 'short1!A', reason: 'too short (< 12 chars)' },
      { password: 'alllowercase123!', reason: 'no uppercase' },
      { password: 'ALLUPPERCASE123!', reason: 'no lowercase' },
      { password: 'NoNumbers!Here', reason: 'no digits' },
      { password: 'NoSpecialChars123', reason: 'no special character' },
      { password: '', reason: 'empty string' },
      { password: 'password', reason: 'common weak password' },
      { password: '123456789012', reason: 'only numbers' }
    ];

    weakPasswords.forEach(({ password, reason }) => {
      it(`should reject: ${reason}`, () => {
        expect(isStrongPassword(password)).toBe(false);
      });
    });
  });

  describe('Edge cases', () => {
    it('should require exactly the allowed special characters', () => {
      // @ $ ! % * ? & are the allowed special characters
      expect(isStrongPassword('ValidPass123@')).toBe(true);
      expect(isStrongPassword('ValidPass123$')).toBe(true);
      expect(isStrongPassword('ValidPass123!')).toBe(true);
      expect(isStrongPassword('ValidPass123%')).toBe(true);
      expect(isStrongPassword('ValidPass123*')).toBe(true);
      expect(isStrongPassword('ValidPass123?')).toBe(true);
      expect(isStrongPassword('ValidPass123&')).toBe(true);
    });

    it('should reject passwords with only # as special char', () => {
      expect(isStrongPassword('ValidPass123#')).toBe(false);
    });

    it('should handle unicode', () => {
      // Unicode chars don't satisfy the special char requirement
      expect(isStrongPassword('ValidPass123é')).toBe(false);
    });

    it('should handle null/undefined', () => {
      expect(isStrongPassword(null as unknown as string)).toBe(false);
      expect(isStrongPassword(undefined as unknown as string)).toBe(false);
    });

    it('should handle non-strings', () => {
      expect(isStrongPassword(12345678901234 as unknown as string)).toBe(false);
      expect(isStrongPassword({} as unknown as string)).toBe(false);
      expect(isStrongPassword([] as unknown as string)).toBe(false);
    });

    it('should accept very long passwords', () => {
      const longPassword = 'Aa1!' + 'a'.repeat(100);
      expect(isStrongPassword(longPassword)).toBe(true);
    });
  });
});
