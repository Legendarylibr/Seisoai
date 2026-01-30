/**
 * Achievement Routes
 * Endpoints for achievements, badges, and leaderboards
 * 
 * Supports both JWT-based and wallet-based authentication
 */
import { Router, type Request, type Response } from 'express';
import type { RequestHandler } from 'express';
import mongoose from 'mongoose';
import logger from '../utils/logger';
import { sendError, sendServerError, requireAuth } from '../utils/responses';
import type { IUser } from '../models/User';
import { getOrCreateUser } from '../services/user';
import { isValidWalletAddress, normalizeWalletAddress } from '../utils/validation';
import {
  getUserAchievements,
  checkAndUnlockAchievements,
  updateLoginStreak,
  getAchievementLeaderboard,
  ACHIEVEMENTS
} from '../services/achievementService';

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
 * Wallet-based authentication middleware for achievements
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

export function createAchievementRoutes(deps: Dependencies = {}) {
  const router = Router();
  const { authenticateFlexible, authenticateToken } = deps;

  const authMiddleware = authenticateFlexible || ((_req: Request, _res: Response, next: () => void) => next());
  const strictAuth = authenticateToken || ((_req: Request, _res: Response, next: () => void) => next());
  
  // Wallet-aware auth that supports both JWT and wallet address
  const walletAuth = createWalletAuth(strictAuth);

  /**
   * Get all achievements with user's progress
   * GET /api/achievements
   * Supports JWT or wallet address auth (X-Wallet-Address header)
   */
  router.get('/', walletAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!requireAuth(req, res)) return;
      
      const userId = req.user?.userId;
      if (!userId) {
        sendError(res, 'User ID not found', 400);
        return;
      }

      const { achievements, totalUnlocked, totalCreditsEarned } = await getUserAchievements(userId);
      
      // Group by category
      const byCategory = {
        generation: achievements.filter(a => a.category === 'generation'),
        social: achievements.filter(a => a.category === 'social'),
        streak: achievements.filter(a => a.category === 'streak'),
        milestone: achievements.filter(a => a.category === 'milestone')
      };
      
      res.json({
        success: true,
        achievements,
        byCategory,
        stats: {
          totalAchievements: ACHIEVEMENTS.length,
          totalUnlocked,
          totalCreditsEarned,
          progress: Math.round((totalUnlocked / ACHIEVEMENTS.length) * 100)
        }
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to get achievements', { error: err.message });
      sendServerError(res, 'Failed to get achievements');
    }
  });

  /**
   * Check for new achievements and unlock them
   * POST /api/achievements/check
   * Supports JWT or wallet address auth (X-Wallet-Address header)
   */
  router.post('/check', walletAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!requireAuth(req, res)) return;
      
      const userId = req.user?.userId;
      if (!userId) {
        sendError(res, 'User ID not found', 400);
        return;
      }

      const { newlyUnlocked, creditsAwarded } = await checkAndUnlockAchievements(userId);
      
      res.json({
        success: true,
        newlyUnlocked,
        creditsAwarded,
        message: newlyUnlocked.length > 0 
          ? `Unlocked ${newlyUnlocked.length} achievement(s) and earned ${creditsAwarded} credits!`
          : 'No new achievements unlocked'
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to check achievements', { error: err.message });
      sendServerError(res, 'Failed to check achievements');
    }
  });

  /**
   * Record daily login and update streak
   * POST /api/achievements/login
   * Supports JWT or wallet address auth (X-Wallet-Address header)
   */
  router.post('/login', walletAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!requireAuth(req, res)) return;
      
      const userId = req.user?.userId;
      if (!userId) {
        sendError(res, 'User ID not found', 400);
        return;
      }

      const { streak, creditsAwarded, newlyUnlocked } = await updateLoginStreak(userId);
      
      res.json({
        success: true,
        streak,
        creditsAwarded,
        newlyUnlocked,
        message: creditsAwarded > 0 
          ? `Daily login: +${creditsAwarded} credits! Streak: ${streak} days`
          : `Welcome back! Streak: ${streak} days`
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to update login streak', { error: err.message });
      sendServerError(res, 'Failed to update login streak');
    }
  });

  /**
   * Get achievement leaderboard
   * GET /api/achievements/leaderboard
   */
  router.get('/leaderboard', authMiddleware, async (req: Request, res: Response) => {
    try {
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 10));
      
      const leaderboard = await getAchievementLeaderboard(limit);
      
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
   * Get all available achievements (public)
   * GET /api/achievements/all
   */
  router.get('/all', (_req: Request, res: Response) => {
    res.json({
      success: true,
      achievements: ACHIEVEMENTS,
      categories: {
        generation: ACHIEVEMENTS.filter(a => a.category === 'generation'),
        social: ACHIEVEMENTS.filter(a => a.category === 'social'),
        streak: ACHIEVEMENTS.filter(a => a.category === 'streak'),
        milestone: ACHIEVEMENTS.filter(a => a.category === 'milestone')
      }
    });
  });

  return router;
}

export default createAchievementRoutes;
