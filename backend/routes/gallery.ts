/**
 * Gallery routes
 * User gallery management
 */
import { Router, type Request, type Response } from 'express';
import type { RequestHandler } from 'express';
import mongoose from 'mongoose';
import logger from '../utils/logger';
import { findUserByIdentifier } from '../services/user';
import type { IUser } from '../models/User';

// Types
interface Dependencies {
  authenticateToken: RequestHandler;
  authenticateFlexible: RequestHandler;
}

interface AuthenticatedRequest extends Request {
  user?: IUser;
}

interface UserQuery {
  email?: string;
  walletAddress?: string;
  userId?: string;
}

export function createGalleryRoutes(deps: Dependencies) {
  const router = Router();
  const { authenticateToken, authenticateFlexible } = deps;

  /**
   * Get user gallery
   * GET /api/gallery/:identifier
   */
  router.get('/:identifier', async (req: Request, res: Response) => {
    try {
      const { identifier } = req.params;
      
      // Validate identifier format
      const isEmail = identifier.includes('@');
      const isWallet = identifier.startsWith('0x') || identifier.length === 44;
      const isUserId = !isEmail && !isWallet;

      if (!isEmail && !isWallet && !isUserId) {
        res.status(400).json({ 
          success: false, 
          error: 'Invalid identifier format' 
        });
        return;
      }

      const User = mongoose.model<IUser>('User');
      const query: UserQuery = {};
      
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
        res.json({ 
          success: true, 
          gallery: [] 
        });
        return;
      }

      res.json({
        success: true,
        gallery: user.gallery || []
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Gallery fetch error', { error: err.message });
      res.status(500).json({ 
        success: false, 
        error: err.message 
      });
    }
  });

  /**
   * Get gallery stats
   * GET /api/gallery/:walletAddress/stats
   */
  router.get('/:walletAddress/stats', async (req: Request, res: Response) => {
    try {
      const { walletAddress } = req.params;
      
      const User = mongoose.model<IUser>('User');
      const user = await User.findOne({ 
        walletAddress: walletAddress.toLowerCase() 
      })
        .select('gallery generationHistory')
        .lean();

      if (!user) {
        res.json({
          success: true,
          stats: {
            galleryCount: 0,
            generationCount: 0
          }
        });
        return;
      }

      res.json({
        success: true,
        stats: {
          galleryCount: user.gallery?.length || 0,
          generationCount: user.generationHistory?.length || 0
        }
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Gallery stats error', { error: err.message });
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
  router.delete('/:walletAddress/:generationId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { walletAddress, generationId } = req.params;
      
      // Verify ownership
      if (req.user?.walletAddress?.toLowerCase() !== walletAddress.toLowerCase()) {
        res.status(403).json({ 
          success: false, 
          error: 'Not authorized to delete this item' 
        });
        return;
      }

      const User = mongoose.model<IUser>('User');
      const result = await User.updateOne(
        { walletAddress: walletAddress.toLowerCase() },
        { $pull: { gallery: { id: generationId } } }
      );

      if (result.modifiedCount === 0) {
        res.status(404).json({ 
          success: false, 
          error: 'Item not found' 
        });
        return;
      }

      res.json({
        success: true,
        message: 'Item deleted'
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Gallery delete error', { error: err.message });
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
  router.post('/save', authenticateFlexible, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { walletAddress, userId, email, imageUrl, prompt, model, generationId } = req.body as {
        walletAddress?: string;
        userId?: string;
        email?: string;
        imageUrl?: string;
        prompt?: string;
        model?: string;
        generationId?: string;
      };
      
      if (!imageUrl) {
        res.status(400).json({ 
          success: false, 
          error: 'Image URL required' 
        });
        return;
      }

      const user = await findUserByIdentifier(walletAddress || null, email || null, userId || null);
      
      if (!user) {
        res.status(404).json({ 
          success: false, 
          error: 'User not found' 
        });
        return;
      }

      const User = mongoose.model<IUser>('User');
      await User.findOneAndUpdate(
        { userId: user.userId },
        {
          $push: {
            gallery: {
              $each: [{
                id: generationId || `gen-${Date.now()}`,
                imageUrl,
                prompt,
                style: model,
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
      const err = error as Error;
      logger.error('Gallery save error', { error: err.message });
      res.status(500).json({ 
        success: false, 
        error: 'Failed to save to gallery' 
      });
    }
  });

  return router;
}

export default createGalleryRoutes;

