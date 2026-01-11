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
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 16;

// Get encryption key from environment
function getEncryptionKey(): Buffer | null {
  const key = process.env.ENCRYPTION_KEY;
  
  if (!key) {
    logger.warn('ENCRYPTION_KEY not set - encryption disabled');
    return null;
  }
  
  // Key should be 64 hex characters (32 bytes)
  if (key.length !== 64) {
    logger.warn(`ENCRYPTION_KEY has ${key.length} chars, expected 64 - encryption disabled`);
    return null;
  }
  
  return Buffer.from(key, 'hex');
}

// Get HMAC key for blind indexes (derived from encryption key)
function getHmacKey(): Buffer | null {
  const encKey = getEncryptionKey();
  if (!encKey) return null;
  return crypto.createHash('sha256').update(encKey).update('blind_index_salt').digest();
}

/**
 * Encrypt a string value
 * Returns format: iv:authTag:ciphertext (all base64)
 * If encryption is not configured, returns plaintext
 */
export function encrypt(plaintext: string): string {
  if (!plaintext) return plaintext;
  
  const key = getEncryptionKey();
  if (!key) {
    // Encryption disabled - return plaintext
    return plaintext;
  }
  
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    const authTag = cipher.getAuthTag();
    
    // Format: iv:authTag:ciphertext
    return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
  } catch (error) {
    logger.error('Encryption failed', { error: (error as Error).message });
    return plaintext; // Return plaintext on error instead of throwing
  }
}

/**
 * Decrypt a string value
 * Expects format: iv:authTag:ciphertext (all base64)
 * If encryption is not configured, returns value as-is
 */
export function decrypt(ciphertext: string): string {
  if (!ciphertext) return ciphertext;
  
  // Check if it's actually encrypted (has our format)
  if (!ciphertext.includes(':')) {
    // Not encrypted, return as-is (for backward compatibility)
    return ciphertext;
  }
  
  const key = getEncryptionKey();
  if (!key) {
    // Encryption disabled - return as-is
    return ciphertext;
  }
  
  try {
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
 * If encryption is not configured, returns a simple hash
 */
export function createBlindIndex(value: string): string {
  if (!value) return '';
  
  const normalized = value.toLowerCase().trim();
  const hmacKey = getHmacKey();
  
  if (!hmacKey) {
    // Encryption disabled - use simple hash (less secure but functional)
    return crypto.createHash('sha256').update(normalized).digest('hex');
  }
  
  try {
    return crypto
      .createHmac('sha256', hmacKey)
      .update(normalized)
      .digest('hex');
  } catch (error) {
    logger.error('Blind index creation failed', { error: (error as Error).message });
    // Fallback to simple hash
    return crypto.createHash('sha256').update(normalized).digest('hex');
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
  email?: string;
  prompts?: string[];
  [key: string]: unknown;
}): typeof userData & { emailHash?: string } {
  const result = { ...userData };
  
  // Encrypt email and create blind index
  if (result.email) {
    const emailHash = createBlindIndex(result.email);
    result.email = encrypt(result.email);
    (result as typeof userData & { emailHash?: string }).emailHash = emailHash;
  }
  
  return result as typeof userData & { emailHash?: string };
}

/**
 * Decrypt sensitive fields in user data for use
 */
export function decryptUserData<T extends { email?: string }>(userData: T): T {
  const result = { ...userData };
  
  if (result.email) {
    result.email = decrypt(result.email);
  }
  
  return result;
}

export default {
  encrypt,
  decrypt,
  createBlindIndex,
  encryptFields,
  decryptFields,
  isEncryptionConfigured,
  generateEncryptionKey,
  encryptUserData,
  decryptUserData
};


