/**
 * Validation utility tests
 */
import { describe, it, expect } from '@jest/globals';
import { generateBrowserFingerprint } from '../../utils/abusePrevention.js';

describe('Validation Utilities', () => {
  describe('generateBrowserFingerprint', () => {
    it('should generate consistent fingerprints for same headers', () => {
      const mockReq = {
        headers: {
          'user-agent': 'Mozilla/5.0',
          'accept-language': 'en-US,en;q=0.9',
          'accept-encoding': 'gzip, deflate, br',
          'accept': '*/*',
          'connection': 'keep-alive',
          'dnt': '1',
          'upgrade-insecure-requests': '1'
        }
      } as unknown as import('express').Request;

      const fp1 = generateBrowserFingerprint(mockReq);
      const fp2 = generateBrowserFingerprint(mockReq);
      
      expect(fp1).toBe(fp2);
      expect(fp1.length).toBe(16);
    });

    it('should generate different fingerprints for different headers', () => {
      const mockReq1 = {
        headers: { 'user-agent': 'Chrome' }
      } as unknown as import('express').Request;
      
      const mockReq2 = {
        headers: { 'user-agent': 'Firefox' }
      } as unknown as import('express').Request;

      const fp1 = generateBrowserFingerprint(mockReq1);
      const fp2 = generateBrowserFingerprint(mockReq2);
      
      expect(fp1).not.toBe(fp2);
    });
  });
});

