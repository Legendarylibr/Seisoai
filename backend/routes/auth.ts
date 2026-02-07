/**
 * Authentication routes
 * Handles wallet-based authentication, token refresh, logout
 */
import { Router, type Request, type Response } from 'express';
import type { RequestHandler } from 'express';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import mongoose from 'mongoose';
import logger from '../utils/logger';
import config from '../config/env';
import { blacklistToken } from '../middleware/auth';
import type { IUser } from '../models/User';

// Types
interface Dependencies {
  authenticateToken?: RequestHandler;
  JWT_SECRET?: string;
  JWT_REFRESH_SECRET?: string;
}

interface JWTDecoded extends JwtPayload {
  userId?: string;
  walletAddress?: string;
  type?: string;
  exp?: number;
}

interface AuthenticatedRequest extends Request {
  user?: {
    userId?: string;
    walletAddress?: string;
  };
}

export function createAuthRoutes(deps: Dependencies = {}) {
  const router = Router();
  const { authenticateToken, JWT_SECRET = config.JWT_SECRET, JWT_REFRESH_SECRET = config.JWT_REFRESH_SECRET } = deps;

  const authMiddleware = authenticateToken || ((_req: Request, _res: Response, next: () => void) => next());

  /**
   * Verify token
   * GET /api/auth/verify
   */
  router.get('/verify', async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader?.split(' ')[1];

      if (!token || !JWT_SECRET) {
        res.status(401).json({
          success: false,
          error: 'No token provided'
        });
        return;
      }

      const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as JWTDecoded;
      const User = mongoose.model<IUser>('User');
      const user = await User.findOne({ userId: decoded.userId })
        .select('-password -generationHistory -gallery -paymentHistory');

      if (!user) {
        res.status(401).json({
          success: false,
          error: 'User not found'
        });
        return;
      }

      // Prevent caching to ensure fresh credits data
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      res.json({
        success: true,
        user: {
          userId: user.userId,
          walletAddress: user.walletAddress,
          credits: user.credits,
          totalCreditsEarned: user.totalCreditsEarned || 0,
          totalCreditsSpent: user.totalCreditsSpent || 0
        }
      });
    } catch (error) {
      res.status(403).json({
        success: false,
        error: 'Invalid token'
      });
    }
  });

  /**
   * Simple credits check - bypasses all complexity
   * GET /api/auth/credits
   */
  router.get('/credits', async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader?.split(' ')[1];

      if (!token || !JWT_SECRET) {
        logger.warn('Credits endpoint: No token provided');
        res.status(401).json({ success: false, error: 'No token' });
        return;
      }

      let decoded: JWTDecoded;
      try {
        decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as JWTDecoded;
      } catch (jwtErr) {
        logger.warn('Credits endpoint: Invalid JWT', { error: (jwtErr as Error).message });
        res.status(403).json({ success: false, error: 'Invalid token' });
        return;
      }
      
      logger.info('Credits endpoint: Looking up user', { userId: decoded.userId });
      
      // Direct DB query - no mongoose model overhead
      const db = mongoose.connection.db;
      const user = await db.collection('users').findOne({ userId: decoded.userId });

      if (!user) {
        logger.warn('Credits endpoint: User not found', { userId: decoded.userId });
        res.status(404).json({ success: false, error: 'User not found', userId: decoded.userId });
        return;
      }

      logger.info('Credits endpoint: Returning credits', { 
        userId: decoded.userId, 
        credits: user.credits 
      });

      res.setHeader('Cache-Control', 'no-store');
      res.json({
        success: true,
        credits: user.credits || 0,
        totalCreditsEarned: user.totalCreditsEarned || 0,
        totalCreditsSpent: user.totalCreditsSpent || 0
      });
    } catch (error) {
      logger.error('Credits endpoint error', { error: (error as Error).message });
      res.status(500).json({ success: false, error: 'Server error' });
    }
  });

  /**
   * Logout (blacklist tokens)
   * POST /api/auth/logout
   */
  router.post('/logout', async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      const accessToken = authHeader?.split(' ')[1];
      const { refreshToken } = req.body as { refreshToken?: string };

      let tokensRevoked = 0;

      if (accessToken && JWT_SECRET) {
        try {
          const decoded = jwt.verify(accessToken, JWT_SECRET, { algorithms: ['HS256'] }) as JWTDecoded;
          await blacklistToken(accessToken, decoded.exp ? decoded.exp * 1000 : null);
          tokensRevoked++;
        } catch {
          // Token already invalid
        }
      }

      if (refreshToken && JWT_REFRESH_SECRET) {
        try {
          const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET, { algorithms: ['HS256'] }) as JWTDecoded;
          await blacklistToken(refreshToken, decoded.exp ? decoded.exp * 1000 : null);
          tokensRevoked++;
        } catch {
          // Token already invalid
        }
      }

      res.json({
        success: true,
        message: `${tokensRevoked} token(s) revoked`
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Logout error:', { error: err.message });
      res.status(500).json({
        success: false,
        error: 'Logout failed'
      });
    }
  });

  /**
   * Refresh access token
   * POST /api/auth/refresh
   */
  router.post('/refresh', async (req: Request, res: Response) => {
    try {
      const { refreshToken } = req.body as { refreshToken?: string };

      if (!refreshToken || !JWT_SECRET || !JWT_REFRESH_SECRET) {
        res.status(400).json({
          success: false,
          error: 'Refresh token required'
        });
        return;
      }

      // SECURITY FIX: Check if refresh token is blacklisted
      const { isTokenBlacklisted } = await import('../middleware/auth.js');
      if (await isTokenBlacklisted(refreshToken)) {
        res.status(401).json({
          success: false,
          error: 'Refresh token has been revoked. Please sign in again.'
        });
        return;
      }

      const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET, { algorithms: ['HS256'] }) as JWTDecoded;

      if (decoded.type !== 'refresh') {
        res.status(403).json({
          success: false,
          error: 'Invalid token type'
        });
        return;
      }

      const User = mongoose.model<IUser>('User');
      const user = await User.findOne({ userId: decoded.userId });

      if (!user) {
        res.status(401).json({
          success: false,
          error: 'User not found'
        });
        return;
      }

      // Generate new access token
      const newAccessToken = jwt.sign(
        { userId: user.userId, walletAddress: user.walletAddress, type: 'access' },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      res.json({
        success: true,
        token: newAccessToken
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Token refresh error:', { error: err.message });
      res.status(403).json({
        success: false,
        error: 'Invalid refresh token'
      });
    }
  });

  /**
   * Get current user data
   * GET /api/auth/me
   */
  router.get('/me', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      // authMiddleware already loaded the user - just use it directly
      // For fresh data, re-fetch by userId
      const User = mongoose.model<IUser>('User');
      const user = await User.findOne({ userId: req.user?.userId })
        .select('-password')
        .maxTimeMS(5000);
      
      if (!user) {
        res.status(404).json({
          success: false,
          error: 'User not found'
        });
        return;
      }
      
      const isNFTHolder = user.nftCollections && user.nftCollections.length > 0;

      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
      
      res.json({
        success: true,
        user: {
          userId: user.userId,
          walletAddress: user.walletAddress || null,
          credits: user.credits || 0,
          totalCreditsEarned: user.totalCreditsEarned || 0,
          totalCreditsSpent: user.totalCreditsSpent || 0,
          isNFTHolder
        }
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Get user data error:', { error: err.message });
      res.status(500).json({
        success: false,
        error: 'Failed to get user data'
      });
    }
  });

  return router;
}

export default createAuthRoutes;

