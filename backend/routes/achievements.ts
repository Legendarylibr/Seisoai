/**
 * Achievement Routes
 * Endpoints for achievements, badges, and leaderboards
 */
import { Router, type Request, type Response } from 'express';
import type { RequestHandler } from 'express';
import logger from '../utils/logger';
import { sendError, sendServerError, requireAuth } from '../utils/responses';
import type { IUser } from '../models/User';
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

export function createAchievementRoutes(deps: Dependencies = {}) {
  const router = Router();
  const { authenticateFlexible, authenticateToken } = deps;

  const authMiddleware = authenticateFlexible || ((_req: Request, _res: Response, next: () => void) => next());
  const strictAuth = authenticateToken || ((_req: Request, _res: Response, next: () => void) => next());

  /**
   * Get all achievements with user's progress
   * GET /api/achievements
   */
  router.get('/', strictAuth, async (req: AuthenticatedRequest, res: Response) => {
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
   */
  router.post('/check', strictAuth, async (req: AuthenticatedRequest, res: Response) => {
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
   */
  router.post('/login', strictAuth, async (req: AuthenticatedRequest, res: Response) => {
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
