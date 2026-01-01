/**
 * User routes
 * User info, credits, gallery, NFT verification
 */
import { Router, type Request, type Response } from 'express';
import type { RequestHandler } from 'express';
import mongoose from 'mongoose';
import logger from '../utils/logger';
import { findUserByIdentifier, getOrCreateUser } from '../services/user';
import { checkNFTBalance } from '../services/blockchain';
import type { IUser } from '../models/User';

// Types
interface Dependencies {
  authenticateFlexible?: RequestHandler;
}

export function createUserRoutes(deps: Dependencies = {}) {
  const router = Router();
  const { authenticateFlexible } = deps;

  const authMiddleware = authenticateFlexible || ((req: Request, res: Response, next: () => void) => next());

  /**
   * Get user info
   * POST /api/user/info
   */
  router.post('/info', async (req: Request, res: Response) => {
    try {
      const { walletAddress, userId, email } = req.body as {
        walletAddress?: string;
        userId?: string;
        email?: string;
      };
      
      const user = await findUserByIdentifier(walletAddress || null, email || null, userId || null);
      
      if (!user) {
        res.json({
          success: true,
          user: null
        });
        return;
      }

      res.json({
        success: true,
        user: {
          userId: user.userId,
          email: user.email,
          walletAddress: user.walletAddress,
          credits: user.credits,
          totalCreditsEarned: user.totalCreditsEarned,
          totalCreditsSpent: user.totalCreditsSpent
        }
      });
    } catch (error) {
      const err = error as Error;
      logger.error('User info error:', { error: err.message });
      res.status(500).json({
        success: false,
        error: 'Failed to fetch user info'
      });
    }
  });

  /**
   * Get user credits
   * POST /api/user/credits OR /api/credits/get
   */
  router.post('/credits', async (req: Request, res: Response) => {
    try {
      const { walletAddress, userId, email } = req.body as {
        walletAddress?: string;
        userId?: string;
        email?: string;
      };
      
      if (!walletAddress && !userId && !email) {
        res.status(400).json({
          success: false,
          error: 'Wallet address, userId, or email required'
        });
        return;
      }

      let user = await findUserByIdentifier(walletAddress || null, email || null, userId || null);
      
      // Create user if doesn't exist and wallet provided
      if (!user && walletAddress) {
        user = await getOrCreateUser(walletAddress, email || null);
      }

      res.json({
        success: true,
        credits: user?.credits || 0,
        totalCreditsEarned: user?.totalCreditsEarned || 0,
        totalCreditsSpent: user?.totalCreditsSpent || 0
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Get credits error:', { error: err.message });
      res.status(500).json({
        success: false,
        error: 'Failed to fetch credits'
      });
    }
  });

  /**
   * Legacy endpoint - GET /api/credits/get
   */
  router.post('/get', async (req: Request, res: Response) => {
    try {
      const { walletAddress, userId, email } = req.body as {
        walletAddress?: string;
        userId?: string;
        email?: string;
      };
      
      if (!walletAddress && !userId && !email) {
        res.status(400).json({
          success: false,
          error: 'Wallet address, userId, or email required'
        });
        return;
      }

      let user = await findUserByIdentifier(walletAddress || null, email || null, userId || null);
      
      // Create user if doesn't exist and wallet provided
      if (!user && walletAddress) {
        user = await getOrCreateUser(walletAddress, email || null);
      }

      res.json({
        success: true,
        credits: user?.credits || 0,
        totalCreditsEarned: user?.totalCreditsEarned || 0,
        totalCreditsSpent: user?.totalCreditsSpent || 0
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Get credits error:', { error: err.message });
      res.status(500).json({
        success: false,
        error: 'Failed to fetch credits'
      });
    }
  });

  /**
   * Get user gallery
   * POST /api/user/gallery OR /api/gallery/get
   */
  router.post('/gallery', authMiddleware, async (req: Request, res: Response) => {
    try {
      const { walletAddress, userId, email } = req.body as {
        walletAddress?: string;
        userId?: string;
        email?: string;
      };
      
      const user = await findUserByIdentifier(walletAddress || null, email || null, userId || null);
      
      if (!user) {
        res.json({
          success: true,
          gallery: []
        });
        return;
      }

      const User = mongoose.model<IUser>('User');
      const userWithGallery = await User.findOne({ userId: user.userId })
        .select('gallery')
        .lean();

      res.json({
        success: true,
        gallery: userWithGallery?.gallery || []
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Gallery fetch error:', { error: err.message });
      res.status(500).json({
        success: false,
        error: 'Failed to fetch gallery'
      });
    }
  });

  /**
   * Save to gallery
   * POST /api/user/gallery/save OR /api/gallery/save
   */
  router.post('/gallery/save', authMiddleware, async (req: Request, res: Response) => {
    try {
      const { walletAddress, userId, email, imageUrl, prompt, model } = req.body as {
        walletAddress?: string;
        userId?: string;
        email?: string;
        imageUrl?: string;
        prompt?: string;
        model?: string;
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
                id: `gen-${Date.now()}`,
                imageUrl,
                prompt,
                style: model,
                timestamp: new Date()
              }],
              $slice: -100
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
      logger.error('Gallery save error:', { error: err.message });
      res.status(500).json({
        success: false,
        error: 'Failed to save to gallery'
      });
    }
  });

  /**
   * Verify NFT ownership
   * POST /api/user/nft OR /api/nft/verify
   */
  router.post('/nft', async (req: Request, res: Response) => {
    try {
      const { walletAddress, contractAddress, chainId = '1' } = req.body as {
        walletAddress?: string;
        contractAddress?: string;
        chainId?: string | number;
      };

      if (!walletAddress || !contractAddress) {
        res.status(400).json({
          success: false,
          error: 'Wallet address and contract address required'
        });
        return;
      }

      const balance = await checkNFTBalance(walletAddress, contractAddress, chainId);

      res.json({
        success: true,
        hasNFT: balance > 0,
        balance
      });
    } catch (error) {
      const err = error as Error;
      logger.error('NFT verification error:', { error: err.message });
      res.status(500).json({
        success: false,
        error: 'Failed to verify NFT'
      });
    }
  });

  return router;
}

export default createUserRoutes;

