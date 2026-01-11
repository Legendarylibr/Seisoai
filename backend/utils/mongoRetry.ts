/**
 * MongoDB Retry Utility
 * Handles transient write conflicts with exponential backoff
 * 
 * Common errors that benefit from retry:
 * - "Plan executor error during findAndModify" - Concurrent write conflicts
 * - WriteConflict errors
 * - TransientTransactionError
 */
import logger from './logger';

interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  operation?: string;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  baseDelayMs: 50,
  maxDelayMs: 1000,
  operation: 'MongoDB operation'
};

/**
 * Check if an error is retryable
 */
function isRetryableError(error: Error): boolean {
  const message = error.message?.toLowerCase() || '';
  const name = error.name?.toLowerCase() || '';
  
  const retryablePatterns = [
    'plan executor error',
    'writeconflict',
    'write conflict',
    'transienttransactionerror',
    'network error',
    'socket exception',
    'connection reset',
    'econnreset',
    'cursor not found',
    'operation was interrupted'
  ];
  
  return retryablePatterns.some(pattern => 
    message.includes(pattern) || name.includes(pattern)
  );
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateDelay(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  // Exponential backoff: baseDelay * 2^attempt
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
  // Add jitter (0-50% of the delay)
  const jitter = Math.random() * 0.5 * exponentialDelay;
  // Cap at maxDelay
  return Math.min(exponentialDelay + jitter, maxDelayMs);
}

/**
 * Execute a MongoDB operation with retry logic
 * 
 * @param operation - Async function to execute
 * @param options - Retry configuration
 * @returns Result of the operation
 * @throws Error if all retries exhausted
 * 
 * @example
 * const result = await withRetry(
 *   () => User.findOneAndUpdate(query, update),
 *   { operation: 'Update user generation history' }
 * );
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      const err = error as Error;
      lastError = err;
      
      // Check if error is retryable
      if (!isRetryableError(err)) {
        throw err;
      }
      
      // Check if we have retries left
      if (attempt >= opts.maxRetries) {
        logger.error(`${opts.operation} failed after ${opts.maxRetries + 1} attempts`, {
          error: err.message,
          attempts: attempt + 1
        });
        throw err;
      }
      
      // Calculate delay and wait
      const delay = calculateDelay(attempt, opts.baseDelayMs, opts.maxDelayMs);
      
      logger.warn(`${opts.operation} failed (attempt ${attempt + 1}/${opts.maxRetries + 1}), retrying in ${Math.round(delay)}ms`, {
        error: err.message
      });
      
      await sleep(delay);
    }
  }
  
  // This should never be reached, but TypeScript needs it
  throw lastError || new Error('Retry failed');
}

export { isRetryableError };
export default { withRetry, isRetryableError };
