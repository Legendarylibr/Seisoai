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

// Types
interface TokenBlacklistEntry {
  blacklistedAt: number;
  expiresAt: number | null;
}

interface JWTDecoded extends JwtPayload {
  userId?: string;
  email?: string;
  type?: string;
}

interface AuthenticatedRequest extends Request {
  user?: IUser;
  authType?: 'jwt' | 'body';
}

// Token blacklist for logout/revocation
const tokenBlacklist = new LRUCache<string, TokenBlacklistEntry>(CACHE.TOKEN_BLACKLIST_SIZE);

/**
 * Check if a token has been revoked/blacklisted
 */
export const isTokenBlacklisted = (token: string | undefined): boolean => {
  if (!token) return false;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex').substring(0, 32);
  return tokenBlacklist.has(tokenHash);
};

/**
 * Add a token to the blacklist (for logout/revocation)
 */
export const blacklistToken = (token: string | undefined, expiresAt: number | null = null): void => {
  if (!token) return;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex').substring(0, 32);
  tokenBlacklist.set(tokenHash, { blacklistedAt: Date.now(), expiresAt });
  logger.debug('Token blacklisted', { tokenHash: tokenHash.substring(0, 8) + '...' });
};

/**
 * Create JWT authentication middleware
 */
export const createAuthenticateToken = (
  jwtSecret: string | undefined, 
  getUserModel: () => Model<IUser>
) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authHeader = req.headers['authorization'];
      const token = authHeader && authHeader.split(' ')[1];

      if (!token) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
        return;
      }

      if (isTokenBlacklisted(token)) {
        res.status(401).json({
          success: false,
          error: 'Token has been revoked. Please sign in again.'
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

      const decoded = jwt.verify(token, jwtSecret) as JWTDecoded;
      
      if (decoded.type === 'refresh') {
        res.status(403).json({
          success: false,
          error: 'Refresh tokens cannot be used for authentication. Please use an access token.'
        });
        return;
      }
      
      const User = getUserModel();
      const user = await User.findOne({
        $or: [
          { userId: decoded.userId },
          { email: decoded.email }
        ]
      }).select('-password -generationHistory -gallery -paymentHistory').maxTimeMS(5000);

      if (!user) {
        res.status(401).json({
          success: false,
          error: 'User not found'
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
 * Create flexible authentication middleware (JWT required, body-based DISABLED in production)
 * 
 * SECURITY FIX: Body-based authentication has been DISABLED as it allows impersonation.
 * All authenticated endpoints now require JWT tokens.
 */
export const createAuthenticateFlexible = (
  jwtSecret: string | undefined, 
  getUserModel: () => Model<IUser>,
  getUserFromRequest: (req: Request) => Promise<IUser | null>
) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authHeader = req.headers['authorization'];
      const token = authHeader && authHeader.split(' ')[1];

      // JWT authentication (required)
      if (token && jwtSecret) {
        if (isTokenBlacklisted(token)) {
          res.status(401).json({
            success: false,
            error: 'Token has been revoked. Please sign in again.'
          });
          return;
        }
        
        try {
          const decoded = jwt.verify(token, jwtSecret) as JWTDecoded;
          
          if (decoded.type !== 'refresh') {
            const User = getUserModel();
            const user = await User.findOne({
              $or: [
                { userId: decoded.userId },
                { email: decoded.email }
              ]
            }).select('-password');

            if (user) {
              req.user = user;
              req.authType = 'jwt';
              next();
              return;
            }
          }
        } catch (jwtError) {
          const err = jwtError as Error;
          logger.debug('JWT authentication failed', { error: err.message });
          res.status(403).json({
            success: false,
            error: 'Invalid or expired token'
          });
          return;
        }
      }

      // SECURITY: Body-based authentication is DISABLED
      // This was a critical vulnerability that allowed user impersonation
      // by simply providing a wallet address, userId, or email in the request body.
      // 
      // If you need backwards compatibility for legacy clients, you must:
      // 1. Implement cryptographic signature verification
      // 2. Or require clients to migrate to JWT authentication
      
      const { walletAddress, userId, email } = req.body as { walletAddress?: string; userId?: string; email?: string };
      
      if (walletAddress || userId || email) {
        // Log the attempt for security monitoring
        logger.warn('SECURITY: Blocked body-based authentication attempt', { 
          walletAddress: walletAddress ? walletAddress.substring(0, 10) + '...' : null,
          userId: userId ? userId.substring(0, 10) + '...' : null,
          email: email ? '***' : null,
          path: req.path,
          ip: req.ip,
          userAgent: req.headers['user-agent']?.substring(0, 50)
        });
      }

      res.status(401).json({
        success: false,
        error: 'Authentication required. Please provide a valid JWT token in the Authorization header.'
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

