/**
 * Request Correlation ID Middleware
 * Enterprise-grade distributed tracing support
 * 
 * Features:
 * - Unique ID per request for tracing
 * - Propagates through headers
 * - Integrates with logging
 */
import { v4 as uuidv4 } from 'uuid';
import type { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger.js';

// Header names for correlation ID
export const CORRELATION_ID_HEADER = 'X-Correlation-ID';
export const REQUEST_ID_HEADER = 'X-Request-ID';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      correlationId?: string;
      requestId?: string;
    }
  }
}

/**
 * Correlation ID middleware
 * Assigns unique IDs to each request for distributed tracing
 */
export function correlationIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Check for existing correlation ID (propagated from upstream service)
  const incomingCorrelationId = req.headers[CORRELATION_ID_HEADER.toLowerCase()] as string | undefined;
  
  // Generate new request ID for this specific request
  const requestId = uuidv4();
  
  // Use incoming correlation ID or generate new one
  const correlationId = incomingCorrelationId || uuidv4();
  
  // Attach to request object
  req.correlationId = correlationId;
  req.requestId = requestId;
  
  // Set response headers for client tracing
  res.setHeader(CORRELATION_ID_HEADER, correlationId);
  res.setHeader(REQUEST_ID_HEADER, requestId);
  
  // Add to logger context for all subsequent logs
  // This ensures all logs from this request include the correlation ID
  const originalSend = res.send;
  const startTime = Date.now();
  
  // Log request start
  logger.debug('Request started', {
    correlationId,
    requestId,
    method: req.method,
    path: req.path,
    userAgent: req.headers['user-agent']?.substring(0, 100),
    ip: req.ip,
  });
  
  // Override send to log request completion
  res.send = function(body) {
    const duration = Date.now() - startTime;
    
    logger.debug('Request completed', {
      correlationId,
      requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
    });
    
    return originalSend.call(this, body);
  };
  
  next();
}

/**
 * Get correlation context for external service calls
 * Use this when making requests to other services
 */
export function getCorrelationHeaders(req: Request): Record<string, string> {
  return {
    [CORRELATION_ID_HEADER]: req.correlationId || uuidv4(),
    [REQUEST_ID_HEADER]: req.requestId || uuidv4(),
  };
}

/**
 * Create child correlation ID for sub-operations
 * Maintains parent correlation while creating unique sub-request ID
 */
export function createChildCorrelation(parentCorrelationId: string): {
  correlationId: string;
  requestId: string;
} {
  return {
    correlationId: parentCorrelationId,
    requestId: uuidv4(),
  };
}

export default correlationIdMiddleware;
