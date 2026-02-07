/**
 * User routes
 * User info, credits, gallery, NFT verification
 */
import { Router, type Request, type Response } from 'express';
import type { RequestHandler } from 'express';
import mongoose from 'mongoose';
import logger from '../utils/logger';
import { findUserByIdentifier, getOrCreateUser } from '../services/user';
import { getAllNFTs, isAlchemyConfigured } from '../services/alchemy';
import { checkNFTBalance } from '../services/blockchain';
import { isValidWalletAddress } from '../utils/validation';
import { requireAuth, sendError, sendServerError } from '../utils/responses';
import { PRODUCTION_DOMAIN } from '../config/env';
import type { IUser } from '../models/User';
import { qualifiesForDailyCredits, grantDailyCredits, isNFTHolder, isTokenHolder } from '../middleware/credits';
import { checkTokenGateAccess, getTokenGateConfig, clearTokenGateCache } from '../middleware/tokenGate';

// Constants - everyone gets the same rate
const PRICING = {
  COST_PER_CREDIT: 0.06,
  CREDITS_PER_USDC: 16.67,
} as const;

const GALLERY_MAX_ITEMS = 100;

// Types
interface Dependencies {
  authenticateFlexible?: RequestHandler;
  authenticateToken?: RequestHandler;
}

interface AuthenticatedRequest extends Request {
  user?: IUser;
  requestId?: string;
}

/**
 * Get pricing - same for everyone
 */
function getPricing() {
  return {
    costPerCredit: PRICING.COST_PER_CREDIT,
    creditsPerUSDC: PRICING.CREDITS_PER_USDC
  };
}

export function createUserRoutes(deps: Dependencies = {}) {
  const router = Router();
  const { authenticateFlexible, authenticateToken } = deps;

  const authMiddleware = authenticateFlexible || ((_req: Request, _res: Response, next: () => void) => next());
  const strictAuth = authenticateToken || ((_req: Request, _res: Response, next: () => void) => next());

  /**
   * Get user info
   * POST /api/user/info
   * SECURITY: Only returns public data unless authenticated user requests their own data
   */
  router.post('/info', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { walletAddress, userId } = req.body as {
        walletAddress?: string;
        userId?: string;
      };
      
      const requestedUser = await findUserByIdentifier(walletAddress || null, userId || null);
      
      if (!requestedUser) {
        res.json({ success: true, user: null });
        return;
      }

      // Check if user is requesting their own data
      const isOwnData = req.user && (
        req.user.userId === requestedUser.userId || 
        (req.user.walletAddress && req.user.walletAddress.toLowerCase() === requestedUser.walletAddress?.toLowerCase())
      );

      if (isOwnData) {
        // Authenticated user requesting their own data - return full info
        res.json({
          success: true,
          user: {
            userId: requestedUser.userId,
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
            isNFTHolder: requestedUser.nftCollections && requestedUser.nftCollections.length > 0
          }
        });
      }
    } catch (error) {
      logger.error('User info error:', { error: (error as Error).message });
      sendServerError(res, error as Error, req.requestId);
    }
  });

  /**
   * Get user credits
   * POST /api/user/credits OR /api/credits/get
   * SECURITY: Requires authentication and only returns authenticated user's credits
   */
  router.post('/credits', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!requireAuth(req, res)) return;

      res.json({
        success: true,
        credits: req.user.credits || 0,
        totalCreditsEarned: req.user.totalCreditsEarned || 0,
        totalCreditsSpent: req.user.totalCreditsSpent || 0
      });
    } catch (error) {
      logger.error('Get credits error:', { error: (error as Error).message });
      sendServerError(res, error as Error, req.requestId);
    }
  });

  /**
   * Legacy endpoint - GET /api/credits/get
   * SECURITY: Requires authentication and only returns authenticated user's credits
   */
  router.post('/get', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!requireAuth(req, res)) return;

      res.json({
        success: true,
        credits: req.user.credits || 0,
        totalCreditsEarned: req.user.totalCreditsEarned || 0,
        totalCreditsSpent: req.user.totalCreditsSpent || 0
      });
    } catch (error) {
      logger.error('Get credits error:', { error: (error as Error).message });
      sendServerError(res, error as Error, req.requestId);
    }
  });

  /**
   * Get user gallery
   * POST /api/user/gallery OR /api/gallery/get
   * SECURITY: Only returns gallery for authenticated user to prevent IDOR
   */
  router.post('/gallery', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!requireAuth(req, res)) return;

      const User = mongoose.model<IUser>('User');
      const userWithGallery = await User.findOne({ userId: req.user.userId })
        .select('gallery')
        .lean();

      res.json({
        success: true,
        gallery: userWithGallery?.gallery || []
      });
    } catch (error) {
      logger.error('Gallery fetch error:', { error: (error as Error).message });
      sendServerError(res, error as Error, req.requestId);
    }
  });

  /**
   * Save to gallery
   * POST /api/user/gallery/save OR /api/gallery/save
   * SECURITY: Only allows saving to authenticated user's gallery
   * SECURITY FIX: Added URL validation to prevent XSS and SSRF
   */
  router.post('/gallery/save', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!requireAuth(req, res)) return;

      const { imageUrl, prompt, model } = req.body as {
        imageUrl?: string;
        prompt?: string;
        model?: string;
      };
      
      if (!imageUrl) {
        sendError(res, 'Image URL required', 400, req.requestId);
        return;
      }

      // SECURITY FIX: Validate URL to prevent XSS (javascript:) and SSRF attacks
      const isValidGalleryUrl = (url: string): boolean => {
        // Allow data URIs for uploaded images
        if (url.startsWith('data:image/')) {
          // Validate data URI format and limit size (10MB max)
          const base64Match = url.match(/^data:image\/(png|jpeg|jpg|gif|webp);base64,/);
          if (!base64Match) return false;
          const base64Data = url.substring(url.indexOf(',') + 1);
          if (base64Data.length > 10 * 1024 * 1024 * 1.37) return false; // ~10MB in base64
          return true;
        }
        
        try {
          const parsed = new URL(url);
          
          // Only allow https (no http, javascript, data with scripts, etc.)
          if (parsed.protocol !== 'https:') {
            logger.warn('Gallery save: rejected non-https URL', { 
              protocol: parsed.protocol,
              userId: req.user.userId 
            });
            return false;
          }
          
          // Block URLs with userinfo (user:pass@host)
          if (parsed.username || parsed.password) {
            return false;
          }
          
          // Allow only trusted domains for gallery images
          const trustedDomains = [
            'fal.media',
            'fal.ai',
            'fal.run',
            PRODUCTION_DOMAIN,
            'storage.googleapis.com',
            'cloudflare-ipfs.com'
          ];
          
          const hostname = parsed.hostname.toLowerCase();
          const isTrusted = trustedDomains.some(domain => 
            hostname === domain || hostname.endsWith('.' + domain)
          );
          
          if (!isTrusted) {
            logger.warn('Gallery save: rejected untrusted domain', { 
              hostname,
              userId: req.user.userId 
            });
            return false;
          }
          
          return true;
        } catch {
          return false;
        }
      };

      if (!isValidGalleryUrl(imageUrl)) {
        sendError(res, 'Invalid image URL. Only HTTPS URLs from trusted sources are allowed.', 400, req.requestId);
        return;
      }

      // SECURITY: Sanitize prompt to prevent stored XSS
      const sanitizedPrompt = prompt 
        ? prompt.replace(/[<>]/g, '').substring(0, 2000) 
        : undefined;

      const User = mongoose.model<IUser>('User');
      await User.findOneAndUpdate(
        { userId: req.user.userId },
        {
          $push: {
            gallery: {
              $each: [{
                id: `gen-${Date.now()}`,
                imageUrl,
                prompt: sanitizedPrompt,
                style: model?.substring(0, 100), // Limit model name length
                timestamp: new Date()
              }],
              $slice: -GALLERY_MAX_ITEMS
            }
          }
        }
      );

      res.json({ success: true, message: 'Saved to gallery' });
    } catch (error) {
      logger.error('Gallery save error:', { error: (error as Error).message });
      sendServerError(res, error as Error, req.requestId);
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
        sendError(res, 'Wallet address and contract address required', 400);
        return;
      }

      const balance = await checkNFTBalance(walletAddress, contractAddress, chainId);

      res.json({
        success: true,
        hasNFT: balance > 0,
        balance
      });
    } catch (error) {
      logger.error('NFT verification error:', { error: (error as Error).message });
      sendServerError(res, error as Error);
    }
  });

  /**
   * Get user by wallet address
   * GET /api/users/:walletAddress
   * 
   * Wallet address serves as the identity - returns user data and grants daily credits for NFT holders.
   */
  router.get('/:walletAddress', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { walletAddress } = req.params;

      if (!isValidWalletAddress(walletAddress)) {
        sendError(res, 'Invalid wallet address format', 400, req.requestId);
        return;
      }

      // Normalize address
      const isSolanaAddress = !walletAddress.startsWith('0x');
      const normalizedAddress = isSolanaAddress ? walletAddress : walletAddress.toLowerCase();

      // Get or create user for this wallet
      let user = await getOrCreateUser(normalizedAddress);

      // Update lastActive
      const User = mongoose.model<IUser>('User');
      await User.findOneAndUpdate(
        { walletAddress: user.walletAddress },
        { lastActive: new Date() }
      );

      // Grant daily credits if user is NFT/Token holder
      let dailyCreditsGranted = 0;
      if (qualifiesForDailyCredits(user)) {
        const getUserModel = () => mongoose.model<IUser>('User');
        const result = await grantDailyCredits(user, getUserModel);
        if (result.granted) {
          user = result.user;
          dailyCreditsGranted = result.amount;
          logger.info('Daily credits granted on wallet fetch', { 
            userId: user.userId, 
            credits: dailyCreditsGranted 
          });
        }
      }

      const nftHolder = isNFTHolder(user);
      
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');

      res.json({
        success: true,
        credits: user.credits || 0,
        totalCreditsEarned: user.totalCreditsEarned || 0,
        totalCreditsSpent: user.totalCreditsSpent || 0,
        walletAddress: user.walletAddress,
        isNFTHolder: nftHolder,
        pricing: getPricing(),
        dailyCreditsGranted
      });
    } catch (error) {
      logger.error('Get user by wallet error:', { error: (error as Error).message });
      sendServerError(res, error as Error, req.requestId);
    }
  });

  /**
   * Check NFT holder credits
   * POST /api/nft/check-credits
   * SECURITY: Requires authentication and only returns authenticated user's credits
   */
  router.post('/check-credits', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!requireAuth(req, res)) return;

      const isNFTHolder = req.user.nftCollections && req.user.nftCollections.length > 0;

      res.json({
        success: true,
        totalCredits: req.user.credits || 0,
        totalCreditsEarned: req.user.totalCreditsEarned || 0,
        totalCreditsSpent: req.user.totalCreditsSpent || 0,
        isNFTHolder,
        pricing: getPricing()
      });
    } catch (error) {
      logger.error('Check credits error:', { error: (error as Error).message });
      sendServerError(res, error as Error, req.requestId);
    }
  });

  /**
   * Check NFT holdings for wallet and grant daily credits
   * POST /api/nft/check-holdings
   * SECURITY: Requires authentication and only operates on authenticated user's wallet
   * 
   * NFT holders get 20 credits per day, Token holders get 20 credits per day
   * Credits are added to main balance (same as paid credits)
   * 
   * This endpoint verifies on-chain NFT ownership and updates user records.
   */
  router.post('/check-holdings', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!requireAuth(req, res)) return;

      if (!req.user.walletAddress) {
        sendError(res, 'No wallet address associated with this account', 400, req.requestId);
        return;
      }

      const normalizedAddress = req.user.walletAddress.startsWith('0x') 
        ? req.user.walletAddress.toLowerCase() 
        : req.user.walletAddress;

      logger.info('Checking NFT/Token holdings', { 
        walletAddress: normalizedAddress.substring(0, 10) + '...',
        userId: req.user.userId
      });

      const User = mongoose.model<IUser>('User');
      let user = req.user;
      
      // Verify NFT ownership using Alchemy API
      // Any NFT on supported chains qualifies for daily credits
      if (!isAlchemyConfigured()) {
        logger.error('Alchemy API key not configured - cannot verify NFT holdings');
        sendError(res, 'NFT verification service not configured', 503, req.requestId);
        return;
      }

      // Get all NFTs owned by this wallet via Alchemy
      const verifiedCollections = await getAllNFTs(normalizedAddress);
      
      // Update user's nftCollections based on Alchemy results
      if (verifiedCollections.length > 0) {
        const updatedUser = await User.findOneAndUpdate(
          { userId: user.userId },
          {
            $set: {
              nftCollections: verifiedCollections.map(c => ({
                contractAddress: c.contractAddress,
                chainId: c.chainId,
                name: c.name,
                balance: c.balance,
                lastChecked: new Date()
              }))
            }
          },
          { new: true }
        );
        
        if (updatedUser) {
          user = updatedUser;
          logger.info('User NFT collections updated via Alchemy', {
            userId: user.userId,
            collectionCount: verifiedCollections.length,
            totalNFTs: verifiedCollections.reduce((sum, c) => sum + c.balance, 0)
          });
        }
      } else if ((user.nftCollections?.length || 0) > 0) {
        // User previously had NFTs but now has none - clear them
        const updatedUser = await User.findOneAndUpdate(
          { userId: user.userId },
          { $set: { nftCollections: [] } },
          { new: true }
        );
        if (updatedUser) {
          user = updatedUser;
          logger.info('User NFT collections cleared - no longer holds NFTs', {
            userId: user.userId
          });
        }
      }
      
      const ownedCollections = user.nftCollections || [];
      const tokenHoldings = user.tokenHoldings || [];
      const nftHolder = isNFTHolder(user);
      const tokenHolder = isTokenHolder(user);

      // Grant daily credits if eligible (20 per day for NFT holders, 20 for token holders)
      const getUserModel = () => mongoose.model<IUser>('User');
      let dailyCreditsGranted = 0;
      
      if (qualifiesForDailyCredits(user)) {
        const result = await grantDailyCredits(user, getUserModel);
        if (result.granted) {
          user = result.user;
          dailyCreditsGranted = result.amount;
          logger.info('Daily credits granted on holdings check', { 
            userId: user.userId, 
            credits: dailyCreditsGranted,
            isNFT: nftHolder,
            isToken: tokenHolder
          });
        }
      }

      res.json({
        success: true,
        isHolder: nftHolder || tokenHolder,
        isNFTHolder: nftHolder,
        isTokenHolder: tokenHolder,
        collections: ownedCollections,
        tokenHoldings: tokenHoldings,
        pricing: getPricing(),
        credits: user.credits,
        creditsGranted: dailyCreditsGranted, // For frontend compatibility
        dailyCreditsGranted,
        dailyCreditsLastGrant: user.dailyCreditsLastGrant
      });
    } catch (error) {
      logger.error('Check holdings error:', { error: (error as Error).message });
      sendServerError(res, error as Error, req.requestId);
    }
  });

  /**
   * Check token gate access
   * GET /api/user/token-gate/config
   * Returns token gate configuration (public endpoint)
   */
  router.get('/token-gate/config', (_req: Request, res: Response) => {
    const config = getTokenGateConfig();
    res.json({
      success: true,
      tokenGate: config
    });
  });

  /**
   * Check token gate access for a wallet
   * POST /api/user/token-gate/check
   * Checks if a wallet has access through token gate
   */
  router.post('/token-gate/check', async (req: Request, res: Response) => {
    try {
      const { walletAddress } = req.body as { walletAddress?: string };

      if (!walletAddress) {
        sendError(res, 'Wallet address required', 400);
        return;
      }

      if (!isValidWalletAddress(walletAddress)) {
        sendError(res, 'Invalid wallet address format', 400);
        return;
      }

      const status = await checkTokenGateAccess(walletAddress.toLowerCase());

      res.json({
        success: true,
        ...status
      });
    } catch (error) {
      logger.error('Token gate check error:', { error: (error as Error).message });
      sendServerError(res, error as Error);
    }
  });

  /**
   * Refresh token gate cache for a wallet
   * POST /api/user/token-gate/refresh
   * Clears cache and re-checks token gate access
   */
  router.post('/token-gate/refresh', async (req: Request, res: Response) => {
    try {
      const { walletAddress } = req.body as { walletAddress?: string };

      if (!walletAddress) {
        sendError(res, 'Wallet address required', 400);
        return;
      }

      if (!isValidWalletAddress(walletAddress)) {
        sendError(res, 'Invalid wallet address format', 400);
        return;
      }

      // Clear cache first
      clearTokenGateCache(walletAddress);

      // Re-check access
      const status = await checkTokenGateAccess(walletAddress.toLowerCase());

      res.json({
        success: true,
        refreshed: true,
        ...status
      });
    } catch (error) {
      logger.error('Token gate refresh error:', { error: (error as Error).message });
      sendServerError(res, error as Error);
    }
  });

  /**
   * Update user settings
   * PUT /api/users/:walletAddress/settings
   * 
   * Wallet address serves as identity (consistent with GET /:walletAddress).
   * Settings are user preferences - no sensitive data, so wallet ownership is implicit.
   */
  router.put('/:walletAddress/settings', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { walletAddress } = req.params;
      const { settings } = req.body as { settings?: Record<string, unknown> };
      
      if (!isValidWalletAddress(walletAddress)) {
        sendError(res, 'Invalid wallet address format', 400, req.requestId);
        return;
      }
      
      // Normalize address
      const isSolanaAddress = !walletAddress.startsWith('0x');
      const normalizedAddress = isSolanaAddress ? walletAddress : walletAddress.toLowerCase();
      
      // Get or create user for this wallet
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
      logger.error('Error updating settings:', { error: (error as Error).message });
      sendServerError(res, error as Error, req.requestId);
    }
  });

  /**
   * Complete onboarding and award bonus credits
   * POST /api/user/complete-onboarding
   * 
   * Wallet address serves as identity (consistent with other endpoints).
   */
  router.post('/complete-onboarding', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { walletAddress, userId } = req.body as { walletAddress?: string; userId?: string };
      
      // Get user from wallet address or userId
      let user: IUser | null = null;
      const User = mongoose.model<IUser>('User');
      
      if (walletAddress && isValidWalletAddress(walletAddress)) {
        const normalizedAddress = walletAddress.startsWith('0x') 
          ? walletAddress.toLowerCase() 
          : walletAddress;
        user = await User.findOne({ walletAddress: normalizedAddress });
      } else if (userId) {
        user = await User.findOne({ userId });
      } else if (req.user) {
        user = await User.findOne({ userId: req.user.userId });
      }
      
      if (!user) {
        sendError(res, 'User not found', 404, req.requestId);
        return;
      }
      
      // Check if onboarding already completed
      if (user.onboardingCompleted) {
        res.json({
          success: true,
          alreadyCompleted: true,
          creditsAwarded: 0
        });
        return;
      }
      
      // Mark onboarding as complete (no bonus credits)
      user.onboardingCompleted = true;
      user.onboardingStep = 99; // Mark as fully complete
      
      await user.save();
      
      logger.info('Onboarding completed', { userId: user.userId });
      
      res.json({
        success: true,
        creditsAwarded: 0,
        newBalance: user.credits
      });
    } catch (error) {
      logger.error('Error completing onboarding:', { error: (error as Error).message });
      sendServerError(res, error as Error, req.requestId);
    }
  });

  return router;
}

export default createUserRoutes;
