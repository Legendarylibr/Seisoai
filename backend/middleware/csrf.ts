/**
 * CSRF Protection Middleware
 * Implements double-submit cookie pattern for CSRF protection
 * 
 * SECURITY: Protects against Cross-Site Request Forgery attacks
 */
import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import logger from '../utils/logger.js';
import config from '../config/env.js';

// CSRF token cookie name
const CSRF_TOKEN_COOKIE = 'XSRF-TOKEN';
const CSRF_TOKEN_HEADER = 'X-CSRF-Token';

// Methods that require CSRF protection
const PROTECTED_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

/**
 * Generate a CSRF token
 */
function generateCSRFToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * CSRF protection middleware
 * Uses double-submit cookie pattern:
 * 1. Server sets CSRF token in cookie
 * 2. Client must send same token in header
 * 3. Server verifies cookie and header match
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  // Skip CSRF check for GET, HEAD, OPTIONS (safe methods)
  if (!PROTECTED_METHODS.includes(req.method)) {
    return next();
  }

  // Skip CSRF check for webhooks (they use signature verification instead)
  if (req.path.includes('/webhook')) {
    return next();
  }

  // Skip CSRF check for health/status endpoints
  if (req.path === '/api/health' || req.path === '/health') {
    return next();
  }

  // Get token from cookie
  const cookieToken = req.cookies?.[CSRF_TOKEN_COOKIE] || req.headers.cookie
    ?.split(';')
    .find(c => c.trim().startsWith(`${CSRF_TOKEN_COOKIE}=`))
    ?.split('=')[1]
    ?.trim();

  // Get token from header
  const headerToken = req.headers[CSRF_TOKEN_HEADER.toLowerCase()] as string | undefined;

  // Verify tokens match
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    logger.warn('CSRF token validation failed', {
      path: req.path,
      method: req.method,
      hasCookieToken: !!cookieToken,
      hasHeaderToken: !!headerToken,
      ip: req.ip
    });
    res.status(403).json({
      success: false,
      error: 'Invalid CSRF token. Please refresh the page and try again.'
    });
    return;
  }

  next();
}

/**
 * Middleware to set CSRF token cookie
 * Call this on GET requests to provide token to client
 */
export function setCSRFToken(req: Request, res: Response, next: NextFunction): void {
  // Only set token for GET requests (safe methods)
  if (req.method !== 'GET') {
    return next();
  }

  // Check if token already exists in cookie
  const existingToken = req.cookies?.[CSRF_TOKEN_COOKIE];
  if (existingToken) {
    return next(); // Token already set
  }

  // Generate new token
  const token = generateCSRFToken();

  // Set token in cookie
  // SECURITY: HttpOnly=false so JavaScript can read it for header
  // SameSite=Strict provides additional CSRF protection
  res.cookie(CSRF_TOKEN_COOKIE, token, {
    httpOnly: false, // Must be readable by JavaScript for header
    secure: config.isProduction, // HTTPS only in production
    sameSite: 'strict', // CSRF protection
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    path: '/'
  });

  // Also set in response header for convenience
  res.setHeader(CSRF_TOKEN_HEADER, token);

  next();
}

/**
 * Get CSRF token endpoint (for clients that need it)
 * GET /api/csrf-token
 */
export function getCSRFToken(req: Request, res: Response): void {
  const token = generateCSRFToken();

  res.cookie(CSRF_TOKEN_COOKIE, token, {
    httpOnly: false,
    secure: config.isProduction,
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000,
    path: '/'
  });

  res.json({
    success: true,
    token,
    headerName: CSRF_TOKEN_HEADER
  });
}

export default {
  csrfProtection,
  setCSRFToken,
  getCSRFToken
};

