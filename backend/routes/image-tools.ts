/**
 * Image Tools routes
 * Face swap, inpainting, image description, and other image utilities
 */
import { Router, type Request, type Response } from 'express';
import type { RequestHandler } from 'express';
import mongoose from 'mongoose';
import logger from '../utils/logger';
import { submitToQueue, checkQueueStatus, getQueueResult, getFalApiKey, isStatusCompleted, isStatusFailed } from '../services/fal';
import { buildUserUpdateQuery } from '../services/user';
import type { IUser } from '../models/User';

// Types
interface Dependencies {
  rateLimiter?: RequestHandler;
  requireCredits: (credits: number) => RequestHandler;
}

interface AuthenticatedRequest extends Request {
  user?: IUser;
}

/**
 * Refund credits to a user after a failed generation
 */
async function refundCredits(
  user: IUser,
  credits: number,
  reason: string
): Promise<IUser | null> {
  try {
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
      logger.info('Credits refunded for failed image tool', {
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

export function createImageToolsRoutes(deps: Dependencies) {
  const router = Router();
  const { rateLimiter, requireCredits } = deps;

  const limiter = rateLimiter || ((req: Request, res: Response, next: () => void) => next());

  // ============================================================================
  // FACE SWAP
  // Swap faces between two images
  // ============================================================================

  /**
   * Face swap between images
   * POST /api/image-tools/face-swap
   * 
   * Inputs:
   * - source_image_url: Image with face to use
   * - target_image_url: Image where face will be placed
   */
  router.post('/face-swap', limiter, requireCredits(2), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ success: false, error: 'User authentication required' });
        return;
      }

      const FAL_API_KEY = getFalApiKey();
      if (!FAL_API_KEY) {
        res.status(500).json({ success: false, error: 'AI service not configured' });
        return;
      }

      const { source_image_url, target_image_url } = req.body as {
        source_image_url?: string;
        target_image_url?: string;
      };

      if (!source_image_url) {
        res.status(400).json({ success: false, error: 'source_image_url is required (face to use)' });
        return;
      }

      if (!target_image_url) {
        res.status(400).json({ success: false, error: 'target_image_url is required (destination image)' });
        return;
      }

      const creditsRequired = 2;

      // Deduct credits
      const User = mongoose.model<IUser>('User');
      const updateQuery = buildUserUpdateQuery(user);
      
      if (!updateQuery) {
        res.status(400).json({ success: false, error: 'User account required' });
        return;
      }

      const updateResult = await User.findOneAndUpdate(
        { ...updateQuery, credits: { $gte: creditsRequired } },
        { $inc: { credits: -creditsRequired, totalCreditsSpent: creditsRequired } },
        { new: true }
      );

      if (!updateResult) {
        res.status(402).json({ success: false, error: 'Insufficient credits' });
        return;
      }

      logger.info('Face swap request', { userId: user.userId });

      // Submit to face-swap model
      const result = await submitToQueue<{ request_id?: string }>('fal-ai/face-swap', {
        source_image_url,
        target_image_url
      });

      const requestId = result.request_id;

      if (!requestId) {
        await refundCredits(user, creditsRequired, 'No request ID returned');
        res.status(500).json({ success: false, error: 'Failed to submit face swap request' });
        return;
      }

      // Poll for completion
      const maxWaitTime = 60 * 1000;
      const pollInterval = 1000;
      const startTime = Date.now();

      while (Date.now() - startTime < maxWaitTime) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));

        try {
          const statusData = await checkQueueStatus<{ status?: string }>(requestId, 'fal-ai/face-swap');
          const normalizedStatus = (statusData.status || '').toUpperCase();

          if (isStatusCompleted(normalizedStatus)) {
            const resultData = await getQueueResult<{
              image?: { url?: string };
              images?: Array<{ url?: string }>;
            }>(requestId, 'fal-ai/face-swap');

            const imageUrl = resultData.image?.url || resultData.images?.[0]?.url;

            if (imageUrl) {
              logger.info('Face swap completed', { requestId, userId: user.userId });
              res.json({
                success: true,
                image_url: imageUrl,
                remainingCredits: updateResult.credits,
                creditsDeducted: creditsRequired
              });
              return;
            } else {
              await refundCredits(user, creditsRequired, 'No image URL in response');
              res.status(500).json({ success: false, error: 'No image generated' });
              return;
            }
          } else if (isStatusFailed(normalizedStatus)) {
            await refundCredits(user, creditsRequired, 'Face swap failed');
            res.status(500).json({ success: false, error: 'Face swap failed' });
            return;
          }
        } catch (pollError) {
          logger.warn('Face swap polling error', { error: (pollError as Error).message });
        }
      }

      await refundCredits(user, creditsRequired, 'Face swap timed out');
      res.status(504).json({ success: false, error: 'Face swap timed out' });
    } catch (error) {
      const err = error as Error;
      logger.error('Face swap error:', { error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ============================================================================
  // INPAINTING
  // Edit specific parts of an image using a mask
  // ============================================================================

  /**
   * Inpaint (edit) parts of an image
   * POST /api/image-tools/inpaint
   * 
   * Inputs:
   * - image_url: Original image
   * - mask_url: Mask image (white = edit, black = keep)
   * - prompt: What to generate in masked area
   */
  router.post('/inpaint', limiter, requireCredits(2), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ success: false, error: 'User authentication required' });
        return;
      }

      const FAL_API_KEY = getFalApiKey();
      if (!FAL_API_KEY) {
        res.status(500).json({ success: false, error: 'AI service not configured' });
        return;
      }

      const { 
        image_url, 
        mask_url, 
        prompt,
        negative_prompt = '',
        guidance_scale = 7.5,
        num_inference_steps = 30
      } = req.body as {
        image_url?: string;
        mask_url?: string;
        prompt?: string;
        negative_prompt?: string;
        guidance_scale?: number;
        num_inference_steps?: number;
      };

      if (!image_url) {
        res.status(400).json({ success: false, error: 'image_url is required' });
        return;
      }

      if (!mask_url) {
        res.status(400).json({ success: false, error: 'mask_url is required' });
        return;
      }

      if (!prompt || prompt.trim().length === 0) {
        res.status(400).json({ success: false, error: 'prompt is required' });
        return;
      }

      const creditsRequired = 2;

      // Deduct credits
      const User = mongoose.model<IUser>('User');
      const updateQuery = buildUserUpdateQuery(user);
      
      if (!updateQuery) {
        res.status(400).json({ success: false, error: 'User account required' });
        return;
      }

      const updateResult = await User.findOneAndUpdate(
        { ...updateQuery, credits: { $gte: creditsRequired } },
        { $inc: { credits: -creditsRequired, totalCreditsSpent: creditsRequired } },
        { new: true }
      );

      if (!updateResult) {
        res.status(402).json({ success: false, error: 'Insufficient credits' });
        return;
      }

      logger.info('Inpaint request', { 
        prompt: prompt.substring(0, 50), 
        userId: user.userId 
      });

      // Submit to FLUX inpaint
      const result = await submitToQueue<{ request_id?: string }>('fal-ai/flux-pro/v1.1/inpaint', {
        image_url,
        mask_url,
        prompt: prompt.trim(),
        negative_prompt,
        guidance_scale,
        num_inference_steps,
        strength: 0.95, // High strength for better inpainting
        output_format: 'png'
      });

      const requestId = result.request_id;

      if (!requestId) {
        await refundCredits(user, creditsRequired, 'No request ID returned');
        res.status(500).json({ success: false, error: 'Failed to submit inpaint request' });
        return;
      }

      // Poll for completion
      const maxWaitTime = 90 * 1000;
      const pollInterval = 1500;
      const startTime = Date.now();

      while (Date.now() - startTime < maxWaitTime) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));

        try {
          const statusData = await checkQueueStatus<{ status?: string }>(requestId, 'fal-ai/flux-pro/v1.1/inpaint');
          const normalizedStatus = (statusData.status || '').toUpperCase();

          if (isStatusCompleted(normalizedStatus)) {
            const resultData = await getQueueResult<{
              image?: { url?: string };
              images?: Array<{ url?: string } | string>;
            }>(requestId, 'fal-ai/flux-pro/v1.1/inpaint');

            let imageUrl: string | null = null;
            if (resultData.image?.url) {
              imageUrl = resultData.image.url;
            } else if (resultData.images && resultData.images.length > 0) {
              const firstImage = resultData.images[0];
              imageUrl = typeof firstImage === 'string' ? firstImage : firstImage.url || null;
            }

            if (imageUrl) {
              logger.info('Inpaint completed', { requestId, userId: user.userId });
              res.json({
                success: true,
                image_url: imageUrl,
                remainingCredits: updateResult.credits,
                creditsDeducted: creditsRequired
              });
              return;
            } else {
              await refundCredits(user, creditsRequired, 'No image URL in response');
              res.status(500).json({ success: false, error: 'No image generated' });
              return;
            }
          } else if (isStatusFailed(normalizedStatus)) {
            await refundCredits(user, creditsRequired, 'Inpaint failed');
            res.status(500).json({ success: false, error: 'Inpaint failed' });
            return;
          }
        } catch (pollError) {
          logger.warn('Inpaint polling error', { error: (pollError as Error).message });
        }
      }

      await refundCredits(user, creditsRequired, 'Inpaint timed out');
      res.status(504).json({ success: false, error: 'Inpaint timed out' });
    } catch (error) {
      const err = error as Error;
      logger.error('Inpaint error:', { error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ============================================================================
  // IMAGE DESCRIPTION (Image to Text)
  // Generate a text description/prompt from an image
  // ============================================================================

  /**
   * Describe an image (generate prompt)
   * POST /api/image-tools/describe
   * 
   * Inputs:
   * - image_url: Image to describe
   * - detail_level: 'brief' | 'detailed' (default: 'detailed')
   */
  router.post('/describe', limiter, requireCredits(0.5), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ success: false, error: 'User authentication required' });
        return;
      }

      const FAL_API_KEY = getFalApiKey();
      if (!FAL_API_KEY) {
        res.status(500).json({ success: false, error: 'AI service not configured' });
        return;
      }

      const { image_url, detail_level = 'detailed' } = req.body as {
        image_url?: string;
        detail_level?: 'brief' | 'detailed';
      };

      if (!image_url) {
        res.status(400).json({ success: false, error: 'image_url is required' });
        return;
      }

      const creditsRequired = 0.5;

      // Deduct credits
      const User = mongoose.model<IUser>('User');
      const updateQuery = buildUserUpdateQuery(user);
      
      if (!updateQuery) {
        res.status(400).json({ success: false, error: 'User account required' });
        return;
      }

      const updateResult = await User.findOneAndUpdate(
        { ...updateQuery, credits: { $gte: creditsRequired } },
        { $inc: { credits: -creditsRequired, totalCreditsSpent: creditsRequired } },
        { new: true }
      );

      if (!updateResult) {
        res.status(402).json({ success: false, error: 'Insufficient credits' });
        return;
      }

      logger.info('Image describe request', { userId: user.userId, detail_level });

      // Build prompt based on detail level
      const systemPrompt = detail_level === 'brief'
        ? 'You are an expert at describing images for AI image generation. Provide a brief, single-sentence description suitable as a generation prompt.'
        : 'You are an expert at describing images for AI image generation. Provide a detailed description including: subject, composition, lighting, colors, style, mood, and any notable details. Format as a comprehensive prompt suitable for regenerating this image.';

      // Use LLaVA for image understanding
      const response = await fetch('https://fal.run/fal-ai/llavav15-13b', {
        method: 'POST',
        headers: {
          'Authorization': `Key ${FAL_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          image_url,
          prompt: detail_level === 'brief' 
            ? 'Describe this image in one sentence as a generation prompt.' 
            : 'Describe this image in detail for AI image generation. Include subject, composition, lighting, colors, style, and mood.',
          max_tokens: detail_level === 'brief' ? 100 : 500
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('Image describe API error', { status: response.status, error: errorText });
        await refundCredits(user, creditsRequired, `API error: ${response.status}`);
        res.status(500).json({ success: false, error: 'Image description failed' });
        return;
      }

      const data = await response.json() as { output?: string; text?: string; response?: string };
      const description = data.output || data.text || data.response || '';

      if (!description) {
        await refundCredits(user, creditsRequired, 'No description generated');
        res.status(500).json({ success: false, error: 'No description generated' });
        return;
      }

      logger.info('Image describe completed', { userId: user.userId });

      res.json({
        success: true,
        description,
        prompt: description, // Alias for convenience
        remainingCredits: updateResult.credits,
        creditsDeducted: creditsRequired
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Image describe error:', { error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ============================================================================
  // BATCH VARIATION (Describe + Variate Flow)
  // Analyze image with vision model, then create variation prompts
  // ============================================================================

  /**
   * Batch variation - analyze image and create varied prompts for generation
   * POST /api/image-tools/batch-variate
   * 
   * Inputs:
   * - image_url: Source image to analyze and variate
   * - num_outputs: Number of output images to generate (1-100)
   * 
   * Flow:
   * 1. Use LLaVA to describe the image
   * 2. Use LLM to create varied prompts based on description
   * 3. Return the description and variation prompts for the frontend to generate
   */
  router.post('/batch-variate', limiter, requireCredits(0.5), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ success: false, error: 'User authentication required' });
        return;
      }

      const FAL_API_KEY = getFalApiKey();
      if (!FAL_API_KEY) {
        res.status(500).json({ success: false, error: 'AI service not configured' });
        return;
      }

      const { image_url, num_outputs = 4 } = req.body as {
        image_url?: string;
        num_outputs?: number;
      };

      if (!image_url) {
        res.status(400).json({ success: false, error: 'image_url is required' });
        return;
      }

      const validNumOutputs = Math.min(Math.max(1, num_outputs), 100);
      const creditsRequired = 0.5; // Just for the analysis, generation costs are separate

      // Deduct credits
      const User = mongoose.model<IUser>('User');
      const updateQuery = buildUserUpdateQuery(user);
      
      if (!updateQuery) {
        res.status(400).json({ success: false, error: 'User account required' });
        return;
      }

      const updateResult = await User.findOneAndUpdate(
        { ...updateQuery, credits: { $gte: creditsRequired } },
        { $inc: { credits: -creditsRequired, totalCreditsSpent: creditsRequired } },
        { new: true }
      );

      if (!updateResult) {
        res.status(402).json({ success: false, error: 'Insufficient credits' });
        return;
      }

      logger.info('Batch variation request', { userId: user.userId, num_outputs: validNumOutputs });

      // Step 1: Describe the image using LLaVA - focus on character details and pose
      const describeResponse = await fetch('https://fal.run/fal-ai/llavav15-13b', {
        method: 'POST',
        headers: {
          'Authorization': `Key ${FAL_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          image_url,
          prompt: `Analyze this image for AI image generation. Describe separately:
1. CHARACTER: Subject's pose, position, body language, facial expression, physical features (face shape, skin tone, eye color, etc.)
2. CLOTHING: What they're wearing, style, colors
3. HAIR: Hairstyle, color, length
4. BACKGROUND: Setting, environment, scenery
5. OBJECTS: Items, props, accessories
6. STYLE: Art style, lighting, mood, color palette

Be specific and detailed about each element.`,
          max_tokens: 600
        })
      });

      if (!describeResponse.ok) {
        const errorText = await describeResponse.text();
        logger.error('Image describe API error', { status: describeResponse.status, error: errorText });
        await refundCredits(user, creditsRequired, `API error: ${describeResponse.status}`);
        res.status(500).json({ success: false, error: 'Image analysis failed' });
        return;
      }

      const describeData = await describeResponse.json() as { output?: string; text?: string; response?: string };
      const description = describeData.output || describeData.text || describeData.response || '';

      if (!description) {
        await refundCredits(user, creditsRequired, 'No description generated');
        res.status(500).json({ success: false, error: 'Failed to analyze image' });
        return;
      }

      logger.debug('Image described for batch variation', { descriptionLength: description.length });

      // Step 2: Generate variation prompts using LLM - preserve pose/character, vary everything else
      const variationSystemPrompt = `You are an expert at creating creative variations of image prompts for AI image generation.

CRITICAL RULES - MUST PRESERVE:
- Character's POSE (body position, angle, stance)
- Character's POSITION in frame (centered, left, right, etc.)
- Character's PHYSICAL FEATURES (face shape, facial features, skin tone, body type)
- Character's EXPRESSION (facial expression, emotion)

MUST VARY (pick different combinations for each prompt):
- CLOTHING: Different outfits, styles (casual, formal, fantasy, streetwear, etc.)
- HAIR: Different hairstyles, colors, lengths
- BACKGROUND: Different settings (urban, nature, abstract, fantasy, indoor, etc.)
- OBJECTS/ACCESSORIES: Different items, props
- LIGHTING: Different lighting styles (dramatic, soft, neon, golden hour, etc.)
- COLOR PALETTE: Different color schemes
- ART STYLE: Different visual styles (photorealistic, anime, oil painting, etc.)

Given the image description, create ${validNumOutputs} unique variation prompts. Each prompt MUST:
1. Start with the exact same pose/position/character description
2. Then add completely different clothing, hair, background, objects, and style
3. Be self-contained and complete for image generation
4. Be creative and diverse - make each variation distinctly different

Respond with a JSON array of prompt strings only.

Example format:
["A woman in the same seated pose with legs crossed, wearing a red evening gown, long flowing black hair, in an elegant ballroom with chandeliers, dramatic lighting", "A woman in the same seated pose with legs crossed, wearing a cyberpunk jacket and neon accessories, short blue pixie cut, in a futuristic city at night with holographic ads, neon lighting"]`;

      const variationResponse = await fetch('https://fal.run/fal-ai/any-llm', {
        method: 'POST',
        headers: {
          'Authorization': `Key ${FAL_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'anthropic/claude-3-haiku',
          prompt: `Based on this image analysis, create ${validNumOutputs} variation prompts that KEEP the same pose and character but CHANGE clothing, hair, background, and style:\n\n${description}`,
          system_prompt: variationSystemPrompt,
          max_tokens: 3000
        })
      });

      if (!variationResponse.ok) {
        // Fallback: return the description as the prompt for all variations
        logger.warn('Variation prompt generation failed, using description as fallback');
        res.json({
          success: true,
          description,
          prompts: Array(validNumOutputs).fill(description),
          remainingCredits: updateResult.credits,
          creditsDeducted: creditsRequired
        });
        return;
      }

      const variationData = await variationResponse.json() as { output?: string; text?: string; response?: string };
      const variationOutput = variationData.output || variationData.text || variationData.response || '';

      // Parse JSON array from response
      let prompts: string[] = [];
      try {
        const jsonMatch = variationOutput.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          prompts = JSON.parse(jsonMatch[0]) as string[];
        }
      } catch {
        logger.warn('Failed to parse variation prompts, using description');
      }

      // Ensure we have the right number of prompts
      if (prompts.length < validNumOutputs) {
        // Pad with the original description
        while (prompts.length < validNumOutputs) {
          prompts.push(description);
        }
      } else if (prompts.length > validNumOutputs) {
        prompts = prompts.slice(0, validNumOutputs);
      }

      logger.info('Batch variation completed', { userId: user.userId, promptCount: prompts.length });

      res.json({
        success: true,
        description,
        prompts,
        remainingCredits: updateResult.credits,
        creditsDeducted: creditsRequired
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Batch variation error:', { error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ============================================================================
  // OUTPAINTING
  // Extend an image beyond its borders
  // ============================================================================

  /**
   * Outpaint (extend) an image
   * POST /api/image-tools/outpaint
   * 
   * Inputs:
   * - image_url: Original image
   * - prompt: Description for extended areas
   * - direction: 'left' | 'right' | 'up' | 'down' | 'all' (default: 'all')
   * - expansion_ratio: How much to expand (1.5 = 50% more, 2.0 = double)
   */
  router.post('/outpaint', limiter, requireCredits(2), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ success: false, error: 'User authentication required' });
        return;
      }

      const FAL_API_KEY = getFalApiKey();
      if (!FAL_API_KEY) {
        res.status(500).json({ success: false, error: 'AI service not configured' });
        return;
      }

      const { 
        image_url, 
        prompt,
        direction = 'all',
        expansion_ratio = 1.5
      } = req.body as {
        image_url?: string;
        prompt?: string;
        direction?: 'left' | 'right' | 'up' | 'down' | 'all';
        expansion_ratio?: number;
      };

      if (!image_url) {
        res.status(400).json({ success: false, error: 'image_url is required' });
        return;
      }

      const creditsRequired = 2;

      // Deduct credits
      const User = mongoose.model<IUser>('User');
      const updateQuery = buildUserUpdateQuery(user);
      
      if (!updateQuery) {
        res.status(400).json({ success: false, error: 'User account required' });
        return;
      }

      const updateResult = await User.findOneAndUpdate(
        { ...updateQuery, credits: { $gte: creditsRequired } },
        { $inc: { credits: -creditsRequired, totalCreditsSpent: creditsRequired } },
        { new: true }
      );

      if (!updateResult) {
        res.status(402).json({ success: false, error: 'Insufficient credits' });
        return;
      }

      logger.info('Outpaint request', { 
        direction,
        expansion_ratio,
        userId: user.userId 
      });

      // Calculate padding based on direction and ratio
      const clampedRatio = Math.max(1.1, Math.min(2.5, expansion_ratio));
      const padding = Math.round((clampedRatio - 1) * 512); // Assuming 512px base

      let left = 0, right = 0, top = 0, bottom = 0;
      if (direction === 'all') {
        left = right = top = bottom = padding;
      } else if (direction === 'left') {
        left = padding * 2;
      } else if (direction === 'right') {
        right = padding * 2;
      } else if (direction === 'up') {
        top = padding * 2;
      } else if (direction === 'down') {
        bottom = padding * 2;
      }

      // Submit to outpainting model
      const result = await submitToQueue<{ request_id?: string }>('fal-ai/flux-pro/v1.1/outpaint', {
        image_url,
        prompt: prompt || 'seamlessly extend the image, matching style and content',
        left,
        right,
        top,
        bottom,
        output_format: 'png'
      });

      const requestId = result.request_id;

      if (!requestId) {
        await refundCredits(user, creditsRequired, 'No request ID returned');
        res.status(500).json({ success: false, error: 'Failed to submit outpaint request' });
        return;
      }

      // Poll for completion
      const maxWaitTime = 90 * 1000;
      const pollInterval = 1500;
      const startTime = Date.now();

      while (Date.now() - startTime < maxWaitTime) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));

        try {
          const statusData = await checkQueueStatus<{ status?: string }>(requestId, 'fal-ai/flux-pro/v1.1/outpaint');
          const normalizedStatus = (statusData.status || '').toUpperCase();

          if (isStatusCompleted(normalizedStatus)) {
            const resultData = await getQueueResult<{
              image?: { url?: string };
              images?: Array<{ url?: string } | string>;
            }>(requestId, 'fal-ai/flux-pro/v1.1/outpaint');

            let imageUrl: string | null = null;
            if (resultData.image?.url) {
              imageUrl = resultData.image.url;
            } else if (resultData.images && resultData.images.length > 0) {
              const firstImage = resultData.images[0];
              imageUrl = typeof firstImage === 'string' ? firstImage : firstImage.url || null;
            }

            if (imageUrl) {
              logger.info('Outpaint completed', { requestId, userId: user.userId });
              res.json({
                success: true,
                image_url: imageUrl,
                remainingCredits: updateResult.credits,
                creditsDeducted: creditsRequired
              });
              return;
            } else {
              await refundCredits(user, creditsRequired, 'No image URL in response');
              res.status(500).json({ success: false, error: 'No image generated' });
              return;
            }
          } else if (isStatusFailed(normalizedStatus)) {
            await refundCredits(user, creditsRequired, 'Outpaint failed');
            res.status(500).json({ success: false, error: 'Outpaint failed' });
            return;
          }
        } catch (pollError) {
          logger.warn('Outpaint polling error', { error: (pollError as Error).message });
        }
      }

      await refundCredits(user, creditsRequired, 'Outpaint timed out');
      res.status(504).json({ success: false, error: 'Outpaint timed out' });
    } catch (error) {
      const err = error as Error;
      logger.error('Outpaint error:', { error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}

export default createImageToolsRoutes;




