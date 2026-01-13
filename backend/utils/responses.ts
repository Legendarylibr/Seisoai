/**
 * Response utilities for Express routes
 * Standardized response helpers and auth guards
 */
import type { Response } from 'express';
import type { IUser } from '../models/User';

/**
 * Request with authenticated user
 */
interface AuthenticatedRequest {
  user?: IUser;
  requestId?: string;
}

/**
 * Type guard that checks if user is authenticated and sends 401 if not
 * Returns true if authenticated, false if not (and response is sent)
 * 
 * @example
 * router.post('/credits', authMiddleware, async (req, res) => {
 *   if (!requireAuth(req, res)) return;
 *   // req.user is now guaranteed to exist
 *   res.json({ credits: req.user.credits });
 * });
 */
export function requireAuth(
  req: AuthenticatedRequest,
  res: Response
): req is AuthenticatedRequest & { user: IUser } {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Authentication required',
      requestId: req.requestId
    });
    return false;
  }
  return true;
}

/**
 * Standard success response
 */
export function sendSuccess<T>(res: Response, data: T, statusCode = 200): void {
  res.status(statusCode).json({
    success: true,
    ...data
  });
}

/**
 * Standard error response
 */
export function sendError(
  res: Response,
  error: string,
  statusCode = 400,
  requestId?: string
): void {
  res.status(statusCode).json({
    success: false,
    error,
    ...(requestId && { requestId })
  });
}

/**
 * Standard not found response
 */
export function sendNotFound(res: Response, message = 'Resource not found', requestId?: string): void {
  sendError(res, message, 404, requestId);
}

/**
 * Standard validation error response
 */
export function sendValidationError(res: Response, errors: string[], requestId?: string): void {
  res.status(400).json({
    success: false,
    error: 'Validation failed',
    errors,
    ...(requestId && { requestId })
  });
}

/**
 * Standard server error response
 * In production, hides the actual error message
 */
export function sendServerError(
  res: Response,
  error: Error,
  requestId?: string
): void {
  const isProduction = process.env.NODE_ENV === 'production';
  
  res.status(500).json({
    success: false,
    error: isProduction ? 'Internal server error' : error.message,
    ...(requestId && { requestId })
  });
}
