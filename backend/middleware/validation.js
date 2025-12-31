/**
 * Input validation middleware
 * Sanitization and validation utilities
 */
import { PublicKey } from '@solana/web3.js';
import logger from '../utils/logger.js';

/**
 * Validate Ethereum address format
 */
export const isValidEthereumAddress = (address) => {
  if (!address || typeof address !== 'string') return false;
  return /^0x[a-fA-F0-9]{40}$/.test(address);
};

/**
 * Validate Solana address format
 */
export const isValidSolanaAddress = (address) => {
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
export const isValidWalletAddress = (address) => {
  if (!address || typeof address !== 'string') return false;
  return isValidEthereumAddress(address) || isValidSolanaAddress(address);
};

/**
 * Normalize wallet address (lowercase for EVM, as-is for Solana)
 */
export const normalizeWalletAddress = (address) => {
  if (!address || typeof address !== 'string') return null;
  return address.startsWith('0x') ? address.toLowerCase() : address;
};

/**
 * Sanitize string input (trim and limit length)
 */
export const sanitizeString = (str, maxLength = 1000) => {
  if (typeof str !== 'string') return '';
  return str.trim().slice(0, maxLength);
};

/**
 * Sanitize number input
 */
export const sanitizeNumber = (num) => {
  const parsed = parseFloat(num);
  if (isNaN(parsed) || !isFinite(parsed)) return null;
  return parsed;
};

/**
 * Deep sanitize object to prevent NoSQL injection
 * Removes MongoDB operators ($gt, $ne, etc.) from nested objects
 */
export const deepSanitize = (obj, depth = 0) => {
  if (depth > 10) return obj;
  
  if (obj === null || obj === undefined) return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(item => deepSanitize(item, depth + 1));
  }
  
  if (typeof obj === 'object') {
    const sanitized = {};
    for (const key of Object.keys(obj)) {
      if (key.startsWith('$')) {
        logger.warn('NoSQL injection attempt blocked', { key, depth });
        continue;
      }
      sanitized[key] = deepSanitize(obj[key], depth + 1);
    }
    return sanitized;
  }
  
  if (typeof obj === 'string') {
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
export const isValidFalUrl = (url) => {
  if (!url || typeof url !== 'string') return false;
  if (url.startsWith('data:')) return true;
  
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    return hostname === 'fal.ai' || 
           hostname === 'fal.media' ||
           hostname.endsWith('.fal.ai') ||
           hostname.endsWith('.fal.media');
  } catch (e) {
    return false;
  }
};

/**
 * Create input validation middleware
 */
export const createValidateInput = () => {
  return (req, res, next) => {
    if (req.query) {
      req.query = deepSanitize(req.query);
    }

    if (req.body && typeof req.body === 'object') {
      req.body = deepSanitize(req.body);
    }

    next();
  };
};

/**
 * Get safe error message for client responses
 */
export const getSafeErrorMessage = (error, defaultMessage = 'An error occurred') => {
  if (process.env.NODE_ENV === 'production') {
    return defaultMessage;
  }
  return error?.message || defaultMessage;
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



