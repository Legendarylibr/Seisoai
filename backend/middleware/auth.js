/**
 * Authentication middleware
 * JWT token verification and user authentication
 */
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import logger from '../utils/logger.js';
import { LRUCache } from '../services/cache.js';
import { CACHE, JWT } from '../config/constants.js';

// Token blacklist for logout/revocation
const tokenBlacklist = new LRUCache(CACHE.TOKEN_BLACKLIST_SIZE);

/**
 * Check if a token has been revoked/blacklisted
 */
export const isTokenBlacklisted = (token) => {
  if (!token) return false;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex').substring(0, 32);
  return tokenBlacklist.has(tokenHash);
};

/**
 * Add a token to the blacklist (for logout/revocation)
 */
export const blacklistToken = (token, expiresAt = null) => {
  if (!token) return;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex').substring(0, 32);
  tokenBlacklist.set(tokenHash, { blacklistedAt: Date.now(), expiresAt });
  logger.debug('Token blacklisted', { tokenHash: tokenHash.substring(0, 8) + '...' });
};

/**
 * Create JWT authentication middleware
 * @param {string} jwtSecret - JWT secret key
 * @param {Function} getUserModel - Function to get User model
 */
export const createAuthenticateToken = (jwtSecret, getUserModel) => {
  return async (req, res, next) => {
    try {
      const authHeader = req.headers['authorization'];
      const token = authHeader && authHeader.split(' ')[1];

      if (!token) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      if (isTokenBlacklisted(token)) {
        return res.status(401).json({
          success: false,
          error: 'Token has been revoked. Please sign in again.'
        });
      }

      const decoded = jwt.verify(token, jwtSecret);
      
      if (decoded.type === 'refresh') {
        return res.status(403).json({
          success: false,
          error: 'Refresh tokens cannot be used for authentication. Please use an access token.'
        });
      }
      
      const User = getUserModel();
      const user = await User.findOne({
        $or: [
          { userId: decoded.userId },
          { email: decoded.email }
        ]
      }).select('-password -generationHistory -gallery -paymentHistory').maxTimeMS(5000);

      if (!user) {
        return res.status(401).json({
          success: false,
          error: 'User not found'
        });
      }

      req.user = user;
      next();
    } catch (error) {
      logger.error('JWT authentication error:', error);
      return res.status(403).json({
        success: false,
        error: 'Invalid or expired token'
      });
    }
  };
};

/**
 * Create flexible authentication middleware (JWT or wallet address)
 */
export const createAuthenticateFlexible = (jwtSecret, getUserModel, getUserFromRequest) => {
  return async (req, res, next) => {
    try {
      const authHeader = req.headers['authorization'];
      const token = authHeader && authHeader.split(' ')[1];

      if (token) {
        if (isTokenBlacklisted(token)) {
          return res.status(401).json({
            success: false,
            error: 'Token has been revoked. Please sign in again.'
          });
        }
        
        try {
          const decoded = jwt.verify(token, jwtSecret);
          
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
              return next();
            }
          }
        } catch (jwtError) {
          logger.debug('JWT authentication failed, trying wallet address', { error: jwtError.message });
        }
      }

      const { walletAddress, userId, email } = req.body;
      
      if (!walletAddress && !userId && !email) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required. Please provide a token or wallet address/userId/email.'
        });
      }
      
      logger.debug('Body-based authentication used (less secure)', { 
        walletAddress: walletAddress ? walletAddress.substring(0, 10) + '...' : null,
        userId: userId ? userId.substring(0, 10) + '...' : null,
        email: email ? '***' : null,
        path: req.path,
        ip: req.ip
      });

      const user = await getUserFromRequest(req);
      
      if (!user) {
        return res.status(401).json({
          success: false,
          error: 'User not found'
        });
      }

      req.user = user;
      req.authType = 'body';
      next();
    } catch (error) {
      logger.error('Flexible authentication error:', error);
      return res.status(403).json({
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
  return async (req, res, next) => {
    const { walletAddress } = req.body;
    
    if (!walletAddress) {
      return res.status(400).json({
        success: false,
        error: 'Wallet address required'
      });
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
        return res.status(403).json({
          success: false,
          error: 'Wallet address does not match authenticated user'
        });
      }
    }
    
    next();
  };
};

// Convenience exports with default JWT secret
import config from '../config/env.js';
import mongoose from 'mongoose';

const getUserModel = () => mongoose.model('User');

export const authenticateToken = createAuthenticateToken(config.JWT_SECRET, getUserModel);
export const authenticateFlexible = createAuthenticateFlexible(config.JWT_SECRET, getUserModel);
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

