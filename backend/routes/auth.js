/**
 * Authentication routes
 * Handles signup, signin, token refresh, logout
 */
import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import logger from '../utils/logger.js';
import config from '../config/env.js';
import { isDisposableEmail } from '../abusePrevention.js';
import { blacklistToken } from '../middleware/auth.js';

export function createAuthRoutes(deps) {
  const router = Router();
  const { authRateLimiter, JWT_SECRET, JWT_REFRESH_SECRET } = deps;

  /**
   * Sign up with email and password
   * POST /api/auth/signup
   */
  router.post('/signup', authRateLimiter, async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({
          success: false,
          error: 'Email and password are required'
        });
      }

      // Validate email
      const emailRegex = /^\S+@\S+\.\S+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid email format'
        });
      }

      // Check disposable email
      if (isDisposableEmail(email)) {
        return res.status(400).json({
          success: false,
          error: 'Temporary email addresses are not allowed'
        });
      }

      // Validate password
      const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{12,}$/;
      if (!passwordRegex.test(password)) {
        return res.status(400).json({
          success: false,
          error: 'Password must be at least 12 characters and include uppercase, lowercase, number, and special character (@$!%*?&)'
        });
      }

      const User = mongoose.model('User');
      
      // Check existing user
      const existing = await User.findOne({ email: email.toLowerCase() });
      if (existing) {
        return res.status(400).json({
          success: false,
          error: 'Email already registered'
        });
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
      logger.error('Signup error:', { error: error.message });
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
  router.post('/signin', authRateLimiter, async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({
          success: false,
          error: 'Email and password are required'
        });
      }

      const User = mongoose.model('User');
      const user = await User.findOne({ email: email.toLowerCase() })
        .select('+password -generationHistory -gallery -paymentHistory');

      if (!user || !user.password) {
        return res.status(401).json({
          success: false,
          error: 'Invalid email or password'
        });
      }

      const isValid = await bcrypt.compare(password, user.password);
      if (!isValid) {
        return res.status(401).json({
          success: false,
          error: 'Invalid email or password'
        });
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
      logger.error('Signin error:', { error: error.message });
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
  router.get('/verify', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader?.split(' ')[1];

      if (!token) {
        return res.status(401).json({
          success: false,
          error: 'No token provided'
        });
      }

      const decoded = jwt.verify(token, JWT_SECRET);
      const User = mongoose.model('User');
      const user = await User.findOne({ userId: decoded.userId })
        .select('-password -generationHistory -gallery -paymentHistory');

      if (!user) {
        return res.status(401).json({
          success: false,
          error: 'User not found'
        });
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
  router.post('/logout', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      const accessToken = authHeader?.split(' ')[1];
      const { refreshToken } = req.body;

      let tokensRevoked = 0;

      if (accessToken) {
        try {
          const decoded = jwt.verify(accessToken, JWT_SECRET);
          blacklistToken(accessToken, decoded.exp * 1000);
          tokensRevoked++;
        } catch (e) {
          // Token already invalid
        }
      }

      if (refreshToken) {
        try {
          const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
          blacklistToken(refreshToken, decoded.exp * 1000);
          tokensRevoked++;
        } catch (e) {
          // Token already invalid
        }
      }

      res.json({
        success: true,
        message: `${tokensRevoked} token(s) revoked`
      });
    } catch (error) {
      logger.error('Logout error:', { error: error.message });
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
  router.post('/refresh', async (req, res) => {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(400).json({
          success: false,
          error: 'Refresh token required'
        });
      }

      const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);

      if (decoded.type !== 'refresh') {
        return res.status(403).json({
          success: false,
          error: 'Invalid token type'
        });
      }

      const User = mongoose.model('User');
      const user = await User.findOne({ userId: decoded.userId });

      if (!user) {
        return res.status(401).json({
          success: false,
          error: 'User not found'
        });
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
      logger.error('Token refresh error:', { error: error.message });
      res.status(403).json({
        success: false,
        error: 'Invalid refresh token'
      });
    }
  });

  return router;
}

export default createAuthRoutes;

