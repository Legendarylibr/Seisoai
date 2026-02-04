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

export default createEmailHash;
