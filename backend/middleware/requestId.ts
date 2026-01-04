/**
 * Request ID Middleware
 * Adds unique request IDs for tracing and debugging
 */
import { v4 as uuidv4 } from 'uuid';
import type { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger.js';

// Extend Express Request to include requestId
declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      startTime?: number;
    }
  }
}

/**
 * Generate and attach a unique request ID to each request
 * Also tracks request timing for performance monitoring
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Use existing request ID from header or generate new one
  const requestId = (req.headers['x-request-id'] as string) || uuidv4();
  
  // Attach to request
  req.requestId = requestId;
  req.startTime = Date.now();
  
  // Add to response headers
  res.setHeader('X-Request-ID', requestId);
  
  // Log request start
  logger.debug('Request started', {
    requestId,
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.headers['user-agent']?.substring(0, 100)
  });
  
  // Log request completion
  res.on('finish', () => {
    const duration = req.startTime ? Date.now() - req.startTime : 0;
    const logData = {
      requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`
    };
    
    if (res.statusCode >= 400) {
      logger.warn('Request completed with error', logData);
    } else {
      logger.debug('Request completed', logData);
    }
  });
  
  next();
}

/**
 * Get request ID from request object
 */
export function getRequestId(req: Request): string {
  return req.requestId || 'unknown';
}

export default requestIdMiddleware;

