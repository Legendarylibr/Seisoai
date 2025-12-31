/**
 * Generation routes
 * Image, video, and music generation endpoints
 */
import { Router } from 'express';
import mongoose from 'mongoose';
import logger from '../utils/logger.js';
import { submitToQueue, checkQueueStatus, getQueueResult } from '../services/fal.js';
import { buildUserUpdateQuery } from '../services/user.js';

export function createGenerationRoutes(deps) {
  const router = Router();
  const { 
    freeImageRateLimiter,
    requireCreditsForModel,
    requireCreditsForVideo,
    requireCredits
  } = deps;

  /**
   * Generate image
   * POST /api/generate/image
   */
  router.post('/image', freeImageRateLimiter, requireCreditsForModel(), async (req, res) => {
    try {
      const user = req.user;
      const creditsRequired = req.creditsRequired || 1;
      
      // Deduct credits atomically
      const User = mongoose.model('User');
      const updateQuery = buildUserUpdateQuery(user);
      
      const updateResult = await User.findOneAndUpdate(
        {
          ...updateQuery,
          credits: { $gte: creditsRequired }
        },
        {
          $inc: { credits: -creditsRequired, totalCreditsSpent: creditsRequired }
        },
        { new: true }
      );

      if (!updateResult) {
        return res.status(402).json({
          success: false,
          error: 'Insufficient credits'
        });
      }

      // Make FAL API call
      const { prompt, model = 'fal-ai/flux-pro/v1.1', ...options } = req.body;
      
      const result = await submitToQueue(model, {
        prompt,
        ...options
      });

      res.json({
        success: true,
        images: result.images || [result.image],
        remainingCredits: updateResult.credits,
        creditsDeducted: creditsRequired,
        requestId: result.request_id
      });
    } catch (error) {
      logger.error('Image generation error:', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * Generate video
   * POST /api/generate/video
   */
  router.post('/video', freeImageRateLimiter, requireCreditsForVideo(), async (req, res) => {
    try {
      const user = req.user;
      const minimumCredits = 2;
      
      // Deduct minimum credits
      const User = mongoose.model('User');
      const updateQuery = buildUserUpdateQuery(user);
      
      const updateResult = await User.findOneAndUpdate(
        {
          ...updateQuery,
          credits: { $gte: minimumCredits }
        },
        {
          $inc: { credits: -minimumCredits, totalCreditsSpent: minimumCredits }
        },
        { new: true }
      );

      if (!updateResult) {
        return res.status(402).json({
          success: false,
          error: 'Insufficient credits'
        });
      }

      // Submit to FAL queue
      const { prompt, image_url, model = 'fal-ai/kling-video/v1/standard/image-to-video', ...options } = req.body;
      
      const result = await submitToQueue(model, {
        prompt,
        image_url,
        ...options
      });

      res.json({
        success: true,
        requestId: result.request_id,
        status: 'queued',
        remainingCredits: updateResult.credits,
        creditsDeducted: minimumCredits
      });
    } catch (error) {
      logger.error('Video generation error:', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * Generate music
   * POST /api/generate/music
   */
  router.post('/music', freeImageRateLimiter, requireCredits(1), async (req, res) => {
    try {
      const user = req.user;
      const creditsRequired = 1;
      
      // Deduct credits
      const User = mongoose.model('User');
      const updateQuery = buildUserUpdateQuery(user);
      
      const updateResult = await User.findOneAndUpdate(
        {
          ...updateQuery,
          credits: { $gte: creditsRequired }
        },
        {
          $inc: { credits: -creditsRequired, totalCreditsSpent: creditsRequired }
        },
        { new: true }
      );

      if (!updateResult) {
        return res.status(402).json({
          success: false,
          error: 'Insufficient credits'
        });
      }

      // Submit to FAL
      const { prompt, duration = 30 } = req.body;
      
      const result = await submitToQueue('fal-ai/stable-audio', {
        prompt,
        duration_seconds: duration
      });

      res.json({
        success: true,
        requestId: result.request_id,
        status: 'queued',
        remainingCredits: updateResult.credits
      });
    } catch (error) {
      logger.error('Music generation error:', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * Check generation status
   * GET /api/generate/status/:requestId
   */
  router.get('/status/:requestId', async (req, res) => {
    try {
      const { requestId } = req.params;
      const status = await checkQueueStatus(requestId);
      
      res.json({
        success: true,
        status: status.status,
        ...status
      });
    } catch (error) {
      logger.error('Status check error:', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * Get generation result
   * GET /api/generate/result/:requestId
   */
  router.get('/result/:requestId', async (req, res) => {
    try {
      const { requestId } = req.params;
      const result = await getQueueResult(requestId);
      
      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      logger.error('Result fetch error:', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  return router;
}

export default createGenerationRoutes;



