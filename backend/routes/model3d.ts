/**
 * 3D Model Generation Routes
 * Uses fal.ai Hunyuan3D V3 for Image-to-3D conversion
 * https://fal.ai/models/fal-ai/hunyuan3d-v3/image-to-3d/api
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
  requireCredits: (credits: number) => RequestHandler;
}

interface AuthenticatedRequest extends Request {
  user?: IUser;
  creditsRequired?: number;
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
      logger.info('Credits refunded for failed 3D generation', {
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

export function createModel3dRoutes(deps: Dependencies) {
  const router = Router();
  const { 
    freeImageRateLimiter,
    requireCredits
  } = deps;

  const freeImageLimiter = freeImageRateLimiter || ((req: Request, res: Response, next: () => void) => next());

  /**
   * Generate 3D model from image
   * POST /api/model3d/generate
   * Uses Hunyuan3D V3 Image-to-3D
   */
  router.post('/generate', freeImageLimiter, requireCredits(3), async (req: AuthenticatedRequest, res: Response) => {
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

      // Extract request parameters
      const {
        input_image_url,
        back_image_url,
        left_image_url,
        right_image_url,
        enable_pbr = true,
        face_count = 500000,
        generate_type = 'Normal',
        polygon_type = 'triangle'
      } = req.body as {
        input_image_url?: string;
        back_image_url?: string;
        left_image_url?: string;
        right_image_url?: string;
        enable_pbr?: boolean;
        face_count?: number;
        generate_type?: 'Normal' | 'LowPoly' | 'Geometry';
        polygon_type?: 'triangle' | 'quadrilateral';
      };

      if (!input_image_url) {
        res.status(400).json({
          success: false,
          error: 'input_image_url is required'
        });
        return;
      }

      // Credits based on settings
      // Normal/LowPoly: 3 credits, Geometry (no texture): 2 credits
      const creditsRequired = generate_type === 'Geometry' ? 2 : 3;

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
        const currentUser = await User.findOne(updateQuery);
        const currentCredits = currentUser?.credits || 0;
        res.status(402).json({
          success: false,
          error: `Insufficient credits. You have ${currentCredits} credit${currentCredits !== 1 ? 's' : ''} but need ${creditsRequired}.`
        });
        return;
      }

      logger.info('3D model generation request', {
        userId: user.userId,
        generate_type,
        face_count,
        enable_pbr,
        hasBackImage: !!back_image_url,
        hasLeftImage: !!left_image_url,
        hasRightImage: !!right_image_url,
        creditsRequired
      });

      // Build request body for Hunyuan3D V3
      const requestBody: Record<string, unknown> = {
        input_image_url,
        face_count: Math.max(40000, Math.min(1500000, face_count)),
        generate_type,
        polygon_type
      };

      // Add optional parameters
      if (enable_pbr && generate_type !== 'Geometry') {
        requestBody.enable_pbr = enable_pbr;
      }
      if (back_image_url) {
        requestBody.back_image_url = back_image_url;
      }
      if (left_image_url) {
        requestBody.left_image_url = left_image_url;
      }
      if (right_image_url) {
        requestBody.right_image_url = right_image_url;
      }

      // Submit to FAL queue
      const queueEndpoint = 'https://queue.fal.run/fal-ai/hunyuan3d-v3/image-to-3d';
      
      const submitResponse = await fetch(queueEndpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Key ${FAL_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!submitResponse.ok) {
        const errorText = await submitResponse.text();
        logger.error('Hunyuan3D submit error', { status: submitResponse.status, error: errorText });
        await refundCredits(user, creditsRequired, `Hunyuan3D submit error: ${submitResponse.status}`);
        res.status(500).json({
          success: false,
          error: `Failed to start 3D generation: ${submitResponse.status}`,
          creditsRefunded: creditsRequired
        });
        return;
      }

      const submitData = await submitResponse.json() as { request_id?: string };
      const requestId = submitData.request_id;

      if (!requestId) {
        logger.error('No request_id from Hunyuan3D', { submitData });
        await refundCredits(user, creditsRequired, 'No request_id from Hunyuan3D');
        res.status(500).json({
          success: false,
          error: 'Failed to submit 3D generation request',
          creditsRefunded: creditsRequired
        });
        return;
      }

      logger.info('3D model generation submitted', { requestId });

      // Poll for completion
      const modelPath = 'fal-ai/hunyuan3d-v3/image-to-3d';
      const maxWaitTime = 5 * 60 * 1000; // 5 minutes max
      const pollInterval = 3000; // Poll every 3 seconds
      const startTime = Date.now();

      while (Date.now() - startTime < maxWaitTime) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));

        const statusResponse = await fetch(
          `https://queue.fal.run/${modelPath}/requests/${requestId}/status`,
          {
            headers: { 'Authorization': `Key ${FAL_API_KEY}` }
          }
        );

        if (!statusResponse.ok) {
          continue;
        }

        const statusData = await statusResponse.json() as { 
          status?: string;
          model_glb?: { url?: string };
          thumbnail?: { url?: string };
          model_urls?: { glb?: { url?: string }; obj?: { url?: string }; fbx?: { url?: string }; usdz?: { url?: string } };
        };
        
        const normalizedStatus = (statusData.status || '').toUpperCase();

        logger.debug('3D model polling', { 
          requestId, 
          status: normalizedStatus,
          elapsed: Math.round((Date.now() - startTime) / 1000) + 's'
        });

        // Check if model in status response
        if (statusData.model_glb?.url || statusData.model_urls?.glb?.url) {
          logger.info('3D model completed (from status)', { requestId });
          res.json({
            success: true,
            model_glb: statusData.model_glb,
            thumbnail: statusData.thumbnail,
            model_urls: statusData.model_urls,
            remainingCredits: updateResult.credits,
            creditsDeducted: creditsRequired
          });
          return;
        }

        if (normalizedStatus === 'COMPLETED') {
          // Fetch the result
          const resultResponse = await fetch(
            `https://queue.fal.run/${modelPath}/requests/${requestId}`,
            {
              headers: { 'Authorization': `Key ${FAL_API_KEY}` }
            }
          );

          if (!resultResponse.ok) {
            await refundCredits(user, creditsRequired, 'Failed to fetch 3D result');
            res.status(500).json({
              success: false,
              error: 'Failed to fetch 3D model result',
              creditsRefunded: creditsRequired
            });
            return;
          }

          const resultData = await resultResponse.json() as {
            model_glb?: { url?: string; file_size?: number; file_name?: string; content_type?: string };
            thumbnail?: { url?: string };
            model_urls?: { 
              glb?: { url?: string }; 
              obj?: { url?: string }; 
              fbx?: { url?: string }; 
              usdz?: { url?: string } 
            };
            seed?: number;
          };

          if (resultData.model_glb?.url || resultData.model_urls?.glb?.url) {
            logger.info('3D model generation completed', { 
              requestId, 
              hasGlb: !!resultData.model_glb?.url,
              hasObj: !!resultData.model_urls?.obj?.url
            });
            
            res.json({
              success: true,
              model_glb: resultData.model_glb,
              thumbnail: resultData.thumbnail,
              model_urls: resultData.model_urls,
              seed: resultData.seed,
              remainingCredits: updateResult.credits,
              creditsDeducted: creditsRequired
            });
            return;
          }

          logger.error('No model URL in 3D result', { resultData: JSON.stringify(resultData).substring(0, 500) });
          await refundCredits(user, creditsRequired, 'No model in 3D result');
          res.status(500).json({
            success: false,
            error: '3D generation completed but no model URL found',
            creditsRefunded: creditsRequired
          });
          return;
        }

        if (normalizedStatus === 'FAILED' || normalizedStatus === 'ERROR') {
          logger.error('3D model generation failed', { requestId, status: normalizedStatus });
          await refundCredits(user, creditsRequired, `3D generation failed: ${normalizedStatus}`);
          res.status(500).json({
            success: false,
            error: '3D model generation failed',
            creditsRefunded: creditsRequired
          });
          return;
        }
      }

      // Timeout
      logger.error('3D model generation timeout', { requestId });
      await refundCredits(user, creditsRequired, '3D generation timeout');
      res.status(504).json({
        success: false,
        error: '3D model generation timed out. Please try again.',
        creditsRefunded: creditsRequired
      });

    } catch (error) {
      const err = error as Error;
      logger.error('3D model generation error:', { error: err.message });
      const user = req.user;
      const creditsToRefund = 3;
      if (user) {
        await refundCredits(user, creditsToRefund, `3D generation error: ${err.message}`);
      }
      res.status(500).json({
        success: false,
        error: err.message,
        creditsRefunded: user ? creditsToRefund : 0
      });
    }
  });

  /**
   * Get generation status
   * GET /api/model3d/status/:requestId
   */
  router.get('/status/:requestId', async (req: Request, res: Response) => {
    try {
      const { requestId } = req.params;
      const FAL_API_KEY = getFalApiKey();
      
      if (!FAL_API_KEY) {
        res.status(500).json({ success: false, error: 'AI service not configured' });
        return;
      }

      const modelPath = 'fal-ai/hunyuan3d-v3/image-to-3d';
      const statusResponse = await fetch(
        `https://queue.fal.run/${modelPath}/requests/${requestId}/status`,
        {
          headers: { 'Authorization': `Key ${FAL_API_KEY}` }
        }
      );

      if (!statusResponse.ok) {
        res.status(statusResponse.status).json({ 
          success: false, 
          error: `Status check failed: ${statusResponse.status}` 
        });
        return;
      }

      const statusData = await statusResponse.json();
      res.json({ success: true, ...statusData });
    } catch (error) {
      const err = error as Error;
      logger.error('3D status check error:', { error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}

export default createModel3dRoutes;


