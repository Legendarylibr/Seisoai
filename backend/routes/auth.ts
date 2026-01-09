/**
 * Authentication routes
 * Handles signup, signin, token refresh, logout
 * 
 * NOTE: Email addresses are encrypted at rest. Uses emailHash for lookups.
 */
import { Router, type Request, type Response } from 'express';
import type { RequestHandler } from 'express';
import bcrypt from 'bcrypt';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import mongoose from 'mongoose';
import logger from '../utils/logger';
import config from '../config/env';
import { isDisposableEmail } from '../abusePrevention';
import { blacklistToken } from '../middleware/auth';
import { createEmailHash } from '../utils/emailHash';
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
  email?: string;
  type?: string;
  exp?: number;
}

interface AuthenticatedRequest extends Request {
  user?: {
    userId?: string;
    email?: string;
  };
}

export function createAuthRoutes(deps: Dependencies = {}) {
  const router = Router();
  const { authRateLimiter, authenticateToken, JWT_SECRET = config.JWT_SECRET, JWT_REFRESH_SECRET = config.JWT_REFRESH_SECRET } = deps;

  const limiter = authRateLimiter || ((req: Request, res: Response, next: () => void) => next());
  const authMiddleware = authenticateToken || ((req: Request, res: Response, next: () => void) => next());

  /**
   * Sign up with email and password
   * POST /api/auth/signup
   */
  router.post('/signup', limiter, async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body as { email?: string; password?: string };

      if (!email || !password) {
        res.status(400).json({
          success: false,
          error: 'Email and password are required'
        });
        return;
      }

      // Validate email
      const emailRegex = /^\S+@\S+\.\S+$/;
      if (!emailRegex.test(email)) {
        res.status(400).json({
          success: false,
          error: 'Invalid email format'
        });
        return;
      }

      // Check disposable email
      if (isDisposableEmail(email)) {
        res.status(400).json({
          success: false,
          error: 'Temporary email addresses are not allowed'
        });
        return;
      }

      // Validate password
      const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{12,}$/;
      if (!passwordRegex.test(password)) {
        res.status(400).json({
          success: false,
          error: 'Password must be at least 12 characters and include uppercase, lowercase, number, and special character (@$!%*?&)'
        });
        return;
      }

      if (!JWT_SECRET || !JWT_REFRESH_SECRET) {
        res.status(500).json({
          success: false,
          error: 'Server configuration error'
        });
        return;
      }

      const User = mongoose.model<IUser>('User');
      
      // Check existing user by emailHash (encrypted emails)
      const emailHash = createEmailHash(email);
      const existing = await User.findOne({ 
        $or: [
          { emailHash },
          { email: email.toLowerCase() }  // Backward compatibility
        ]
      });
      if (existing) {
        res.status(400).json({
          success: false,
          error: 'Email already registered'
        });
        return;
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 12);

      // Create user with 2 free credits
      const user = new User({
        email: email.toLowerCase(),
        password: hashedPassword,
        credits: 2,
        totalCreditsEarned: 2
      });

      await user.save();
      logger.info('New user created', { email: user.email, userId: user.userId });

      // Generate tokens
      const token = jwt.sign(
        { userId: user.userId, email: user.email, type: 'access' },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      const refreshToken = jwt.sign(
        { userId: user.userId, type: 'refresh' },
        JWT_REFRESH_SECRET,
        { expiresIn: '30d' }
      );

      res.json({
        success: true,
        token,
        refreshToken,
        user: {
          userId: user.userId,
          email: user.email,
          credits: user.credits
        }
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Signup error:', { error: err.message });
      res.status(500).json({
        success: false,
        error: 'Failed to create account'
      });
    }
  });

  /**
   * Sign in with email and password
   * POST /api/auth/signin
   */
  router.post('/signin', limiter, async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body as { email?: string; password?: string };

      if (!email || !password) {
        res.status(400).json({
          success: false,
          error: 'Email and password are required'
        });
        return;
      }

      if (!JWT_SECRET || !JWT_REFRESH_SECRET) {
        res.status(500).json({
          success: false,
          error: 'Server configuration error'
        });
        return;
      }

      const User = mongoose.model<IUser>('User');
      // Look up by emailHash (encrypted emails) or direct email (backward compatibility)
      const emailHash = createEmailHash(email);
      const user = await User.findOne({ 
        $or: [
          { emailHash },
          { email: email.toLowerCase() }  // Backward compatibility
        ]
      }).select('+password -generationHistory -gallery -paymentHistory');

      if (!user) {
        res.status(401).json({
          success: false,
          error: 'Invalid email or password'
        });
        return;
      }

      // Check if user has a password set (wallet-only users may not have one)
      if (!user.password) {
        res.status(401).json({
          success: false,
          error: 'This account was created with a wallet. Please connect your wallet to sign in, or reset your password.'
        });
        return;
      }

      const isValid = await bcrypt.compare(password, user.password);
      if (!isValid) {
        res.status(401).json({
          success: false,
          error: 'Invalid email or password'
        });
        return;
      }

      // Generate tokens
      const token = jwt.sign(
        { userId: user.userId, email: user.email, type: 'access' },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      const refreshToken = jwt.sign(
        { userId: user.userId, type: 'refresh' },
        JWT_REFRESH_SECRET,
        { expiresIn: '30d' }
      );

      res.json({
        success: true,
        token,
        refreshToken,
        user: {
          userId: user.userId,
          email: user.email,
          credits: user.credits,
          walletAddress: user.walletAddress
        }
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Signin error:', { error: err.message });
      res.status(500).json({
        success: false,
        error: 'Failed to sign in'
      });
    }
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

      const decoded = jwt.verify(token, JWT_SECRET) as JWTDecoded;
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

      res.json({
        success: true,
        user: {
          userId: user.userId,
          email: user.email,
          credits: user.credits,
          walletAddress: user.walletAddress
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
          const decoded = jwt.verify(accessToken, JWT_SECRET) as JWTDecoded;
          blacklistToken(accessToken, decoded.exp ? decoded.exp * 1000 : null);
          tokensRevoked++;
        } catch {
          // Token already invalid
        }
      }

      if (refreshToken && JWT_REFRESH_SECRET) {
        try {
          const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET) as JWTDecoded;
          blacklistToken(refreshToken, decoded.exp ? decoded.exp * 1000 : null);
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

      const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET) as JWTDecoded;

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
        { userId: user.userId, email: user.email, type: 'access' },
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
      const User = mongoose.model<IUser>('User');
      const user = await User.findOne({
        $or: [
          { userId: req.user?.userId },
          { email: req.user?.email }
        ]
      }).select('-password -generationHistory -gallery -paymentHistory').maxTimeMS(5000);
      
      if (!user) {
        res.status(404).json({
          success: false,
          error: 'User not found'
        });
        return;
      }
      
      // Check NFT status if wallet is linked
      let isNFTHolder = false;
      if (user.walletAddress) {
        isNFTHolder = user.nftCollections && user.nftCollections.length > 0;
      }

      // Set cache-control headers to prevent browser caching
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      
      res.json({
        success: true,
        user: {
          userId: user.userId,
          email: user.email,
          credits: user.credits || 0,
          totalCreditsEarned: user.totalCreditsEarned || 0,
          totalCreditsSpent: user.totalCreditsSpent || 0,
          walletAddress: user.walletAddress || null,
          nftCollections: user.nftCollections || [],
          paymentHistory: user.paymentHistory || [],
          generationHistory: user.generationHistory || [],
          gallery: user.gallery || [],
          settings: user.settings || {},
          lastActive: user.lastActive,
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

