/**
 * Backend Error Classes
 * Typed error classes for consistent error handling across the API
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
    code: string = 'INTERNAL_ERROR',
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

  /**
   * Convert to JSON for API responses
   */
  toJSON() {
    return {
      success: false,
      error: this.message,
      code: this.code,
    };
  }
}

// ============================================
// Authentication & Authorization Errors
// ============================================

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 'AUTHENTICATION_REQUIRED', 401);
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'You do not have permission to perform this action') {
    super(message, 'FORBIDDEN', 403);
  }
}

export class InvalidTokenError extends AppError {
  constructor(message: string = 'Invalid or expired token') {
    super(message, 'INVALID_TOKEN', 401);
  }
}

export class SessionExpiredError extends AppError {
  constructor(message: string = 'Session expired. Please sign in again.') {
    super(message, 'SESSION_EXPIRED', 401);
  }
}

// ============================================
// Resource Errors
// ============================================

export class NotFoundError extends AppError {
  constructor(resource: string = 'Resource') {
    super(`${resource} not found`, 'NOT_FOUND', 404);
  }
}

export class ConflictError extends AppError {
  constructor(message: string = 'Resource already exists') {
    super(message, 'CONFLICT', 409);
  }
}

// ============================================
// Validation Errors
// ============================================

export class ValidationError extends AppError {
  public readonly field?: string;
  public readonly details?: Record<string, string>;

  constructor(message: string, field?: string, details?: Record<string, string>) {
    super(message, 'VALIDATION_ERROR', 400);
    this.field = field;
    this.details = details;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      ...(this.field && { field: this.field }),
      ...(this.details && { details: this.details }),
    };
  }
}

export class InvalidInputError extends ValidationError {
  constructor(field: string, message?: string) {
    super(message || `Invalid value for ${field}`, field);
    this.code = 'INVALID_INPUT';
  }
}

// ============================================
// Business Logic Errors
// ============================================

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

  toJSON() {
    return {
      ...super.toJSON(),
      required: this.required,
      available: this.available,
    };
  }
}

export class RateLimitError extends AppError {
  public readonly retryAfter?: number;

  constructor(message: string = 'Too many requests', retryAfter?: number) {
    super(message, 'RATE_LIMIT_EXCEEDED', 429);
    this.retryAfter = retryAfter;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      ...(this.retryAfter && { retryAfter: this.retryAfter }),
    };
  }
}

export class QuotaExceededError extends AppError {
  constructor(resource: string = 'quota') {
    super(`${resource} exceeded`, 'QUOTA_EXCEEDED', 429);
  }
}

// ============================================
// External Service Errors
// ============================================

export class ExternalServiceError extends AppError {
  public readonly service: string;

  constructor(service: string, message?: string) {
    super(
      message || `External service error: ${service}`,
      'EXTERNAL_SERVICE_ERROR',
      502
    );
    this.service = service;
  }
}

export class DatabaseError extends AppError {
  constructor(message: string = 'Database operation failed') {
    super(message, 'DATABASE_ERROR', 500, false);
  }
}

export class TimeoutError extends AppError {
  constructor(operation: string = 'Operation') {
    super(`${operation} timed out`, 'TIMEOUT', 504);
  }
}

// ============================================
// Utility Functions
// ============================================

/**
 * Check if error is an operational AppError
 */
export function isOperationalError(error: unknown): error is AppError {
  return error instanceof AppError && error.isOperational;
}

/**
 * Check if error is a specific AppError type
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Get error message safely from any error type
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
 * Get HTTP status code from error
 */
export function getStatusCode(error: unknown): number {
  if (error instanceof AppError) {
    return error.statusCode;
  }
  return 500;
}

/**
 * Convert any error to AppError
 */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }
  return new AppError(getErrorMessage(error));
}

/**
 * Create error response object
 */
export function createErrorResponse(
  error: unknown,
  requestId?: string
): { success: false; error: string; code?: string; requestId?: string } {
  const appError = toAppError(error);
  return {
    success: false,
    error: appError.message,
    code: appError.code,
    ...(requestId && { requestId }),
  };
}

export default {
  AppError,
  AuthenticationError,
  AuthorizationError,
  InvalidTokenError,
  SessionExpiredError,
  NotFoundError,
  ConflictError,
  ValidationError,
  InvalidInputError,
  InsufficientCreditsError,
  RateLimitError,
  QuotaExceededError,
  ExternalServiceError,
  DatabaseError,
  TimeoutError,
  isOperationalError,
  isAppError,
  getErrorMessage,
  getStatusCode,
  toAppError,
  createErrorResponse,
};
