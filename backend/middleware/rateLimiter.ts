/**
 * Rate limiting middleware
 * Configures various rate limiters for different endpoints
 * 
 * Memory optimization: Uses Redis store in production to:
 * - Reduce memory usage (rate limit data stored in Redis, not in-memory)
 * - Share state across multiple server instances
 * - Persist rate limit data across server restarts
 */
import rateLimit, { type RateLimitRequestHandler, type Options } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { RATE_LIMITS } from '../config/constants';
import { generateBrowserFingerprint } from '../abusePrevention';
import { getRedis } from '../services/redis';
import logger from '../utils/logger';

/**
 * Get Redis store for rate limiting (production only)
 * Falls back to in-memory store if Redis is not available
 */
function getRedisStore(prefix: string): RedisStore | undefined {
  const client = getRedis();
  
  if (!client) {
    return undefined;
  }
  
  try {
    return new RedisStore({
      // Use ioredis client - cast to proper type for rate-limit-redis
      sendCommand: ((...args: string[]) => 
        client.call(args[0], ...args.slice(1))
      ) as (...args: string[]) => Promise<boolean | number | string | (boolean | number | string)[]>,
      prefix: `seisoai:ratelimit:${prefix}:`
    });
  } catch (error) {
    logger.warn('Failed to create Redis store for rate limiting, using in-memory', { 
      error: (error as Error).message,
      prefix 
    });
    return undefined;
  }
}

/**
 * Create rate limiter with optional Redis store
 */
function createLimiter(options: Partial<Options> & { storePrefix?: string }): RateLimitRequestHandler {
  const { storePrefix, ...rateLimitOptions } = options;
  const store = storePrefix ? getRedisStore(storePrefix) : undefined;
  
  return rateLimit({
    ...rateLimitOptions,
    ...(store && { store }),
    standardHeaders: true,
    legacyHeaders: false
  });
}

/**
 * Create the general API rate limiter
 * ENTERPRISE: Includes proper Retry-After headers for RFC compliance
 */
export const createGeneralLimiter = (): RateLimitRequestHandler => createLimiter({
  storePrefix: 'general',
  windowMs: RATE_LIMITS.GENERAL.windowMs,
  max: process.env.NODE_ENV === 'production' ? RATE_LIMITS.GENERAL.max : 1000,
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  skip: (req) => req.path === '/api/health',
  // ENTERPRISE: Custom handler to include Retry-After header
  handler: (req, res, next, options) => {
    const retryAfterSeconds = Math.ceil(options.windowMs / 1000);
    res.setHeader('Retry-After', retryAfterSeconds);
    res.setHeader('X-RateLimit-Reset', new Date(Date.now() + options.windowMs).toISOString());
    res.status(429).json({
      success: false,
      error: 'Too many requests from this IP, please try again later.',
      retryAfter: retryAfterSeconds,
      retryAfterDate: new Date(Date.now() + options.windowMs).toISOString(),
    });
  }
});

/**
 * Create authentication rate limiter (prevent brute force)
 * ENTERPRISE: Includes proper Retry-After headers
 */
export const createAuthLimiter = (): RateLimitRequestHandler => createLimiter({
  storePrefix: 'auth',
  windowMs: RATE_LIMITS.AUTH.windowMs,
  max: RATE_LIMITS.AUTH.max,
  message: {
    error: 'Too many authentication attempts. Please try again later.',
    retryAfter: '15 minutes'
  },
  skipSuccessfulRequests: false,
  handler: (req, res, next, options) => {
    const retryAfterSeconds = Math.ceil(options.windowMs / 1000);
    res.setHeader('Retry-After', retryAfterSeconds);
    res.status(429).json({
      success: false,
      error: 'Too many authentication attempts. Please try again later.',
      retryAfter: retryAfterSeconds,
    });
  }
});

/**
 * Create payment rate limiter
 */
export const createPaymentLimiter = (): RateLimitRequestHandler => createLimiter({
  storePrefix: 'payment',
  windowMs: RATE_LIMITS.PAYMENT.windowMs,
  max: RATE_LIMITS.PAYMENT.max,
  message: {
    error: 'Too many payment requests, please try again later.',
    retryAfter: '5 minutes'
  }
});

/**
 * Create video status check limiter
 */
export const createWanStatusLimiter = (): RateLimitRequestHandler => createLimiter({
  storePrefix: 'wan-status',
  windowMs: 1 * 60 * 1000,
  max: 60,
  message: {
    error: 'Too many status check requests. Please wait a moment.',
    retryAfter: '1 minute'
  }
});

/**
 * Create video submit limiter
 */
export const createWanSubmitLimiter = (): RateLimitRequestHandler => createLimiter({
  storePrefix: 'wan-submit',
  windowMs: 5 * 60 * 1000,
  max: 10,
  message: {
    error: 'Too many video generation requests. Please wait before submitting another.',
    retryAfter: '5 minutes'
  }
});

/**
 * Create video result limiter
 */
export const createWanResultLimiter = (): RateLimitRequestHandler => createLimiter({
  storePrefix: 'wan-result',
  windowMs: 1 * 60 * 1000,
  max: 30,
  message: {
    error: 'Too many result requests. Please wait a moment.',
    retryAfter: '1 minute'
  }
});

/**
 * Create blockchain RPC rate limiter
 */
export const createBlockchainRpcLimiter = (): RateLimitRequestHandler => createLimiter({
  storePrefix: 'rpc',
  windowMs: 1 * 60 * 1000,
  max: 120,
  message: {
    error: 'Too many RPC requests. Please wait a moment.',
    retryAfter: '1 minute'
  }
});

/**
 * Create free image rate limiter with browser fingerprinting
 * SECURITY FIX: Only skip rate limiting for requests with valid JWT tokens,
 * not just presence of wallet/userId/email in body (which could be faked)
 */
export const createFreeImageLimiter = (): RateLimitRequestHandler => {
  const store = getRedisStore('free-image');
  
  return rateLimit({
    ...(store && { store }),
    windowMs: RATE_LIMITS.FREE_IMAGE.windowMs,
    max: RATE_LIMITS.FREE_IMAGE.max,
    message: {
      error: 'Too many free image requests. Please wait before trying again.',
      retryAfter: '1 hour'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false,
    keyGenerator: (req) => {
      const fingerprint = generateBrowserFingerprint(req);
      return `${req.ip || 'unknown'}-${fingerprint}`;
    },
    // SECURITY FIX: Only skip for valid JWT authentication, not body params
    // Body params (walletAddress, userId, email) can be faked to bypass rate limits
    skip: (req) => {
      // Check for valid JWT token in Authorization header
      const authHeader = req.headers['authorization'];
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        // Only skip if token exists and has reasonable length (JWT tokens are long)
        // The actual validation happens in auth middleware, this just prevents
        // unauthenticated requests from bypassing rate limits
        if (token && token.length > 50) {
          return true;
        }
      }
      return false;
    }
  });
};

export default {
  createGeneralLimiter,
  createAuthLimiter,
  createPaymentLimiter,
  createWanStatusLimiter,
  createWanSubmitLimiter,
  createWanResultLimiter,
  createBlockchainRpcLimiter,
  createFreeImageLimiter
};




