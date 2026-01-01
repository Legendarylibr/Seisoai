/**
 * Shared validation utilities
 * Consolidates input validation logic used across endpoints
 */
import { PublicKey } from '@solana/web3.js';

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
 * Get safe error message for client (hides sensitive details in production)
 */
export function getSafeErrorMessage(error: unknown, defaultMessage: string = 'An error occurred'): string {
  if (process.env.NODE_ENV === 'production') {
    return defaultMessage;
  }
  const err = error as { message?: string } | null;
  return err?.message || defaultMessage;
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
  getSafeErrorMessage
};

