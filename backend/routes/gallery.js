/**
 * Gallery routes
 * User gallery management
 */
import { Router } from 'express';
import mongoose from 'mongoose';
import logger from '../utils/logger.js';
import { findUserByIdentifier } from '../services/user.js';

export function createGalleryRoutes(deps) {
  const router = Router();
  const { authenticateToken, authenticateFlexible } = deps;

  /**
   * Get user gallery
   * GET /api/gallery/:identifier
   */
  router.get('/:identifier', async (req, res) => {
    try {
      const { identifier } = req.params;
      
      // Validate identifier format
      const isEmail = identifier.includes('@');
      const isWallet = identifier.startsWith('0x') || identifier.length === 44;
      const isUserId = !isEmail && !isWallet;

      if (!isEmail && !isWallet && !isUserId) {
        return res.status(400).json({ 
          success: false, 
          error: 'Invalid identifier format' 
        });
      }

      const User = mongoose.model('User');
      let query = {};
      
      if (isEmail) {
        query.email = identifier.toLowerCase();
      } else if (isWallet) {
        query.walletAddress = identifier.startsWith('0x') ? identifier.toLowerCase() : identifier;
      } else {
        query.userId = identifier;
      }

      const user = await User.findOne(query)
        .select('gallery')
        .lean()
        .maxTimeMS(10000);

      if (!user) {
        return res.json({ 
          success: true, 
          gallery: [] 
        });
      }

      res.json({
        success: true,
        gallery: user.gallery || []
      });
    } catch (error) {
      logger.error('Gallery fetch error', { error: error.message });
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  });

  /**
   * Get gallery stats
   * GET /api/gallery/:walletAddress/stats
   */
  router.get('/:walletAddress/stats', async (req, res) => {
    try {
      const { walletAddress } = req.params;
      
      const User = mongoose.model('User');
      const user = await User.findOne({ 
        walletAddress: walletAddress.toLowerCase() 
      })
        .select('gallery generationHistory')
        .lean();

      if (!user) {
        return res.json({
          success: true,
          stats: {
            galleryCount: 0,
            generationCount: 0
          }
        });
      }

      res.json({
        success: true,
        stats: {
          galleryCount: user.gallery?.length || 0,
          generationCount: user.generationHistory?.length || 0
        }
      });
    } catch (error) {
      logger.error('Gallery stats error', { error: error.message });
      res.status(500).json({ 
        success: false, 
        error: 'Failed to get stats' 
      });
    }
  });

  /**
   * Delete gallery item
   * DELETE /api/gallery/:walletAddress/:generationId
   */
  router.delete('/:walletAddress/:generationId', authenticateToken, async (req, res) => {
    try {
      const { walletAddress, generationId } = req.params;
      
      // Verify ownership
      if (req.user?.walletAddress?.toLowerCase() !== walletAddress.toLowerCase()) {
        return res.status(403).json({ 
          success: false, 
          error: 'Not authorized to delete this item' 
        });
      }

      const User = mongoose.model('User');
      const result = await User.updateOne(
        { walletAddress: walletAddress.toLowerCase() },
        { $pull: { gallery: { generationId } } }
      );

      if (result.modifiedCount === 0) {
        return res.status(404).json({ 
          success: false, 
          error: 'Item not found' 
        });
      }

      res.json({
        success: true,
        message: 'Item deleted'
      });
    } catch (error) {
      logger.error('Gallery delete error', { error: error.message });
      res.status(500).json({ 
        success: false, 
        error: 'Failed to delete item' 
      });
    }
  });

  /**
   * Save to gallery
   * POST /api/gallery/save
   */
  router.post('/save', authenticateFlexible, async (req, res) => {
    try {
      const { walletAddress, userId, email, imageUrl, prompt, model, generationId } = req.body;
      
      if (!imageUrl) {
        return res.status(400).json({ 
          success: false, 
          error: 'Image URL required' 
        });
      }

      const user = await findUserByIdentifier(walletAddress, email, userId);
      
      if (!user) {
        return res.status(404).json({ 
          success: false, 
          error: 'User not found' 
        });
      }

      const User = mongoose.model('User');
      await User.findOneAndUpdate(
        { userId: user.userId },
        {
          $push: {
            gallery: {
              $each: [{
                generationId: generationId || `gen-${Date.now()}`,
                imageUrl,
                prompt,
                model,
                timestamp: new Date()
              }],
              $slice: -100 // Keep last 100 items
            }
          }
        }
      );

      res.json({
        success: true,
        message: 'Saved to gallery'
      });
    } catch (error) {
      logger.error('Gallery save error', { error: error.message });
      res.status(500).json({ 
        success: false, 
        error: 'Failed to save to gallery' 
      });
    }
  });

  return router;
}

export default createGalleryRoutes;



