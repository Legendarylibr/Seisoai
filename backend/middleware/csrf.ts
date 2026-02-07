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

  // Skip CSRF check for RPC proxy endpoints (stateless blockchain data proxy)
  // These don't modify server state - blockchain ops are secured by wallet signatures
  if (req.path.includes('/evm/rpc') || req.path.includes('/solana/rpc')) {
    return next();
  }

  // Skip CSRF check for payment-related read-only endpoints
  // These are used for fetching payment config and checking transaction status
  if (req.path.includes('/payment/get-address') || 
      req.path.includes('/payment/check-payment') ||
      req.path.includes('/payment/instant-check')) {
    return next();
  }

  // Skip CSRF check for token gate endpoints (read-only balance checks)
  // These only read blockchain state and don't modify any server data
  if (req.path.includes('/token-gate/check') || 
      req.path.includes('/token-gate/refresh')) {
    return next();
  }

  // Skip CSRF check for x402 payment requests (machine-to-machine API calls)
  // SECURITY FIX: Only skip if the Symbol-verified x402 flag is set by our middleware,
  // not just based on the presence of a header (which can be spoofed).
  // The payment-signature header alone is not sufficient; the x402 middleware must
  // verify the payment cryptographically and set the Symbol flag first.
  const X402_VERIFIED_SYMBOL = Symbol.for('seisoai.x402.verified');
  if ((req as any)[X402_VERIFIED_SYMBOL] === true) {
    return next();
  }

  // Skip CSRF check for API key authenticated requests (machine-to-machine)
  // API keys are cryptographically verified by apiKeyAuth middleware
  if ((req as any).isApiKeyAuth === true && (req as any).apiKey) {
    return next();
  }

  // SECURITY FIX: Removed x-internal-request header bypass - it was spoofable.
  // Internal server-to-server calls now use the shared internal token below.
  const INTERNAL_SECRET = config.INTERNAL_REQUEST_SECRET;
  if (INTERNAL_SECRET && req.headers['x-internal-token']) {
    const internalToken = req.headers['x-internal-token']?.toString() || '';
    // SECURITY: Use constant-time comparison for internal tokens
    if (internalToken.length === INTERNAL_SECRET.length) {
      try {
        const tokenBuf = Buffer.from(internalToken, 'utf8');
        const secretBuf = Buffer.from(INTERNAL_SECRET, 'utf8');
        if (crypto.timingSafeEqual(tokenBuf, secretBuf)) {
          return next();
        }
      } catch {
        // Fall through to CSRF check
      }
    }
  }

  // SECURITY FIX: Removed Claw/OpenClaw user-agent bypass - user-agent headers are trivially spoofable.
  // External AI agents should authenticate via API keys or x402 payments instead.

  // Get token from cookie
  const cookieToken = req.cookies?.[CSRF_TOKEN_COOKIE] || req.headers.cookie
    ?.split(';')
    .find(c => c.trim().startsWith(`${CSRF_TOKEN_COOKIE}=`))
    ?.split('=')[1]
    ?.trim();

  // Get token from header
  const headerToken = req.headers[CSRF_TOKEN_HEADER.toLowerCase()] as string | undefined;

  // SECURITY FIX: Use constant-time comparison to prevent timing attacks
  let tokensMatch = false;
  if (cookieToken && headerToken && cookieToken.length === headerToken.length) {
    try {
      const cookieBuffer = Buffer.from(cookieToken, 'utf8');
      const headerBuffer = Buffer.from(headerToken, 'utf8');
      tokensMatch = crypto.timingSafeEqual(cookieBuffer, headerBuffer);
    } catch {
      tokensMatch = false;
    }
  }

  // Verify tokens match
  if (!cookieToken || !headerToken || !tokensMatch) {
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
  // SameSite=Lax allows cookie to be sent on same-site navigations and top-level GET
  // This is more compatible with CDN/proxy setups like Cloudflare while still preventing CSRF
  res.cookie(CSRF_TOKEN_COOKIE, token, {
    httpOnly: false, // Must be readable by JavaScript for header
    secure: config.isProduction, // HTTPS only in production
    sameSite: 'lax', // CSRF protection - 'lax' works better with Cloudflare proxy
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
export function getCSRFToken(_req: Request, res: Response): void {
  const token = generateCSRFToken();

  res.cookie(CSRF_TOKEN_COOKIE, token, {
    httpOnly: false,
    secure: config.isProduction,
    sameSite: 'lax', // 'lax' works better with Cloudflare proxy
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

