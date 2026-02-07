/**
 * API Key Authentication Middleware
 * Authenticates external agents via API keys (X-API-Key header)
 * Supports rate limiting, credit checking, and tool access control
 */
import type { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import logger from '../utils/logger';
import { LRUCache } from '../services/cache';
import type { IApiKey } from '../models/ApiKey';

// Rate limiting tracking (Redis-backed with in-memory fallback)
interface RateLimitEntry {
  minuteCount: number;
  minuteResetAt: number;
  dayCount: number;
  dayResetAt: number;
}

const rateLimitCache = new LRUCache<string, RateLimitEntry>(10000);

// SECURITY FIX: Lazy-load Redis for distributed rate limiting across instances
let redisService: typeof import('../services/redis.js') | null = null;
async function getRedisForRateLimit() {
  if (!redisService) {
    try { redisService = await import('../services/redis.js'); } catch { /* Redis not available */ }
  }
  return redisService;
}

// Extend Express Request to include API key info
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      apiKey?: IApiKey;
      isApiKeyAuth?: boolean;
    }
  }
}

/**
 * Extract API key from request
 * Supports: X-API-Key header, Authorization: Bearer sk_live_*
 */
function extractApiKey(req: Request): string | null {
  // 1. X-API-Key header (preferred)
  const xApiKey = req.headers['x-api-key'];
  if (xApiKey && typeof xApiKey === 'string' && xApiKey.startsWith('sk_live_')) {
    return xApiKey;
  }

  // 2. Authorization: Bearer sk_live_*
  const authHeader = req.headers['authorization'];
  if (authHeader) {
    const token = authHeader.split(' ')[1];
    if (token && token.startsWith('sk_live_')) {
      return token;
    }
  }

  // SECURITY FIX: Removed query parameter support (?api_key=) to prevent
  // API key leakage via server logs, referrer headers, and browser history.
  // API keys should only be sent via headers (X-API-Key or Authorization).

  return null;
}

/**
 * SECURITY FIX: Check rate limits for an API key using Redis (distributed) with in-memory fallback.
 * This ensures rate limits are shared across all server instances and survive restarts.
 */
async function checkRateLimit(apiKey: IApiKey): Promise<{ allowed: boolean; retryAfter?: number }> {
  const now = Date.now();
  const keyId = apiKey.keyHash || (apiKey as any)._id?.toString();

  // Try Redis-based rate limiting first (shared across instances)
  try {
    const redis = await getRedisForRateLimit();
    if (redis && redis.isRedisConnected()) {
      // Use rateLimitIncrement which handles INCR + EXPIRE atomically
      const minuteCount = await redis.rateLimitIncrement(`apikey:min:${keyId}`, 60);
      if (minuteCount > apiKey.rateLimitPerMinute) {
        return { allowed: false, retryAfter: 60 };
      }

      const dayCount = await redis.rateLimitIncrement(`apikey:day:${keyId}`, 86400);
      if (dayCount > apiKey.rateLimitPerDay) {
        return { allowed: false, retryAfter: 86400 };
      }

      return { allowed: true };
    }
  } catch {
    // Redis unavailable — fall through to in-memory
  }

  // Fallback: in-memory rate limiting (per-instance only)
  let entry = rateLimitCache.get(keyId);
  
  if (!entry) {
    entry = {
      minuteCount: 0,
      minuteResetAt: now + 60000,
      dayCount: 0,
      dayResetAt: now + 86400000,
    };
  }

  // Reset minute counter if window expired
  if (now >= entry.minuteResetAt) {
    entry.minuteCount = 0;
    entry.minuteResetAt = now + 60000;
  }

  // Reset day counter if window expired
  if (now >= entry.dayResetAt) {
    entry.dayCount = 0;
    entry.dayResetAt = now + 86400000;
  }

  // Check limits
  if (entry.minuteCount >= apiKey.rateLimitPerMinute) {
    const retryAfter = Math.ceil((entry.minuteResetAt - now) / 1000);
    rateLimitCache.set(keyId, entry);
    return { allowed: false, retryAfter };
  }

  if (entry.dayCount >= apiKey.rateLimitPerDay) {
    const retryAfter = Math.ceil((entry.dayResetAt - now) / 1000);
    rateLimitCache.set(keyId, entry);
    return { allowed: false, retryAfter };
  }

  // Increment counters
  entry.minuteCount++;
  entry.dayCount++;
  rateLimitCache.set(keyId, entry);

  return { allowed: true };
}

/**
 * API Key authentication middleware
 * Use this on routes that should accept API key authentication
 * 
 * If an API key is found, authenticates via API key.
 * If no API key is found, falls through to next middleware (allows JWT fallback).
 */
export function authenticateApiKey(req: Request, res: Response, next: NextFunction): void {
  const rawKey = extractApiKey(req);

  if (!rawKey) {
    // No API key found - let other auth middleware handle it
    next();
    return;
  }

  // Async lookup
  (async () => {
    try {
      const ApiKey = mongoose.model<IApiKey>('ApiKey');
      const apiKey = await (ApiKey as any).findByKey(rawKey);

      if (!apiKey) {
        res.status(401).json({
          success: false,
          error: 'Invalid or expired API key',
        });
        return;
      }

      // Check IP allowlist
      if (apiKey.ipAllowlist.length > 0) {
        const clientIP = req.ip || req.socket.remoteAddress || '';
        if (!apiKey.ipAllowlist.includes(clientIP)) {
          logger.warn('API key used from unauthorized IP', {
            keyPrefix: apiKey.keyPrefix,
            ip: clientIP,
          });
          res.status(403).json({
            success: false,
            error: 'Request from unauthorized IP address',
          });
          return;
        }
      }

      // Check rate limits (async for Redis support)
      const rateCheck = await checkRateLimit(apiKey);
      if (!rateCheck.allowed) {
        res.setHeader('Retry-After', String(rateCheck.retryAfter || 60));
        res.status(429).json({
          success: false,
          error: 'Rate limit exceeded',
          retryAfter: rateCheck.retryAfter,
        });
        return;
      }

      // Update last used timestamp and request count (fire-and-forget)
      ApiKey.updateOne(
        { _id: apiKey._id },
        {
          $set: { lastUsedAt: new Date() },
          $inc: { totalRequests: 1 },
        }
      ).exec().catch((err: Error) => {
        logger.debug('Failed to update API key usage', { error: err.message });
      });

      // Attach API key to request
      req.apiKey = apiKey;
      req.isApiKeyAuth = true;

      logger.debug('API key authenticated', {
        keyPrefix: apiKey.keyPrefix,
        name: apiKey.name,
        credits: apiKey.credits,
      });

      next();
    } catch (error) {
      const err = error as Error;
      logger.error('API key authentication error', { error: err.message });
      res.status(500).json({
        success: false,
        error: 'Authentication error',
      });
    }
  })();
}

/**
 * Require API key credits middleware
 * Checks that the API key has enough credits and deducts them
 */
export function requireApiKeyCredits(credits: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.isApiKeyAuth || !req.apiKey) {
      // Not API key auth - skip, let other credit middleware handle it
      next();
      return;
    }

    if (req.apiKey.credits < credits) {
      res.status(402).json({
        success: false,
        error: 'Insufficient API key credits',
        required: credits,
        available: req.apiKey.credits,
        topUpUrl: '/api/api-keys/top-up',
      });
      return;
    }

    // Deduct credits atomically
    (async () => {
      try {
        const ApiKey = mongoose.model<IApiKey>('ApiKey');
        const updated = await ApiKey.findOneAndUpdate(
          { _id: req.apiKey!._id, credits: { $gte: credits } },
          {
            $inc: {
              credits: -credits,
              totalCreditsSpent: credits,
            },
          },
          { new: true }
        );

        if (!updated) {
          res.status(402).json({
            success: false,
            error: 'Insufficient API key credits (race condition)',
            topUpUrl: '/api/api-keys/top-up',
          });
          return;
        }

        req.apiKey = updated;
        next();
      } catch (error) {
        const err = error as Error;
        logger.error('Failed to deduct API key credits', { error: err.message });
        res.status(500).json({
          success: false,
          error: 'Credit deduction failed',
        });
      }
    })();
  };
}

/**
 * Check tool access for API key
 * Verifies the API key is allowed to use the specified tool/category
 */
export function checkApiKeyToolAccess(toolId: string, category: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.isApiKeyAuth || !req.apiKey) {
      next();
      return;
    }

    const { allowedCategories, allowedTools } = req.apiKey;

    // If no restrictions, allow all
    if (allowedCategories.length === 0 && allowedTools.length === 0) {
      next();
      return;
    }

    // Check tool-level access
    if (allowedTools.length > 0 && allowedTools.includes(toolId)) {
      next();
      return;
    }

    // Check category-level access
    if (allowedCategories.length > 0 && allowedCategories.includes(category)) {
      next();
      return;
    }

    res.status(403).json({
      success: false,
      error: `API key does not have access to tool: ${toolId}`,
      allowedCategories: allowedCategories.length > 0 ? allowedCategories : 'all',
      allowedTools: allowedTools.length > 0 ? allowedTools : 'all',
    });
  };
}

/**
 * Refund credits to an API key
 */
export async function refundApiKeyCredits(
  apiKeyId: string,
  credits: number,
  reason: string
): Promise<void> {
  try {
    const ApiKey = mongoose.model<IApiKey>('ApiKey');
    await ApiKey.findOneAndUpdate(
      { _id: apiKeyId },
      {
        $inc: {
          credits: credits,
          totalCreditsSpent: -credits,
        },
      }
    );
    logger.info('API key credits refunded', { apiKeyId, credits, reason });
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to refund API key credits', { apiKeyId, credits, reason, error: err.message });
  }
}

export default {
  authenticateApiKey,
  requireApiKeyCredits,
  checkApiKeyToolAccess,
  refundApiKeyCredits,
};
