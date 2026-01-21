/**
 * Authentication routes
 * Handles signup, signin, token refresh, logout
 * 
 * NOTE: Email addresses are encrypted at rest. Uses emailHash for lookups.
 */
import { Router, type Request, type Response } from 'express';
import type { RequestHandler } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import mongoose from 'mongoose';
import logger from '../utils/logger';
import config from '../config/env';
import { isDisposableEmail } from '../abusePrevention';
import { blacklistToken } from '../middleware/auth';
import { createEmailHash } from '../utils/emailHash';
import { generateResetToken, hashResetToken, sendPasswordResetEmail } from '../services/email';
import { alertPasswordReset, alertAccountLockout } from '../services/securityAlerts';
import { sendWelcomeEmail } from '../services/emailMarketing';
import { applyReferralCode } from '../services/referralService';
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

  const limiter = authRateLimiter || ((_req: Request, _res: Response, next: () => void) => next());
  const authMiddleware = authenticateToken || ((_req: Request, _res: Response, next: () => void) => next());

  /**
   * Sign up with email and password
   * POST /api/auth/signup
   */
  router.post('/signup', limiter, async (req: Request, res: Response) => {
    try {
      const { email, password, referralCode } = req.body as { email?: string; password?: string; referralCode?: string };

      if (!email || !password) {
        res.status(400).json({
          success: false,
          error: 'Email and password are required'
        });
        return;
      }

      // Validate email with stricter regex
      // SECURITY FIX: More comprehensive email validation to prevent malformed inputs
      const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
      if (!emailRegex.test(email) || email.length > 254) {
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
      
      // Check existing user with robust lookup (multiple fallback methods)
      const normalizedEmail = email.toLowerCase().trim();
      const emailHash = createEmailHash(normalizedEmail);
      const emailHashPlain = crypto.createHash('sha256').update(normalizedEmail).digest('hex');
      
      const existing = await User.findOne({ 
        $or: [
          { emailHash },                    // Primary: HMAC hash
          { emailHashPlain },               // Fallback: plain SHA-256
          { emailLookup: normalizedEmail }, // Fallback: plain email field
          { email: normalizedEmail }        // Legacy: direct match
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

      // Create user with 10 free credits
      const user = new User({
        email: email.toLowerCase(),
        password: hashedPassword,
        credits: 10,
        totalCreditsEarned: 10
      });

      await user.save();
      logger.info('New user created with 10 credits', { email: user.email, userId: user.userId });

      // Apply referral code if provided (awards credits to both referrer and referee)
      let referralBonus = 0;
      if (referralCode && user.userId) {
        const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.ip;
        const userAgent = req.headers['user-agent'];
        const referralResult = await applyReferralCode(user.userId, referralCode, ipAddress, userAgent);
        if (referralResult.success) {
          referralBonus = referralResult.bonusCredits || 0;
          logger.info('Referral code applied during signup', { 
            userId: user.userId, 
            referralCode, 
            bonusCredits: referralBonus 
          });
        } else {
          logger.warn('Failed to apply referral code during signup', { 
            userId: user.userId, 
            referralCode, 
            error: referralResult.error 
          });
        }
      }

      // Send welcome email (non-blocking)
      if (user.userId) {
        sendWelcomeEmail(user.userId).catch(err => {
          logger.warn('Failed to send welcome email', { userId: user.userId, error: err.message });
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

      // Refetch user to get updated credits after referral bonus
      const updatedUser = referralBonus > 0 
        ? await User.findOne({ userId: user.userId })
        : user;

      res.json({
        success: true,
        token,
        refreshToken,
        user: {
          userId: user.userId,
          email: user.email,
          credits: updatedUser?.credits ?? user.credits,
          totalCreditsEarned: updatedUser?.totalCreditsEarned ?? user.totalCreditsEarned,
          totalCreditsSpent: updatedUser?.totalCreditsSpent ?? 0
        },
        referralApplied: referralBonus > 0,
        referralBonus
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
      // Look up by emailHash (encrypted emails) or fallback methods
      const emailHash = createEmailHash(email);
      const normalizedEmail = email.toLowerCase().trim();
      // Plain SHA-256 hash for cross-environment compatibility
      const emailHashPlain = crypto.createHash('sha256').update(normalizedEmail).digest('hex');
      
      let user = await User.findOne({ 
        $or: [
          { emailHash },                    // Primary: HMAC hash (with encryption key)
          { emailHashPlain },               // Fallback: plain SHA-256 hash
          { emailLookup: normalizedEmail }, // Fallback: plain email lookup field
          { email: normalizedEmail }        // Legacy: direct email match
        ]
      }).select('+password -generationHistory -gallery -paymentHistory');

      // SECURITY FIX: Prevent timing attacks by always performing password comparison
      // Use a dummy hash if user doesn't exist to maintain constant-time comparison
      const dummyHash = '$2b$12$dummy.hash.that.takes.same.time.to.compare.and.is.64.chars.long';
      const passwordToCompare = user?.password || dummyHash;

      // SECURITY: Always perform password comparison to prevent user enumeration via timing
      const isValid = await bcrypt.compare(password, passwordToCompare);
      
      // Only check user existence after password comparison
      if (!user) {
        // SECURITY: Use same response time as failed password to prevent timing attacks
        await bcrypt.compare('dummy', dummyHash); // Additional constant-time operation
        res.status(401).json({
          success: false,
          error: 'Invalid email or password'
        });
        return;
      }

      // SECURITY FIX: Check for account lockout (brute force protection)
      const lockoutUntil = (user as { lockoutUntil?: Date }).lockoutUntil;
      if (lockoutUntil && new Date(lockoutUntil) > new Date()) {
        const minutesRemaining = Math.ceil((new Date(lockoutUntil).getTime() - Date.now()) / 60000);
        logger.warn('Account locked - too many failed login attempts', {
          emailHash: emailHash.substring(0, 8) + '...',
          minutesRemaining
        });
        res.status(423).json({
          success: false,
          error: `Account temporarily locked due to too many failed login attempts. Please try again in ${minutesRemaining} minute(s).`
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
      if (!isValid) {
        // SECURITY FIX: Track failed login attempts and lock account after 5 failures
        const failedAttempts = ((user as { failedLoginAttempts?: number }).failedLoginAttempts || 0) + 1;
        const MAX_FAILED_ATTEMPTS = 5;
        const LOCKOUT_DURATION_MINUTES = 30;

        if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
          const lockoutUntil = new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000);
          await User.updateOne(
            { _id: user._id },
            {
              $set: {
                failedLoginAttempts: failedAttempts,
                lockoutUntil
              }
            }
          );
          logger.warn('Account locked due to too many failed login attempts', {
            emailHash: emailHash.substring(0, 8) + '...',
            failedAttempts,
            lockoutUntil
          });
          
          // SECURITY: Send alert for account lockout
          alertAccountLockout(normalizedEmail, req.ip || 'unknown', failedAttempts);
          
          res.status(423).json({
            success: false,
            error: `Too many failed login attempts. Account locked for ${LOCKOUT_DURATION_MINUTES} minutes.`
          });
          return;
        } else {
          // Increment failed attempts
          await User.updateOne(
            { _id: user._id },
            { $inc: { failedLoginAttempts: 1 } }
          );
        }

        res.status(401).json({
          success: false,
          error: 'Invalid email or password'
        });
        return;
      }

      // SECURITY FIX: Reset failed login attempts on successful login
      if ((user as { failedLoginAttempts?: number }).failedLoginAttempts || (user as { lockoutUntil?: Date }).lockoutUntil) {
        await User.updateOne(
          { _id: user._id },
          {
            $unset: {
              failedLoginAttempts: '',
              lockoutUntil: ''
            }
          }
        );
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

      // Prevent caching to ensure fresh credits data
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      res.json({
        success: true,
        user: {
          userId: user.userId,
          email: user.email,
          credits: user.credits,
          totalCreditsEarned: user.totalCreditsEarned || 0,
          totalCreditsSpent: user.totalCreditsSpent || 0,
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
        decoded = jwt.verify(token, JWT_SECRET) as JWTDecoded;
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
          const decoded = jwt.verify(accessToken, JWT_SECRET) as JWTDecoded;
          await blacklistToken(accessToken, decoded.exp ? decoded.exp * 1000 : null);
          tokensRevoked++;
        } catch {
          // Token already invalid
        }
      }

      if (refreshToken && JWT_REFRESH_SECRET) {
        try {
          const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET) as JWTDecoded;
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
          email: user.email,
          credits: user.credits || 0,
          totalCreditsEarned: user.totalCreditsEarned || 0,
          totalCreditsSpent: user.totalCreditsSpent || 0,
          walletAddress: user.walletAddress || null,
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
          email: user.email,
          credits: user.credits,
          totalCreditsEarned: user.totalCreditsEarned,
          totalCreditsSpent: user.totalCreditsSpent,
          walletAddress: user.walletAddress
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
  // Password Reset Flow
  // ============================================================================

  /**
   * Request password reset
   * POST /api/auth/forgot-password
   * 
   * SECURITY:
   * - Rate limited to prevent enumeration
   * - Constant-time response to prevent timing attacks
   * - Token hashed before storage
   * - 30 minute expiry
   */
  router.post('/forgot-password', limiter, async (req: Request, res: Response) => {
    try {
      const { email } = req.body as { email?: string };

      // Always respond with same message to prevent email enumeration
      const genericResponse = {
        success: true,
        message: 'If an account exists with this email, you will receive a password reset link.'
      };

      if (!email || typeof email !== 'string') {
        // Still return success to prevent enumeration
        res.json(genericResponse);
        return;
      }

      const normalizedEmail = email.toLowerCase().trim();
      
      // Validate email format
      const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
      if (!emailRegex.test(normalizedEmail) || normalizedEmail.length > 254) {
        res.json(genericResponse);
        return;
      }

      // Find user by email hash
      const User = mongoose.model<IUser>('User');
      const emailHash = createEmailHash(normalizedEmail);
      const emailHashPlain = crypto.createHash('sha256').update(normalizedEmail).digest('hex');
      
      const user = await User.findOne({
        $or: [
          { emailHash },
          { emailHashPlain },
          { emailLookup: normalizedEmail },
          { email: normalizedEmail }
        ]
      });

      if (!user) {
        // SECURITY: Don't reveal if user exists - use constant time delay
        await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 100));
        res.json(genericResponse);
        return;
      }

      // Generate reset token
      const { token, hash } = generateResetToken();
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

      // Store hashed token (so DB breach doesn't expose tokens)
      await User.updateOne(
        { _id: user._id },
        {
          $set: {
            passwordResetToken: hash,
            passwordResetExpires: expiresAt
          }
        }
      );

      // Send reset email
      const emailResult = await sendPasswordResetEmail(
        normalizedEmail,
        token,
        user.discordUsername
      );

      if (!emailResult.success) {
        logger.error('Failed to send password reset email', { 
          userId: user.userId,
          error: emailResult.error 
        });
        // Still return success to prevent enumeration
      } else {
        logger.info('Password reset requested', { userId: user.userId });
        
        // Send security alert
        alertPasswordReset(normalizedEmail, req.ip || 'unknown', user.userId);
      }

      res.json(genericResponse);
    } catch (error) {
      const err = error as Error;
      logger.error('Forgot password error', { error: err.message });
      // Return generic response even on error
      res.json({
        success: true,
        message: 'If an account exists with this email, you will receive a password reset link.'
      });
    }
  });

  /**
   * Verify reset token (check if valid before showing form)
   * POST /api/auth/verify-reset-token
   */
  router.post('/verify-reset-token', limiter, async (req: Request, res: Response) => {
    try {
      const { token } = req.body as { token?: string };

      if (!token || typeof token !== 'string' || token.length !== 64) {
        res.status(400).json({
          success: false,
          error: 'Invalid or expired reset token'
        });
        return;
      }

      const tokenHash = hashResetToken(token);
      const User = mongoose.model<IUser>('User');

      const user = await User.findOne({
        passwordResetToken: tokenHash,
        passwordResetExpires: { $gt: new Date() }
      }).select('userId');

      if (!user) {
        res.status(400).json({
          success: false,
          error: 'Invalid or expired reset token'
        });
        return;
      }

      res.json({
        success: true,
        message: 'Token is valid'
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Verify reset token error', { error: err.message });
      res.status(500).json({
        success: false,
        error: 'Failed to verify token'
      });
    }
  });

  /**
   * Reset password with token
   * POST /api/auth/reset-password
   * 
   * SECURITY:
   * - Validates token and expiry
   * - Enforces password strength
   * - Clears token after use (single-use)
   * - Blacklists all existing tokens (force re-login)
   */
  router.post('/reset-password', limiter, async (req: Request, res: Response) => {
    try {
      const { token, password } = req.body as { token?: string; password?: string };

      if (!token || typeof token !== 'string' || token.length !== 64) {
        res.status(400).json({
          success: false,
          error: 'Invalid or expired reset token'
        });
        return;
      }

      if (!password || typeof password !== 'string') {
        res.status(400).json({
          success: false,
          error: 'Password is required'
        });
        return;
      }

      // Validate password strength
      const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{12,}$/;
      if (!passwordRegex.test(password)) {
        res.status(400).json({
          success: false,
          error: 'Password must be at least 12 characters and include uppercase, lowercase, number, and special character (@$!%*?&)'
        });
        return;
      }

      const tokenHash = hashResetToken(token);
      const User = mongoose.model<IUser>('User');

      // Find user with valid token
      const user = await User.findOne({
        passwordResetToken: tokenHash,
        passwordResetExpires: { $gt: new Date() }
      });

      if (!user) {
        res.status(400).json({
          success: false,
          error: 'Invalid or expired reset token'
        });
        return;
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(password, 12);

      // Update password and clear reset token (single-use)
      await User.updateOne(
        { _id: user._id },
        {
          $set: { password: hashedPassword },
          $unset: {
            passwordResetToken: '',
            passwordResetExpires: '',
            // Also reset lockout on password reset
            failedLoginAttempts: '',
            lockoutUntil: ''
          }
        }
      );

      logger.info('Password reset completed', { userId: user.userId });

      // Generate new tokens for auto-login
      if (JWT_SECRET && JWT_REFRESH_SECRET) {
        const accessToken = jwt.sign(
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
          message: 'Password reset successfully',
          token: accessToken,
          refreshToken,
          user: {
            userId: user.userId,
            email: user.email,
            credits: user.credits
          }
        });
      } else {
        res.json({
          success: true,
          message: 'Password reset successfully. Please sign in with your new password.'
        });
      }
    } catch (error) {
      const err = error as Error;
      logger.error('Reset password error', { error: err.message });
      res.status(500).json({
        success: false,
        error: 'Failed to reset password'
      });
    }
  });

  return router;
}

export default createAuthRoutes;

