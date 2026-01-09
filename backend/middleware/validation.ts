/**
 * Input validation middleware
 * Sanitization and validation utilities
 */
import { PublicKey } from '@solana/web3.js';
import type { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';
// Import shared wallet normalization from user service to avoid duplication
import { normalizeWalletAddress } from '../services/user';

/**
 * Validate Ethereum address format
 */
export const isValidEthereumAddress = (address: unknown): boolean => {
  if (!address || typeof address !== 'string') return false;
  return /^0x[a-fA-F0-9]{40}$/.test(address);
};

/**
 * Validate Solana address format
 */
export const isValidSolanaAddress = (address: unknown): boolean => {
  if (!address || typeof address !== 'string') return false;
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
};

/**
 * Validate wallet address (Ethereum or Solana)
 */
export const isValidWalletAddress = (address: unknown): boolean => {
  if (!address || typeof address !== 'string') return false;
  return isValidEthereumAddress(address) || isValidSolanaAddress(address);
};

// Re-export normalizeWalletAddress from user service for backwards compatibility
export { normalizeWalletAddress };

/**
 * Sanitize string input (trim and limit length)
 */
export const sanitizeString = (str: unknown, maxLength: number = 1000): string => {
  if (typeof str !== 'string') return '';
  return str.trim().slice(0, maxLength);
};

/**
 * Sanitize number input
 */
export const sanitizeNumber = (num: unknown): number | null => {
  const parsed = parseFloat(String(num));
  if (isNaN(parsed) || !isFinite(parsed)) return null;
  return parsed;
};

/**
 * Deep sanitize object to prevent NoSQL injection
 * Removes MongoDB operators ($gt, $ne, etc.) from nested objects
 * NOTE: Does NOT truncate data URIs (base64 images/videos) to preserve file integrity
 */
export const deepSanitize = (obj: unknown, depth: number = 0): unknown => {
  if (depth > 10) return obj;
  
  if (obj === null || obj === undefined) return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(item => deepSanitize(item, depth + 1));
  }
  
  if (typeof obj === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
      if (key.startsWith('$')) {
        logger.warn('NoSQL injection attempt blocked', { key, depth });
        continue;
      }
      sanitized[key] = deepSanitize((obj as Record<string, unknown>)[key], depth + 1);
    }
    return sanitized;
  }
  
  if (typeof obj === 'string') {
    // Don't truncate data URIs (base64 images/videos) or fal.ai URLs - they need to be intact
    if (obj.startsWith('data:') || obj.includes('fal.ai') || obj.includes('fal.media')) {
      return obj.trim();
    }
    return sanitizeString(obj);
  }
  
  if (typeof obj === 'number') {
    return sanitizeNumber(obj);
  }
  
  return obj;
};

/**
 * Validate fal.ai URL (prevents SSRF attacks)
 */
export const isValidFalUrl = (url: unknown): boolean => {
  if (!url || typeof url !== 'string') return false;
  if (url.startsWith('data:')) return true;
  
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    return hostname === 'fal.ai' || 
           hostname === 'fal.media' ||
           hostname.endsWith('.fal.ai') ||
           hostname.endsWith('.fal.media');
  } catch {
    return false;
  }
};

/**
 * Create input validation middleware
 */
export const createValidateInput = () => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.query) {
      req.query = deepSanitize(req.query) as typeof req.query;
    }

    if (req.body && typeof req.body === 'object') {
      req.body = deepSanitize(req.body) as typeof req.body;
    }

    next();
  };
};

/**
 * Get safe error message for client responses
 */
export const getSafeErrorMessage = (error: unknown, defaultMessage: string = 'An error occurred'): string => {
  if (process.env.NODE_ENV === 'production') {
    return defaultMessage;
  }
  const err = error as { message?: string } | null;
  return err?.message || defaultMessage;
};

export default {
  isValidEthereumAddress,
  isValidSolanaAddress,
  isValidWalletAddress,
  normalizeWalletAddress,
  sanitizeString,
  sanitizeNumber,
  deepSanitize,
  isValidFalUrl,
  createValidateInput,
  getSafeErrorMessage
};




