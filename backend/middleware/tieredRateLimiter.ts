/**
 * Tiered Rate Limiting Middleware
 * Enterprise-grade rate limits based on subscription tier
 * 
 * Features:
 * - Different limits per subscription tier
 * - Dynamic tier detection
 * - Bypass for enterprise customers
 * - Rate limit headers
 */
import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import type { Request, Response, NextFunction } from 'express';
import { getRedis } from '../services/redis.js';
import { generateBrowserFingerprint } from '../utils/abusePrevention.js';
import logger from '../utils/logger.js';

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
      sendCommand: ((...args: string[]) => 
        client.call(args[0], ...args.slice(1))
      ) as (...args: string[]) => Promise<number>,
      prefix: `rl:${prefix}:`,
    });
  } catch {
    return undefined;
  }
}

// Subscription tiers
export enum SubscriptionTier {
  FREE = 'free',
  BASIC = 'basic',
  PRO = 'pro',
  ENTERPRISE = 'enterprise',
}

// Rate limits per tier (requests per 15 minutes)
export const TIER_LIMITS = {
  [SubscriptionTier.FREE]: {
    general: 100,
    generation: 10,
    auth: 10,
  },
  [SubscriptionTier.BASIC]: {
    general: 500,
    generation: 50,
    auth: 20,
  },
  [SubscriptionTier.PRO]: {
    general: 2000,
    generation: 200,
    auth: 50,
  },
  [SubscriptionTier.ENTERPRISE]: {
    general: 10000,
    generation: 1000,
    auth: 100,
  },
};

// Window duration in milliseconds
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Determine user's subscription tier from request
 */
function getTierFromRequest(req: Request): SubscriptionTier {
  // Check if user is authenticated
  const user = (req as Request & { user?: { tier?: string; credits?: number } }).user;
  
  if (!user) {
    return SubscriptionTier.FREE;
  }
  
  // Check tier from user object
  if (user.tier) {
    const tier = user.tier.toLowerCase();
    if (Object.values(SubscriptionTier).includes(tier as SubscriptionTier)) {
      return tier as SubscriptionTier;
    }
  }
  
  // Infer tier from credits if not explicitly set
  if (user.credits !== undefined) {
    if (user.credits >= 10000) return SubscriptionTier.ENTERPRISE;
    if (user.credits >= 1000) return SubscriptionTier.PRO;
    if (user.credits >= 100) return SubscriptionTier.BASIC;
  }
  
  return SubscriptionTier.FREE;
}

/**
 * Generate rate limit key based on user ID or fingerprint
 */
function generateKey(req: Request, prefix: string): string {
  const user = (req as Request & { user?: { userId?: string } }).user;
  
  if (user?.userId) {
    return `tiered:${prefix}:user:${user.userId}`;
  }
  
  // Fall back to fingerprint for unauthenticated requests
  const fingerprint = generateBrowserFingerprint(req);
  return `tiered:${prefix}:fp:${fingerprint}`;
}

/**
 * Create a tiered rate limiter for a specific category
 */
export function createTieredRateLimiter(category: 'general' | 'generation' | 'auth') {
  // Create individual limiters for each tier
  const limiters = new Map<SubscriptionTier, ReturnType<typeof rateLimit>>();
  
  for (const tier of Object.values(SubscriptionTier)) {
    const max = TIER_LIMITS[tier][category];
    const store = getRedisStore(`tiered:${category}:${tier}`);
    
    limiters.set(tier, rateLimit({
      windowMs: WINDOW_MS,
      max,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) => generateKey(req, `${category}:${tier}`),
      store,
      handler: (req, res, _next, options) => {
        const retryAfterSeconds = Math.ceil(options.windowMs / 1000);
        res.setHeader('Retry-After', retryAfterSeconds);
        res.setHeader('X-RateLimit-Limit', max);
        res.setHeader('X-RateLimit-Tier', tier);
        res.setHeader('X-RateLimit-Reset', new Date(Date.now() + options.windowMs).toISOString());
        
        logger.warn('Tiered rate limit exceeded', {
          tier,
          category,
          ip: req.ip,
          userId: (req as Request & { user?: { userId?: string } }).user?.userId,
        });
        
        res.status(429).json({
          success: false,
          error: 'Rate limit exceeded',
          tier,
          limit: max,
          retryAfter: retryAfterSeconds,
          upgradeHint: tier !== SubscriptionTier.ENTERPRISE 
            ? `Upgrade to ${getNextTier(tier)} for higher limits`
            : undefined,
        });
      },
    }));
  }
  
  // Return middleware that selects the appropriate limiter
  return (req: Request, res: Response, next: NextFunction): void => {
    const tier = getTierFromRequest(req);
    const limiter = limiters.get(tier);
    
    // Add tier to response headers
    res.setHeader('X-RateLimit-Tier', tier);
    res.setHeader('X-RateLimit-Limit', TIER_LIMITS[tier][category]);
    
    if (limiter) {
      limiter(req, res, next);
    } else {
      next();
    }
  };
}

/**
 * Get the next tier for upgrade hints
 */
function getNextTier(currentTier: SubscriptionTier): SubscriptionTier {
  const tiers = [
    SubscriptionTier.FREE,
    SubscriptionTier.BASIC,
    SubscriptionTier.PRO,
    SubscriptionTier.ENTERPRISE,
  ];
  
  const currentIndex = tiers.indexOf(currentTier);
  return tiers[Math.min(currentIndex + 1, tiers.length - 1)];
}

/**
 * Middleware to check if user has enterprise bypass
 */
export function enterpriseBypass(req: Request, _res: Response, next: NextFunction): void {
  const user = (req as Request & { user?: { tier?: string; enterpriseBypass?: boolean } }).user;
  
  if (user?.tier === SubscriptionTier.ENTERPRISE || user?.enterpriseBypass) {
    // Set a flag to skip rate limiting
    (req as Request & { skipRateLimit?: boolean }).skipRateLimit = true;
  }
  
  next();
}

/**
 * Get tier information for a user
 */
export function getTierInfo(tier: SubscriptionTier): {
  tier: SubscriptionTier;
  limits: typeof TIER_LIMITS[SubscriptionTier];
  windowMs: number;
} {
  return {
    tier,
    limits: TIER_LIMITS[tier],
    windowMs: WINDOW_MS,
  };
}

/**
 * Create pre-configured tiered limiters
 */
export const tieredGeneralLimiter = createTieredRateLimiter('general');
export const tieredGenerationLimiter = createTieredRateLimiter('generation');
export const tieredAuthLimiter = createTieredRateLimiter('auth');

export default {
  createTieredRateLimiter,
  enterpriseBypass,
  getTierInfo,
  tieredGeneralLimiter,
  tieredGenerationLimiter,
  tieredAuthLimiter,
  SubscriptionTier,
  TIER_LIMITS,
};
