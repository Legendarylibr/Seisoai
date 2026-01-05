/**
 * Rate limiting middleware
 * Configures various rate limiters for different endpoints
 */
import rateLimit, { type RateLimitRequestHandler } from 'express-rate-limit';
import { RATE_LIMITS } from '../config/constants';
import { generateBrowserFingerprint } from '../abusePrevention';

/**
 * Create the general API rate limiter
 */
export const createGeneralLimiter = (): RateLimitRequestHandler => rateLimit({
  windowMs: RATE_LIMITS.GENERAL.windowMs,
  max: process.env.NODE_ENV === 'production' ? RATE_LIMITS.GENERAL.max : 1000,
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/api/health'
});

/**
 * Create authentication rate limiter (prevent brute force)
 */
export const createAuthLimiter = (): RateLimitRequestHandler => rateLimit({
  windowMs: RATE_LIMITS.AUTH.windowMs,
  max: RATE_LIMITS.AUTH.max,
  message: {
    error: 'Too many authentication attempts. Please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false
});

/**
 * Create payment rate limiter
 */
export const createPaymentLimiter = (): RateLimitRequestHandler => rateLimit({
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
export const createWanStatusLimiter = (): RateLimitRequestHandler => rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  message: {
    error: 'Too many status check requests. Please wait a moment.',
    retryAfter: '1 minute'
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Create video submit limiter
 */
export const createWanSubmitLimiter = (): RateLimitRequestHandler => rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  message: {
    error: 'Too many video generation requests. Please wait before submitting another.',
    retryAfter: '5 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Create video result limiter
 */
export const createWanResultLimiter = (): RateLimitRequestHandler => rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  message: {
    error: 'Too many result requests. Please wait a moment.',
    retryAfter: '1 minute'
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Create blockchain RPC rate limiter
 */
export const createBlockchainRpcLimiter = (): RateLimitRequestHandler => rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 120,
  message: {
    error: 'Too many RPC requests. Please wait a moment.',
    retryAfter: '1 minute'
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Create free image rate limiter with browser fingerprinting
 */
export const createFreeImageLimiter = (): RateLimitRequestHandler => rateLimit({
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
  skip: (req) => {
    const body = req.body || {};
    return !!(body.walletAddress || body.userId || body.email);
  }
});

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




