/**
 * Authentication middleware
 * JWT token verification and user authentication
 */
import jwt, { type JwtPayload } from 'jsonwebtoken';
import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';
import { LRUCache } from '../services/cache';
import { CACHE } from '../config/constants';
import type { IUser } from '../models/User';
import type { Model } from 'mongoose';

// SECURITY FIX: Use a Symbol to prevent isX402Paid from being spoofed via request manipulation.
// Only code that has access to this Symbol can set the x402 verified flag.
export const X402_VERIFIED_SYMBOL = Symbol.for('seisoai.x402.verified');

// Types
interface TokenBlacklistEntry {
  blacklistedAt: number;
  expiresAt: number | null;
}

interface JWTDecoded extends JwtPayload {
  userId?: string;
  walletAddress?: string;
  type?: string;
}

interface AuthenticatedRequest extends Request {
  user?: IUser;
  authType?: 'jwt' | 'body';
}

// Token blacklist for logout/revocation
// SECURITY FIX: Use Redis for persistent blacklist, fallback to in-memory cache
const tokenBlacklist = new LRUCache<string, TokenBlacklistEntry>(CACHE.TOKEN_BLACKLIST_SIZE);

// Lazy import Redis to avoid circular dependencies
let redisService: typeof import('../services/redis.js') | null = null;
async function getRedisService() {
  if (!redisService) {
    redisService = await import('../services/redis.js');
  }
  return redisService;
}

/**
 * Check if a token has been revoked/blacklisted
 * SECURITY FIX: Checks Redis first (persistent), then in-memory cache (fallback)
 */
export const isTokenBlacklisted = async (token: string | undefined): Promise<boolean> => {
  if (!token) return false;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex').substring(0, 32);
  
  // Check Redis first (persistent across restarts)
  try {
    const redis = await getRedisService();
    if (redis && redis.isRedisConnected()) {
      const blacklisted = await redis.cacheExists(`token:blacklist:${tokenHash}`, { prefix: '' });
      if (blacklisted) {
        return true;
      }
    }
  } catch (error) {
    logger.debug('Redis blacklist check failed, using in-memory cache', { error: (error as Error).message });
  }
  
  // Fallback to in-memory cache
  return tokenBlacklist.has(tokenHash);
};

/**
 * Add a token to the blacklist (for logout/revocation)
 * SECURITY FIX: Stores in Redis (persistent) and in-memory cache (fallback)
 */
export const blacklistToken = async (token: string | undefined, expiresAt: number | null = null): Promise<void> => {
  if (!token) return;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex').substring(0, 32);
  const entry: TokenBlacklistEntry = { blacklistedAt: Date.now(), expiresAt };
  
  // Store in Redis (persistent across restarts)
  try {
    const redis = await getRedisService();
    if (redis && redis.isRedisConnected()) {
      const ttl = expiresAt ? Math.max(0, Math.floor((expiresAt - Date.now()) / 1000)) : 7 * 24 * 60 * 60; // 7 days default
      await redis.cacheSet(`token:blacklist:${tokenHash}`, entry, { 
        prefix: '', 
        ttl: ttl > 0 ? ttl : 7 * 24 * 60 * 60 
      });
    }
  } catch (error) {
    logger.debug('Redis blacklist store failed, using in-memory cache only', { error: (error as Error).message });
  }
  
  // Also store in in-memory cache (fast lookup fallback)
  tokenBlacklist.set(tokenHash, entry);
  logger.debug('Token blacklisted', { tokenHash: tokenHash.substring(0, 8) + '...' });
};

/**
 * Create JWT authentication middleware
 * SECURITY FIX: Now checks token blacklist to properly handle logged-out tokens
 */
export const createAuthenticateToken = (
  jwtSecret: string | undefined, 
  getUserModel: () => Model<IUser>
) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      // x402 BYPASS: If request was paid via x402, skip auth check
      // SECURITY FIX: Use Symbol-based check to prevent spoofing via request properties
      if ((req as any)[X402_VERIFIED_SYMBOL] === true) {
        logger.debug('x402 payment detected (verified via Symbol), bypassing token auth', { path: req.path });
        next();
        return;
      }

      const authHeader = req.headers['authorization'];
      const token = authHeader && authHeader.split(' ')[1];

      if (!token) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
        return;
      }

      if (!jwtSecret) {
        res.status(500).json({
          success: false,
          error: 'Server configuration error'
        });
        return;
      }

      // SECURITY FIX: Check if token is blacklisted (logged out)
      const blacklisted = await isTokenBlacklisted(token);
      if (blacklisted) {
        res.status(401).json({
          success: false,
          error: 'Token has been revoked. Please sign in again.'
        });
        return;
      }

      // SECURITY FIX: Specify algorithm to prevent algorithm confusion attacks
      const decoded = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] }) as JWTDecoded;
      
      if (decoded.type === 'refresh') {
        res.status(403).json({
          success: false,
          error: 'Refresh tokens cannot be used for authentication. Please use an access token.'
        });
        return;
      }
      
      const User = getUserModel();
      
      // Simple lookup: userId first, then walletAddress
      let user = null;
      if (decoded.userId) {
        user = await User.findOne({ userId: decoded.userId })
          .select('-generationHistory -gallery -paymentHistory')
          .maxTimeMS(5000);
      }
      
      if (!user && decoded.walletAddress) {
        user = await User.findOne({ walletAddress: decoded.walletAddress.toLowerCase() })
          .select('-generationHistory -gallery -paymentHistory')
          .maxTimeMS(5000);
      }

      if (!user) {
        res.status(401).json({
          success: false,
          error: 'User not found. Please connect your wallet.'
        });
        return;
      }

      req.user = user;
      next();
    } catch (error) {
      logger.error('JWT authentication error:', error);
      res.status(403).json({
        success: false,
        error: 'Invalid or expired token'
      });
    }
  };
};

/**
 * Create flexible authentication middleware
 * 
 * Supports multiple authentication methods in order of preference:
 * 1. x402 payment (cryptographic payment verification)
 * 2. JWT token (Authorization: Bearer <token>)
 * 3. Wallet address from request body (wallet serves as identity)
 * 
 * The wallet-based auth is the primary method since this is a Web3 app.
 * JWT tokens are optional and used for enhanced security on sensitive endpoints.
 */
export const createAuthenticateFlexible = (
  jwtSecret: string | undefined, 
  getUserModel: () => Model<IUser>,
  getUserFromRequest: (req: Request) => Promise<IUser | null>
) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      // x402 BYPASS: If request was paid via x402, skip auth check
      // SECURITY FIX: Use Symbol-based check to prevent spoofing via request properties
      if ((req as any)[X402_VERIFIED_SYMBOL] === true) {
        logger.debug('x402 payment detected (verified via Symbol), bypassing auth check', { path: req.path });
        next();
        return;
      }

      const authHeader = req.headers['authorization'];
      const token = authHeader && authHeader.split(' ')[1];

      // Method 1: JWT authentication (highest priority if present)
      if (token && jwtSecret) {
        try {
          // Check if token is blacklisted (logged out)
          const blacklisted = await isTokenBlacklisted(token);
          if (blacklisted) {
            // Don't fail - try wallet-based auth instead
            logger.debug('JWT token blacklisted, falling back to wallet auth');
          } else {
            // SECURITY FIX: Specify algorithm to prevent algorithm confusion attacks
            const decoded = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] }) as JWTDecoded;
            
            if (decoded.type !== 'refresh') {
              const User = getUserModel();
              
              // Simple lookup: userId first, then walletAddress
              let user = null;
              if (decoded.userId) {
                user = await User.findOne({ userId: decoded.userId });
              }
              if (!user && decoded.walletAddress) {
                user = await User.findOne({ walletAddress: decoded.walletAddress.toLowerCase() });
              }

              if (user) {
                req.user = user;
                req.authType = 'jwt';
                next();
                return;
              }
            }
          }
        } catch (jwtError) {
          // JWT failed - fall through to wallet-based auth
          logger.debug('JWT auth failed, trying wallet-based auth', { error: (jwtError as Error).message });
        }
      }

      // Method 2: Wallet-based authentication from request body
      // This is the primary auth method for Web3 apps
      try {
        const user = await getUserFromRequest(req);
        if (user) {
          req.user = user;
          req.authType = 'body';
          next();
          return;
        }
      } catch (walletError) {
        logger.debug('Wallet-based auth failed', { error: (walletError as Error).message });
      }

      // No valid authentication found
      res.status(401).json({
        success: false,
        error: 'Authentication required. Please connect your wallet.'
      });
    } catch (error) {
      logger.error('Authentication error:', error);
      res.status(403).json({
        success: false,
        error: 'Authentication failed'
      });
    }
  };
};

/**
 * Create wallet ownership verification middleware
 */
export const createVerifyWalletOwnership = () => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    const { walletAddress } = req.body as { walletAddress?: string };
    
    if (!walletAddress) {
      res.status(400).json({
        success: false,
        error: 'Wallet address required'
      });
      return;
    }
    
    if (req.authType === 'jwt' && req.user) {
      const userWallet = req.user.walletAddress;
      const normalizedRequest = walletAddress.toLowerCase();
      const normalizedUser = userWallet ? userWallet.toLowerCase() : null;
      
      if (normalizedUser && normalizedUser !== normalizedRequest) {
        logger.warn('Wallet mismatch in authenticated request', {
          userId: req.user.userId,
          userWallet: normalizedUser.substring(0, 10) + '...',
          requestWallet: normalizedRequest.substring(0, 10) + '...'
        });
        res.status(403).json({
          success: false,
          error: 'Wallet address does not match authenticated user'
        });
        return;
      }
    }
    
    next();
  };
};

// Convenience exports with default JWT secret
import config from '../config/env';
import mongoose from 'mongoose';
import { getUserFromRequest } from '../services/user';

const getUserModel = () => mongoose.model<IUser>('User');

export const authenticateToken = createAuthenticateToken(config.JWT_SECRET, getUserModel);
export const authenticateFlexible = createAuthenticateFlexible(config.JWT_SECRET, getUserModel, getUserFromRequest);
export const requireVerifiedAuth = authenticateToken; // Alias

export default {
  isTokenBlacklisted,
  blacklistToken,
  createAuthenticateToken,
  createAuthenticateFlexible,
  createVerifyWalletOwnership,
  authenticateToken,
  authenticateFlexible,
  requireVerifiedAuth
};

