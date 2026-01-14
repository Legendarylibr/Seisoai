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
import { isValidWalletAddress } from '../utils/validation';
import { requireAuth, sendError, sendServerError } from '../utils/responses';
import type { IUser } from '../models/User';

// Constants
const PRICING = {
  COST_PER_CREDIT_DEFAULT: 0.15,
  COST_PER_CREDIT_NFT_HOLDER: 0.06,
  CREDITS_PER_USDC_DEFAULT: 6.67,
  CREDITS_PER_USDC_NFT_HOLDER: 16.67,
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
 * Get pricing based on NFT holder status
 */
function getPricing(isNFTHolder: boolean) {
  return {
    costPerCredit: isNFTHolder ? PRICING.COST_PER_CREDIT_NFT_HOLDER : PRICING.COST_PER_CREDIT_DEFAULT,
    creditsPerUSDC: isNFTHolder ? PRICING.CREDITS_PER_USDC_NFT_HOLDER : PRICING.CREDITS_PER_USDC_DEFAULT
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
      const { walletAddress, userId, email } = req.body as {
        walletAddress?: string;
        userId?: string;
        email?: string;
      };
      
      const requestedUser = await findUserByIdentifier(walletAddress || null, email || null, userId || null);
      
      if (!requestedUser) {
        res.json({ success: true, user: null });
        return;
      }

      // Check if user is requesting their own data
      const isOwnData = req.user && (
        req.user.userId === requestedUser.userId || 
        req.user.email === requestedUser.email ||
        (req.user.walletAddress && req.user.walletAddress.toLowerCase() === requestedUser.walletAddress?.toLowerCase())
      );

      if (isOwnData) {
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
            'seisoai.com',
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
   * SECURITY FIX: Now requires authentication OR returns only public data
   * - Authenticated users can only access their own wallet data
   * - Unauthenticated users get minimal public data only (no credits, no auto-creation)
   */
  router.get('/:walletAddress', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { walletAddress } = req.params;

      if (!isValidWalletAddress(walletAddress)) {
        sendError(res, 'Invalid wallet address format', 400, req.requestId);
        return;
      }

      // Normalize address
      const isSolanaAddress = !walletAddress.startsWith('0x');
      const normalizedAddress = isSolanaAddress ? walletAddress : walletAddress.toLowerCase();

      // SECURITY FIX: If authenticated, MUST be accessing own wallet
      if (req.user) {
        const normalizedUserWallet = req.user.walletAddress?.startsWith('0x') 
          ? req.user.walletAddress.toLowerCase() 
          : req.user.walletAddress;

        if (!normalizedUserWallet || normalizedUserWallet !== normalizedAddress) {
          logger.warn('SECURITY: Blocked user data access attempt for different wallet', {
            requestedWallet: normalizedAddress.substring(0, 10) + '...',
            authenticatedUserId: req.user.userId,
            path: req.path,
            ip: req.ip
          });
          sendError(res, 'You can only access your own account data', 403, req.requestId);
          return;
        }

        // Authenticated user accessing their own wallet - return full data
        const user = await getOrCreateUser(normalizedAddress);

        // Update lastActive
        const User = mongoose.model<IUser>('User');
        await User.findOneAndUpdate(
          { walletAddress: user.walletAddress },
          { lastActive: new Date() }
        );

        const isNFTHolder = user.nftCollections && user.nftCollections.length > 0;
        
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.setHeader('Pragma', 'no-cache');

        res.json({
          success: true,
          credits: user.credits || 0,
          totalCreditsEarned: user.totalCreditsEarned || 0,
          totalCreditsSpent: user.totalCreditsSpent || 0,
          walletAddress: user.walletAddress,
          isNFTHolder,
          pricing: getPricing(isNFTHolder)
        });
        return;
      }

      // SECURITY FIX: Unauthenticated - return minimal public data only
      // Do NOT auto-create users or return credit balances
      const User = mongoose.model<IUser>('User');
      const existingUser = await User.findOne({ walletAddress: normalizedAddress })
        .select('walletAddress nftCollections')
        .lean();

      if (!existingUser) {
        // User doesn't exist - return minimal response (don't create them)
        res.json({
          success: true,
          exists: false,
          walletAddress: normalizedAddress,
          pricing: getPricing(false)
        });
        return;
      }

      // Return only public data for unauthenticated requests
      const isNFTHolder = existingUser.nftCollections && existingUser.nftCollections.length > 0;
      
      res.setHeader('Cache-Control', 'public, max-age=60'); // Cache public data for 1 min

      res.json({
        success: true,
        exists: true,
        walletAddress: existingUser.walletAddress,
        isNFTHolder,
        pricing: getPricing(isNFTHolder)
        // SECURITY: Do NOT return credits, totalCreditsEarned, totalCreditsSpent for unauthed
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
        pricing: getPricing(isNFTHolder)
      });
    } catch (error) {
      logger.error('Check credits error:', { error: (error as Error).message });
      sendServerError(res, error as Error, req.requestId);
    }
  });

  /**
   * Check NFT holdings for wallet
   * POST /api/nft/check-holdings
   * SECURITY: Requires authentication and only operates on authenticated user's wallet
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

      logger.info('Checking NFT holdings', { 
        walletAddress: normalizedAddress.substring(0, 10) + '...',
        userId: req.user.userId
      });

      const user = req.user;
      const ownedCollections = user.nftCollections || [];
      const isHolder = ownedCollections.length > 0;

      // Grant NFT holder credits if applicable
      if (isHolder && ownedCollections.length > 0) {
        const User = mongoose.model<IUser>('User');
        const targetCredits = 5;
        const currentCredits = user.credits || 0;
        const nftGrantTxHash = `NFT_GRANT_${normalizedAddress}`;

        const hasBeenGranted = user.paymentHistory?.some(
          (p: { txHash?: string }) => p.txHash === nftGrantTxHash
        );

        if (currentCredits < targetCredits && !hasBeenGranted) {
          const creditsToGrant = targetCredits - currentCredits;
          await User.findOneAndUpdate(
            { userId: user.userId },
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
          logger.info('NFT credits granted', { userId: user.userId, credits: creditsToGrant });
        }
      }

      res.json({
        success: true,
        isHolder,
        collections: ownedCollections,
        pricing: getPricing(isHolder)
      });
    } catch (error) {
      logger.error('Check holdings error:', { error: (error as Error).message });
      sendServerError(res, error as Error, req.requestId);
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
      
      if (!isValidWalletAddress(walletAddress)) {
        sendError(res, 'Invalid wallet address format', 400, req.requestId);
        return;
      }
      
      // Normalize address for comparison
      const isSolanaAddress = !walletAddress.startsWith('0x');
      const normalizedAddress = isSolanaAddress ? walletAddress : walletAddress.toLowerCase();
      
      // Verify user owns this wallet address
      if (!req.user || req.user.walletAddress !== normalizedAddress) {
        logger.warn('Unauthorized settings update attempt', {
          requestedWallet: normalizedAddress,
          authenticatedUser: req.user?.userId || req.user?.email
        });
        sendError(res, 'You can only update your own settings', 403, req.requestId);
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
      logger.error('Error updating settings:', { error: (error as Error).message });
      sendServerError(res, error as Error, req.requestId);
    }
  });

  return router;
}

export default createUserRoutes;
