/**
 * Extract layers route
 * Extract image layers using AI
 */
import { Router, type Request, type Response } from 'express';
import type { RequestHandler } from 'express';
import logger from '../utils/logger';
import config from '../config/env';
import type { IUser } from '../models/User';
import { applyClawMarkup } from '../middleware/credits';
import { authenticateFlexible, requireVerifiedIdentity } from '../middleware/auth';
import {
  deductCredits,
  refundCredits,
  validateUser,
  handleCreditError,
  ServiceNotConfiguredError
} from '../services/creditTransaction';

// Types
interface Dependencies {
  requireCredits: (credits: number) => RequestHandler;
}

interface AuthenticatedRequest extends Request {
  user?: IUser;
  hasFreeAccess?: boolean;
}

const FAL_API_KEY = config.FAL_API_KEY;

export function createExtractRoutes(deps: Dependencies) {
  const router = Router();
  const { requireCredits } = deps;

  /**
   * Extract layers from image
   * POST /api/extract-layers
   * SECURITY: Requires verified identity (JWT or x402)
   */
  router.post('/extract-layers', 
    authenticateFlexible,
    requireVerifiedIdentity,
    requireCredits(1), 
    async (req: AuthenticatedRequest, res: Response) => {
      let user: IUser | undefined;
      let actualCreditsDeducted = 0;
      let remainingCredits = 0;
      
      try {
        user = req.user;
        validateUser(user);
        if (!FAL_API_KEY) throw new ServiceNotConfiguredError();

        const { image_url } = req.body as { image_url?: string; prompt?: string };

        if (!image_url) {
          res.status(400).json({ 
            success: false, 
            error: 'image_url is required' 
          });
          return;
        }

        const creditsToDeduct = applyClawMarkup(req, 1);
        const hasFreeAccess = req.hasFreeAccess || false;
        const deductResult = await deductCredits(user, creditsToDeduct, hasFreeAccess);
        remainingCredits = deductResult.remainingCredits;
        actualCreditsDeducted = deductResult.actualCreditsDeducted;

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
          await refundCredits(user, actualCreditsDeducted, `Layer extraction API error: ${response.status}`);
          res.status(response.status).json({
            success: false,
            error: errorData.detail || 'Failed to extract layers',
            creditsRefunded: actualCreditsDeducted
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
          await refundCredits(user, actualCreditsDeducted, 'No image returned from layer extraction');
          res.status(500).json({
            success: false,
            error: 'No image returned from layer extraction',
            creditsRefunded: actualCreditsDeducted
          });
          return;
        }

        // Return as 'images' array to match frontend expectations
        res.json({
          success: true,
          images: [imageUrl],
          remainingCredits,
          creditsDeducted: actualCreditsDeducted
        });
      } catch (error) {
        const err = error as Error;
        logger.error('Extract layers error', { error: err.message });
        if (handleCreditError(error, res)) return;
        // Refund credits on unexpected error
        if (user && actualCreditsDeducted > 0) {
          await refundCredits(user, actualCreditsDeducted, `Layer extraction error: ${err.message}`);
        }
        res.status(500).json({ 
          success: false, 
          error: 'Failed to extract layers',
          creditsRefunded: actualCreditsDeducted
        });
      }
    }
  );

  return router;
}

export default createExtractRoutes;

