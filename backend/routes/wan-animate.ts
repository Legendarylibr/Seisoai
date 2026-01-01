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

export function createWanAnimateRoutes(deps: Dependencies) {
  const router = Router();
  const { wanSubmitLimiter, wanStatusLimiter, wanResultLimiter, requireCredits, authenticateToken } = deps;

  const submitLimiter = wanSubmitLimiter || ((req: Request, res: Response, next: () => void) => next());
  const statusLimiter = wanStatusLimiter || ((req: Request, res: Response, next: () => void) => next());
  const resultLimiter = wanResultLimiter || ((req: Request, res: Response, next: () => void) => next());
  const authMiddleware = authenticateToken || ((req: Request, res: Response, next: () => void) => next());

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
      
      // Upload to fal.ai
      const boundary = `----formdata-${Date.now()}`;
      const CRLF = '\r\n';
      
      let formDataBody = `--${boundary}${CRLF}`;
      formDataBody += `Content-Disposition: form-data; name="file"; filename="video.${extension}"${CRLF}`;
      formDataBody += `Content-Type: ${mimeType}${CRLF}${CRLF}`;
      
      const formDataBuffer = Buffer.concat([
        Buffer.from(formDataBody, 'utf8'),
        buffer,
        Buffer.from(`${CRLF}--${boundary}--${CRLF}`, 'utf8')
      ]);
      
      const uploadResponse = await fetch('https://fal.ai/files', {
        method: 'POST',
        headers: {
          'Authorization': `Key ${FAL_API_KEY}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        body: formDataBuffer
      });

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        res.status(uploadResponse.status).json({ 
          success: false, 
          error: `Failed to upload video: ${errorText.substring(0, 200)}` 
        });
        return;
      }

      const uploadData = await uploadResponse.json() as { url?: string; file?: { url?: string } };
      const videoUrl = uploadData.url || uploadData.file?.url;
      
      if (!videoUrl) {
        res.status(500).json({ success: false, error: 'No video URL returned from upload' });
        return;
      }

      res.json({ success: true, url: videoUrl });
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
      
      // Upload to fal.ai
      const boundary = `----formdata-${Date.now()}`;
      const CRLF = '\r\n';
      
      let formDataBody = `--${boundary}${CRLF}`;
      formDataBody += `Content-Disposition: form-data; name="file"; filename="image.${extension}"${CRLF}`;
      formDataBody += `Content-Type: ${mimeType}${CRLF}${CRLF}`;
      
      const formDataBuffer = Buffer.concat([
        Buffer.from(formDataBody, 'utf8'),
        buffer,
        Buffer.from(`${CRLF}--${boundary}--${CRLF}`, 'utf8')
      ]);
      
      const uploadResponse = await fetch('https://fal.ai/files', {
        method: 'POST',
        headers: {
          'Authorization': `Key ${FAL_API_KEY}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        body: formDataBuffer
      });

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        res.status(uploadResponse.status).json({ 
          success: false, 
          error: `Failed to upload image: ${errorText.substring(0, 200)}` 
        });
        return;
      }

      const uploadData = await uploadResponse.json() as { url?: string; file?: { url?: string } };
      const imageUrl = uploadData.url || uploadData.file?.url;
      
      if (!imageUrl) {
        res.status(500).json({ success: false, error: 'No image URL returned from upload' });
        return;
      }

      res.json({ success: true, url: imageUrl });
    } catch (error) {
      const err = error as Error;
      logger.error('Wan-animate image upload error', { error: err.message });
      res.status(500).json({ success: false, error: 'Failed to upload image' });
    }
  });

  /**
   * Submit animation job
   * POST /api/wan-animate/submit
   */
  router.post('/submit', submitLimiter, requireCredits(2), async (req: AuthenticatedRequest, res: Response) => {
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
      
      const User = mongoose.model<IUser>('User');
      const updateQuery = buildUserUpdateQuery(user);
      
      if (!updateQuery) {
        res.status(400).json({ 
          success: false, 
          error: 'User account must have wallet address, userId, or email' 
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
        res.status(submitResponse.status).json({ 
          success: false, 
          error: errorData.detail || 'Failed to submit animation request' 
        });
        return;
      }

      const submitData = await submitResponse.json() as { request_id?: string; requestId?: string };
      const requestId = submitData.request_id || submitData.requestId;

      if (!requestId) {
        res.status(500).json({ success: false, error: 'No request ID returned' });
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
      res.status(500).json({ success: false, error: 'Failed to submit animation' });
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
      const { requestId, duration } = req.body as {
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
