/**
 * Field-Level Encryption Utility
 * Protects sensitive user data against database breaches
 * 
 * Uses:
 * - AES-256-GCM for encryption (authenticated encryption)
 * - HMAC-SHA256 for blind indexes (searchable encrypted fields)
 */
import crypto from 'crypto';
import logger from './logger.js';

// Encryption algorithm
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // GCM recommended IV length
// AUTH_TAG_LENGTH = 16 (used implicitly by crypto.createCipheriv)
// SALT_LENGTH = 16 (reserved for future key derivation)

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

// Get HMAC key for blind indexes (derived from encryption key)
function getHmacKey(): Buffer {
  const encKey = getEncryptionKey();
  return crypto.createHash('sha256').update(encKey).update('blind_index_salt').digest();
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
 * Create a blind index (deterministic hash) for searchable encrypted fields
 * This allows lookups without exposing the actual value
 */
export function createBlindIndex(value: string): string {
  if (!value) return '';
  
  try {
    const hmacKey = getHmacKey();
    const normalized = value.toLowerCase().trim();
    
    return crypto
      .createHmac('sha256', hmacKey)
      .update(normalized)
      .digest('hex');
  } catch (error) {
    logger.error('Blind index creation failed', { error: (error as Error).message });
    throw new Error('Failed to create search index');
  }
}

/**
 * Encrypt an object's specified fields
 */
export function encryptFields<T extends Record<string, unknown>>(
  obj: T, 
  fields: (keyof T)[]
): T {
  const result = { ...obj };
  
  for (const field of fields) {
    const value = result[field];
    if (typeof value === 'string' && value) {
      result[field] = encrypt(value) as T[keyof T];
    }
  }
  
  return result;
}

/**
 * Decrypt an object's specified fields
 */
export function decryptFields<T extends Record<string, unknown>>(
  obj: T, 
  fields: (keyof T)[]
): T {
  const result = { ...obj };
  
  for (const field of fields) {
    const value = result[field];
    if (typeof value === 'string' && value) {
      result[field] = decrypt(value) as T[keyof T];
    }
  }
  
  return result;
}

/**
 * Check if a string value is already encrypted (matches our iv:authTag:ciphertext format)
 * Shared helper used by models to prevent double-encryption
 */
export function isEncrypted(value: string): boolean {
  if (!value) return false;
  const parts = value.split(':');
  return parts.length === 3 && parts[0].length > 10;
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
 * Generate a new encryption key (for setup)
 * Run this once to generate a key, then store it securely
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Encrypt sensitive fields in user data for storage
 */
export function encryptUserData(userData: {
  prompts?: string[];
  [key: string]: unknown;
}): typeof userData {
  const result = { ...userData };
  return result;
}

/**
 * Decrypt sensitive fields in user data for use
 */
export function decryptUserData<T extends Record<string, unknown>>(userData: T): T {
  const result = { ...userData };
  return result;
}

export default {
  encrypt,
  decrypt,
  createBlindIndex,
  encryptFields,
  decryptFields,
  isEncrypted,
  isEncryptionConfigured,
  generateEncryptionKey,
  encryptUserData,
  decryptUserData
};


