/**
 * WAN Animate routes
 * Video generation with WAN 2.2 model
 */
import { Router, type Request, type Response } from 'express';
import type { RequestHandler } from 'express';
import mongoose from 'mongoose';
import logger from '../utils/logger';
import config from '../config/env';
import { buildUserUpdateQuery } from '../services/user';
import type { IUser } from '../models/User';
import { applyClawMarkup } from '../middleware/credits';
import { authenticateFlexible, requireVerifiedIdentity } from '../middleware/auth';

const FAL_API_KEY = config.FAL_API_KEY;
const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB

// Types
interface Dependencies {
  wanSubmitLimiter?: RequestHandler;
  wanStatusLimiter?: RequestHandler;
  wanResultLimiter?: RequestHandler;
  requireCredits: (credits: number) => RequestHandler;
  authenticateToken?: RequestHandler;
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
      logger.info('Credits refunded for failed WAN generation', {
        userId: user.userId || user.walletAddress,
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

export function createWanAnimateRoutes(deps: Dependencies) {
  const router = Router();
  const { wanSubmitLimiter, wanStatusLimiter, wanResultLimiter, requireCredits, authenticateToken } = deps;

  const submitLimiter = wanSubmitLimiter || ((_req: Request, _res: Response, next: () => void) => next());
  const statusLimiter = wanStatusLimiter || ((_req: Request, _res: Response, next: () => void) => next());
  const resultLimiter = wanResultLimiter || ((_req: Request, _res: Response, next: () => void) => next());
  const authMiddleware = authenticateToken || ((_req: Request, _res: Response, next: () => void) => next());

  /**
   * Upload video (direct multipart form data)
   * POST /api/wan-animate/upload-video-direct
   */
  router.post('/upload-video-direct', async (req: Request, res: Response) => {
    try {
      if (!FAL_API_KEY) {
        res.status(500).json({ success: false, error: 'AI service not configured' });
        return;
      }

      // Handle multipart/form-data
      const formData = await new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => {
          const buffer = Buffer.concat(chunks);
          const contentType = req.headers['content-type'] || '';
          const boundary = contentType.split('boundary=')[1];
          if (!boundary) {
            return reject(new Error('No boundary in Content-Type'));
          }

          const parts = buffer.toString('binary').split(`--${boundary}`);
          for (const part of parts) {
            if (part.includes('Content-Disposition: form-data')) {
              const headerEnd = part.indexOf('\r\n\r\n');
              if (headerEnd === -1) continue;

              const headers = part.substring(0, headerEnd);
              const body = part.substring(headerEnd + 4);
              const bodyEnd = body.indexOf(`\r\n--${boundary}`);
              const fileData = bodyEnd === -1 ? body : body.substring(0, bodyEnd);

              if (headers.includes('name="video"')) {
                return resolve(Buffer.from(fileData, 'binary'));
              }
            }
          }
          reject(new Error('No video field found'));
        });
        req.on('error', reject);
      });

      // Upload to fal.ai using presigned URL
      const mimeType = 'video/mp4';

      // Step 1: Initiate upload to get presigned URL
      const initiateResponse = await fetch('https://rest.fal.run/storage/upload/initiate', {
        method: 'POST',
        headers: {
          'Authorization': `Key ${FAL_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          file_name: 'video.mp4',
          content_type: mimeType
        })
      });

      if (!initiateResponse.ok) {
        const errorText = await initiateResponse.text();
        logger.error('Failed to initiate video upload to fal.ai (direct)', {
          status: initiateResponse.status,
          error: errorText.substring(0, 200)
        });
        res.status(initiateResponse.status).json({
          success: false,
          error: `Failed to initiate upload: ${errorText.substring(0, 200)}`
        });
        return;
      }

      const initiateData = await initiateResponse.json() as { upload_url?: string; file_url?: string };
      if (!initiateData.upload_url || !initiateData.file_url) {
        res.status(500).json({ success: false, error: 'No upload URL returned from fal.ai' });
        return;
      }

      // Step 2: Upload file to presigned URL
      const uploadResponse = await fetch(initiateData.upload_url, {
        method: 'PUT',
        headers: {
          'Content-Type': mimeType
        },
        body: formData
      });

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        logger.error('Failed to upload video to fal.ai (direct)', {
          status: uploadResponse.status,
          error: errorText.substring(0, 200)
        });
        res.status(uploadResponse.status).json({
          success: false,
          error: `Failed to upload video: ${errorText.substring(0, 200)}`
        });
        return;
      }

      const videoUrl = initiateData.file_url;

      if (!videoUrl) {
        res.status(500).json({ success: false, error: 'No video URL in response' });
        return;
      }

      res.json({
        success: true,
        videoUrl
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Direct video upload error:', { error: err.message });
      res.status(500).json({
        success: false,
        error: err.message
      });
    }
  });

  /**
   * Upload video (data URI)
   * POST /api/wan-animate/upload-video
   */
  router.post('/upload-video', async (req: Request, res: Response) => {
    try {
      if (!FAL_API_KEY) {
        res.status(500).json({ success: false, error: 'AI service not configured' });
        return;
      }

      const { videoDataUri } = req.body as { videoDataUri?: string };
      
      if (!videoDataUri || !videoDataUri.startsWith('data:')) {
        res.status(400).json({ success: false, error: 'Invalid video data URI' });
        return;
      }

      if (videoDataUri.length > MAX_VIDEO_SIZE) {
        res.status(400).json({ 
          success: false, 
          error: `Video file too large. Maximum size is ${MAX_VIDEO_SIZE / (1024 * 1024)}MB.` 
        });
        return;
      }

      const base64Data = videoDataUri.split(',')[1];
      if (!base64Data) {
        res.status(400).json({ success: false, error: 'Invalid video data URI format' });
        return;
      }
      
      const buffer = Buffer.from(base64Data, 'base64');
      const mimeMatch = videoDataUri.match(/data:([^;]+)/);
      const mimeType = mimeMatch ? mimeMatch[1] : 'video/mp4';
      const extension = mimeType.includes('quicktime') ? 'mov' : 'mp4';
      
      // Upload to fal.ai using presigned URL
      // Step 1: Initiate upload to get presigned URL
      const initiateResponse = await fetch('https://rest.fal.run/storage/upload/initiate', {
        method: 'POST',
        headers: {
          'Authorization': `Key ${FAL_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          file_name: `video.${extension}`,
          content_type: mimeType
        })
      });

      if (!initiateResponse.ok) {
        const errorText = await initiateResponse.text();
        res.status(initiateResponse.status).json({ 
          success: false, 
          error: `Failed to initiate upload: ${errorText.substring(0, 200)}` 
        });
        return;
      }

      const initiateData = await initiateResponse.json() as { upload_url?: string; file_url?: string };
      if (!initiateData.upload_url || !initiateData.file_url) {
        res.status(500).json({ success: false, error: 'No upload URL returned from fal.ai' });
        return;
      }

      // Step 2: Upload file to presigned URL
      const uploadResponse = await fetch(initiateData.upload_url, {
        method: 'PUT',
        headers: {
          'Content-Type': mimeType
        },
        body: buffer
      });

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        res.status(uploadResponse.status).json({ 
          success: false, 
          error: `Failed to upload video: ${errorText.substring(0, 200)}` 
        });
        return;
      }

      res.json({ success: true, url: initiateData.file_url });
    } catch (error) {
      const err = error as Error;
      logger.error('Wan-animate video upload error', { error: err.message });
      res.status(500).json({ success: false, error: 'Failed to upload video' });
    }
  });

  /**
   * Upload image
   * POST /api/wan-animate/upload-image
   */
  router.post('/upload-image', async (req: Request, res: Response) => {
    try {
      if (!FAL_API_KEY) {
        res.status(500).json({ success: false, error: 'AI service not configured' });
        return;
      }

      const { imageDataUri } = req.body as { imageDataUri?: string };
      
      if (!imageDataUri || !imageDataUri.startsWith('data:')) {
        res.status(400).json({ success: false, error: 'Invalid image data URI' });
        return;
      }

      if (imageDataUri.length > MAX_IMAGE_SIZE) {
        res.status(400).json({ 
          success: false, 
          error: `Image file too large. Maximum size is ${MAX_IMAGE_SIZE / (1024 * 1024)}MB.` 
        });
        return;
      }

      const base64Data = imageDataUri.split(',')[1];
      if (!base64Data) {
        res.status(400).json({ success: false, error: 'Invalid image data URI format' });
        return;
      }
      
      const buffer = Buffer.from(base64Data, 'base64');
      const mimeMatch = imageDataUri.match(/data:([^;]+)/);
      const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
      const extension = mimeType.includes('png') ? 'png' : 'jpg';
      
      // Upload to fal.ai using presigned URL
      // Step 1: Initiate upload to get presigned URL
      const initiateResponse = await fetch('https://rest.fal.run/storage/upload/initiate', {
        method: 'POST',
        headers: {
          'Authorization': `Key ${FAL_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          file_name: `image.${extension}`,
          content_type: mimeType
        })
      });

      if (!initiateResponse.ok) {
        const errorText = await initiateResponse.text();
        res.status(initiateResponse.status).json({ 
          success: false, 
          error: `Failed to initiate upload: ${errorText.substring(0, 200)}` 
        });
        return;
      }

      const initiateData = await initiateResponse.json() as { upload_url?: string; file_url?: string };
      if (!initiateData.upload_url || !initiateData.file_url) {
        res.status(500).json({ success: false, error: 'No upload URL returned from fal.ai' });
        return;
      }

      // Step 2: Upload file to presigned URL
      const uploadResponse = await fetch(initiateData.upload_url, {
        method: 'PUT',
        headers: {
          'Content-Type': mimeType
        },
        body: buffer
      });

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        res.status(uploadResponse.status).json({ 
          success: false, 
          error: `Failed to upload image: ${errorText.substring(0, 200)}` 
        });
        return;
      }

      res.json({ success: true, url: initiateData.file_url });
    } catch (error) {
      const err = error as Error;
      logger.error('Wan-animate image upload error', { error: err.message });
      res.status(500).json({ success: false, error: 'Failed to upload image' });
    }
  });

  /**
   * Submit animation job
   * POST /api/wan-animate/submit
   * SECURITY: Requires verified identity (JWT or x402)
   */
  router.post('/submit', submitLimiter, authenticateFlexible, requireVerifiedIdentity, requireCredits(2), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({
          success: false,
          error: 'User authentication required'
        });
        return;
      }

      const minimumCredits = applyClawMarkup(req, 2);
      
      const User = mongoose.model<IUser>('User');
      const updateQuery = buildUserUpdateQuery(user);
      
      if (!updateQuery) {
        res.status(400).json({ 
          success: false, 
          error: 'User account must have wallet address or userId' 
        });
        return;
      }
      
      // Deduct credits
      const updateResult = await User.findOneAndUpdate(
        { ...updateQuery, credits: { $gte: minimumCredits } },
        { $inc: { credits: -minimumCredits, totalCreditsSpent: minimumCredits } },
        { new: true }
      );
      
      if (!updateResult) {
        res.status(400).json({
          success: false,
          error: 'Insufficient credits for video generation'
        });
        return;
      }

      const { prompt, video_url, image_url, aspect_ratio = '16:9' } = req.body as {
        prompt?: string;
        video_url?: string;
        image_url?: string;
        aspect_ratio?: string;
      };
      
      if (!prompt) {
        res.status(400).json({ success: false, error: 'Prompt is required' });
        return;
      }

      if (!FAL_API_KEY) {
        res.status(500).json({ success: false, error: 'AI service not configured' });
        return;
      }

      // Submit to FAL
      const requestBody: Record<string, string> = {
        prompt,
        aspect_ratio
      };
      
      if (video_url) requestBody.video_url = video_url;
      if (image_url) requestBody.image_url = image_url;

      const submitResponse = await fetch('https://queue.fal.run/fal-ai/wan/v2.2-1.3b/animate/replace', {
        method: 'POST',
        headers: {
          'Authorization': `Key ${FAL_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!submitResponse.ok) {
        const errorData = await submitResponse.json().catch(() => ({})) as { detail?: string };
        // Refund credits on submit failure
        await refundCredits(user, minimumCredits, `WAN animate submit error: ${submitResponse.status}`);
        res.status(submitResponse.status).json({ 
          success: false, 
          error: errorData.detail || 'Failed to submit animation request',
          creditsRefunded: minimumCredits
        });
        return;
      }

      const submitData = await submitResponse.json() as { request_id?: string; requestId?: string };
      const requestId = submitData.request_id || submitData.requestId;

      if (!requestId) {
        // Refund credits when no request ID returned
        await refundCredits(user, minimumCredits, 'WAN animate: no request ID returned');
        res.status(500).json({ success: false, error: 'No request ID returned', creditsRefunded: minimumCredits });
        return;
      }

      logger.info('WAN animate submitted', { requestId, userId: user.userId });

      res.json({
        success: true,
        requestId,
        status: 'queued',
        remainingCredits: updateResult.credits,
        creditsDeducted: minimumCredits
      });
    } catch (error) {
      const err = error as Error;
      logger.error('WAN animate submit error', { error: err.message });
      // Refund credits on unexpected error
      const user = req.user;
      const minimumCredits = applyClawMarkup(req, 2);
      if (user) {
        await refundCredits(user, minimumCredits, `WAN animate error: ${err.message}`);
      }
      res.status(500).json({ success: false, error: 'Failed to submit animation', creditsRefunded: user ? minimumCredits : 0 });
    }
  });

  /**
   * Check animation status
   * GET /api/wan-animate/status/:requestId
   */
  router.get('/status/:requestId', statusLimiter, async (req: Request, res: Response) => {
    try {
      const { requestId } = req.params;

      if (!FAL_API_KEY) {
        res.status(500).json({ success: false, error: 'AI service not configured' });
        return;
      }

      const statusResponse = await fetch(
        `https://queue.fal.run/fal-ai/wan/v2.2-1.3b/animate/replace/requests/${requestId}/status`,
        {
          headers: { 'Authorization': `Key ${FAL_API_KEY}` }
        }
      );

      if (!statusResponse.ok) {
        res.status(statusResponse.status).json({ 
          success: false, 
          error: 'Failed to check status' 
        });
        return;
      }

      const statusData = await statusResponse.json() as { status?: string; [key: string]: unknown };
      
      res.json({
        success: true,
        status: statusData.status,
        ...statusData
      });
    } catch (error) {
      const err = error as Error;
      logger.error('WAN animate status error', { error: err.message });
      res.status(500).json({ success: false, error: 'Failed to check status' });
    }
  });

  /**
   * Get animation result
   * GET /api/wan-animate/result/:requestId
   */
  router.get('/result/:requestId', resultLimiter, async (req: Request, res: Response) => {
    try {
      const { requestId } = req.params;

      if (!FAL_API_KEY) {
        res.status(500).json({ success: false, error: 'AI service not configured' });
        return;
      }

      const resultResponse = await fetch(
        `https://queue.fal.run/fal-ai/wan/v2.2-1.3b/animate/replace/requests/${requestId}`,
        {
          headers: { 'Authorization': `Key ${FAL_API_KEY}` }
        }
      );

      if (!resultResponse.ok) {
        res.status(resultResponse.status).json({ 
          success: false, 
          error: 'Failed to get result' 
        });
        return;
      }

      const resultData = await resultResponse.json() as Record<string, unknown>;
      
      res.json({
        success: true,
        ...resultData
      });
    } catch (error) {
      const err = error as Error;
      logger.error('WAN animate result error', { error: err.message });
      res.status(500).json({ success: false, error: 'Failed to get result' });
    }
  });

  /**
   * Mark animation complete
   * POST /api/wan-animate/complete
   */
  router.post('/complete', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { duration } = req.body as {
        requestId?: string;
        duration?: number;
      };
      
      // Calculate additional credits based on duration
      // 2 credits per second, already deducted 2 at submit
      const additionalCredits = Math.max(0, Math.ceil(duration || 1) * 2 - 2);
      
      if (additionalCredits > 0 && req.user) {
        const User = mongoose.model<IUser>('User');
        await User.findOneAndUpdate(
          { userId: req.user.userId },
          { $inc: { credits: -additionalCredits, totalCreditsSpent: additionalCredits } }
        );
      }

      res.json({
        success: true,
        additionalCreditsDeducted: additionalCredits
      });
    } catch (error) {
      const err = error as Error;
      logger.error('WAN animate complete error', { error: err.message });
      res.status(500).json({ success: false, error: 'Failed to complete' });
    }
  });

  return router;
}

export default createWanAnimateRoutes;
