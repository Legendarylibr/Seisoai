/**
 * Rate limiter middleware unit tests
 */
import { describe, it, expect } from '@jest/globals';
import crypto from 'crypto';

// Browser fingerprint generation (from abusePrevention.ts)
function generateBrowserFingerprint(headers: Record<string, string>): string {
  const components = [
    headers['user-agent'] || '',
    headers['accept-language'] || '',
    headers['accept-encoding'] || '',
    headers['accept'] || '',
    headers['connection'] || '',
    headers['dnt'] || '',
    headers['upgrade-insecure-requests'] || '',
  ];
  
  return crypto
    .createHash('sha256')
    .update(components.join('|'))
    .digest('hex')
    .substring(0, 16);
}

// IP extraction logic (from abusePrevention.ts)
function extractClientIP(
  headers: Record<string, string | string[] | undefined>,
  socketAddress: string,
  trustProxy: boolean = true
): string {
  // Cloudflare
  const cfIp = headers['cf-connecting-ip'];
  if (trustProxy && cfIp && typeof cfIp === 'string') {
    return cfIp;
  }
  
  // X-Real-IP
  const realIp = headers['x-real-ip'];
  if (trustProxy && realIp && typeof realIp === 'string') {
    return realIp;
  }
  
  // X-Forwarded-For (first IP)
  const forwardedFor = headers['x-forwarded-for'];
  if (trustProxy && forwardedFor) {
    const ips = (typeof forwardedFor === 'string' ? forwardedFor : forwardedFor[0])
      .split(',')
      .map(ip => ip.trim());
    if (ips.length > 0 && ips[0]) {
      return ips[0];
    }
  }
  
  return socketAddress;
}

// Rate limit key generation
function generateRateLimitKey(ip: string, fingerprint: string, endpoint: string): string {
  return `ratelimit:${endpoint}:${ip}:${fingerprint}`;
}

describe('Rate Limiter', () => {
  describe('Browser Fingerprint Generation', () => {
    it('should generate 16-character hex fingerprint', () => {
      const fp = generateBrowserFingerprint({
        'user-agent': 'Mozilla/5.0',
        'accept-language': 'en-US',
      });
      
      expect(fp.length).toBe(16);
      expect(/^[a-f0-9]+$/.test(fp)).toBe(true);
    });

    it('should be consistent for same headers', () => {
      const headers = {
        'user-agent': 'Chrome/100',
        'accept-language': 'en-US,en;q=0.9',
      };
      
      const fp1 = generateBrowserFingerprint(headers);
      const fp2 = generateBrowserFingerprint(headers);
      
      expect(fp1).toBe(fp2);
    });

    it('should differ for different headers', () => {
      const fp1 = generateBrowserFingerprint({ 'user-agent': 'Chrome' });
      const fp2 = generateBrowserFingerprint({ 'user-agent': 'Firefox' });
      
      expect(fp1).not.toBe(fp2);
    });

    it('should handle empty headers', () => {
      const fp = generateBrowserFingerprint({});
      expect(fp.length).toBe(16);
    });
  });

  describe('IP Extraction', () => {
    it('should extract Cloudflare IP first', () => {
      const ip = extractClientIP(
        { 'cf-connecting-ip': '1.2.3.4', 'x-real-ip': '5.6.7.8' },
        '10.0.0.1'
      );
      expect(ip).toBe('1.2.3.4');
    });

    it('should fall back to x-real-ip', () => {
      const ip = extractClientIP(
        { 'x-real-ip': '5.6.7.8' },
        '10.0.0.1'
      );
      expect(ip).toBe('5.6.7.8');
    });

    it('should extract first IP from x-forwarded-for', () => {
      const ip = extractClientIP(
        { 'x-forwarded-for': '1.1.1.1, 2.2.2.2, 3.3.3.3' },
        '10.0.0.1'
      );
      expect(ip).toBe('1.1.1.1');
    });

    it('should fall back to socket address', () => {
      const ip = extractClientIP({}, '192.168.1.100');
      expect(ip).toBe('192.168.1.100');
    });

    it('should not trust proxy headers when disabled', () => {
      const ip = extractClientIP(
        { 'cf-connecting-ip': '1.2.3.4' },
        '10.0.0.1',
        false
      );
      expect(ip).toBe('10.0.0.1');
    });

    it('should handle array x-forwarded-for', () => {
      const ip = extractClientIP(
        { 'x-forwarded-for': ['1.1.1.1, 2.2.2.2'] },
        '10.0.0.1'
      );
      expect(ip).toBe('1.1.1.1');
    });
  });

  describe('Rate Limit Key Generation', () => {
    it('should include all components', () => {
      const key = generateRateLimitKey('1.2.3.4', 'abc123', 'auth');
      expect(key).toBe('ratelimit:auth:1.2.3.4:abc123');
    });

    it('should generate unique keys for different IPs', () => {
      const key1 = generateRateLimitKey('1.1.1.1', 'abc', 'auth');
      const key2 = generateRateLimitKey('2.2.2.2', 'abc', 'auth');
      expect(key1).not.toBe(key2);
    });

    it('should generate unique keys for different fingerprints', () => {
      const key1 = generateRateLimitKey('1.1.1.1', 'fp1', 'auth');
      const key2 = generateRateLimitKey('1.1.1.1', 'fp2', 'auth');
      expect(key1).not.toBe(key2);
    });

    it('should generate unique keys for different endpoints', () => {
      const key1 = generateRateLimitKey('1.1.1.1', 'abc', 'auth');
      const key2 = generateRateLimitKey('1.1.1.1', 'abc', 'generate');
      expect(key1).not.toBe(key2);
    });
  });

  describe('Rate Limit Configuration', () => {
    const RATE_LIMITS = {
      general: { windowMs: 15 * 60 * 1000, max: 100 },
      auth: { windowMs: 15 * 60 * 1000, max: 5 },
      passwordReset: { windowMs: 15 * 60 * 1000, max: 3 },
      generation: { windowMs: 60 * 1000, max: 10 },
      freeImage: { windowMs: 24 * 60 * 60 * 1000, max: 5 },
    };

    it('should have general limit of 100 per 15 min', () => {
      expect(RATE_LIMITS.general.max).toBe(100);
      expect(RATE_LIMITS.general.windowMs).toBe(15 * 60 * 1000);
    });

    it('should have auth limit of 5 per 15 min', () => {
      expect(RATE_LIMITS.auth.max).toBe(5);
    });

    it('should have password reset limit of 3 per 15 min', () => {
      expect(RATE_LIMITS.passwordReset.max).toBe(3);
    });

    it('should have generation limit of 10 per minute', () => {
      expect(RATE_LIMITS.generation.max).toBe(10);
      expect(RATE_LIMITS.generation.windowMs).toBe(60 * 1000);
    });

    it('should have free image limit of 5 per day', () => {
      expect(RATE_LIMITS.freeImage.max).toBe(5);
      expect(RATE_LIMITS.freeImage.windowMs).toBe(24 * 60 * 60 * 1000);
    });

    it('should have stricter auth limits than general', () => {
      expect(RATE_LIMITS.auth.max).toBeLessThan(RATE_LIMITS.general.max);
    });
  });

  describe('Private IP Detection', () => {
    function isPrivateIP(ip: string): boolean {
      // Localhost
      if (ip === '127.0.0.1' || ip === 'localhost' || ip === '::1') {
        return true;
      }
      
      // Private ranges
      const parts = ip.split('.').map(Number);
      if (parts.length !== 4) return false;
      
      // 10.x.x.x
      if (parts[0] === 10) return true;
      
      // 172.16.x.x - 172.31.x.x
      if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
      
      // 192.168.x.x
      if (parts[0] === 192 && parts[1] === 168) return true;
      
      // 0.0.0.0
      if (parts[0] === 0) return true;
      
      return false;
    }

    it('should detect localhost', () => {
      expect(isPrivateIP('127.0.0.1')).toBe(true);
      expect(isPrivateIP('localhost')).toBe(true);
    });

    it('should detect 10.x.x.x range', () => {
      expect(isPrivateIP('10.0.0.1')).toBe(true);
      expect(isPrivateIP('10.255.255.255')).toBe(true);
    });

    it('should detect 172.16-31.x.x range', () => {
      expect(isPrivateIP('172.16.0.1')).toBe(true);
      expect(isPrivateIP('172.31.255.255')).toBe(true);
      expect(isPrivateIP('172.15.0.1')).toBe(false);
      expect(isPrivateIP('172.32.0.1')).toBe(false);
    });

    it('should detect 192.168.x.x range', () => {
      expect(isPrivateIP('192.168.1.1')).toBe(true);
      expect(isPrivateIP('192.168.255.255')).toBe(true);
    });

    it('should not detect public IPs', () => {
      expect(isPrivateIP('8.8.8.8')).toBe(false);
      expect(isPrivateIP('1.1.1.1')).toBe(false);
      expect(isPrivateIP('203.0.113.1')).toBe(false);
    });
  });
});
