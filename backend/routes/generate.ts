/**
 * Generation routes
 * Image, video, and music generation endpoints
 */
import { Router, type Request, type Response } from 'express';
import type { RequestHandler } from 'express';
import mongoose from 'mongoose';
import logger from '../utils/logger';
import { submitToQueue, checkQueueStatus, getQueueResult, getFalApiKey } from '../services/fal';
import { buildUserUpdateQuery } from '../services/user';
import type { IUser } from '../models/User';

// Types
interface Dependencies {
  freeImageRateLimiter?: RequestHandler;
  authenticateFlexible?: RequestHandler;
  requireCreditsForModel: () => RequestHandler;
  requireCreditsForVideo: () => RequestHandler;
  requireCredits: (credits: number) => RequestHandler;
}

interface AuthenticatedRequest extends Request {
  user?: IUser;
  creditsRequired?: number;
}

interface FalImageResponse {
  images?: Array<{ url?: string } | string>;
  image?: { url?: string } | string;
}

export function createGenerationRoutes(deps: Dependencies) {
  const router = Router();
  const { 
    freeImageRateLimiter,
    authenticateFlexible,
    requireCreditsForModel,
    requireCreditsForVideo,
    requireCredits
  } = deps;

  const freeImageLimiter = freeImageRateLimiter || ((req: Request, res: Response, next: () => void) => next());
  const flexibleAuth = authenticateFlexible || ((req: Request, res: Response, next: () => void) => next());

  /**
   * Generate image
   * POST /api/generate/image
   */
  router.post('/image', freeImageLimiter, requireCreditsForModel(), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({
          success: false,
          error: 'User authentication required'
        });
        return;
      }

      const FAL_API_KEY = getFalApiKey();
      if (!FAL_API_KEY) {
        res.status(500).json({
          success: false,
          error: 'AI service not configured'
        });
        return;
      }

      const creditsRequired = req.creditsRequired || 1;
      
      // Deduct credits atomically
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
        res.status(402).json({
          success: false,
          error: 'Insufficient credits'
        });
        return;
      }

      // Extract request parameters
      const {
        prompt,
        guidanceScale = 7.5,
        numImages = 1,
        image_url,
        image_urls,
        aspect_ratio,
        seed,
        model
      } = req.body as {
        prompt?: string;
        guidanceScale?: number;
        numImages?: number;
        image_url?: string;
        image_urls?: string[];
        aspect_ratio?: string;
        seed?: number;
        model?: string;
      };

      if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
        res.status(400).json({
          success: false,
          error: 'prompt is required and must be a non-empty string'
        });
        return;
      }

      // Determine endpoint based on image inputs and model selection
      const isMultipleImages = image_urls && Array.isArray(image_urls) && image_urls.length >= 2;
      const isSingleImage = image_url || (image_urls && image_urls.length === 1);
      const hasImages = isMultipleImages || isSingleImage;
      const isNanoBananaPro = model === 'nano-banana-pro';

      let endpoint: string;
      if (isNanoBananaPro) {
        endpoint = hasImages 
          ? 'https://fal.run/fal-ai/nano-banana-pro/edit'
          : 'https://fal.run/fal-ai/nano-banana-pro';
      } else if (isMultipleImages) {
        endpoint = 'https://fal.run/fal-ai/flux-pro/kontext/max/multi';
      } else if (isSingleImage) {
        endpoint = 'https://fal.run/fal-ai/flux-pro/kontext/max';
      } else {
        endpoint = 'https://fal.run/fal-ai/flux-pro/kontext/text-to-image';
      }

      // Build request body based on model
      let requestBody: Record<string, unknown>;
      
      if (isNanoBananaPro) {
        requestBody = {
          prompt: prompt.trim(),
          resolution: '1K'
        };
        if (isMultipleImages) {
          requestBody.image_urls = image_urls;
        } else if (isSingleImage) {
          const singleImageUrl = image_url || (image_urls && image_urls[0]);
          requestBody.image_urls = [singleImageUrl];
        }
        if (aspect_ratio) {
          requestBody.aspect_ratio = aspect_ratio;
        }
        if (!hasImages && numImages) {
          requestBody.num_images = numImages;
        }
      } else {
        // FLUX Kontext API format
        requestBody = {
          prompt: prompt.trim(),
          guidance_scale: guidanceScale,
          num_images: numImages,
          output_format: 'jpeg',
          safety_tolerance: '6',
          prompt_safety_tolerance: '6',
          enhance_prompt: true,
          seed: seed ?? Math.floor(Math.random() * 2147483647)
        };

        if (isMultipleImages) {
          requestBody.image_urls = image_urls;
        } else if (isSingleImage) {
          requestBody.image_url = image_url || (image_urls && image_urls[0]);
        }

        if (aspect_ratio) {
          requestBody.aspect_ratio = aspect_ratio;
        }
      }

      logger.debug('Calling FAL API', { endpoint, model: model || 'flux' });

      // Make FAL API call
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Key ${FAL_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('FAL API error', { status: response.status, error: errorText });
        throw new Error(`FAL API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json() as FalImageResponse;

      // Extract image URLs from response
      const images: string[] = [];
      if (result.images && Array.isArray(result.images)) {
        for (const img of result.images) {
          if (typeof img === 'string') {
            images.push(img);
          } else if (img && typeof img === 'object' && img.url) {
            images.push(img.url);
          }
        }
      } else if (result.image) {
        if (typeof result.image === 'string') {
          images.push(result.image);
        } else if (result.image.url) {
          images.push(result.image.url);
        }
      }

      res.json({
        success: true,
        images,
        remainingCredits: updateResult.credits,
        creditsDeducted: creditsRequired
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Image generation error:', { error: err.message });
      res.status(500).json({
        success: false,
        error: err.message
      });
    }
  });

  /**
   * Generate video
   * POST /api/generate/video
   */
  router.post('/video', freeImageLimiter, requireCreditsForVideo(), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({
          success: false,
          error: 'User authentication required'
        });
        return;
      }

      const minimumCredits = 2;
      
      // Deduct minimum credits
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
        res.status(402).json({
          success: false,
          error: 'Insufficient credits'
        });
        return;
      }

      // Submit to FAL queue
      const { prompt, image_url, model = 'fal-ai/kling-video/v1/standard/image-to-video', ...options } = req.body as {
        prompt?: string;
        image_url?: string;
        model?: string;
        [key: string]: unknown;
      };
      
      const result = await submitToQueue<{ request_id?: string }>(model, {
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
      const err = error as Error;
      logger.error('Video generation error:', { error: err.message });
      res.status(500).json({
        success: false,
        error: err.message
      });
    }
  });

  /**
   * Generate music
   * POST /api/generate/music
   */
  router.post('/music', freeImageLimiter, requireCredits(1), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({
          success: false,
          error: 'User authentication required'
        });
        return;
      }

      const creditsRequired = 1;
      
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
        res.status(402).json({
          success: false,
          error: 'Insufficient credits'
        });
        return;
      }

      // Submit to FAL
      const { prompt, duration = 30 } = req.body as {
        prompt?: string;
        duration?: number;
      };
      
      const result = await submitToQueue<{ request_id?: string }>('fal-ai/stable-audio', {
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
      const err = error as Error;
      logger.error('Music generation error:', { error: err.message });
      res.status(500).json({
        success: false,
        error: err.message
      });
    }
  });

  /**
   * Check generation status
   * GET /api/generate/status/:requestId
   */
  router.get('/status/:requestId', async (req: Request, res: Response) => {
    try {
      const { requestId } = req.params;
      const status = await checkQueueStatus<{ status?: string; [key: string]: unknown }>(requestId);
      
      res.json({
        success: true,
        status: status.status,
        ...status
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Status check error:', { error: err.message });
      res.status(500).json({
        success: false,
        error: err.message
      });
    }
  });

  /**
   * Get generation result
   * GET /api/generate/result/:requestId
   */
  router.get('/result/:requestId', async (req: Request, res: Response) => {
    try {
      const { requestId } = req.params;
      const result = await getQueueResult<Record<string, unknown>>(requestId);
      
      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Result fetch error:', { error: err.message });
      res.status(500).json({
        success: false,
        error: err.message
      });
    }
  });

  /**
   * Add generation to history
   * POST /api/generations/add
   */
  router.post('/add', flexibleAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
        return;
      }

      logger.debug('Generation add request received', {
        authenticatedUserId: user.userId,
        authenticatedEmail: user.email,
        authenticatedWallet: user.walletAddress,
        hasImageUrl: !!req.body?.imageUrl,
        hasVideoUrl: !!req.body?.videoUrl
      });

      const { prompt, style, imageUrl, videoUrl, requestId, status, creditsUsed } = req.body as {
        prompt?: string;
        style?: string;
        imageUrl?: string;
        videoUrl?: string;
        requestId?: string;
        status?: string;
        creditsUsed?: number;
      };

      if (!imageUrl && !videoUrl) {
        res.status(400).json({
          success: false,
          error: 'Missing required field: imageUrl or videoUrl is required'
        });
        return;
      }

      if (!user.walletAddress && !user.email) {
        res.status(400).json({
          success: false,
          error: 'User account must have wallet address or email'
        });
        return;
      }

      // Credits are already deducted in generation endpoints
      const creditsUsedForHistory = creditsUsed || 1;

      const User = mongoose.model<IUser>('User');
      const updateQuery = buildUserUpdateQuery(user);
      
      if (!updateQuery) {
        res.status(400).json({
          success: false,
          error: 'User account must have wallet address, userId, or email'
        });
        return;
      }

      // Create generation record
      const generationId = `gen_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const generation = {
        id: generationId,
        prompt: prompt || 'No prompt',
        style: style || 'No Style',
        ...(imageUrl && { imageUrl }),
        ...(videoUrl && { videoUrl }),
        ...(requestId && { requestId }),
        ...(status && { status }),
        creditsUsed: creditsUsedForHistory,
        timestamp: new Date()
      };

      // Add to user's generation history
      await User.findOneAndUpdate(
        updateQuery,
        {
          $push: {
            generationHistory: {
              $each: [generation],
              $slice: -100 // Keep last 100 generations
            }
          }
        }
      );

      logger.info('Generation added to history', {
        userId: user.userId,
        generationId,
        hasImage: !!imageUrl,
        hasVideo: !!videoUrl
      });

      res.json({
        success: true,
        generationId,
        credits: user.credits,
        totalCreditsEarned: user.totalCreditsEarned,
        totalCreditsSpent: user.totalCreditsSpent
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Add generation error:', { error: err.message });
      res.status(500).json({
        success: false,
        error: 'Failed to add generation'
      });
    }
  });

  return router;
}

export default createGenerationRoutes;

