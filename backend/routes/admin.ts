/**
 * Admin routes
 * Administrative functions for managing users and data
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import type { RequestHandler } from 'express';
import mongoose from 'mongoose';
import logger from '../utils/logger';
import type { IUser } from '../models/User';
import rateLimit from 'express-rate-limit';

// SECURITY: Admin secret must be configured - no default allowed
const ADMIN_SECRET = process.env.ADMIN_SECRET;

// Types
interface Dependencies {
  [key: string]: unknown;
}

interface UserQuery {
  walletAddress?: string;
  email?: string;
  userId?: string;
}

// Admin rate limiter - 10 requests per 15 minutes per IP
const adminRateLimiter: RequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, error: 'Too many admin requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

export function createAdminRoutes(deps: Dependencies = {}) {
  const router = Router();
  
  // Apply rate limiting to all admin routes
  router.use(adminRateLimiter);

  // Admin authentication middleware
  const requireAdmin = (req: Request, res: Response, next: NextFunction): void => {
    // SECURITY: Fail if admin secret is not configured
    if (!ADMIN_SECRET || ADMIN_SECRET.length < 32) {
      logger.error('Admin access attempted but ADMIN_SECRET is not properly configured');
      res.status(503).json({ success: false, error: 'Admin functionality not available' });
      return;
    }
    
    const authHeader = req.headers.authorization;
    const isProduction = process.env.NODE_ENV === 'production';
    
    // SECURITY: In production, only accept admin secret via Authorization header
    // Request body secrets could be logged and pose a security risk
    let providedSecret: string | undefined;
    if (authHeader) {
      providedSecret = authHeader.replace('Bearer ', '');
    } else if (!isProduction) {
      // Development only: allow secret in request body for convenience
      providedSecret = (req.body as { adminSecret?: string }).adminSecret;
    }
    
    if (!providedSecret || providedSecret !== ADMIN_SECRET) {
      logger.warn('Failed admin authentication attempt', { 
        ip: req.ip,
        path: req.path,
        method: req.method,
        hasAuthHeader: !!authHeader,
        isProduction
      });
      res.status(403).json({ success: false, error: 'Unauthorized' });
      return;
    }
    
    logger.info('Admin access granted', { ip: req.ip, path: req.path });
    next();
  };

  /**
   * Add credits to user
   * POST /api/admin/add-credits
   */
  router.post('/add-credits', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { walletAddress, email, userId, credits } = req.body as {
        walletAddress?: string;
        email?: string;
        userId?: string;
        credits?: number;
      };

      if (!credits || typeof credits !== 'number' || credits <= 0) {
        res.status(400).json({ success: false, error: 'Valid credits amount required' });
        return;
      }

      const User = mongoose.model<IUser>('User');
      const query: UserQuery = {};
      
      if (walletAddress) query.walletAddress = walletAddress.toLowerCase();
      else if (email) query.email = email.toLowerCase();
      else if (userId) query.userId = userId;
      else {
        res.status(400).json({ success: false, error: 'User identifier required' });
        return;
      }

      const user = await User.findOneAndUpdate(
        query,
        { $inc: { credits, totalCreditsEarned: credits } },
        { new: true }
      );

      if (!user) {
        res.status(404).json({ success: false, error: 'User not found' });
        return;
      }

      logger.info('Admin added credits', { query, credits, newBalance: user.credits });

      res.json({
        success: true,
        credits: user.credits,
        totalCreditsEarned: user.totalCreditsEarned
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Admin add credits error', { error: err.message });
      res.status(500).json({ success: false, error: 'Failed to add credits' });
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

      const User = mongoose.model<IUser>('User');
      const query: UserQuery = {};
      
      if (walletAddress) query.walletAddress = walletAddress.toLowerCase();
      else if (email) query.email = email.toLowerCase();
      else if (userId) query.userId = userId;
      else {
        res.status(400).json({ success: false, error: 'User identifier required' });
        return;
      }

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

      logger.info('Fixed oversized user', { query });

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
  router.post('/fix-all-oversized', requireAdmin, async (req: Request, res: Response) => {
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

      const User = mongoose.model<IUser>('User');
      const query: UserQuery = {};
      
      if (walletAddress) query.walletAddress = walletAddress.toLowerCase();
      else if (email) query.email = email.toLowerCase();
      else if (userId) query.userId = userId;
      else {
        res.status(400).json({ success: false, error: 'User identifier required' });
        return;
      }

      const result = await User.updateOne(query, {
        $set: { generationHistory: [] }
      });

      if (result.matchedCount === 0) {
        res.status(404).json({ success: false, error: 'User not found' });
        return;
      }

      logger.info('Cleared generations for user', { query });

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




