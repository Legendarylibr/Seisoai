/**
 * Extract layers route
 * Extract image layers using AI
 * 
 * NOTE: Uses x402 for all payments - no legacy credit system
 */
import { Router, type Request, type Response } from 'express';
import type { RequestHandler } from 'express';
import logger from '../utils/logger';
import config from '../config/env';
import type { IUser } from '../models/User';

// Types
interface Dependencies {
  requireCredits: (credits: number) => RequestHandler;
}

interface AuthenticatedRequest extends Request {
  user?: IUser;
}

const FAL_API_KEY = config.FAL_API_KEY;

/**
 * Log generation failure (x402 handles all payments, no refunds needed)
 */
function logGenerationFailure(user: IUser | undefined, reason: string): void {
  if (user) {
    logger.warn('Generation failed (x402 payment already processed)', {
      userId: user.userId || user.walletAddress,
      reason
    });
  }
}

export function createExtractRoutes(deps: Dependencies) {
  const router = Router();
  const { requireCredits } = deps;

  /**
   * Extract layers from image
   * POST /api/extract-layers
   * Payment handled by x402 middleware
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
          // Log failure (x402 handles payments)
          logGenerationFailure(user, `Layer extraction API error: ${response.status}`);
          res.status(response.status).json({
            success: false,
            error: errorData.detail || 'Failed to extract layers'
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
          // Log failure (x402 handles payments)
          logGenerationFailure(user, 'No image returned from layer extraction');
          res.status(500).json({
            success: false,
            error: 'No image returned from layer extraction'
          });
          return;
        }

        // Return as 'images' array to match frontend expectations
        res.json({
          success: true,
          images: [imageUrl]
        });
      } catch (error) {
        const err = error as Error;
        logger.error('Extract layers error', { error: err.message });
        // Log failure (x402 handles payments)
        logGenerationFailure(req.user, `Layer extraction error: ${err.message}`);
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

