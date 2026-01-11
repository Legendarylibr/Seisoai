/**
 * JWT Key Rotation Service
 * Enterprise-grade secret management for JWT tokens
 * 
 * Features:
 * - Multiple active keys for zero-downtime rotation
 * - Automatic key expiry
 * - Graceful token verification during rotation
 * - Key versioning
 */
import crypto from 'crypto';
import jwt, { type JwtPayload, type Secret } from 'jsonwebtoken';
import logger from '../utils/logger.js';
import config from '../config/env.js';

// Key structure
interface JWTKey {
  id: string;
  secret: string;
  createdAt: Date;
  expiresAt: Date;
  isActive: boolean;
  version: number;
}

// In-memory key store (in production, use Redis or a secrets manager)
// Keys are stored with the newest first
let keyStore: JWTKey[] = [];
let currentKeyVersion = 0;

// Key rotation settings
const KEY_ROTATION_INTERVAL_DAYS = 30; // Rotate every 30 days
const KEY_OVERLAP_DAYS = 7; // Keep old keys valid for 7 days after rotation
const MAX_ACTIVE_KEYS = 3; // Maximum number of active keys

/**
 * Generate a new cryptographically secure key
 */
function generateSecureKey(): string {
  return crypto.randomBytes(64).toString('hex');
}

/**
 * Initialize the key rotation service
 * Should be called once at server startup
 */
export function initializeKeyRotation(): void {
  // Check if we have a primary key from environment
  const primarySecret = config.JWT_SECRET;
  
  if (!primarySecret) {
    logger.error('JWT_SECRET not configured - key rotation cannot initialize');
    return;
  }
  
  // Initialize with the primary key from environment
  const now = new Date();
  const primaryKey: JWTKey = {
    id: crypto.randomBytes(8).toString('hex'),
    secret: primarySecret,
    createdAt: now,
    expiresAt: new Date(now.getTime() + (KEY_ROTATION_INTERVAL_DAYS + KEY_OVERLAP_DAYS) * 24 * 60 * 60 * 1000),
    isActive: true,
    version: 1,
  };
  
  keyStore = [primaryKey];
  currentKeyVersion = 1;
  
  logger.info('Key rotation service initialized', {
    activeKeys: 1,
    nextRotation: new Date(now.getTime() + KEY_ROTATION_INTERVAL_DAYS * 24 * 60 * 60 * 1000),
  });
}

/**
 * Get the current signing key (newest active key)
 */
export function getCurrentSigningKey(): { keyId: string; secret: string } {
  const activeKeys = keyStore.filter(k => k.isActive && k.expiresAt > new Date());
  
  if (activeKeys.length === 0) {
    // Fallback to environment key
    return {
      keyId: 'env-primary',
      secret: config.JWT_SECRET || '',
    };
  }
  
  // Return the newest key
  const newestKey = activeKeys[0];
  return {
    keyId: newestKey.id,
    secret: newestKey.secret,
  };
}

/**
 * Get all valid verification keys
 * Used when verifying tokens (try all active keys)
 */
export function getVerificationKeys(): Array<{ keyId: string; secret: string }> {
  const now = new Date();
  const validKeys = keyStore.filter(k => k.expiresAt > now);
  
  if (validKeys.length === 0) {
    // Fallback to environment key
    return [{
      keyId: 'env-primary',
      secret: config.JWT_SECRET || '',
    }];
  }
  
  return validKeys.map(k => ({
    keyId: k.id,
    secret: k.secret,
  }));
}

/**
 * Rotate keys - generate a new key and deprecate old ones
 * Should be called periodically (e.g., via cron job)
 */
export function rotateKeys(): { newKeyId: string; deprecatedCount: number } {
  const now = new Date();
  
  // Generate new key
  currentKeyVersion++;
  const newKey: JWTKey = {
    id: crypto.randomBytes(8).toString('hex'),
    secret: generateSecureKey(),
    createdAt: now,
    expiresAt: new Date(now.getTime() + (KEY_ROTATION_INTERVAL_DAYS + KEY_OVERLAP_DAYS) * 24 * 60 * 60 * 1000),
    isActive: true,
    version: currentKeyVersion,
  };
  
  // Add new key at the beginning
  keyStore.unshift(newKey);
  
  // Mark old keys as inactive (but still valid for verification until expiry)
  let deprecatedCount = 0;
  keyStore.forEach((key, index) => {
    if (index > 0 && key.isActive) {
      key.isActive = false;
      deprecatedCount++;
    }
  });
  
  // Remove expired keys
  const beforeCount = keyStore.length;
  keyStore = keyStore.filter(k => k.expiresAt > now);
  const removedCount = beforeCount - keyStore.length;
  
  // Limit maximum keys
  if (keyStore.length > MAX_ACTIVE_KEYS) {
    keyStore = keyStore.slice(0, MAX_ACTIVE_KEYS);
  }
  
  logger.info('Key rotation completed', {
    newKeyId: newKey.id,
    newKeyVersion: currentKeyVersion,
    deprecatedCount,
    removedCount,
    totalActiveKeys: keyStore.length,
  });
  
  return {
    newKeyId: newKey.id,
    deprecatedCount,
  };
}

/**
 * Sign a JWT token with the current key
 * Includes key ID in header for verification
 */
export function signToken(
  payload: Record<string, unknown>,
  options?: jwt.SignOptions
): string {
  const { keyId, secret } = getCurrentSigningKey();
  
  return jwt.sign(payload, secret, {
    ...options,
    header: {
      ...options?.header,
      kid: keyId, // Key ID for verification
    },
  });
}

/**
 * Verify a JWT token, trying all valid keys
 * Handles tokens signed with rotated keys
 */
export function verifyToken(token: string): JwtPayload | null {
  const keys = getVerificationKeys();
  
  // Try to extract key ID from token header
  try {
    const decoded = jwt.decode(token, { complete: true });
    if (decoded?.header?.kid) {
      // Try the specific key first
      const specificKey = keys.find(k => k.keyId === decoded.header.kid);
      if (specificKey) {
        try {
          return jwt.verify(token, specificKey.secret) as JwtPayload;
        } catch {
          // Key didn't work, try others
        }
      }
    }
  } catch {
    // Failed to decode header, try all keys
  }
  
  // Try all keys
  for (const key of keys) {
    try {
      return jwt.verify(token, key.secret) as JwtPayload;
    } catch {
      // Try next key
    }
  }
  
  // No key worked
  return null;
}

/**
 * Get key rotation status for monitoring
 */
export function getKeyRotationStatus(): {
  activeKeys: number;
  currentVersion: number;
  oldestKeyAge: number;
  newestKeyAge: number;
  nextRotationRecommended: boolean;
} {
  const now = new Date();
  const validKeys = keyStore.filter(k => k.expiresAt > now);
  
  if (validKeys.length === 0) {
    return {
      activeKeys: 0,
      currentVersion,
      oldestKeyAge: 0,
      newestKeyAge: 0,
      nextRotationRecommended: true,
    };
  }
  
  const oldestAge = Math.floor((now.getTime() - validKeys[validKeys.length - 1].createdAt.getTime()) / (24 * 60 * 60 * 1000));
  const newestAge = Math.floor((now.getTime() - validKeys[0].createdAt.getTime()) / (24 * 60 * 60 * 1000));
  
  return {
    activeKeys: validKeys.length,
    currentVersion,
    oldestKeyAge: oldestAge,
    newestKeyAge: newestAge,
    nextRotationRecommended: newestAge >= KEY_ROTATION_INTERVAL_DAYS,
  };
}

/**
 * Schedule automatic key rotation
 * Call this once at startup to enable automatic rotation
 */
export function scheduleKeyRotation(): void {
  // Check daily if rotation is needed
  const CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
  
  setInterval(() => {
    const status = getKeyRotationStatus();
    
    if (status.nextRotationRecommended) {
      logger.info('Automatic key rotation triggered');
      rotateKeys();
    }
  }, CHECK_INTERVAL);
  
  logger.info('Automatic key rotation scheduled', {
    checkInterval: '24 hours',
    rotationInterval: `${KEY_ROTATION_INTERVAL_DAYS} days`,
  });
}

export default {
  initializeKeyRotation,
  getCurrentSigningKey,
  getVerificationKeys,
  rotateKeys,
  signToken,
  verifyToken,
  getKeyRotationStatus,
  scheduleKeyRotation,
};
