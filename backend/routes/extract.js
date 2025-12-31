/**
 * Extract layers route
 * Extract image layers using AI
 */
import { Router } from 'express';
import mongoose from 'mongoose';
import logger from '../utils/logger.js';
import config from '../config/env.js';
import { buildUserUpdateQuery } from '../services/user.js';

const FAL_API_KEY = config.FAL_API_KEY;

export function createExtractRoutes(deps) {
  const router = Router();
  const { freeImageRateLimiter, requireCredits } = deps;

  /**
   * Extract layers from image
   * POST /api/extract-layers
   */
  router.post('/extract-layers', 
    freeImageRateLimiter || ((req, res, next) => next()), 
    requireCredits(1), 
    async (req, res) => {
      try {
        const user = req.user;
        const creditsToDeduct = 1;

        // Deduct credits
        const User = mongoose.model('User');
        const updateQuery = buildUserUpdateQuery(user);
        
        if (!updateQuery) {
          return res.status(400).json({ 
            success: false, 
            error: 'User account required' 
          });
        }

        const updateResult = await User.findOneAndUpdate(
          { ...updateQuery, credits: { $gte: creditsToDeduct } },
          { $inc: { credits: -creditsToDeduct, totalCreditsSpent: creditsToDeduct } },
          { new: true }
        );

        if (!updateResult) {
          return res.status(400).json({
            success: false,
            error: 'Insufficient credits'
          });
        }

        const { image_url, prompt } = req.body;

        if (!image_url) {
          return res.status(400).json({ 
            success: false, 
            error: 'image_url is required' 
          });
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
          const errorData = await response.json().catch(() => ({}));
          return res.status(response.status).json({
            success: false,
            error: errorData.detail || 'Failed to extract layers'
          });
        }

        const data = await response.json();

        res.json({
          success: true,
          image: data.image,
          remainingCredits: updateResult.credits,
          creditsDeducted: creditsToDeduct
        });
      } catch (error) {
        logger.error('Extract layers error', { error: error.message });
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



