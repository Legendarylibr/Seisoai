/**
 * Email Hash Utility
 * Creates consistent hashes from email addresses for lookups
 * 
 * NOTE: Uses blind index when encryption is configured for enhanced security
 */
import crypto from 'crypto';
import { createBlindIndex, isEncryptionConfigured } from './encryption';

/**
 * Create email hash for lookups (matches model implementation)
 * Uses blind index when encryption is configured, otherwise SHA-256
 */
export function createEmailHash(email: string): string {
  const normalized = email.toLowerCase().trim();
  if (isEncryptionConfigured()) {
    return createBlindIndex(normalized);
  }
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

export default createEmailHash;
