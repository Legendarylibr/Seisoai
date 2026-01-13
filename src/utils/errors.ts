/**
 * Error handling utilities
 * Typed error classes and standardized error handling
 */

// ============================================
// Base Application Error
// ============================================

/**
 * Base error class for all application errors
 * Provides consistent error structure and metadata
 */
export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    code: string = 'APP_ERROR',
    statusCode: number = 500,
    isOperational: boolean = true
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

// ============================================
// Specific Error Types
// ============================================

/**
 * Authentication/authorization errors
 */
export class AuthError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 'AUTH_ERROR', 401);
  }
}

/**
 * Session expired error
 */
export class SessionExpiredError extends AuthError {
  constructor(message: string = 'Session expired. Please sign in again.') {
    super(message);
    Object.assign(this, { code: 'SESSION_EXPIRED' });
  }
}

/**
 * Insufficient credits error
 */
export class InsufficientCreditsError extends AppError {
  public readonly required: number;
  public readonly available: number;

  constructor(required: number, available: number) {
    super(
      `Insufficient credits. Required: ${required}, Available: ${available}`,
      'INSUFFICIENT_CREDITS',
      402
    );
    this.required = required;
    this.available = available;
  }
}

/**
 * Network/connectivity errors
 */
export class NetworkError extends AppError {
  constructor(message: string = 'Network error. Please check your connection.') {
    super(message, 'NETWORK_ERROR', 503);
  }
}

/**
 * API response errors
 */
export class ApiError extends AppError {
  public readonly endpoint: string;

  constructor(message: string, statusCode: number, endpoint: string) {
    super(message, 'API_ERROR', statusCode);
    this.endpoint = endpoint;
  }
}

/**
 * Validation errors
 */
export class ValidationError extends AppError {
  public readonly field?: string;

  constructor(message: string, field?: string) {
    super(message, 'VALIDATION_ERROR', 400);
    this.field = field;
  }
}

/**
 * Rate limit errors
 */
export class RateLimitError extends AppError {
  public readonly retryAfter?: number;

  constructor(message: string = 'Too many requests. Please slow down.', retryAfter?: number) {
    super(message, 'RATE_LIMIT', 429);
    this.retryAfter = retryAfter;
  }
}

/**
 * Resource not found errors
 */
export class NotFoundError extends AppError {
  constructor(resource: string = 'Resource') {
    super(`${resource} not found`, 'NOT_FOUND', 404);
  }
}

// ============================================
// Error Utility Functions
// ============================================

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
export function isNetworkError(error: unknown): error is NetworkError {
  if (error instanceof NetworkError) return true;
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
export function isInsufficientCreditsError(error: unknown): error is InsufficientCreditsError {
  if (error instanceof InsufficientCreditsError) return true;
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
export function isAuthError(error: unknown): error is AuthError {
  if (error instanceof AuthError) return true;
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
export function formatErrorForLog(error: unknown): { message: string; stack?: string; code?: string } {
  const message = getErrorMessage(error);
  const stack = error instanceof Error ? error.stack : undefined;
  const code = error instanceof AppError ? error.code : undefined;
  
  return {
    message,
    ...(code ? { code } : {}),
    ...(import.meta.env.DEV && stack ? { stack } : {})
  };
}

/**
 * Check if error is an AppError (typed application error)
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Create appropriate error from API response
 */
export async function createErrorFromResponse(
  response: Response,
  endpoint: string
): Promise<AppError> {
  let message = `Request failed with status ${response.status}`;
  
  try {
    const data = await response.json();
    if (data.error) message = data.error;
    if (data.message) message = data.message;
  } catch {
    // Response might not be JSON
  }

  switch (response.status) {
    case 401:
      return new AuthError(message);
    case 402:
      return new InsufficientCreditsError(0, 0); // Caller should provide actual values
    case 404:
      return new NotFoundError(endpoint);
    case 429:
      const retryAfter = response.headers.get('Retry-After');
      return new RateLimitError(message, retryAfter ? parseInt(retryAfter) : undefined);
    default:
      return new ApiError(message, response.status, endpoint);
  }
}

/**
 * Wrap async function with error handling
 */
export function withErrorHandling<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  errorHandler?: (error: AppError) => void
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (error) {
      const appError = error instanceof AppError 
        ? error 
        : new AppError(getErrorMessage(error));
      
      if (errorHandler) {
        errorHandler(appError);
      }
      throw appError;
    }
  }) as T;
}
