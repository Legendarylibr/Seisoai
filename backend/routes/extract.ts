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
import { applyClawMarkup } from '../middleware/credits';

// Types
interface Dependencies {
  requireCredits: (credits: number) => RequestHandler;
}

interface AuthenticatedRequest extends Request {
  user?: IUser;
}

const FAL_API_KEY = config.FAL_API_KEY;

/**
 * Refund credits to a user after a failed generation
 */
async function refundCredits(
  user: IUser,
  credits: number,
  reason: string
): Promise<IUser | null> {
  try {
    // Validate credits is a valid positive number
    if (!Number.isFinite(credits) || credits <= 0) {
      logger.error('Cannot refund invalid credits amount', { credits, reason, userId: user.userId });
      return null;
    }
    
    const User = mongoose.model<IUser>('User');
    const updateQuery = buildUserUpdateQuery(user);
    
    if (!updateQuery) {
      logger.error('Cannot refund credits: no valid user identifier', { userId: user.userId });
      return null;
    }

    const updatedUser = await User.findOneAndUpdate(
      updateQuery,
      {
        $inc: { credits: credits, totalCreditsSpent: -credits }
      },
      { new: true }
    );

    if (updatedUser) {
      logger.info('Credits refunded for failed layer extraction', {
        userId: user.userId || user.email || user.walletAddress,
        creditsRefunded: credits,
        newBalance: updatedUser.credits,
        reason
      });
    }

    return updatedUser;
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to refund credits', {
      userId: user.userId,
      credits,
      reason,
      error: err.message
    });
    return null;
  }
}

export function createExtractRoutes(deps: Dependencies) {
  const router = Router();
  const { requireCredits } = deps;

  /**
   * Extract layers from image
   * POST /api/extract-layers
   */
  router.post('/extract-layers', 
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

        const creditsToDeduct = applyClawMarkup(req, 1);

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

        const { image_url } = req.body as { image_url?: string; prompt?: string };

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
          // Refund credits on API failure
          await refundCredits(user, creditsToDeduct, `Layer extraction API error: ${response.status}`);
          res.status(response.status).json({
            success: false,
            error: errorData.detail || 'Failed to extract layers',
            creditsRefunded: creditsToDeduct
          });
          return;
        }

        const data = await response.json() as { image?: { url?: string } | string };
        
        // Extract image URL from response (can be string or object with url)
        let imageUrl: string | undefined;
        if (typeof data.image === 'string') {
          imageUrl = data.image;
        } else if (data.image?.url) {
          imageUrl = data.image.url;
        }

        if (!imageUrl) {
          // Refund credits if no image returned
          await refundCredits(user, creditsToDeduct, 'No image returned from layer extraction');
          res.status(500).json({
            success: false,
            error: 'No image returned from layer extraction',
            creditsRefunded: creditsToDeduct
          });
          return;
        }

        // Return as 'images' array to match frontend expectations
        res.json({
          success: true,
          images: [imageUrl],
          remainingCredits: updateResult.credits,
          creditsDeducted: creditsToDeduct
        });
      } catch (error) {
        const err = error as Error;
        logger.error('Extract layers error', { error: err.message });
        // Refund credits on unexpected error
        const user = req.user;
        const creditsToRefund = applyClawMarkup(req, 1);
        if (user) {
          await refundCredits(user, creditsToRefund, `Layer extraction error: ${err.message}`);
        }
        res.status(500).json({ 
          success: false, 
          error: 'Failed to extract layers',
          creditsRefunded: user ? creditsToRefund : 0
        });
      }
    }
  );

  return router;
}

export default createExtractRoutes;

