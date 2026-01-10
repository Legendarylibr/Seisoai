/**
 * 3D Model Generation Routes
 * Uses fal.ai Hunyuan3D V3 for Image-to-3D conversion
 * https://fal.ai/models/fal-ai/hunyuan3d-v3/image-to-3d/api
 */
import { Router, type Request, type Response } from 'express';
import type { RequestHandler } from 'express';
import mongoose from 'mongoose';
import logger from '../utils/logger';
import { checkQueueStatus, getQueueResult, getFalApiKey, isStatusCompleted, isStatusFailed } from '../services/fal';
import { buildUserUpdateQuery } from '../services/user';
import { CREDITS } from '../config/constants';
import type { IUser } from '../models/User';
import { encrypt, isEncryptionConfigured } from '../utils/encryption';

// Types
interface Dependencies {
  freeImageRateLimiter?: RequestHandler;
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
    authenticateFlexible,
    requireCredits
  } = deps;

  const freeImageLimiter = freeImageRateLimiter || ((req: Request, res: Response, next: () => void) => next());
  const flexibleAuth = authenticateFlexible || ((req: Request, res: Response, next: () => void) => next());

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
  router.post('/generate', freeImageLimiter, flexibleAuth, requireCreditsFor3d, async (req: AuthenticatedRequest, res: Response) => {
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

      // Poll for completion
      const modelPath = 'fal-ai/hunyuan3d-v3/image-to-3d';
      const maxWaitTime = 7 * 60 * 1000; // 7 minutes max (3D gen can take up to 5 mins)
      const pollInterval = 5000; // Poll every 5 seconds (reduce API calls)
      const startTime = Date.now();
      let lastStatus = '';
      let pollCount = 0;

      while (Date.now() - startTime < maxWaitTime) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        pollCount++;

        const statusResponse = await fetch(
          `https://queue.fal.run/${modelPath}/requests/${requestId}/status`,
          {
            headers: { 'Authorization': `Key ${FAL_API_KEY}` }
          }
        );

        if (!statusResponse.ok) {
          logger.warn('3D status check failed', { 
            requestId, 
            status: statusResponse.status,
            elapsed: Math.round((Date.now() - startTime) / 1000) + 's'
          });
          continue;
        }

        const rawStatusData = await statusResponse.json() as { 
          status?: string;
          // FAL queue returns response_url when completed
          response_url?: string;
          // FAL may include result data in status response
          data?: {
            // FAL Hunyuan3D returns 'glb' directly, not 'model_glb'
            glb?: { url?: string; file_size?: number; file_name?: string; content_type?: string };
            model_glb?: { url?: string };
            thumbnail?: { url?: string };
            model_urls?: { glb?: { url?: string }; obj?: { url?: string }; fbx?: { url?: string }; usdz?: { url?: string } };
          };
          // Or unwrapped - FAL returns 'glb' directly
          glb?: { url?: string; file_size?: number; file_name?: string; content_type?: string };
          model_glb?: { url?: string };
          thumbnail?: { url?: string };
          model_urls?: { glb?: { url?: string }; obj?: { url?: string }; fbx?: { url?: string }; usdz?: { url?: string } };
          // Output fields that FAL may return
          output?: {
            glb?: { url?: string };
            model_glb?: { url?: string };
          };
          result?: {
            glb?: { url?: string };
            model_glb?: { url?: string };
          };
        };
        
        // Handle wrapped or unwrapped data
        const statusResult = rawStatusData.data || rawStatusData.output || rawStatusData.result || rawStatusData;
        const rawStatus = rawStatusData.status || '';
        const normalizedStatus = rawStatus.toUpperCase();

        // Only log on status change or every 6th poll (~30s) to reduce log spam
        const statusChanged = normalizedStatus !== lastStatus;
        if (statusChanged || pollCount % 6 === 0) {
          logger.info('3D model polling', { 
            requestId, 
            status: normalizedStatus,
            pollCount,
            elapsed: Math.round((Date.now() - startTime) / 1000) + 's'
          });
          // Log the raw status response structure for debugging
          logger.info('3D polling status response', {
            requestId,
            status: rawStatusData.status,
            hasResponseUrl: !!rawStatusData.response_url,
            hasData: !!rawStatusData.data,
            hasOutput: !!rawStatusData.output,
            hasResult: !!rawStatusData.result,
            hasGlb: !!rawStatusData.glb,
            hasModelGlb: !!rawStatusData.model_glb,
            hasModelUrls: !!rawStatusData.model_urls,
            topLevelKeys: Object.keys(rawStatusData).slice(0, 20),
            rawResponsePreview: JSON.stringify(rawStatusData).substring(0, 1000)
          });
          lastStatus = normalizedStatus;
        }

        // Check if model in status response (some FAL endpoints include result in status)
        // Per FAL docs: https://fal.ai/models/fal-ai/hunyuan3d-v3/image-to-3d/api
        // Output includes: model_glb (File), thumbnail (File), model_urls (ModelUrls)
        // Also check rawStatusData directly in case data is at top level
        const typedStatusResult = (statusResult || rawStatusData) as {
          model_glb?: { url?: string; file_size?: number; file_name?: string; content_type?: string };
          glb?: { url?: string; file_size?: number; file_name?: string; content_type?: string }; // fallback alias
          thumbnail?: { url?: string };
          model_urls?: { glb?: { url?: string }; obj?: { url?: string }; fbx?: { url?: string }; usdz?: { url?: string } };
        };
        // Prioritize model_glb as per FAL docs, with fallbacks
        const glbFromStatus = typedStatusResult.model_glb || typedStatusResult.glb || typedStatusResult.model_urls?.glb;
        if (glbFromStatus?.url) {
          logger.info('3D model completed (from status response)', { 
            requestId,
            hasModelGlb: !!typedStatusResult.model_glb?.url,
            hasGlb: !!typedStatusResult.glb?.url,
            hasModelUrlsGlb: !!typedStatusResult.model_urls?.glb?.url,
            hasThumbnail: !!typedStatusResult.thumbnail?.url,
            glbUrl: glbFromStatus?.url?.substring(0, 100),
            elapsed: Math.round((Date.now() - startTime) / 1000) + 's'
          });
          
          // Update gallery item with result
          await updateGalleryItemWithResult(updateQuery, generationId, typedStatusResult, input_image_url);

          // Ensure response hasn't been sent already
          if (!res.headersSent) {
            const responsePayload = {
              success: true,
              // Use model_glb directly as that's what FAL returns
              model_glb: typedStatusResult.model_glb || typedStatusResult.glb,
              thumbnail: typedStatusResult.thumbnail,
              model_urls: typedStatusResult.model_urls,
              remainingCredits: updateResult.credits,
              creditsDeducted: creditsRequired,
              generationId: generationId // Return generationId so frontend can find it in gallery
            };
            logger.info('3D polling returning success response (from status)', {
              requestId,
              hasModelGlb: !!responsePayload.model_glb,
              hasThumbnail: !!responsePayload.thumbnail,
              hasModelUrls: !!responsePayload.model_urls,
              responsePreview: JSON.stringify(responsePayload).substring(0, 1000)
            });
            res.json(responsePayload);
          }
          return;
        }

        // Check for completion - handle various status formats from FAL
        if (isStatusCompleted(normalizedStatus)) {
          logger.info('3D model status COMPLETED, fetching result', { 
            requestId, 
            normalizedStatus,
            hasResponseUrl: !!rawStatusData.response_url,
            elapsed: Math.round((Date.now() - startTime) / 1000) + 's'
          });
          
          // Use FAL service helper to fetch result, or use response_url if provided
          let rawResult: {
            // FAL queue result may wrap response in various fields
            data?: {
              glb?: { url?: string; file_size?: number; file_name?: string; content_type?: string };
              model_glb?: { url?: string; file_size?: number; file_name?: string; content_type?: string };
              thumbnail?: { url?: string };
              model_urls?: { glb?: { url?: string }; obj?: { url?: string }; fbx?: { url?: string }; usdz?: { url?: string } };
              seed?: number;
            };
            output?: {
              glb?: { url?: string; file_size?: number; file_name?: string; content_type?: string };
              model_glb?: { url?: string; file_size?: number; file_name?: string; content_type?: string };
              thumbnail?: { url?: string };
              model_urls?: { glb?: { url?: string }; obj?: { url?: string }; fbx?: { url?: string }; usdz?: { url?: string } };
            };
            result?: {
              glb?: { url?: string; file_size?: number; file_name?: string; content_type?: string };
              model_glb?: { url?: string; file_size?: number; file_name?: string; content_type?: string };
              thumbnail?: { url?: string };
              model_urls?: { glb?: { url?: string }; obj?: { url?: string }; fbx?: { url?: string }; usdz?: { url?: string } };
            };
            response?: {
              glb?: { url?: string; file_size?: number; file_name?: string; content_type?: string };
              model_glb?: { url?: string; file_size?: number; file_name?: string; content_type?: string };
              thumbnail?: { url?: string };
              model_urls?: { glb?: { url?: string }; obj?: { url?: string }; fbx?: { url?: string }; usdz?: { url?: string } };
            };
            // Or it might be unwrapped (for direct API calls)
            glb?: { url?: string; file_size?: number; file_name?: string; content_type?: string };
            model_glb?: { url?: string; file_size?: number; file_name?: string; content_type?: string };
            thumbnail?: { url?: string };
            model_urls?: { glb?: { url?: string }; obj?: { url?: string }; fbx?: { url?: string }; usdz?: { url?: string } };
            seed?: number;
          };

          try {
            // If response_url is provided, use it directly, otherwise use the FAL service helper
            if (rawStatusData.response_url) {
              const resultResponse = await fetch(rawStatusData.response_url, {
                headers: { 'Authorization': `Key ${FAL_API_KEY}` }
              });
              if (!resultResponse.ok) {
                throw new Error(`Failed to fetch from response_url: ${resultResponse.status}`);
              }
              rawResult = await resultResponse.json() as typeof rawResult;
            } else {
              // Use FAL service helper function
              rawResult = await getQueueResult<typeof rawResult>(requestId, modelPath);
            }
          } catch (error) {
            const err = error as Error;
            logger.error('Failed to fetch 3D result', { 
              requestId, 
              error: err.message,
              hasResponseUrl: !!rawStatusData.response_url
            });
            await refundCredits(user, creditsRequired, `Failed to fetch 3D result: ${err.message}`);
            res.status(500).json({
              success: false,
              error: 'Failed to fetch 3D model result',
              creditsRefunded: creditsRequired
            });
            return;
          }

          // Handle all possible wrapper formats - FAL can return in data/output/result/response or unwrapped
          type ResultShape = {
            glb?: { url?: string; file_size?: number; file_name?: string; content_type?: string };
            model_glb?: { url?: string; file_size?: number; file_name?: string; content_type?: string };
            thumbnail?: { url?: string };
            model_urls?: { glb?: { url?: string }; obj?: { url?: string }; fbx?: { url?: string }; usdz?: { url?: string } };
            seed?: number;
          };
          const resultData: ResultShape = rawResult.data || rawResult.output || rawResult.result || rawResult.response || rawResult;
          
          // Log the full raw response for debugging (truncated)
          logger.info('3D result response structure', {
            requestId,
            hasDataWrapper: !!rawResult.data,
            hasOutputWrapper: !!rawResult.output,
            hasResultWrapper: !!rawResult.result,
            hasResponseWrapper: !!rawResult.response,
            hasGlb: !!resultData.glb?.url,
            hasModelGlb: !!resultData.model_glb?.url,
            hasModelUrls: !!resultData.model_urls,
            keys: Object.keys(rawResult).slice(0, 20),
            resultDataKeys: Object.keys(resultData).slice(0, 20),
            fullResponse: JSON.stringify(rawResult).substring(0, 2000),
            resultDataPreview: JSON.stringify(resultData).substring(0, 1000)
          });

          // Per FAL docs: output has model_glb (File), model_urls (ModelUrls with glb, obj, etc)
          const glbResult = resultData.model_glb || resultData.glb || resultData.model_urls?.glb;
          
          if (glbResult?.url) {
            logger.info('3D model generation completed (from result endpoint)', { 
              requestId, 
              hasModelGlb: !!resultData.model_glb?.url,
              hasGlb: !!resultData.glb?.url,
              hasModelUrlsGlb: !!resultData.model_urls?.glb?.url,
              hasObj: !!resultData.model_urls?.obj?.url,
              hasThumbnail: !!resultData.thumbnail?.url,
              glbUrl: glbResult?.url?.substring(0, 100),
              elapsed: Math.round((Date.now() - startTime) / 1000) + 's'
            });
            
            // Update gallery item with result
            await updateGalleryItemWithResult(updateQuery, generationId, resultData, input_image_url);
            
          // Ensure response hasn't been sent already
          if (!res.headersSent) {
            const responsePayload = {
              success: true,
              // Return model_glb as per FAL docs
              model_glb: resultData.model_glb || resultData.glb,
              thumbnail: resultData.thumbnail,
              model_urls: resultData.model_urls,
              seed: resultData.seed,
              remainingCredits: updateResult.credits,
              creditsDeducted: creditsRequired,
              generationId: generationId // Return generationId so frontend can find it in gallery
            };
            logger.info('3D polling returning success response', {
              requestId,
              hasModelGlb: !!responsePayload.model_glb,
              hasThumbnail: !!responsePayload.thumbnail,
              hasModelUrls: !!responsePayload.model_urls,
              responsePreview: JSON.stringify(responsePayload).substring(0, 1000)
            });
            res.json(responsePayload);
          }
          return;
          }

          logger.error('No model URL in 3D result', { 
            requestId,
            rawResultKeys: Object.keys(rawResult).slice(0, 20),
            resultDataKeys: Object.keys(resultData).slice(0, 20),
            rawResultFull: JSON.stringify(rawResult).substring(0, 2000),
            resultDataFull: JSON.stringify(resultData).substring(0, 2000)
          });
          await refundCredits(user, creditsRequired, 'No model in 3D result');
          res.status(500).json({
            success: false,
            error: '3D generation completed but no model URL found',
            creditsRefunded: creditsRequired
          });
          return;
        }

        if (isStatusFailed(normalizedStatus)) {
          logger.error('3D model generation failed', { requestId, status: normalizedStatus });
          
          // Update gallery item status to failed
          try {
            const User = mongoose.model<IUser>('User');
            await User.findOneAndUpdate(
              {
                ...updateQuery,
                'gallery.id': generationId
              },
              {
                $set: {
                  'gallery.$.status': 'failed'
                }
              }
            );
          } catch (updateError) {
            logger.error('Failed to update gallery item status to failed', { 
              error: (updateError as Error).message,
              generationId 
            });
          }
          
          await refundCredits(user, creditsRequired, `3D generation failed: ${normalizedStatus}`);
          res.status(500).json({
            success: false,
            error: '3D model generation failed',
            creditsRefunded: creditsRequired
          });
          return;
        }
      }

      // Timeout - but generation may still complete in background
      // Gallery item is already created, so user can check back later
      logger.warn('3D model generation polling timeout', { 
        requestId,
        message: 'Generation may still be processing. Check gallery later.'
      });
      
      // Update gallery item to indicate it's still processing
      // The status endpoint can be used to check completion
      try {
        const User = mongoose.model<IUser>('User');
        await User.findOneAndUpdate(
          {
            ...updateQuery,
            'gallery.id': generationId
          },
          {
            $set: {
              'gallery.$.status': 'processing',
              'gallery.$.requestId': requestId // Keep requestId for status checks
            }
          }
        );
        logger.info('Gallery item kept for async completion check', { generationId, requestId });
      } catch (updateError) {
        logger.error('Failed to update gallery item on timeout', { 
          error: (updateError as Error).message,
          generationId 
        });
      }
      
      // Don't refund credits yet - generation may still complete
      // User can check gallery or status endpoint
      res.status(202).json({
        success: false,
        error: '3D model generation is taking longer than expected. Check your gallery in a few minutes.',
        generationId: generationId,
        requestId: requestId,
        statusEndpoint: `/api/model3d/status/${requestId}`,
        message: 'Your generation is still processing. It will appear in your gallery when complete.'
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

      const rawStatusData = await statusResponse.json() as { 
        status?: string;
        response_url?: string;
        data?: {
          glb?: { url?: string; file_size?: number; file_name?: string; content_type?: string };
          model_glb?: { url?: string };
          thumbnail?: { url?: string };
          model_urls?: { glb?: { url?: string }; obj?: { url?: string }; fbx?: { url?: string }; usdz?: { url?: string } };
        };
        glb?: { url?: string; file_size?: number; file_name?: string; content_type?: string };
        model_glb?: { url?: string };
        thumbnail?: { url?: string };
        model_urls?: { glb?: { url?: string }; obj?: { url?: string }; fbx?: { url?: string }; usdz?: { url?: string } };
      };

      const normalizedStatus = (rawStatusData.status || '').toUpperCase();
      
      // If generation is complete and user is authenticated, try to update gallery
      if (req.user && (isStatusCompleted(normalizedStatus) || rawStatusData.model_glb?.url || rawStatusData.glb?.url)) {
        try {
          const User = mongoose.model<IUser>('User');
          const updateQuery = buildUserUpdateQuery(req.user);
          
          if (updateQuery) {
            // Find gallery item with this requestId
            const user = await User.findOne({
              ...updateQuery,
              'gallery.requestId': requestId
            }).select('gallery');
            
            if (user) {
              const galleryItem = user.gallery?.find((item: { requestId?: string }) => item.requestId === requestId);
              
              if (galleryItem && galleryItem.status !== 'completed') {
                // Check if we have result data in status response
                const statusResult = rawStatusData.data || rawStatusData;
                const glbUrl = statusResult.model_glb?.url || statusResult.glb?.url || statusResult.model_urls?.glb?.url;
                
                if (glbUrl) {
                  // Update gallery item
                  await updateGalleryItemWithResult(
                    updateQuery,
                    galleryItem.id,
                    statusResult,
                    galleryItem.thumbnailUrl || galleryItem.imageUrl
                  );
                  logger.info('Gallery item updated from status check', { 
                    requestId,
                    generationId: galleryItem.id 
                  });
                } else if (isStatusCompleted(normalizedStatus)) {
                  // Status says completed but no URL in status response, fetch result
                  try {
                    let rawResult: {
                      data?: {
                        glb?: { url?: string };
                        model_glb?: { url?: string };
                        thumbnail?: { url?: string };
                        model_urls?: { glb?: { url?: string }; obj?: { url?: string }; fbx?: { url?: string } };
                      };
                      output?: {
                        glb?: { url?: string };
                        model_glb?: { url?: string };
                        thumbnail?: { url?: string };
                        model_urls?: { glb?: { url?: string }; obj?: { url?: string }; fbx?: { url?: string } };
                      };
                      glb?: { url?: string };
                      model_glb?: { url?: string };
                      thumbnail?: { url?: string };
                      model_urls?: { glb?: { url?: string }; obj?: { url?: string }; fbx?: { url?: string } };
                    };

                    if (rawStatusData.response_url) {
                      const resultResponse = await fetch(rawStatusData.response_url, {
                        headers: { 'Authorization': `Key ${FAL_API_KEY}` }
                      });
                      if (resultResponse.ok) {
                        rawResult = await resultResponse.json() as typeof rawResult;
                      }
                    } else {
                      rawResult = await getQueueResult<typeof rawResult>(requestId, modelPath);
                    }

                    const resultData = rawResult.data || rawResult.output || rawResult;
                    const glbUrl = resultData.model_glb?.url || resultData.glb?.url || resultData.model_urls?.glb?.url;
                    
                    if (glbUrl) {
                      await updateGalleryItemWithResult(
                        updateQuery,
                        galleryItem.id,
                        resultData,
                        galleryItem.thumbnailUrl || galleryItem.imageUrl
                      );
                      logger.info('Gallery item updated from result fetch', { 
                        requestId,
                        generationId: galleryItem.id 
                      });
                    }
                  } catch (fetchError) {
                    logger.error('Failed to fetch result for gallery update', { 
                      error: (fetchError as Error).message,
                      requestId 
                    });
                  }
                }
              }
            }
          }
        } catch (galleryUpdateError) {
          logger.error('Failed to update gallery from status check', { 
            error: (galleryUpdateError as Error).message,
            requestId 
          });
          // Don't fail the status check if gallery update fails
        }
      }

      res.json({ success: true, ...rawStatusData });
    } catch (error) {
      const err = error as Error;
      logger.error('3D status check error:', { error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}

export default createModel3dRoutes;



