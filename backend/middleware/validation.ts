/**
 * Input validation middleware
 * Re-exports validation utilities from utils/validation.ts
 * 
 * NOTE: All validation logic is centralized in utils/validation.ts.
 * This file provides middleware-specific exports for backwards compatibility.
 */

// Re-export all validation utilities from the centralized location
export {
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
} from '../utils/validation';

// Re-export default for backwards compatibility
export { default } from '../utils/validation';
