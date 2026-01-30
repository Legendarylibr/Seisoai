/**
 * Referral routes
 * Referral code generation, application, and statistics
 * 
 * Supports both JWT-based and wallet-based authentication
 */
import { Router, type Request, type Response } from 'express';
import type { RequestHandler } from 'express';
import logger from '../utils/logger';
import { sendError, sendServerError, requireAuth } from '../utils/responses';
import type { IUser } from '../models/User';
import { getOrCreateUser } from '../services/user';
import { isValidWalletAddress, normalizeWalletAddress } from '../utils/validation';
import {
  getOrCreateReferralCode,
  validateReferralCode,
  applyReferralCode,
  getReferralStats,
  getReferralLeaderboard,
  trackSocialShare,
  getShareStats
} from '../services/referralService';

// Types
interface Dependencies {
  authenticateFlexible?: RequestHandler;
  authenticateToken?: RequestHandler;
  rateLimiter?: RequestHandler;
}

interface AuthenticatedRequest extends Request {
  user?: IUser;
  requestId?: string;
}

/**
 * Wallet-based authentication middleware for referrals
 * Supports JWT auth (existing) or wallet address in X-Wallet-Address header
 * 
 * SECURITY: Validates wallet address format before accepting
 */
const createWalletAuth = (strictAuth: RequestHandler) => {
  return async (req: AuthenticatedRequest, res: Response, next: () => void) => {
    // First, try JWT auth
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return strictAuth(req, res, next);
    }

    // Fallback to wallet address from header
    const walletAddress = req.headers['x-wallet-address'] as string;
    if (walletAddress) {
      // SECURITY: Validate wallet address format (Ethereum or Solana)
      if (!isValidWalletAddress(walletAddress)) {
        logger.warn('Invalid wallet address format in X-Wallet-Address header', { 
          address: walletAddress.substring(0, 20) + '...' 
        });
        res.status(400).json({
          success: false,
          error: 'Invalid wallet address format'
        });
        return;
      }
      
      const normalized = normalizeWalletAddress(walletAddress);
      if (normalized) {
        try {
          const user = await getOrCreateUser(normalized);
          req.user = user;
          return next();
        } catch (error) {
          logger.error('Failed to authenticate with wallet', { error: (error as Error).message });
        }
      }
    }

    // No valid auth
    res.status(401).json({
      success: false,
      error: 'Authentication required. Provide JWT token or X-Wallet-Address header.'
    });
  };
};

export function createReferralRoutes(deps: Dependencies = {}) {
  const router = Router();
  const { authenticateFlexible, authenticateToken, rateLimiter } = deps;

  const authMiddleware = authenticateFlexible || ((_req: Request, _res: Response, next: () => void) => next());
  const strictAuth = authenticateToken || ((_req: Request, _res: Response, next: () => void) => next());
  const limiter = rateLimiter || ((_req: Request, _res: Response, next: () => void) => next());
  
  // Wallet-aware auth that supports both JWT and wallet address
  const walletAuth = createWalletAuth(strictAuth);

  /**
   * Normalize frontend URL to always use seisoai.com (without www)
   */
  const getNormalizedFrontendUrl = (): string => {
    const frontendUrl = process.env.FRONTEND_URL || 'https://seisoai.com';
    // Remove www. prefix if present and ensure it's https://seisoai.com
    try {
      const url = new URL(frontendUrl);
      if (url.hostname.startsWith('www.')) {
        url.hostname = url.hostname.replace(/^www\./, '');
      }
      // Ensure it's seisoai.com (not a subdomain)
      if (url.hostname === 'seisoai.com' || url.hostname.endsWith('.seisoai.com')) {
        return `https://seisoai.com`;
      }
      return url.toString();
    } catch {
      return 'https://seisoai.com';
    }
  };

  /**
   * Get or generate referral code for the current user
   * GET /api/referral/code
   * Supports JWT or wallet address auth (X-Wallet-Address header)
   */
  router.get('/code', walletAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!requireAuth(req, res)) return;
      
      const userId = req.user?.userId;
      if (!userId) {
        sendError(res, 'User ID not found', 400);
        return;
      }

      const referralCode = await getOrCreateReferralCode(userId);
      const baseUrl = getNormalizedFrontendUrl();
      
      res.json({
        success: true,
        referralCode,
        shareUrl: `${baseUrl}?ref=${referralCode}`
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to get referral code', { error: err.message });
      sendServerError(res, 'Failed to get referral code');
    }
  });

  /**
   * Validate a referral code
   * POST /api/referral/validate
   */
  router.post('/validate', limiter, async (req: Request, res: Response) => {
    try {
      const { code } = req.body as { code?: string };
      
      if (!code) {
        sendError(res, 'Referral code is required', 400);
        return;
      }

      const result = await validateReferralCode(code);
      
      res.json({
        success: true,
        valid: result.valid,
        error: result.error
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to validate referral code', { error: err.message });
      sendServerError(res, 'Failed to validate referral code');
    }
  });

  /**
   * Apply a referral code for the current user
   * POST /api/referral/apply
   * Supports JWT or wallet address auth (X-Wallet-Address header)
   */
  router.post('/apply', walletAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!requireAuth(req, res)) return;
      
      const userId = req.user?.userId;
      if (!userId) {
        sendError(res, 'User ID not found', 400);
        return;
      }

      const { code } = req.body as { code?: string };
      
      if (!code) {
        sendError(res, 'Referral code is required', 400);
        return;
      }

      // Get IP and user agent for fraud detection
      const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.ip;
      const userAgent = req.headers['user-agent'];

      const result = await applyReferralCode(userId, code, ipAddress, userAgent);
      
      if (!result.success) {
        sendError(res, result.error || 'Failed to apply referral code', 400);
        return;
      }

      res.json({
        success: true,
        bonusCredits: result.bonusCredits,
        message: `Referral applied! You received ${result.bonusCredits} bonus credits.`
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to apply referral code', { error: err.message });
      sendServerError(res, 'Failed to apply referral code');
    }
  });

  /**
   * Get referral statistics for the current user
   * GET /api/referral/stats
   * Supports JWT or wallet address auth (X-Wallet-Address header)
   */
  router.get('/stats', walletAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!requireAuth(req, res)) return;
      
      const userId = req.user?.userId;
      if (!userId) {
        sendError(res, 'User ID not found', 400);
        return;
      }

      const stats = await getReferralStats(userId);
      const shareStats = await getShareStats(userId);
      const baseUrl = getNormalizedFrontendUrl();
      
      res.json({
        success: true,
        referral: {
          code: stats.referralCode,
          shareUrl: `${baseUrl}?ref=${stats.referralCode}`,
          count: stats.referralCount,
          creditsEarned: stats.referralCreditsEarned,
          recentReferrals: stats.recentReferrals
        },
        sharing: shareStats
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to get referral stats', { error: err.message });
      sendServerError(res, 'Failed to get referral stats');
    }
  });

  /**
   * Get referral leaderboard
   * GET /api/referral/leaderboard
   * Returns anonymized leaderboard - no email or wallet addresses exposed
   */
  router.get('/leaderboard', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
      const currentUserId = req.user?.userId; // Optional - for showing "You" to current user
      
      const leaderboard = await getReferralLeaderboard(limit, currentUserId);
      
      res.json({
        success: true,
        leaderboard
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to get leaderboard', { error: err.message });
      sendServerError(res, 'Failed to get leaderboard');
    }
  });

  /**
   * Track a social share
   * POST /api/referral/share
   * Supports JWT or wallet address auth (X-Wallet-Address header)
   */
  router.post('/share', walletAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!requireAuth(req, res)) return;
      
      const userId = req.user?.userId;
      if (!userId) {
        sendError(res, 'User ID not found', 400);
        return;
      }

      const { platform, contentId } = req.body as { 
        platform?: 'twitter' | 'discord' | 'reddit' | 'facebook' | 'linkedin';
        contentId?: string;
      };
      
      if (!platform || !contentId) {
        sendError(res, 'Platform and contentId are required', 400);
        return;
      }

      const validPlatforms = ['twitter', 'discord', 'reddit', 'facebook', 'linkedin'];
      if (!validPlatforms.includes(platform)) {
        sendError(res, 'Invalid platform', 400);
        return;
      }

      const result = await trackSocialShare(userId, platform, contentId);
      
      res.json({
        success: result.success,
        creditsAwarded: result.creditsAwarded,
        message: result.creditsAwarded > 0 
          ? `You earned ${result.creditsAwarded} credit for sharing!` 
          : result.error || 'Share tracked'
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to track share', { error: err.message });
      sendServerError(res, 'Failed to track share');
    }
  });

  /**
   * Get share statistics for the current user
   * GET /api/referral/share-stats
   * Supports JWT or wallet address auth (X-Wallet-Address header)
   */
  router.get('/share-stats', walletAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!requireAuth(req, res)) return;
      
      const userId = req.user?.userId;
      if (!userId) {
        sendError(res, 'User ID not found', 400);
        return;
      }

      const stats = await getShareStats(userId);
      
      res.json({
        success: true,
        ...stats
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to get share stats', { error: err.message });
      sendServerError(res, 'Failed to get share stats');
    }
  });

  return router;
}

export default createReferralRoutes;
