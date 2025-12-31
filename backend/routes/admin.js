/**
 * Admin routes
 * Administrative functions for managing users and data
 */
import { Router } from 'express';
import mongoose from 'mongoose';
import logger from '../utils/logger.js';

const ADMIN_SECRET = process.env.ADMIN_SECRET || 'admin-secret-key';

export function createAdminRoutes(deps) {
  const router = Router();

  // Admin authentication middleware
  const requireAdmin = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const providedSecret = authHeader?.replace('Bearer ', '') || req.body.adminSecret;
    
    if (providedSecret !== ADMIN_SECRET) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }
    next();
  };

  /**
   * Add credits to user
   * POST /api/admin/add-credits
   */
  router.post('/add-credits', requireAdmin, async (req, res) => {
    try {
      const { walletAddress, email, userId, credits } = req.body;

      if (!credits || typeof credits !== 'number' || credits <= 0) {
        return res.status(400).json({ success: false, error: 'Valid credits amount required' });
      }

      const User = mongoose.model('User');
      let query = {};
      
      if (walletAddress) query.walletAddress = walletAddress.toLowerCase();
      else if (email) query.email = email.toLowerCase();
      else if (userId) query.userId = userId;
      else return res.status(400).json({ success: false, error: 'User identifier required' });

      const user = await User.findOneAndUpdate(
        query,
        { $inc: { credits, totalCreditsEarned: credits } },
        { new: true }
      );

      if (!user) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }

      logger.info('Admin added credits', { query, credits, newBalance: user.credits });

      res.json({
        success: true,
        credits: user.credits,
        totalCreditsEarned: user.totalCreditsEarned
      });
    } catch (error) {
      logger.error('Admin add credits error', { error: error.message });
      res.status(500).json({ success: false, error: 'Failed to add credits' });
    }
  });

  /**
   * Fix oversized user document
   * POST /api/admin/fix-oversized-user
   */
  router.post('/fix-oversized-user', requireAdmin, async (req, res) => {
    try {
      const { walletAddress, email, userId } = req.body;

      const User = mongoose.model('User');
      let query = {};
      
      if (walletAddress) query.walletAddress = walletAddress.toLowerCase();
      else if (email) query.email = email.toLowerCase();
      else if (userId) query.userId = userId;
      else return res.status(400).json({ success: false, error: 'User identifier required' });

      // Clear large arrays that cause document size issues
      const result = await User.updateOne(query, {
        $set: {
          generationHistory: [],
          gallery: []
        }
      });

      if (result.matchedCount === 0) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }

      logger.info('Fixed oversized user', { query });

      res.json({
        success: true,
        message: 'User document fixed'
      });
    } catch (error) {
      logger.error('Fix oversized user error', { error: error.message });
      res.status(500).json({ success: false, error: 'Failed to fix user' });
    }
  });

  /**
   * Fix all oversized documents
   * POST /api/admin/fix-all-oversized
   */
  router.post('/fix-all-oversized', requireAdmin, async (req, res) => {
    try {
      const User = mongoose.model('User');
      
      // Find users with large arrays
      const result = await User.updateMany(
        {
          $or: [
            { 'generationHistory.100': { $exists: true } },
            { 'gallery.100': { $exists: true } }
          ]
        },
        {
          $set: {
            generationHistory: { $slice: ['$generationHistory', -50] },
            gallery: { $slice: ['$gallery', -50] }
          }
        }
      );

      logger.info('Fixed all oversized documents', { modifiedCount: result.modifiedCount });

      res.json({
        success: true,
        modifiedCount: result.modifiedCount
      });
    } catch (error) {
      logger.error('Fix all oversized error', { error: error.message });
      res.status(500).json({ success: false, error: 'Failed to fix documents' });
    }
  });

  /**
   * Clear all generations for a user
   * POST /api/admin/clear-all-generations
   */
  router.post('/clear-all-generations', requireAdmin, async (req, res) => {
    try {
      const { walletAddress, email, userId } = req.body;

      const User = mongoose.model('User');
      let query = {};
      
      if (walletAddress) query.walletAddress = walletAddress.toLowerCase();
      else if (email) query.email = email.toLowerCase();
      else if (userId) query.userId = userId;
      else return res.status(400).json({ success: false, error: 'User identifier required' });

      const result = await User.updateOne(query, {
        $set: { generationHistory: [] }
      });

      if (result.matchedCount === 0) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }

      logger.info('Cleared generations for user', { query });

      res.json({
        success: true,
        message: 'Generation history cleared'
      });
    } catch (error) {
      logger.error('Clear generations error', { error: error.message });
      res.status(500).json({ success: false, error: 'Failed to clear generations' });
    }
  });

  return router;
}

export default createAdminRoutes;

