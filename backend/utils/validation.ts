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
 * SECURITY FIX: More comprehensive email validation to prevent malformed inputs
 */
export function isValidEmail(email: unknown): boolean {
  if (!email || typeof email !== 'string') return false;
  if (email.length > 254) return false; // RFC 5321 max length
  // More comprehensive regex that validates:
  // - Local part: alphanumeric and special chars
  // - Domain: valid hostname format
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  return emailRegex.test(email);
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
 * SECURITY FIX: Validate user-provided URLs to prevent SSRF attacks.
 * More permissive than isValidFalUrl - allows any public HTTPS URL
 * but blocks private IPs, localhost, and dangerous protocols.
 * Use this for user-provided image_url, audio_url, video_url etc.
 */
export function isValidPublicUrl(url: unknown): boolean {
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
    const isPrivateIPv4 = /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|127\.|169\.254\.|0\.)/.test(hostname);
    if (isPrivateIPv4) {
      logger.warn('SSRF attempt blocked - private IPv4', { hostname, url: url.substring(0, 100) });
      return false;
    }
    
    // SECURITY: Block private IPv6 addresses
    const isPrivateIPv6 = /^(::1|fc00:|fd[0-9a-f]{2}:|fe80:|::ffff:(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|127\.|169\.254\.))/.test(hostname);
    if (isPrivateIPv6) {
      logger.warn('SSRF attempt blocked - private IPv6', { hostname, url: url.substring(0, 100) });
      return false;
    }
    
    // SECURITY: Block localhost variations
    if (hostname === 'localhost' || hostname === '0.0.0.0' || hostname.startsWith('127.')) {
      logger.warn('SSRF attempt blocked - localhost', { hostname, url: url.substring(0, 100) });
      return false;
    }
    
    // SECURITY: Block cloud metadata endpoints
    if (hostname === '169.254.169.254' || hostname === 'metadata.google.internal') {
      logger.warn('SSRF attempt blocked - cloud metadata', { hostname, url: url.substring(0, 100) });
      return false;
    }

    // SECURITY: Block reserved TLDs
    const blockedTLDs = ['.local', '.internal', '.localhost', '.test', '.invalid', '.example'];
    if (blockedTLDs.some(tld => hostname.endsWith(tld))) {
      logger.warn('SSRF attempt blocked - reserved TLD', { hostname, url: url.substring(0, 100) });
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

/**
 * SECURITY: Validate webhook URL to prevent data exfiltration
 * Only allows HTTPS URLs to verified domains (no localhost, private IPs, or arbitrary endpoints)
 */
export function isValidWebhookUrl(url: unknown): { valid: boolean; error?: string } {
  if (!url || typeof url !== 'string') {
    return { valid: false, error: 'Webhook URL must be a string' };
  }

  if (url.length > 2048) {
    return { valid: false, error: 'Webhook URL exceeds maximum length (2048 characters)' };
  }

  try {
    const urlObj = new URL(url);

    // SECURITY: Only allow HTTPS (no HTTP, file://, etc.)
    if (urlObj.protocol !== 'https:') {
      logger.warn('Webhook validation failed - non-HTTPS protocol', { protocol: urlObj.protocol, url: url.substring(0, 100) });
      return { valid: false, error: 'Webhook URL must use HTTPS' };
    }

    // SECURITY: Block URLs with userinfo (user:pass@host)
    if (urlObj.username || urlObj.password) {
      logger.warn('Webhook validation failed - userinfo in URL', { url: url.substring(0, 100) });
      return { valid: false, error: 'Webhook URL cannot contain credentials' };
    }

    const hostname = urlObj.hostname.toLowerCase();

    // SECURITY: Block localhost and loopback
    if (hostname === 'localhost' || hostname === '0.0.0.0' || hostname.startsWith('127.')) {
      logger.warn('Webhook validation failed - localhost', { hostname, url: url.substring(0, 100) });
      return { valid: false, error: 'Webhook URL cannot point to localhost' };
    }

    // SECURITY: Block private IPv4 addresses
    const isPrivateIPv4 = /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|127\.|169\.254\.)/.test(hostname);
    if (isPrivateIPv4) {
      logger.warn('Webhook validation failed - private IPv4', { hostname, url: url.substring(0, 100) });
      return { valid: false, error: 'Webhook URL cannot point to private IP addresses' };
    }

    // SECURITY: Block private IPv6 addresses
    const isPrivateIPv6 = /^(::1|fc00:|fe80:|fd[0-9a-f]{2}:|::ffff:(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|127\.|169\.254\.))/.test(hostname);
    if (isPrivateIPv6) {
      logger.warn('Webhook validation failed - private IPv6', { hostname, url: url.substring(0, 100) });
      return { valid: false, error: 'Webhook URL cannot point to private IP addresses' };
    }

    // SECURITY: Block raw IP addresses (require domain names for accountability)
    const isRawIP = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) || hostname.includes(':');
    if (isRawIP) {
      logger.warn('Webhook validation failed - raw IP address', { hostname, url: url.substring(0, 100) });
      return { valid: false, error: 'Webhook URL must use a domain name, not an IP address' };
    }

    // SECURITY: Require at least one dot in domain (blocks 'localhost' style single-label domains)
    if (!hostname.includes('.')) {
      logger.warn('Webhook validation failed - single-label domain', { hostname, url: url.substring(0, 100) });
      return { valid: false, error: 'Webhook URL must use a fully qualified domain name' };
    }

    // SECURITY: Block common internal/reserved TLDs
    const blockedTLDs = ['.local', '.internal', '.localhost', '.test', '.invalid', '.example'];
    if (blockedTLDs.some(tld => hostname.endsWith(tld))) {
      logger.warn('Webhook validation failed - blocked TLD', { hostname, url: url.substring(0, 100) });
      return { valid: false, error: 'Webhook URL cannot use reserved domain names' };
    }

    return { valid: true };
  } catch (error) {
    logger.warn('Webhook validation failed - invalid URL format', { url: url.substring(0, 100), error: (error as Error).message });
    return { valid: false, error: 'Invalid webhook URL format' };
  }
}

/**
 * SECURITY: Sanitize system prompt to prevent prompt injection attacks
 * Removes or escapes potentially dangerous patterns that could override agent behavior
 */
export function sanitizeSystemPrompt(prompt: unknown, maxLength: number = 10000): { sanitized: string; warnings: string[] } {
  const warnings: string[] = [];
  
  if (!prompt || typeof prompt !== 'string') {
    return { sanitized: '', warnings: [] };
  }

  let sanitized = prompt.trim();

  // SECURITY: Limit length to prevent resource exhaustion
  if (sanitized.length > maxLength) {
    sanitized = sanitized.slice(0, maxLength);
    warnings.push(`System prompt truncated to ${maxLength} characters`);
  }

  // SECURITY FIX: Detect AND REMOVE dangerous patterns (not just warn)
  // Critical injection patterns are stripped from the prompt to prevent attacks
  const criticalPatterns = [
    { pattern: /system:\s*\[/gi, name: 'system tag injection' },
    { pattern: /<\|im_start\|>/gi, name: 'ChatML injection' },
    { pattern: /<\|system\|>/gi, name: 'system role injection' },
    { pattern: /\[\[SYSTEM\]\]/gi, name: 'system marker injection' },
    { pattern: /```system/gi, name: 'code block system injection' },
    { pattern: /<\|endoftext\|>/gi, name: 'end-of-text injection' },
    { pattern: /\[INST\]/gi, name: 'instruction tag injection' },
    { pattern: /\[\/INST\]/gi, name: 'instruction close tag injection' },
    { pattern: /<<SYS>>/gi, name: 'system block injection' },
    { pattern: /<<\/SYS>>/gi, name: 'system block close injection' },
  ];

  // These are stripped entirely (high confidence injection attempts)
  for (const { pattern, name } of criticalPatterns) {
    if (pattern.test(sanitized)) {
      warnings.push(`Dangerous pattern blocked and removed: ${name}`);
      logger.warn('Prompt injection pattern BLOCKED', { pattern: name, promptPreview: sanitized.substring(0, 100) });
      sanitized = sanitized.replace(pattern, '[BLOCKED]');
    }
  }

  // Behavioral override patterns: warn but also defang
  const behavioralPatterns = [
    { pattern: /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|rules?)/gi, name: 'instruction override' },
    { pattern: /you\s+are\s+now\s+(a\s+)?different/gi, name: 'identity override' },
    { pattern: /forget\s+(all\s+)?(your\s+)?(previous|prior)/gi, name: 'memory wipe' },
    { pattern: /act\s+as\s+if\s+you\s+(have\s+)?no\s+(rules?|restrictions?|guidelines?)/gi, name: 'restriction bypass' },
    { pattern: /pretend\s+(that\s+)?(you\s+)?(are|have)\s+no\s+(safety|content)/gi, name: 'safety bypass' },
    { pattern: /disregard\s+(all\s+)?(your\s+)?(previous|prior|safety|instructions?)/gi, name: 'disregard instructions' },
  ];

  for (const { pattern, name } of behavioralPatterns) {
    if (pattern.test(sanitized)) {
      warnings.push(`Behavioral override pattern blocked: ${name}`);
      logger.warn('Prompt injection behavioral pattern BLOCKED', { pattern: name, promptPreview: sanitized.substring(0, 100) });
      sanitized = sanitized.replace(pattern, '[BLOCKED]');
    }
  }

  // SECURITY: Escape certain control sequences that might be interpreted specially
  // Replace multiple newlines with max 2 to prevent prompt structure manipulation
  sanitized = sanitized.replace(/\n{3,}/g, '\n\n');

  return { sanitized, warnings };
}

/**
 * SECURITY: Sanitize skill markdown to prevent injection attacks
 * Similar to system prompt but allows markdown formatting
 */
export function sanitizeSkillMarkdown(skillMd: unknown, maxLength: number = 50000): { sanitized: string; warnings: string[] } {
  const warnings: string[] = [];
  
  if (!skillMd || typeof skillMd !== 'string') {
    return { sanitized: '', warnings: [] };
  }

  let sanitized = skillMd.trim();

  // SECURITY: Limit length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.slice(0, maxLength);
    warnings.push(`Skill markdown truncated to ${maxLength} characters`);
  }

  // SECURITY FIX: Detect AND REMOVE dangerous patterns in skill definitions
  const dangerousPatterns = [
    { pattern: /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|rules?)/gi, name: 'instruction override' },
    { pattern: /you\s+are\s+now\s+(a\s+)?different/gi, name: 'identity override' },
    { pattern: /bypass\s+(all\s+)?(safety|security|content)/gi, name: 'safety bypass' },
    { pattern: /disregard\s+(all\s+)?(your\s+)?(previous|prior|safety|instructions?)/gi, name: 'disregard instructions' },
    { pattern: /system:\s*\[/gi, name: 'system tag injection' },
    { pattern: /<\|im_start\|>/gi, name: 'ChatML injection' },
    { pattern: /<\|system\|>/gi, name: 'system role injection' },
    { pattern: /\[\[SYSTEM\]\]/gi, name: 'system marker injection' },
    { pattern: /<\|endoftext\|>/gi, name: 'end-of-text injection' },
  ];

  for (const { pattern, name } of dangerousPatterns) {
    if (pattern.test(sanitized)) {
      warnings.push(`Dangerous pattern blocked and removed: ${name}`);
      logger.warn('Skill markdown injection pattern BLOCKED', { pattern: name, skillPreview: sanitized.substring(0, 100) });
      sanitized = sanitized.replace(pattern, '[BLOCKED]');
    }
  }

  // SECURITY: Remove HTML script tags completely
  sanitized = sanitized.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  
  // SECURITY: Remove javascript: protocol URLs
  sanitized = sanitized.replace(/javascript:/gi, 'blocked:');
  
  // SECURITY: Remove data:text/html URLs (XSS vector)
  sanitized = sanitized.replace(/data:text\/html/gi, 'blocked:text/html');
  
  // SECURITY: Remove HTML event handlers
  sanitized = sanitized.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '');

  return { sanitized, warnings };
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
  isValidPublicUrl,
  isValidWebhookUrl,
  sanitizeSystemPrompt,
  sanitizeSkillMarkdown,
  createValidateInput,
  getSafeErrorMessage
};
