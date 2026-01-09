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
  authenticateToken?: RequestHandler;
}

interface AuthenticatedRequest extends Request {
  user?: IUser;
}

export function createUserRoutes(deps: Dependencies = {}) {
  const router = Router();
  const { authenticateFlexible, authenticateToken } = deps;

  const authMiddleware = authenticateFlexible || ((req: Request, res: Response, next: () => void) => next());
  const strictAuth = authenticateToken || ((req: Request, res: Response, next: () => void) => next());

  /**
   * Get user info
   * POST /api/user/info
   * SECURITY FIX: Only returns public data unless authenticated user requests their own data
   */
  router.post('/info', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { walletAddress, userId, email } = req.body as {
        walletAddress?: string;
        userId?: string;
        email?: string;
      };
      
      const requestedUser = await findUserByIdentifier(walletAddress || null, email || null, userId || null);
      
      if (!requestedUser) {
        res.json({
          success: true,
          user: null
        });
        return;
      }

      // SECURITY: If authenticated, only return full data for own account
      // Otherwise, return only public data
      if (req.user && (req.user.userId === requestedUser.userId || 
                       req.user.email === requestedUser.email ||
                       (req.user.walletAddress && req.user.walletAddress.toLowerCase() === requestedUser.walletAddress?.toLowerCase()))) {
        // Authenticated user requesting their own data - return full info
        res.json({
          success: true,
          user: {
            userId: requestedUser.userId,
            email: requestedUser.email,
            walletAddress: requestedUser.walletAddress,
            credits: requestedUser.credits,
            totalCreditsEarned: requestedUser.totalCreditsEarned,
            totalCreditsSpent: requestedUser.totalCreditsSpent
          }
        });
      } else {
        // Public data only (no authentication or different user)
        res.json({
          success: true,
          user: {
            userId: requestedUser.userId,
            walletAddress: requestedUser.walletAddress,
            // DO NOT return: email, credits (sensitive data)
            isNFTHolder: requestedUser.nftCollections && requestedUser.nftCollections.length > 0
          }
        });
      }
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
   * SECURITY FIX: Only returns gallery for authenticated user to prevent IDOR
   */
  router.post('/gallery', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      // SECURITY: Only return gallery for authenticated user
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
        return;
      }

      const User = mongoose.model<IUser>('User');
      const userWithGallery = await User.findOne({ userId: req.user.userId })
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
   * SECURITY FIX: Only allows saving to authenticated user's gallery
   */
  router.post('/gallery/save', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      // SECURITY: Only allow saving to authenticated user's gallery
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
        return;
      }

      const { imageUrl, prompt, model } = req.body as {
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

      const User = mongoose.model<IUser>('User');
      await User.findOneAndUpdate(
        { userId: req.user.userId },
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

  /**
   * Get user by wallet address (public endpoint)
   * GET /api/users/:walletAddress
   */
  router.get('/:walletAddress', async (req: Request, res: Response) => {
    try {
      const { walletAddress } = req.params;
      const { skipNFTs } = req.query;

      // Normalize address
      const isSolanaAddress = !walletAddress.startsWith('0x');
      const normalizedAddress = isSolanaAddress ? walletAddress : walletAddress.toLowerCase();

      // Get or create user
      const user = await getOrCreateUser(normalizedAddress);

      // Update lastActive
      const User = mongoose.model<IUser>('User');
      await User.findOneAndUpdate(
        { walletAddress: user.walletAddress },
        { lastActive: new Date() }
      );

      // Check NFT holdings (unless skipped)
      let isNFTHolder = user.nftCollections && user.nftCollections.length > 0;
      
      // Set cache headers
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');

      // SECURITY: Only return public data
      res.json({
        success: true,
        credits: user.credits || 0,
        totalCreditsEarned: user.totalCreditsEarned || 0,
        totalCreditsSpent: user.totalCreditsSpent || 0,
        walletAddress: user.walletAddress,
        isNFTHolder,
        pricing: {
          costPerCredit: isNFTHolder ? 0.06 : 0.15,
          creditsPerUSDC: isNFTHolder ? 16.67 : 6.67
        }
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Get user by wallet error:', { error: err.message });
      res.status(500).json({
        success: false,
        error: 'Failed to get user'
      });
    }
  });

  /**
   * Check NFT holder credits
   * POST /api/nft/check-credits
   */
  router.post('/check-credits', async (req: Request, res: Response) => {
    try {
      const { walletAddress } = req.body as { walletAddress?: string };

      if (!walletAddress) {
        res.status(400).json({
          success: false,
          error: 'Wallet address required'
        });
        return;
      }

      const user = await getOrCreateUser(walletAddress);
      const isNFTHolder = user.nftCollections && user.nftCollections.length > 0;

      res.json({
        success: true,
        totalCredits: user.credits || 0,
        totalCreditsEarned: user.totalCreditsEarned || 0,
        totalCreditsSpent: user.totalCreditsSpent || 0,
        isNFTHolder,
        pricing: {
          costPerCredit: isNFTHolder ? 0.06 : 0.15,
          creditsPerUSDC: isNFTHolder ? 16.67 : 6.67
        }
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Check credits error:', { error: err.message });
      res.status(500).json({
        success: false,
        error: 'Failed to check credits'
      });
    }
  });

  /**
   * Check NFT holdings for wallet
   * POST /api/nft/check-holdings
   */
  router.post('/check-holdings', async (req: Request, res: Response) => {
    try {
      const { walletAddress } = req.body as { walletAddress?: string };

      if (!walletAddress) {
        res.status(400).json({
          success: false,
          error: 'Wallet address required'
        });
        return;
      }

      const isSolanaAddress = !walletAddress.startsWith('0x');
      const normalizedAddress = isSolanaAddress ? walletAddress : walletAddress.toLowerCase();

      logger.info('Checking NFT holdings', { walletAddress: normalizedAddress });

      // Get user's NFT collections from database
      const user = await getOrCreateUser(normalizedAddress);
      const ownedCollections = user.nftCollections || [];
      const isHolder = ownedCollections.length > 0;

      // Grant NFT holder credits if applicable
      if (isHolder && ownedCollections.length > 0) {
        const User = mongoose.model<IUser>('User');
        const targetCredits = 5;
        const currentCredits = user.credits || 0;
        const nftGrantTxHash = `NFT_GRANT_${normalizedAddress}`;

        // Check if already granted
        const hasBeenGranted = user.paymentHistory?.some(
          (p: { txHash?: string }) => p.txHash === nftGrantTxHash
        );

        if (currentCredits < targetCredits && !hasBeenGranted) {
          const creditsToGrant = targetCredits - currentCredits;
          await User.findOneAndUpdate(
            { walletAddress: user.walletAddress },
            {
              $inc: { credits: creditsToGrant, totalCreditsEarned: creditsToGrant },
              $push: {
                paymentHistory: {
                  txHash: nftGrantTxHash,
                  tokenSymbol: 'NFT',
                  amount: 0,
                  credits: creditsToGrant,
                  timestamp: new Date()
                }
              }
            }
          );
          logger.info('NFT credits granted', { walletAddress: normalizedAddress, credits: creditsToGrant });
        }
      }

      res.json({
        success: true,
        isHolder,
        collections: ownedCollections,
        pricing: {
          costPerCredit: isHolder ? 0.06 : 0.15,
          creditsPerUSDC: isHolder ? 16.67 : 6.67
        }
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Check holdings error:', { error: err.message });
      res.status(500).json({
        success: false,
        error: 'Failed to check NFT holdings'
      });
    }
  });

  /**
   * Update user settings
   * PUT /api/users/:walletAddress/settings
   * SECURITY: Requires authentication - user can only update their own settings
   */
  router.put('/:walletAddress/settings', strictAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { walletAddress } = req.params;
      const { settings } = req.body as { settings?: Record<string, unknown> };
      
      // Normalize address for comparison
      const isSolanaAddress = !walletAddress.startsWith('0x');
      const normalizedAddress = isSolanaAddress ? walletAddress : walletAddress.toLowerCase();
      
      // SECURITY: Verify user owns this wallet address
      if (!req.user || req.user.walletAddress !== normalizedAddress) {
        logger.warn('Unauthorized settings update attempt', {
          requestedWallet: normalizedAddress,
          authenticatedUser: req.user?.userId || req.user?.email
        });
        res.status(403).json({
          success: false,
          error: 'You can only update your own settings'
        });
        return;
      }
      
      const user = await getOrCreateUser(normalizedAddress);
      const User = mongoose.model<IUser>('User');
      
      await User.findOneAndUpdate(
        { walletAddress: normalizedAddress },
        { $set: { settings: { ...user.settings, ...settings } } }
      );
      
      const updatedUser = await User.findOne({ walletAddress: normalizedAddress });
      
      res.json({
        success: true,
        settings: updatedUser?.settings,
        message: 'Settings updated'
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Error updating settings:', { error: err.message });
      res.status(500).json({ success: false, error: 'Failed to update settings' });
    }
  });

  return router;
}

export default createUserRoutes;

