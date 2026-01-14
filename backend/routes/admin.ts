/**
 * Admin routes
 * Administrative functions for managing users and data
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import type { RequestHandler } from 'express';
import mongoose from 'mongoose';
import crypto from 'crypto';
import logger from '../utils/logger';
import type { IUser } from '../models/User';
import { createEmailHash } from '../utils/emailHash';
import rateLimit from 'express-rate-limit';

// SECURITY: Admin secret must be configured - no default allowed
const ADMIN_SECRET = process.env.ADMIN_SECRET;

/**
 * Build robust email lookup query with multiple fallback methods
 * This ensures users can be found regardless of ENCRYPTION_KEY configuration
 */
function buildEmailLookupConditions(email: string): Array<Record<string, string>> {
  const normalized = email.toLowerCase().trim();
  const emailHash = createEmailHash(normalized);
  const emailHashPlain = crypto.createHash('sha256').update(normalized).digest('hex');
  
  return [
    { emailHash },                    // Primary: HMAC hash (with encryption key)
    { emailHashPlain },               // Fallback: plain SHA-256 hash
    { emailLookup: normalized },      // Fallback: plain email lookup field
    { email: normalized }             // Legacy: direct email match
  ];
}

// Types
interface Dependencies {
  [key: string]: unknown;
}

type UserQuery = Record<string, unknown>;

/**
 * Build a MongoDB query for user lookup by wallet, email, or userId
 * Uses robust email lookup with multiple fallback methods for encrypted emails
 */
function buildUserQuery(walletAddress?: string, email?: string, userId?: string): UserQuery | null {
  if (walletAddress) {
    return { walletAddress: walletAddress.toLowerCase() };
  } else if (email) {
    // Use robust email lookup with multiple fallback methods
    return { $or: buildEmailLookupConditions(email) };
  } else if (userId) {
    return { userId };
  }
  return null;
}

// SECURITY ENHANCED: Admin rate limiter with multi-factor key generation
// Combines IP, browser fingerprint, and user agent for better tracking
const adminRateLimiter: RequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // SECURITY FIX: Reduced from 10 to 5 to prevent brute force attacks
  message: { success: false, error: 'Too many admin requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false, // Count all requests, not just failures
  // SECURITY: Use multi-factor key generation to prevent bypass via proxy/VPN
  keyGenerator: (req) => {
    const { generateBrowserFingerprint } = require('../abusePrevention');
    const fingerprint = generateBrowserFingerprint(req);
    const userAgent = req.headers['user-agent']?.substring(0, 50) || 'unknown';
    return `${req.ip || 'unknown'}-${fingerprint}-${userAgent}`;
  }
});

export function createAdminRoutes(_deps: Dependencies = {}) {
  const router = Router();
  
  // Apply rate limiting to all admin routes
  router.use(adminRateLimiter);

  // Admin authentication middleware
  // SECURITY FIX: Use constant-time comparison to prevent timing attacks
  const requireAdmin = (req: Request, res: Response, next: NextFunction): void => {
    // SECURITY: Fail if admin secret is not configured
    if (!ADMIN_SECRET || ADMIN_SECRET.length < 32) {
      logger.error('Admin access attempted but ADMIN_SECRET is not properly configured');
      res.status(503).json({ success: false, error: 'Admin functionality not available' });
      return;
    }
    
    const authHeader = req.headers.authorization;
    
    // SECURITY FIX: Only accept admin secret via Authorization header
    // Request body secrets could be logged in proxies, load balancers, or application logs
    // This is a critical security vulnerability - never accept secrets in request body
    if (!authHeader) {
      logger.warn('Failed admin authentication attempt - no Authorization header', { 
        ip: req.ip,
        path: req.path,
        method: req.method
      });
      res.status(403).json({ success: false, error: 'Unauthorized' });
      return;
    }
    
    const providedSecret = authHeader.replace('Bearer ', '').trim();
    
    // SECURITY: Log attempts to use admin secret in request body (security monitoring)
    const bodySecret = (req.body as { adminSecret?: string }).adminSecret;
    if (bodySecret) {
      logger.warn('SECURITY: Admin secret provided in request body - this is not allowed', {
        ip: req.ip,
        path: req.path,
        method: req.method,
        hasAuthHeader: !!authHeader
      });
    }
    
    // SECURITY FIX: Use constant-time comparison to prevent timing attacks
    // Timing attacks can leak the secret character by character by measuring response time
    let isValid = false;
    if (providedSecret && providedSecret.length === ADMIN_SECRET.length) {
      try {
        const providedBuffer = Buffer.from(providedSecret, 'utf8');
        const secretBuffer = Buffer.from(ADMIN_SECRET, 'utf8');
        isValid = crypto.timingSafeEqual(providedBuffer, secretBuffer);
      } catch {
        isValid = false;
      }
    }
    
    if (!isValid) {
      logger.warn('Failed admin authentication attempt', { 
        ip: req.ip,
        path: req.path,
        method: req.method,
        hasAuthHeader: !!authHeader
      });
      res.status(403).json({ success: false, error: 'Unauthorized' });
      return;
    }
    
    logger.info('Admin access granted', { ip: req.ip, path: req.path });
    next();
  };

  /**
   * Lookup user by wallet or email
   * POST /api/admin/user
   */
  router.post('/user', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { walletAddress, email, userId } = req.body as {
        walletAddress?: string;
        email?: string;
        userId?: string;
      };

      const query = buildUserQuery(walletAddress, email, userId);
      if (!query) {
        res.status(400).json({ success: false, error: 'User identifier required (walletAddress, email, or userId)' });
        return;
      }

      const User = mongoose.model<IUser>('User');
      const user = await User.findOne(query).select('-password -generationHistory -gallery');

      if (!user) {
        res.status(404).json({ success: false, error: 'User not found' });
        return;
      }

      logger.info('Admin user lookup', { 
        identifier: walletAddress || email || userId 
      });

      res.json({
        success: true,
        user: {
          userId: user.userId,
          walletAddress: user.walletAddress,
          email: user.email,
          credits: user.credits,
          totalCreditsEarned: user.totalCreditsEarned,
          totalCreditsSpent: user.totalCreditsSpent,
          isNFTHolder: user.nftCollections && user.nftCollections.length > 0,
          createdAt: user.createdAt,
          lastActive: user.lastActive
        }
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Admin user lookup error', { error: err.message });
      res.status(500).json({ success: false, error: 'Failed to lookup user' });
    }
  });

  /**
   * Add credits to user
   * POST /api/admin/add-credits
   */
  router.post('/add-credits', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { walletAddress, email, userId, credits, reason } = req.body as {
        walletAddress?: string;
        email?: string;
        userId?: string;
        credits?: number;
        reason?: string;
      };

      if (!credits || typeof credits !== 'number' || credits <= 0) {
        res.status(400).json({ success: false, error: 'Valid credits amount required (positive number)' });
        return;
      }

      const query = buildUserQuery(walletAddress, email, userId);
      if (!query) {
        res.status(400).json({ success: false, error: 'User identifier required (walletAddress, email, or userId)' });
        return;
      }

      // Record admin action in payment history for audit trail
      const paymentEntry = {
        txHash: `admin_add_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        tokenSymbol: 'ADMIN',
        amount: 0,
        credits: credits,
        chainId: 'admin',
        walletType: 'admin',
        timestamp: new Date(),
        type: 'admin' as const
      };

      const User = mongoose.model<IUser>('User');
      const user = await User.findOneAndUpdate(
        query,
        { 
          $inc: { credits, totalCreditsEarned: credits },
          $push: { paymentHistory: paymentEntry }
        },
        { new: true }
      );

      if (!user) {
        res.status(404).json({ success: false, error: 'User not found' });
        return;
      }

      logger.info('Admin added credits', { 
        identifier: walletAddress || email || userId, 
        credits, 
        newBalance: user.credits,
        reason: reason || 'not specified'
      });

      res.json({
        success: true,
        credits: user.credits,
        totalCreditsEarned: user.totalCreditsEarned,
        totalCreditsSpent: user.totalCreditsSpent,
        message: `Added ${credits} credits`
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Admin add credits error', { error: err.message });
      res.status(500).json({ success: false, error: 'Failed to add credits' });
    }
  });

  /**
   * Set user credits to specific value
   * POST /api/admin/set-credits
   */
  router.post('/set-credits', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { walletAddress, email, userId, credits, reason } = req.body as {
        walletAddress?: string;
        email?: string;
        userId?: string;
        credits?: number;
        reason?: string;
      };

      if (credits === undefined || typeof credits !== 'number' || credits < 0) {
        res.status(400).json({ success: false, error: 'Valid credits amount required (non-negative number)' });
        return;
      }

      const query = buildUserQuery(walletAddress, email, userId);
      if (!query) {
        res.status(400).json({ success: false, error: 'User identifier required (walletAddress, email, or userId)' });
        return;
      }

      const User = mongoose.model<IUser>('User');

      // Get current credits to calculate difference
      const currentUser = await User.findOne(query);
      if (!currentUser) {
        res.status(404).json({ success: false, error: 'User not found' });
        return;
      }

      const previousCredits = currentUser.credits || 0;
      const difference = credits - previousCredits;

      // Record admin action in payment history for audit trail
      const paymentEntry = {
        txHash: `admin_set_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        tokenSymbol: 'ADMIN',
        amount: 0,
        credits: difference,
        chainId: 'admin',
        walletType: 'admin',
        timestamp: new Date(),
        type: 'admin' as const
      };

      const updateFields: Record<string, unknown> = { 
        $set: { credits },
        $push: { paymentHistory: paymentEntry }
      };
      
      // Update totalCreditsEarned if credits increased
      if (difference > 0) {
        updateFields.$inc = { totalCreditsEarned: difference };
      }

      const user = await User.findOneAndUpdate(
        query,
        updateFields,
        { new: true }
      );

      logger.info('Admin set credits', { 
        identifier: walletAddress || email || userId, 
        previousCredits,
        newCredits: credits,
        difference,
        reason: reason || 'not specified'
      });

      res.json({
        success: true,
        previousCredits,
        credits: user!.credits,
        difference,
        totalCreditsEarned: user!.totalCreditsEarned,
        totalCreditsSpent: user!.totalCreditsSpent,
        message: `Set credits to ${credits} (was ${previousCredits})`
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Admin set credits error', { error: err.message });
      res.status(500).json({ success: false, error: 'Failed to set credits' });
    }
  });

  /**
   * Subtract credits from user
   * POST /api/admin/subtract-credits
   */
  router.post('/subtract-credits', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { walletAddress, email, userId, credits, reason } = req.body as {
        walletAddress?: string;
        email?: string;
        userId?: string;
        credits?: number;
        reason?: string;
      };

      if (!credits || typeof credits !== 'number' || credits <= 0) {
        res.status(400).json({ success: false, error: 'Valid credits amount required (positive number)' });
        return;
      }

      const query = buildUserQuery(walletAddress, email, userId);
      if (!query) {
        res.status(400).json({ success: false, error: 'User identifier required (walletAddress, email, or userId)' });
        return;
      }

      const User = mongoose.model<IUser>('User');

      // Get current credits to check balance
      const currentUser = await User.findOne(query);
      if (!currentUser) {
        res.status(404).json({ success: false, error: 'User not found' });
        return;
      }

      const previousCredits = currentUser.credits || 0;
      const newCredits = Math.max(0, previousCredits - credits);

      // Record admin action in payment history for audit trail
      const paymentEntry = {
        txHash: `admin_subtract_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        tokenSymbol: 'ADMIN',
        amount: 0,
        credits: -credits,
        chainId: 'admin',
        walletType: 'admin',
        timestamp: new Date(),
        type: 'admin' as const
      };

      const user = await User.findOneAndUpdate(
        query,
        { 
          $set: { credits: newCredits },
          $inc: { totalCreditsSpent: credits },
          $push: { paymentHistory: paymentEntry }
        },
        { new: true }
      );

      logger.info('Admin subtracted credits', { 
        identifier: walletAddress || email || userId, 
        previousCredits,
        subtracted: credits,
        newCredits: user!.credits,
        reason: reason || 'not specified'
      });

      res.json({
        success: true,
        previousCredits,
        subtracted: credits,
        credits: user!.credits,
        totalCreditsEarned: user!.totalCreditsEarned,
        totalCreditsSpent: user!.totalCreditsSpent,
        message: `Subtracted ${credits} credits (was ${previousCredits}, now ${user!.credits})`
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Admin subtract credits error', { error: err.message });
      res.status(500).json({ success: false, error: 'Failed to subtract credits' });
    }
  });

  /**
   * Fix oversized user document
   * POST /api/admin/fix-oversized-user
   */
  router.post('/fix-oversized-user', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { walletAddress, email, userId } = req.body as {
        walletAddress?: string;
        email?: string;
        userId?: string;
      };

      const query = buildUserQuery(walletAddress, email, userId);
      if (!query) {
        res.status(400).json({ success: false, error: 'User identifier required (walletAddress, email, or userId)' });
        return;
      }

      const User = mongoose.model<IUser>('User');

      // Clear large arrays that cause document size issues
      const result = await User.updateOne(query, {
        $set: {
          generationHistory: [],
          gallery: []
        }
      });

      if (result.matchedCount === 0) {
        res.status(404).json({ success: false, error: 'User not found' });
        return;
      }

      logger.info('Fixed oversized user', { identifier: walletAddress || email || userId });

      res.json({
        success: true,
        message: 'User document fixed'
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Fix oversized user error', { error: err.message });
      res.status(500).json({ success: false, error: 'Failed to fix user' });
    }
  });

  /**
   * Fix all oversized documents
   * POST /api/admin/fix-all-oversized
   */
  router.post('/fix-all-oversized', requireAdmin, async (_req: Request, res: Response) => {
    try {
      const User = mongoose.model<IUser>('User');
      
      // Find users with large arrays - simplified approach
      const users = await User.find({
        $or: [
          { 'generationHistory.100': { $exists: true } },
          { 'gallery.100': { $exists: true } }
        ]
      }).select('_id');

      let modifiedCount = 0;
      for (const user of users) {
        await User.updateOne(
          { _id: user._id },
          {
            $set: {
              generationHistory: [],
              gallery: []
            }
          }
        );
        modifiedCount++;
      }

      logger.info('Fixed all oversized documents', { modifiedCount });

      res.json({
        success: true,
        modifiedCount
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Fix all oversized error', { error: err.message });
      res.status(500).json({ success: false, error: 'Failed to fix documents' });
    }
  });

  /**
   * Clear all generations for a user
   * POST /api/admin/clear-all-generations
   */
  router.post('/clear-all-generations', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { walletAddress, email, userId } = req.body as {
        walletAddress?: string;
        email?: string;
        userId?: string;
      };

      const query = buildUserQuery(walletAddress, email, userId);
      if (!query) {
        res.status(400).json({ success: false, error: 'User identifier required (walletAddress, email, or userId)' });
        return;
      }

      const User = mongoose.model<IUser>('User');

      const result = await User.updateOne(query, {
        $set: { generationHistory: [] }
      });

      if (result.matchedCount === 0) {
        res.status(404).json({ success: false, error: 'User not found' });
        return;
      }

      logger.info('Cleared generations for user', { identifier: walletAddress || email || userId });

      res.json({
        success: true,
        message: 'Generation history cleared'
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Clear generations error', { error: err.message });
      res.status(500).json({ success: false, error: 'Failed to clear generations' });
    }
  });

  return router;
}

export default createAdminRoutes;




