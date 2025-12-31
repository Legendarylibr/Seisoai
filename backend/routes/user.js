/**
 * User routes
 * User info, credits, gallery, NFT verification
 */
import { Router } from 'express';
import mongoose from 'mongoose';
import logger from '../utils/logger.js';
import { findUserByIdentifier, getOrCreateUser } from '../services/user.js';
import { checkNFTBalance } from '../services/blockchain.js';

export function createUserRoutes(deps) {
  const router = Router();
  const { authenticateFlexible } = deps;

  /**
   * Get user info
   * POST /api/user/info
   */
  router.post('/info', async (req, res) => {
    try {
      const { walletAddress, userId, email } = req.body;
      
      const user = await findUserByIdentifier(walletAddress, email, userId);
      
      if (!user) {
        return res.json({
          success: true,
          user: null
        });
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
      logger.error('User info error:', { error: error.message });
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
  router.post('/credits', async (req, res) => {
    try {
      const { walletAddress, userId, email } = req.body;
      
      if (!walletAddress && !userId && !email) {
        return res.status(400).json({
          success: false,
          error: 'Wallet address, userId, or email required'
        });
      }

      let user = await findUserByIdentifier(walletAddress, email, userId);
      
      // Create user if doesn't exist and wallet provided
      if (!user && walletAddress) {
        user = await getOrCreateUser(walletAddress, email);
      }

      res.json({
        success: true,
        credits: user?.credits || 0,
        totalCreditsEarned: user?.totalCreditsEarned || 0,
        totalCreditsSpent: user?.totalCreditsSpent || 0
      });
    } catch (error) {
      logger.error('Get credits error:', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to fetch credits'
      });
    }
  });

  /**
   * Legacy endpoint - GET /api/credits/get
   */
  router.post('/get', async (req, res) => {
    try {
      const { walletAddress, userId, email } = req.body;
      
      if (!walletAddress && !userId && !email) {
        return res.status(400).json({
          success: false,
          error: 'Wallet address, userId, or email required'
        });
      }

      let user = await findUserByIdentifier(walletAddress, email, userId);
      
      // Create user if doesn't exist and wallet provided
      if (!user && walletAddress) {
        user = await getOrCreateUser(walletAddress, email);
      }

      res.json({
        success: true,
        credits: user?.credits || 0,
        totalCreditsEarned: user?.totalCreditsEarned || 0,
        totalCreditsSpent: user?.totalCreditsSpent || 0
      });
    } catch (error) {
      logger.error('Get credits error:', { error: error.message });
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
  router.post('/gallery', authenticateFlexible, async (req, res) => {
    try {
      const { walletAddress, userId, email } = req.body;
      
      const user = await findUserByIdentifier(walletAddress, email, userId);
      
      if (!user) {
        return res.json({
          success: true,
          gallery: []
        });
      }

      const User = mongoose.model('User');
      const userWithGallery = await User.findOne({ userId: user.userId })
        .select('gallery')
        .lean();

      res.json({
        success: true,
        gallery: userWithGallery?.gallery || []
      });
    } catch (error) {
      logger.error('Gallery fetch error:', { error: error.message });
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
  router.post('/gallery/save', authenticateFlexible, async (req, res) => {
    try {
      const { walletAddress, userId, email, imageUrl, prompt, model } = req.body;
      
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
              imageUrl,
              prompt,
              model,
              timestamp: new Date()
            }
          }
        }
      );

      res.json({
        success: true,
        message: 'Saved to gallery'
      });
    } catch (error) {
      logger.error('Gallery save error:', { error: error.message });
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
  router.post('/nft', async (req, res) => {
    try {
      const { walletAddress, contractAddress, chainId = '1' } = req.body;

      if (!walletAddress || !contractAddress) {
        return res.status(400).json({
          success: false,
          error: 'Wallet address and contract address required'
        });
      }

      const balance = await checkNFTBalance(walletAddress, contractAddress, chainId);

      res.json({
        success: true,
        hasNFT: balance > 0,
        balance
      });
    } catch (error) {
      logger.error('NFT verification error:', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to verify NFT'
      });
    }
  });

  return router;
}

export default createUserRoutes;

