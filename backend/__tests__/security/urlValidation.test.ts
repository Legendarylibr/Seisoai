/**
 * URL validation security tests
 * Tests for SSRF prevention and redirect validation
 */
import { describe, it, expect } from '@jest/globals';
import { isValidFalUrl } from '../../utils/validation.js';

describe('URL Validation Security', () => {
  describe('isValidFalUrl - SSRF Prevention', () => {
    describe('Valid URLs', () => {
      const validUrls = [
        'https://fal.ai/models/test',
        'https://api.fal.ai/v1/generate',
        'https://fal.media/files/image.png',
        'https://queue.fal.run/job/123',
        'https://rest.fal.run/endpoint',
        'https://fal.run/model',
        'data:image/png;base64,iVBORw0KGgo...',
        'data:image/jpeg;base64,/9j/4AAQSkZJRg...'
      ];

      validUrls.forEach(url => {
        it(`should allow: ${url.substring(0, 40)}...`, () => {
          expect(isValidFalUrl(url)).toBe(true);
        });
      });
    });

    describe('Blocked URLs - Private IPs (SSRF)', () => {
      const privateIpUrls = [
        'http://127.0.0.1/admin',
        'http://localhost/api',
        'http://10.0.0.1/internal',
        'http://192.168.1.1/config',
        'http://172.16.0.1/secret',
        'http://0.0.0.0/all'
      ];

      privateIpUrls.forEach(url => {
        it(`should block private IP: ${url}`, () => {
          expect(isValidFalUrl(url)).toBe(false);
        });
      });
    });

    describe('Blocked URLs - Arbitrary domains', () => {
      const arbitraryUrls = [
        'https://evil.com/payload',
        'https://attacker.io/steal',
        'https://not-fal.ai/fake',
        'https://fal.ai.evil.com/trick',
        'https://google.com',
        'https://example.com'
      ];

      arbitraryUrls.forEach(url => {
        it(`should block non-whitelisted domain: ${url}`, () => {
          expect(isValidFalUrl(url)).toBe(false);
        });
      });
    });

    describe('Blocked URLs - Dangerous schemes', () => {
      const dangerousUrls = [
        'javascript:alert(1)',
        'file:///etc/passwd',
        'ftp://fal.ai/files',
        'gopher://evil.com/payload'
      ];

      dangerousUrls.forEach(url => {
        it(`should block dangerous scheme: ${url}`, () => {
          expect(isValidFalUrl(url)).toBe(false);
        });
      });
    });

    describe('Blocked URLs - With credentials', () => {
      it('should block URLs with userinfo', () => {
        expect(isValidFalUrl('https://user:pass@fal.ai/api')).toBe(false);
        expect(isValidFalUrl('https://admin@fal.ai/api')).toBe(false);
      });
    });

    describe('Edge cases', () => {
      it('should handle null/undefined', () => {
        expect(isValidFalUrl(null)).toBe(false);
        expect(isValidFalUrl(undefined)).toBe(false);
      });

      it('should handle empty string', () => {
        expect(isValidFalUrl('')).toBe(false);
      });

      it('should handle invalid URLs', () => {
        expect(isValidFalUrl('not-a-url')).toBe(false);
        expect(isValidFalUrl('://missing-scheme')).toBe(false);
      });

      it('should handle non-strings', () => {
        expect(isValidFalUrl(123 as unknown as string)).toBe(false);
        expect(isValidFalUrl({} as unknown as string)).toBe(false);
      });
    });
  });

  describe('Redirect URL Validation Pattern', () => {
    const ALLOWED_REDIRECT_DOMAINS = new Set([
      'seisoai.com',
      'www.seisoai.com',
      'localhost',
      '127.0.0.1'
    ]);

    function isAllowedRedirect(url: string): boolean {
      if (!url || typeof url !== 'string') return false;
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
          return false;
        }
        const hostname = parsed.hostname.toLowerCase();
        return ALLOWED_REDIRECT_DOMAINS.has(hostname) || 
               hostname.endsWith('.seisoai.com');
      } catch {
        return false;
      }
    }

    it('should allow seisoai.com redirects', () => {
      expect(isAllowedRedirect('https://seisoai.com/success')).toBe(true);
      expect(isAllowedRedirect('https://www.seisoai.com/callback')).toBe(true);
    });

    it('should allow subdomains of seisoai.com', () => {
      expect(isAllowedRedirect('https://app.seisoai.com/dashboard')).toBe(true);
      expect(isAllowedRedirect('https://api.seisoai.com/v1')).toBe(true);
    });

    it('should allow localhost for development', () => {
      expect(isAllowedRedirect('http://localhost:5173/callback')).toBe(true);
      expect(isAllowedRedirect('http://127.0.0.1:3000/success')).toBe(true);
    });

    it('should block external domains', () => {
      expect(isAllowedRedirect('https://evil.com/phishing')).toBe(false);
      expect(isAllowedRedirect('https://seisoai.com.evil.com/fake')).toBe(false);
      expect(isAllowedRedirect('https://google.com')).toBe(false);
    });

    it('should block javascript: scheme', () => {
      expect(isAllowedRedirect('javascript:alert(document.cookie)')).toBe(false);
    });
  });
});
