/**
 * Authentication routes
 * Handles wallet-based authentication, token refresh, logout
 * 
 * NOTE: Email-based authentication has been removed. Only wallet authentication is supported.
 */
import { Router, type Request, type Response } from 'express';
import type { RequestHandler } from 'express';
import crypto from 'crypto';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import mongoose from 'mongoose';
import logger from '../utils/logger';
import config from '../config/env';
import { blacklistToken } from '../middleware/auth';
import type { IUser } from '../models/User';

// Types
interface Dependencies {
  authRateLimiter?: RequestHandler;
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
  const { authRateLimiter, authenticateToken, JWT_SECRET = config.JWT_SECRET, JWT_REFRESH_SECRET = config.JWT_REFRESH_SECRET } = deps;

  const limiter = authRateLimiter || ((_req: Request, _res: Response, next: () => void) => next());
  const authMiddleware = authenticateToken || ((_req: Request, _res: Response, next: () => void) => next());

  /**
   * Sign up - DEPRECATED: Email auth removed, use wallet connection
   * POST /api/auth/signup
   */
  router.post('/signup', limiter, async (_req: Request, res: Response) => {
    res.status(410).json({
      success: false,
      error: 'Email-based signup is no longer supported. Please connect your wallet to sign in.'
    });
  });

  /**
   * Sign in - DEPRECATED: Email auth removed, use wallet connection
   * POST /api/auth/signin
   */
  router.post('/signin', limiter, async (_req: Request, res: Response) => {
    res.status(410).json({
      success: false,
      error: 'Email-based sign-in is no longer supported. Please connect your wallet to sign in.'
    });
  });

  /**
   * Legacy signin handler - DEPRECATED
   * POST /api/auth/signin-legacy
   */
  router.post('/signin-legacy', limiter, async (_req: Request, res: Response) => {
    res.status(410).json({
      success: false,
      error: 'Email-based sign-in is no longer supported. Please connect your wallet to sign in.'
    });
  });

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

  /**
   * Generate Discord account linking code
   * POST /api/auth/discord-link-code
   * 
   * User must be authenticated. Generates an 8-character alphanumeric code valid for 5 minutes.
   * User enters this code in Discord with /link code command.
   * 
   * SECURITY FIX: Added rate limiting and stronger code (8 alphanumeric = 36^8 = 2.8 trillion combinations)
   */
  router.post('/discord-link-code', limiter, authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.user?.userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
        return;
      }

      const User = mongoose.model<IUser>('User');
      const user = await User.findOne({ userId: req.user.userId });

      if (!user) {
        res.status(404).json({
          success: false,
          error: 'User not found'
        });
        return;
      }

      // Check if already linked to Discord
      if (user.discordId) {
        res.status(400).json({
          success: false,
          error: 'This account is already linked to a Discord account',
          discordUsername: user.discordUsername
        });
        return;
      }

      // SECURITY FIX: Check for existing non-expired code to prevent code flooding
      const existingCode = user.discordLinkCode;
      const existingExpiry = user.discordLinkCodeExpires;
      if (existingCode && existingExpiry && new Date(existingExpiry) > new Date()) {
        // Return existing valid code instead of generating new one
        const remainingSeconds = Math.ceil((new Date(existingExpiry).getTime() - Date.now()) / 1000);
        res.json({
          success: true,
          code: existingCode,
          expiresAt: new Date(existingExpiry).toISOString(),
          expiresIn: remainingSeconds,
          message: 'Enter this code in Discord using: /link code:' + existingCode,
          reused: true
        });
        return;
      }

      // SECURITY FIX: Generate a secure 8-character alphanumeric code
      // 36^8 = 2,821,109,907,456 combinations (vs 900,000 for 6 digits)
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed confusing chars: 0, O, 1, I
      let code = '';
      for (let i = 0; i < 8; i++) {
        code += chars.charAt(crypto.randomInt(chars.length));
      }
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

      // Store the code on the user
      await User.findOneAndUpdate(
        { userId: user.userId },
        {
          discordLinkCode: code,
          discordLinkCodeExpires: expiresAt
        }
      );

      logger.info('Discord link code generated', { 
        userId: user.userId,
        expiresAt
      });

      res.json({
        success: true,
        code,
        expiresAt: expiresAt.toISOString(),
        expiresIn: 300, // 5 minutes in seconds
        message: 'Enter this code in Discord using: /link code:' + code
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Generate Discord link code error:', { error: err.message });
      res.status(500).json({
        success: false,
        error: 'Failed to generate link code'
      });
    }
  });

  /**
   * Verify Discord account linking code
   * POST /api/auth/verify-discord-link
   * 
   * Called by Discord bot to verify a linking code and complete the link.
   * SECURITY: Requires bot API key authentication to prevent brute force attacks.
   */
  router.post('/verify-discord-link', limiter, async (req: Request, res: Response) => {
    try {
      // SECURITY: Verify bot API key to prevent unauthorized access
      const botApiKey = process.env.DISCORD_BOT_API_KEY;
      const providedKey = req.headers['x-bot-api-key'] as string;
      
      if (!botApiKey || botApiKey.length < 32) {
        logger.error('DISCORD_BOT_API_KEY not configured or too short');
        res.status(503).json({
          success: false,
          error: 'Discord linking service not available'
        });
        return;
      }
      
      // SECURITY FIX: Use constant-time comparison to prevent timing attacks
      let isValidKey = false;
      if (providedKey && providedKey.length === botApiKey.length) {
        try {
          const providedBuffer = Buffer.from(providedKey, 'utf8');
          const expectedBuffer = Buffer.from(botApiKey, 'utf8');
          isValidKey = crypto.timingSafeEqual(providedBuffer, expectedBuffer);
        } catch {
          isValidKey = false;
        }
      }

      if (!isValidKey) {
        logger.warn('Discord link verification: invalid or missing API key', {
          ip: req.ip,
          hasKey: !!providedKey
        });
        res.status(401).json({
          success: false,
          error: 'Unauthorized'
        });
        return;
      }
      
      const { code, discordId, discordUsername } = req.body as {
        code?: string;
        discordId?: string;
        discordUsername?: string;
      };

      // Validate input
      if (!code || !discordId) {
        res.status(400).json({
          success: false,
          error: 'Code and Discord ID are required'
        });
        return;
      }

      // SECURITY FIX: Validate code format (8 alphanumeric OR legacy 6 digits)
      const isValidCode = /^[A-Z2-9]{8}$/.test(code) || /^\d{6}$/.test(code);
      if (!isValidCode) {
        res.status(400).json({
          success: false,
          error: 'Invalid code format'
        });
        return;
      }
      
      // SECURITY: Validate discordId format (snowflake - 17-19 digit number)
      if (!/^\d{17,19}$/.test(discordId)) {
        res.status(400).json({
          success: false,
          error: 'Invalid Discord ID format'
        });
        return;
      }

      const User = mongoose.model<IUser>('User');

      // Find user with this code that hasn't expired
      const user = await User.findOne({
        discordLinkCode: code,
        discordLinkCodeExpires: { $gt: new Date() }
      });

      if (!user) {
        // Check if code exists but expired
        const expiredUser = await User.findOne({ discordLinkCode: code });
        if (expiredUser) {
          res.status(400).json({
            success: false,
            error: 'This code has expired. Please generate a new one from the website.'
          });
          return;
        }

        res.status(400).json({
          success: false,
          error: 'Invalid code. Please check the code and try again.'
        });
        return;
      }

      // Check if this Discord account is already linked to another user
      const existingDiscordUser = await User.findOne({ discordId });
      if (existingDiscordUser && existingDiscordUser.userId !== user.userId) {
        res.status(400).json({
          success: false,
          error: 'This Discord account is already linked to another SeisoAI account.'
        });
        return;
      }

      // Link the accounts
      await User.findOneAndUpdate(
        { userId: user.userId },
        {
          discordId,
          discordUsername,
          discordLinkedAt: new Date(),
          // Clear the link code after successful use
          $unset: { discordLinkCode: '', discordLinkCodeExpires: '' }
        }
      );

      logger.info('Discord account linked successfully', {
        userId: user.userId,
        discordId,
        discordUsername
      });

      res.json({
        success: true,
        message: 'Discord account linked successfully!',
        user: {
          userId: user.userId,
          walletAddress: user.walletAddress,
          credits: user.credits,
          totalCreditsEarned: user.totalCreditsEarned,
          totalCreditsSpent: user.totalCreditsSpent
        }
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Verify Discord link error:', { error: err.message });
      res.status(500).json({
        success: false,
        error: 'Failed to verify link code'
      });
    }
  });

  /**
   * Unlink Discord account
   * POST /api/auth/unlink-discord
   * 
   * Allows authenticated user to unlink their Discord account.
   */
  router.post('/unlink-discord', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.user?.userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
        return;
      }

      const User = mongoose.model<IUser>('User');
      const user = await User.findOne({ userId: req.user.userId });

      if (!user) {
        res.status(404).json({
          success: false,
          error: 'User not found'
        });
        return;
      }

      if (!user.discordId) {
        res.status(400).json({
          success: false,
          error: 'No Discord account is linked to this account'
        });
        return;
      }

      const oldDiscordId = user.discordId;
      const oldDiscordUsername = user.discordUsername;

      // Unlink Discord
      await User.findOneAndUpdate(
        { userId: user.userId },
        {
          $unset: { 
            discordId: '', 
            discordUsername: '', 
            discordLinkedAt: '',
            discordLinkCode: '',
            discordLinkCodeExpires: ''
          }
        }
      );

      logger.info('Discord account unlinked', {
        userId: user.userId,
        oldDiscordId,
        oldDiscordUsername
      });

      res.json({
        success: true,
        message: 'Discord account unlinked successfully'
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Unlink Discord error:', { error: err.message });
      res.status(500).json({
        success: false,
        error: 'Failed to unlink Discord account'
      });
    }
  });

  // ============================================================================
  // Password Reset Flow - DEPRECATED
  // Email-based authentication is no longer supported. Use wallet authentication.
  // ============================================================================

  /**
   * Request password reset - DEPRECATED
   * POST /api/auth/forgot-password
   */
  router.post('/forgot-password', limiter, async (_req: Request, res: Response) => {
    res.status(410).json({
      success: false,
      error: 'Email-based authentication is no longer supported. Please use wallet authentication.'
    });
  });

  /**
   * Verify reset token - DEPRECATED
   * POST /api/auth/verify-reset-token
   */
  router.post('/verify-reset-token', limiter, async (_req: Request, res: Response) => {
    res.status(410).json({
      success: false,
      error: 'Email-based authentication is no longer supported. Please use wallet authentication.'
    });
  });

  /**
   * Reset password with token - DEPRECATED
   * POST /api/auth/reset-password
   */
  router.post('/reset-password', limiter, async (_req: Request, res: Response) => {
    res.status(410).json({
      success: false,
      error: 'Email-based authentication is no longer supported. Please use wallet authentication.'
    });
  });

  return router;
}

export default createAuthRoutes;

