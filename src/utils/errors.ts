/**
 * Error handling utilities
 * Standardized error message extraction and handling
 */

/**
 * Extract a user-friendly error message from any error type
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return 'An unexpected error occurred';
}

/**
 * Check if an error is a network/fetch error
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return true;
  }
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('network') ||
      message.includes('failed to fetch') ||
      message.includes('connection refused') ||
      message.includes('timeout')
    );
  }
  return false;
}

/**
 * Check if an error indicates insufficient credits
 */
export function isInsufficientCreditsError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes('insufficient credits') ||
    message.includes('not enough credits') ||
    message.includes('credit') && message.includes('required')
  );
}

/**
 * Check if an error is an authentication error
 */
export function isAuthError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes('unauthorized') ||
    message.includes('authentication') ||
    message.includes('not authenticated') ||
    message.includes('session expired') ||
    message.includes('invalid token')
  );
}

/**
 * Format an error for logging (includes stack trace in development)
 */
export function formatErrorForLog(error: unknown): { message: string; stack?: string } {
  const message = getErrorMessage(error);
  const stack = error instanceof Error ? error.stack : undefined;
  
  return {
    message,
    ...(import.meta.env.DEV && stack ? { stack } : {})
  };
}
