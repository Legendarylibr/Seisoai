/**
 * Field-Level Encryption Utility for Discord Bot
 * Protects sensitive user data against database breaches
 * 
 * Uses:
 * - AES-256-GCM for encryption (authenticated encryption)
 * - HMAC-SHA256 for blind indexes (searchable encrypted fields)
 * 
 * NOTE: This mirrors the backend encryption module for consistency
 */
import crypto from 'crypto';
import logger from './logger.js';

// Encryption algorithm
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // GCM recommended IV length
const AUTH_TAG_LENGTH = 16;

// Get encryption key from environment
function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  
  if (!key) {
    throw new Error('ENCRYPTION_KEY environment variable is required for data encryption');
  }
  
  // Key should be 64 hex characters (32 bytes)
  if (key.length !== 64) {
    throw new Error(`ENCRYPTION_KEY must be exactly 64 hex characters (256 bits), got ${key.length}`);
  }
  
  return Buffer.from(key, 'hex');
}

/**
 * Check if encryption is properly configured
 */
export function isEncryptionConfigured(): boolean {
  try {
    getEncryptionKey();
    return true;
  } catch {
    return false;
  }
}

/**
 * Encrypt a string value
 * Returns format: iv:authTag:ciphertext (all base64)
 */
export function encrypt(plaintext: string): string {
  if (!plaintext) return plaintext;
  
  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    const authTag = cipher.getAuthTag();
    
    // Format: iv:authTag:ciphertext
    return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
  } catch (error) {
    logger.error('Encryption failed', { error: (error as Error).message });
    throw new Error('Encryption failed');
  }
}

/**
 * Decrypt a string value
 * Expects format: iv:authTag:ciphertext (all base64)
 */
export function decrypt(ciphertext: string): string {
  if (!ciphertext) return ciphertext;
  
  // Check if it's actually encrypted (has our format)
  if (!ciphertext.includes(':')) {
    // Not encrypted, return as-is (for backward compatibility)
    return ciphertext;
  }
  
  try {
    const key = getEncryptionKey();
    const parts = ciphertext.split(':');
    
    if (parts.length !== 3) {
      // Not our format, return as-is
      return ciphertext;
    }
    
    const iv = Buffer.from(parts[0], 'base64');
    const authTag = Buffer.from(parts[1], 'base64');
    const encrypted = parts[2];
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    logger.error('Decryption failed', { error: (error as Error).message });
    // Return original value if decryption fails (might not be encrypted)
    return ciphertext;
  }
}

/**
 * Check if a string is already encrypted (contains our format)
 */
export function isEncrypted(value: string): boolean {
  if (!value) return false;
  const parts = value.split(':');
  return parts.length === 3 && parts[0].length > 10;
}

/**
 * Create a blind index (deterministic hash for searching encrypted fields)
 * Uses HMAC-SHA256 with encryption key for extra security
 */
export function createBlindIndex(value: string): string {
  if (!value) return '';
  
  try {
    const key = getEncryptionKey();
    return crypto.createHmac('sha256', key)
      .update(value.toLowerCase().trim())
      .digest('hex');
  } catch {
    // If encryption key not configured, fall back to SHA-256
    return crypto.createHash('sha256')
      .update(value.toLowerCase().trim())
      .digest('hex');
  }
}

/**
 * Create email hash for lookups (matches backend implementation)
 * Uses blind index when encryption is configured, otherwise SHA-256
 */
export function createEmailHash(email: string): string {
  const normalized = email.toLowerCase().trim();
  if (isEncryptionConfigured()) {
    return createBlindIndex(normalized);
  }
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Build robust email lookup query with multiple fallback methods
 * This ensures users can be found regardless of ENCRYPTION_KEY configuration
 */
export function buildEmailLookupConditions(email: string): Array<Record<string, string>> {
  const normalized = email.toLowerCase().trim();
  const emailHash = createEmailHash(normalized);
  const emailHashPlain = crypto.createHash('sha256').update(normalized).digest('hex');
  
  return [
    { emailHash },                    // Primary: HMAC hash (with encryption key)
    { emailHashPlain },               // Fallback: plain SHA-256 hash
    { emailLookup: normalized },      // Fallback: plain email lookup field
    { email: normalized }             // Legacy: direct email match
  ];
}

export default {
  encrypt,
  decrypt,
  isEncryptionConfigured,
  isEncrypted,
  createBlindIndex,
  createEmailHash,
  buildEmailLookupConditions
};
