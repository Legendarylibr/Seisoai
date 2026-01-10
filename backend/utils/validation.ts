/**
 * Shared validation utilities
 * Consolidates input validation logic used across endpoints
 * 
 * NOTE: This is the single source of truth for validation functions.
 * Other modules should import from here.
 */
import { PublicKey } from '@solana/web3.js';
import type { Request, Response, NextFunction } from 'express';
import logger from './logger';

/**
 * Validate Ethereum address format
 */
export function isValidEthereumAddress(address: unknown): boolean {
  if (!address || typeof address !== 'string') return false;
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Validate Solana address format
 */
export function isValidSolanaAddress(address: unknown): boolean {
  if (!address || typeof address !== 'string') return false;
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate wallet address (Ethereum or Solana)
 */
export function isValidWalletAddress(address: unknown): boolean {
  if (!address || typeof address !== 'string') return false;
  return isValidEthereumAddress(address) || isValidSolanaAddress(address);
}

/**
 * Normalize wallet address (lowercase for EVM, as-is for Solana)
 */
export function normalizeWalletAddress(address: unknown): string | null {
  if (!address || typeof address !== 'string') return null;
  return address.startsWith('0x') ? address.toLowerCase() : address;
}

/**
 * Sanitize string input (trim and limit length)
 */
export function sanitizeString(str: unknown, maxLength: number = 1000): string {
  if (typeof str !== 'string') return '';
  return str.trim().slice(0, maxLength);
}

/**
 * Sanitize number input
 */
export function sanitizeNumber(num: unknown): number | null {
  const parsed = parseFloat(String(num));
  if (isNaN(parsed) || !isFinite(parsed)) return null;
  return parsed;
}

/**
 * Validate request ID format (alphanumeric, hyphens, underscores, dots)
 */
export function isValidRequestId(requestId: unknown): boolean {
  if (!requestId || typeof requestId !== 'string') return false;
  if (requestId.length > 200) return false;
  return /^[a-zA-Z0-9._-]+$/.test(requestId);
}

/**
 * Validate email format
 */
export function isValidEmail(email: unknown): boolean {
  if (!email || typeof email !== 'string') return false;
  return /^\S+@\S+\.\S+$/.test(email);
}

/**
 * SECURITY: List of all MongoDB operators to block
 */
const MONGO_OPERATORS = [
  '$gt', '$gte', '$lt', '$lte', '$ne', '$in', '$nin', '$exists', '$type',
  '$mod', '$regex', '$text', '$where', '$all', '$elemMatch', '$size',
  '$bitsAllSet', '$bitsAnySet', '$bitsAllClear', '$bitsAnyClear',
  '$geoWithin', '$geoIntersects', '$near', '$nearSphere',
  '$eq', '$and', '$or', '$not', '$nor', '$expr', '$jsonSchema',
  '$lookup', '$match', '$group', '$project', '$sort', '$limit', '$skip'
];

/**
 * SECURITY: Prototype pollution prevention keys
 */
const PROTOTYPE_POLLUTION_KEYS = ['__proto__', 'constructor', 'prototype'];

/**
 * Deep sanitize object to prevent NoSQL injection
 * Removes MongoDB operators ($gt, $ne, etc.) from nested objects
 * SECURITY ENHANCED: Blocks all MongoDB operators and prototype pollution
 * NOTE: Does NOT truncate data URIs (base64 images/videos) to preserve file integrity
 */
export function deepSanitize(obj: unknown, depth: number = 0): unknown {
  // SECURITY: At max depth, return empty object for objects to prevent injection
  if (depth > 10) {
    return typeof obj === 'object' && obj !== null && !Array.isArray(obj) ? {} : obj;
  }
  
  if (obj === null || obj === undefined) return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(item => deepSanitize(item, depth + 1));
  }
  
  if (typeof obj === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
      const keyLower = key.toLowerCase();
      
      // SECURITY: Block all MongoDB operators (case-insensitive)
      if (MONGO_OPERATORS.includes(keyLower) || key.startsWith('$')) {
        logger.warn('NoSQL injection attempt blocked', { key, depth, keyLower });
        continue;
      }
      
      // SECURITY: Block prototype pollution attempts
      if (PROTOTYPE_POLLUTION_KEYS.includes(key)) {
        logger.warn('Prototype pollution attempt blocked', { key, depth });
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
}

/**
 * SECURITY ENHANCED: Validate fal.ai URL (prevents SSRF attacks)
 * Blocks private IPs, localhost, and only allows specific fal.ai domains
 */
export function isValidFalUrl(url: unknown): boolean {
  if (!url || typeof url !== 'string') return false;
  
  // Allow data URIs (for uploaded files)
  if (url.startsWith('data:')) return true;
  
  try {
    const urlObj = new URL(url);
    
    // SECURITY: Only allow http/https protocols
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      logger.warn('SSRF attempt blocked - invalid protocol', { protocol: urlObj.protocol, url: url.substring(0, 100) });
      return false;
    }
    
    // SECURITY: Block URLs with userinfo (user:pass@host)
    if (urlObj.username || urlObj.password) {
      logger.warn('SSRF attempt blocked - userinfo in URL', { url: url.substring(0, 100) });
      return false;
    }
    
    const hostname = urlObj.hostname.toLowerCase();
    
    // SECURITY: Block private IPv4 addresses
    const isPrivateIPv4 = /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|127\.|169\.254\.)/.test(hostname);
    if (isPrivateIPv4) {
      logger.warn('SSRF attempt blocked - private IPv4', { hostname, url: url.substring(0, 100) });
      return false;
    }
    
    // SECURITY: Block private IPv6 addresses
    const isPrivateIPv6 = /^(::1|fc00:|fe80:|::ffff:(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|127\.|169\.254\.))/.test(hostname);
    if (isPrivateIPv6) {
      logger.warn('SSRF attempt blocked - private IPv6', { hostname, url: url.substring(0, 100) });
      return false;
    }
    
    // SECURITY: Block localhost variations
    if (hostname === 'localhost' || hostname === '0.0.0.0' || hostname.startsWith('127.')) {
      logger.warn('SSRF attempt blocked - localhost', { hostname, url: url.substring(0, 100) });
      return false;
    }
    
    // SECURITY: Only allow specific fal.ai domains (no wildcard subdomains)
    const allowedDomains = ['fal.ai', 'fal.media'];
    const allowedSubdomains = ['api.fal.ai', 'queue.fal.run', 'rest.fal.run', 'fal.run'];
    
    const isAllowed = allowedDomains.some(domain => hostname === domain) ||
                     allowedSubdomains.some(subdomain => hostname === subdomain);
    
    if (!isAllowed) {
      logger.warn('SSRF attempt blocked - invalid domain', { hostname, url: url.substring(0, 100) });
      return false;
    }
    
    return true;
  } catch (error) {
    logger.warn('SSRF attempt blocked - invalid URL format', { url: url.substring(0, 100), error: (error as Error).message });
    return false;
  }
}

/**
 * Create input validation middleware
 */
export function createValidateInput() {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (req.query) {
      req.query = deepSanitize(req.query) as typeof req.query;
    }

    if (req.body && typeof req.body === 'object') {
      req.body = deepSanitize(req.body) as typeof req.body;
    }

    next();
  };
}

/**
 * SECURITY ENHANCED: Get safe error message for client responses
 * Sanitizes error messages to prevent information disclosure
 */
export function getSafeErrorMessage(error: unknown, defaultMessage: string = 'An error occurred'): string {
  const err = error as { message?: string } | null;
  const message = err?.message || '';
  
  if (process.env.NODE_ENV === 'production') {
    // SECURITY: In production, never expose internal error details
    return defaultMessage;
  }
  
  // SECURITY: In development, sanitize error messages to remove sensitive info
  const sanitized = message
    .replace(/mongodb:\/\/[^@]+@/g, 'mongodb://***@') // Hide MongoDB credentials
    .replace(/\/[^\s]+\.(ts|js):\d+:\d+/g, '/*.ts:0:0') // Hide file paths
    .replace(/at\s+[^\s]+\s+\([^)]+\)/g, 'at ***') // Hide stack frames
    .replace(/ENOENT:\s+[^,]+/g, 'ENOENT: ***') // Hide file paths
    .replace(/password[=:]\s*[^\s,]+/gi, 'password=***') // Hide passwords
    .replace(/secret[=:]\s*[^\s,]+/gi, 'secret=***') // Hide secrets
    .replace(/key[=:]\s*[^\s,]+/gi, 'key=***') // Hide keys
    .substring(0, 200); // Limit length
  
  return sanitized || defaultMessage;
}

export default {
  isValidEthereumAddress,
  isValidSolanaAddress,
  isValidWalletAddress,
  normalizeWalletAddress,
  sanitizeString,
  sanitizeNumber,
  isValidRequestId,
  isValidEmail,
  deepSanitize,
  isValidFalUrl,
  createValidateInput,
  getSafeErrorMessage
};
