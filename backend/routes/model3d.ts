/**
 * 3D Model Generation Routes
 * Uses fal.ai Hunyuan3D V3 for Image-to-3D conversion
 * https://fal.ai/models/fal-ai/hunyuan3d-v3/image-to-3d/api
 */
import { Router, type Request, type Response } from 'express';
import type { RequestHandler } from 'express';
import mongoose from 'mongoose';
import logger from '../utils/logger';
import { getFalApiKey, isStatusCompleted } from '../services/fal';
import { buildUserUpdateQuery } from '../services/user';
import { CREDITS } from '../config/constants';
import type { IUser } from '../models/User';
import { encrypt, isEncryptionConfigured } from '../utils/encryption';

// Types
interface Dependencies {
  authenticateFlexible?: RequestHandler;
  requireCredits: (credits: number) => RequestHandler;
}

interface AuthenticatedRequest extends Request {
  user?: IUser;
  creditsRequired?: number;
}

/**
 * Update gallery item with 3D generation result
 */
async function updateGalleryItemWithResult(
  updateQuery: { walletAddress?: string; userId?: string; emailHash?: string },
  generationId: string,
  result: {
    model_glb?: { url?: string };
    glb?: { url?: string };
    thumbnail?: { url?: string };
    model_urls?: { 
      glb?: { url?: string }; 
      obj?: { url?: string }; 
      fbx?: { url?: string };
      usdz?: { url?: string };
    };
  },
  fallbackThumbnail?: string
): Promise<void> {
  try {
    const User = mongoose.model<IUser>('User');
    const glbUrl = result.model_glb?.url || result.glb?.url || result.model_urls?.glb?.url;
    const objUrl = result.model_urls?.obj?.url;
    const fbxUrl = result.model_urls?.fbx?.url;
    const thumbnailUrl = result.thumbnail?.url || fallbackThumbnail;

    if (glbUrl) {
      await User.findOneAndUpdate(
        {
          ...updateQuery,
          'gallery.id': generationId
        },
        {
          $set: {
            'gallery.$.glbUrl': glbUrl,
            'gallery.$.objUrl': objUrl,
            'gallery.$.fbxUrl': fbxUrl,
            'gallery.$.thumbnailUrl': thumbnailUrl,
            'gallery.$.imageUrl': thumbnailUrl, // Update imageUrl to thumbnail
            'gallery.$.status': 'completed'
          }
        }
      );
      logger.info('3D gallery item updated with result', { 
        generationId,
        hasGlb: !!glbUrl,
        hasObj: !!objUrl,
        hasFbx: !!fbxUrl
      });
    }
  } catch (updateError) {
    const err = updateError as Error;
    logger.error('Failed to update 3D gallery item', { 
      error: err.message,
      generationId 
    });
  }
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
    authenticateFlexible
    // requireCredits - not used, we use dynamic requireCreditsFor3d instead
  } = deps;

  const flexibleAuth = authenticateFlexible || ((_req: Request, _res: Response, next: () => void) => next());

  /**
   * Dynamic credits middleware for 3D generation
   * Checks credits based on generate_type from request body
   */
  const requireCreditsFor3d = async (req: AuthenticatedRequest, res: Response, next: () => void): Promise<void> => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required. Please sign in to continue.'
        });
        return;
      }

      // Determine credit cost based on generate_type
      const generateType = req.body?.generate_type || 'Normal';
      const creditsRequired = generateType === 'Geometry' 
        ? CREDITS.MODEL_3D_GEOMETRY 
        : generateType === 'LowPoly' 
          ? CREDITS.MODEL_3D_LOWPOLY 
          : CREDITS.MODEL_3D_NORMAL;

      if ((user.credits || 0) < creditsRequired) {
        res.status(402).json({
          success: false,
          error: `Insufficient credits. You have ${user.credits || 0} credits but need ${creditsRequired}.`,
          creditsRequired,
          creditsAvailable: user.credits || 0
        });
        return;
      }

      next();
    } catch (error) {
      const err = error as Error;
      logger.error('Error in requireCreditsFor3d middleware:', err);
      res.status(500).json({
        success: false,
        error: 'Failed to check credits'
      });
    }
  };

  /**
   * Generate 3D model from image
   * POST /api/model3d/generate
   * Uses Hunyuan3D V3 Image-to-3D
   */
  router.post('/generate', flexibleAuth, requireCreditsFor3d, async (req: AuthenticatedRequest, res: Response) => {
    // Set headers to prevent connection timeout during long-running 3D generation
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering if behind nginx
    
    // Entry point logging - helps diagnose if requests reach this route
    logger.info('3D model generation request received', {
      hasUser: !!req.user,
      userId: req.user?.userId || req.user?.email || req.user?.walletAddress,
      hasInputImage: !!req.body?.input_image_url,
      generateType: req.body?.generate_type
    });

    try {
      const user = req.user;
      if (!user) {
        logger.warn('3D generation rejected: no user', { body: Object.keys(req.body || {}) });
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

      // Credits based on generate_type (from centralized constants)
      const creditsRequired = generate_type === 'Geometry' 
        ? CREDITS.MODEL_3D_GEOMETRY 
        : generate_type === 'LowPoly' 
          ? CREDITS.MODEL_3D_LOWPOLY 
          : CREDITS.MODEL_3D_NORMAL;

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

      // Build request body for Hunyuan3D V3 (fal-ai/hunyuan3d-v3/image-to-3d)
      // NOTE: input_image_url should be optimized before reaching this endpoint
      // The frontend ensures images are optimized via image-to-image generation
      // before calling this route to ensure best results for 3D conversion
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

      // Create gallery item immediately so user can access it even if they disconnect
      const generationId = `3d-${requestId}-${Date.now()}`;
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now
      
      // Encrypt prompt if encryption is configured
      let encryptedPrompt = input_image_url; // Use image URL as prompt placeholder, or could use a description
      const promptText = `3D Model Generation - ${generate_type}`;
      if (isEncryptionConfigured()) {
        encryptedPrompt = encrypt(promptText);
      } else {
        encryptedPrompt = promptText;
      }

      const galleryItem = {
        id: generationId,
        imageUrl: input_image_url, // Use input image as thumbnail
        prompt: encryptedPrompt,
        style: `3D-${generate_type}`,
        timestamp: new Date(),
        modelType: '3d' as const,
        glbUrl: undefined,
        objUrl: undefined,
        fbxUrl: undefined,
        thumbnailUrl: input_image_url,
        expiresAt: expiresAt,
        status: 'processing' as const,
        requestId: requestId,
        creditsUsed: creditsRequired
      };

      // Save to gallery immediately
      try {
        const User = mongoose.model<IUser>('User');
        await User.findOneAndUpdate(
          updateQuery,
          {
            $push: {
              gallery: {
                $each: [galleryItem],
                $slice: -100 // Keep last 100 items
              }
            }
          }
        );
        logger.info('3D generation added to gallery', { 
          userId: user.userId || user.email || user.walletAddress,
          generationId,
          requestId,
          expiresAt 
        });
      } catch (galleryError) {
        const err = galleryError as Error;
        logger.error('Failed to add 3D generation to gallery', { 
          error: err.message,
          requestId 
        });
        // Don't fail the request if gallery save fails
      }

      // CLOUDFLARE FIX: Return immediately with 202 Accepted
      // Frontend will poll the status endpoint separately
      // This avoids Cloudflare's 100-second timeout for long-running requests
      logger.info('3D generation submitted, returning 202 for frontend polling', { 
        requestId, 
        generationId,
        note: 'Frontend will poll /api/model3d/status/:requestId'
      });
      
      res.status(202).json({
        success: true, // Mark as success since submission worked
        requestId: requestId,
        generationId: generationId,
        statusEndpoint: `/api/model3d/status/${requestId}`,
        message: '3D model generation started. Polling for completion...',
        remainingCredits: updateResult.credits,
        creditsDeducted: creditsRequired
      });

    } catch (error) {
      const err = error as Error;
      logger.error('3D model generation error:', { error: err.message });
      const user = req.user;
      // Determine credits to refund based on generate_type from request
      const genType = req.body?.generate_type || 'Normal';
      const creditsToRefund = genType === 'Geometry' 
        ? CREDITS.MODEL_3D_GEOMETRY 
        : genType === 'LowPoly' 
          ? CREDITS.MODEL_3D_LOWPOLY 
          : CREDITS.MODEL_3D_NORMAL;
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
   * Also updates gallery item if generation is complete
   */
  router.get('/status/:requestId', flexibleAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { requestId } = req.params;
      const FAL_API_KEY = getFalApiKey();
      
      if (!FAL_API_KEY) {
        res.status(500).json({ success: false, error: 'AI service not configured' });
        return;
      }

      const modelPath = 'fal-ai/hunyuan3d-v3/image-to-3d';
      
      // Check status from FAL
      const statusResponse = await fetch(
        `https://queue.fal.run/${modelPath}/requests/${requestId}/status`,
        { headers: { 'Authorization': `Key ${FAL_API_KEY}` } }
      );

      if (!statusResponse.ok) {
        res.status(statusResponse.status).json({ 
          success: false, 
          error: `Status check failed: ${statusResponse.status}` 
        });
        return;
      }

      const rawStatusData = await statusResponse.json() as { 
        status?: string;
        response_url?: string;
        glb?: { url?: string };
        model_glb?: { url?: string };
        thumbnail?: { url?: string };
        model_urls?: { glb?: { url?: string }; obj?: { url?: string }; fbx?: { url?: string } };
      };

      const normalizedStatus = (rawStatusData.status || '').toUpperCase();
      let statusResult: Record<string, unknown> = rawStatusData;
      let glbUrl = rawStatusData.model_glb?.url || rawStatusData.glb?.url || rawStatusData.model_urls?.glb?.url;
      
      // If completed but no model URL, fetch from result endpoint
      if (isStatusCompleted(normalizedStatus) && !glbUrl) {
        logger.info('Status completed, fetching result', { requestId });
        
        try {
          const resultUrl = rawStatusData.response_url || 
            `https://queue.fal.run/${modelPath}/requests/${requestId}`;
          
          const resultResponse = await fetch(resultUrl, {
            headers: { 'Authorization': `Key ${FAL_API_KEY}` }
          });
          
          if (resultResponse.ok) {
            const rawResult = await resultResponse.json() as Record<string, unknown>;
            
            // FAL may nest result under 'data' or 'output'
            const resultData = (rawResult.data || rawResult.output || rawResult) as Record<string, unknown>;
            statusResult = resultData;
            
            // Extract GLB URL from various possible locations
            // Hunyuan3D returns: glb.url, model_glb.url, or model_urls.glb.url
            const glbData = resultData.glb || resultData.model_glb || 
              (resultData.model_urls as Record<string, unknown>)?.glb;
            glbUrl = (glbData as { url?: string })?.url;
            
            // Also check top level if nested didn't work
            if (!glbUrl) {
              const topGlb = rawResult.glb || rawResult.model_glb ||
                (rawResult.model_urls as Record<string, unknown>)?.glb;
              glbUrl = (topGlb as { url?: string })?.url;
              if (glbUrl) statusResult = rawResult;
            }
            
            logger.info('Fetched 3D result', { 
              requestId, 
              hasGlb: !!glbUrl,
              resultKeys: Object.keys(resultData).slice(0, 10)
            });
          }
        } catch (fetchError) {
          logger.error('Failed to fetch 3D result', { 
            error: (fetchError as Error).message, 
            requestId 
          });
        }
      }
      
      // Update gallery if completed and authenticated
      if (req.user && glbUrl) {
        try {
          const User = mongoose.model<IUser>('User');
          const updateQuery = buildUserUpdateQuery(req.user);
          
          if (updateQuery) {
            const user = await User.findOne({
              ...updateQuery,
              'gallery.requestId': requestId
            }).select('gallery');
            
            if (user) {
              const galleryItem = user.gallery?.find((item: { requestId?: string }) => item.requestId === requestId);
              
              if (galleryItem && galleryItem.status !== 'completed' && galleryItem.id) {
                await updateGalleryItemWithResult(
                  updateQuery,
                  galleryItem.id,
                  statusResult as {
                    model_glb?: { url?: string };
                    glb?: { url?: string };
                    thumbnail?: { url?: string };
                    model_urls?: { glb?: { url?: string }; obj?: { url?: string }; fbx?: { url?: string } };
                  },
                  galleryItem.thumbnailUrl || galleryItem.imageUrl
                );
              }
            }
          }
        } catch (galleryUpdateError) {
          // Don't fail status check if gallery update fails
          logger.error('Gallery update failed', { error: (galleryUpdateError as Error).message });
        }
      }

      // Build response
      const responseData: Record<string, unknown> = {
        success: true,
        status: rawStatusData.status
      };
      
      // Include model data
      if (statusResult.model_glb) responseData.model_glb = statusResult.model_glb;
      if (statusResult.glb) responseData.glb = statusResult.glb;
      if (statusResult.thumbnail) responseData.thumbnail = statusResult.thumbnail;
      if (statusResult.model_urls) responseData.model_urls = statusResult.model_urls;
      
      res.json(responseData);
    } catch (error) {
      const err = error as Error;
      logger.error('3D status check error:', { error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}

export default createModel3dRoutes;



