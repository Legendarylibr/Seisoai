/**
 * Email Hash Utility
 * Creates consistent hashes for email addresses for database lookups
 * 
 * Uses HMAC-SHA256 when ENCRYPTION_KEY is configured (secure blind index)
 * Falls back to plain SHA-256 when no encryption key (development mode)
 */
import crypto from 'crypto';
import logger from './logger.js';

/**
 * Check if encryption key is configured
 */
function hasEncryptionKey(): boolean {
  const key = process.env.ENCRYPTION_KEY;
  return !!key && key.length === 64;
}

/**
 * Get HMAC key for blind indexes (derived from encryption key)
 */
function getHmacKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  
  if (!key || key.length !== 64) {
    throw new Error('ENCRYPTION_KEY not configured for HMAC');
  }
  
  const encKey = Buffer.from(key, 'hex');
  return crypto.createHash('sha256').update(encKey).update('blind_index_salt').digest();
}

/**
 * Create a consistent hash for an email address
 * Used for database lookups without exposing the actual email
 * 
 * @param email - The email address to hash
 * @returns A 64-character hex string (SHA-256 digest)
 */
export function createEmailHash(email: string): string {
  if (!email) return '';
  
  // Normalize: lowercase and trim
  const normalized = email.toLowerCase().trim();
  
  try {
    // If encryption key is configured, use HMAC-based blind index
    if (hasEncryptionKey()) {
      const hmacKey = getHmacKey();
      return crypto
        .createHmac('sha256', hmacKey)
        .update(normalized)
        .digest('hex');
    }
  } catch (error) {
    // Fall through to plain SHA-256
    logger.debug('HMAC not available, using plain SHA-256', { 
      error: (error as Error).message 
    });
  }
  
  // Fallback: plain SHA-256 (for development or when key not configured)
  return crypto
    .createHash('sha256')
    .update(normalized)
    .digest('hex');
}

export default { createEmailHash };
