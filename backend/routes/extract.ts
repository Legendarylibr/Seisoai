/**
 * Extract layers route
 * Extract image layers using AI
 */
import { Router, type Request, type Response } from 'express';
import type { RequestHandler } from 'express';
import mongoose from 'mongoose';
import logger from '../utils/logger';
import config from '../config/env';
import { buildUserUpdateQuery } from '../services/user';
import type { IUser } from '../models/User';

// Types
interface Dependencies {
  freeImageRateLimiter?: RequestHandler;
  requireCredits: (credits: number) => RequestHandler;
}

interface AuthenticatedRequest extends Request {
  user?: IUser;
}

const FAL_API_KEY = config.FAL_API_KEY;

export function createExtractRoutes(deps: Dependencies) {
  const router = Router();
  const { freeImageRateLimiter, requireCredits } = deps;

  /**
   * Extract layers from image
   * POST /api/extract-layers
   */
  router.post('/extract-layers', 
    freeImageRateLimiter || ((req: Request, res: Response, next: () => void) => next()), 
    requireCredits(1), 
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const user = req.user;
        if (!user) {
          res.status(401).json({ 
            success: false, 
            error: 'User authentication required' 
          });
          return;
        }

        const creditsToDeduct = 1;

        // Deduct credits
        const User = mongoose.model<IUser>('User');
        const updateQuery = buildUserUpdateQuery(user);
        
        if (!updateQuery) {
          res.status(400).json({ 
            success: false, 
            error: 'User account required' 
          });
          return;
        }

        const updateResult = await User.findOneAndUpdate(
          { ...updateQuery, credits: { $gte: creditsToDeduct } },
          { $inc: { credits: -creditsToDeduct, totalCreditsSpent: creditsToDeduct } },
          { new: true }
        );

        if (!updateResult) {
          res.status(400).json({
            success: false,
            error: 'Insufficient credits'
          });
          return;
        }

        const { image_url, prompt } = req.body as { image_url?: string; prompt?: string };

        if (!image_url) {
          res.status(400).json({ 
            success: false, 
            error: 'image_url is required' 
          });
          return;
        }

        if (!FAL_API_KEY) {
          res.status(503).json({
            success: false,
            error: 'AI service not configured'
          });
          return;
        }

        // Call FAL API for layer extraction
        const response = await fetch('https://queue.fal.run/fal-ai/birefnet', {
          method: 'POST',
          headers: {
            'Authorization': `Key ${FAL_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            image_url,
            model: 'General Use (Light)',
            operating_resolution: '1024x1024',
            output_format: 'png'
          })
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({})) as { detail?: string };
          res.status(response.status).json({
            success: false,
            error: errorData.detail || 'Failed to extract layers'
          });
          return;
        }

        const data = await response.json() as { image?: string };

        res.json({
          success: true,
          image: data.image,
          remainingCredits: updateResult.credits,
          creditsDeducted: creditsToDeduct
        });
      } catch (error) {
        const err = error as Error;
        logger.error('Extract layers error', { error: err.message });
        res.status(500).json({ 
          success: false, 
          error: 'Failed to extract layers' 
        });
      }
    }
  );

  return router;
}

export default createExtractRoutes;

