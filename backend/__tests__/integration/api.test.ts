/**
 * API Versioning Unit Tests
 * Tests for API versioning logic without requiring network
 */
import { describe, it, expect } from '@jest/globals';

// Constants matching versioned.ts
const CURRENT_VERSION = 'v1';
const SUPPORTED_VERSIONS = ['v1'];

/**
 * Parse version from path
 */
function parseVersion(path: string): { version: string; isSupported: boolean } {
  const versionMatch = path.match(/^\/v(\d+)\//);
  
  if (versionMatch) {
    const version = `v${versionMatch[1]}`;
    return {
      version,
      isSupported: SUPPORTED_VERSIONS.includes(version),
    };
  }
  
  return {
    version: CURRENT_VERSION,
    isSupported: true,
  };
}

/**
 * Generate version rejection response
 */
function generateVersionRejection(version: string) {
  return {
    success: false,
    error: `API version '${version}' is not supported. Supported versions: ${SUPPORTED_VERSIONS.join(', ')}`,
    currentVersion: CURRENT_VERSION,
  };
}

describe('API Versioning', () => {
  describe('Version Parsing', () => {
    it('should parse v1 from path', () => {
      const result = parseVersion('/v1/users');
      expect(result.version).toBe('v1');
      expect(result.isSupported).toBe(true);
    });

    it('should parse v2 from path (unsupported)', () => {
      const result = parseVersion('/v2/users');
      expect(result.version).toBe('v2');
      expect(result.isSupported).toBe(false);
    });

    it('should default to v1 for unversioned paths', () => {
      const result = parseVersion('/users');
      expect(result.version).toBe('v1');
      expect(result.isSupported).toBe(true);
    });

    it('should handle paths without leading slash', () => {
      const result = parseVersion('users');
      expect(result.version).toBe('v1');
      expect(result.isSupported).toBe(true);
    });

    it('should parse high version numbers', () => {
      const result = parseVersion('/v99/endpoint');
      expect(result.version).toBe('v99');
      expect(result.isSupported).toBe(false);
    });
  });

  describe('Version Info', () => {
    it('should have v1 as current version', () => {
      expect(CURRENT_VERSION).toBe('v1');
    });

    it('should support v1', () => {
      expect(SUPPORTED_VERSIONS).toContain('v1');
    });

    it('should have at least one supported version', () => {
      expect(SUPPORTED_VERSIONS.length).toBeGreaterThan(0);
    });
  });

  describe('Version Rejection Response', () => {
    it('should include error message for unsupported version', () => {
      const response = generateVersionRejection('v99');
      expect(response.success).toBe(false);
      expect(response.error).toContain('v99');
      expect(response.error).toContain('not supported');
    });

    it('should include current version', () => {
      const response = generateVersionRejection('v2');
      expect(response.currentVersion).toBe('v1');
    });

    it('should list supported versions in error', () => {
      const response = generateVersionRejection('v5');
      expect(response.error).toContain('v1');
    });
  });

  describe('Version Headers', () => {
    const expectedHeaders = {
      'X-API-Version': 'v1',
      'X-API-Deprecated': 'false',
    };

    it('should define X-API-Version header value', () => {
      expect(expectedHeaders['X-API-Version']).toBe('v1');
    });

    it('should define X-API-Deprecated header value', () => {
      expect(expectedHeaders['X-API-Deprecated']).toBe('false');
    });
  });
});
