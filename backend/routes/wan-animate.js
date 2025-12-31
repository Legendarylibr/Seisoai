/**
 * WAN Animate routes
 * Video generation with WAN 2.2 model
 */
import { Router } from 'express';
import mongoose from 'mongoose';
import logger from '../utils/logger.js';
import config from '../config/env.js';
import { buildUserUpdateQuery } from '../services/user.js';

const FAL_API_KEY = config.FAL_API_KEY;
const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB

export function createWanAnimateRoutes(deps) {
  const router = Router();
  const { wanSubmitLimiter, wanStatusLimiter, wanResultLimiter, requireCredits, authenticateToken } = deps;

  /**
   * Upload video (data URI)
   * POST /api/wan-animate/upload-video
   */
  router.post('/upload-video', async (req, res) => {
    try {
      if (!FAL_API_KEY) {
        return res.status(500).json({ success: false, error: 'AI service not configured' });
      }

      const { videoDataUri } = req.body;
      
      if (!videoDataUri || !videoDataUri.startsWith('data:')) {
        return res.status(400).json({ success: false, error: 'Invalid video data URI' });
      }

      if (videoDataUri.length > MAX_VIDEO_SIZE) {
        return res.status(400).json({ 
          success: false, 
          error: `Video file too large. Maximum size is ${MAX_VIDEO_SIZE / (1024 * 1024)}MB.` 
        });
      }

      const base64Data = videoDataUri.split(',')[1];
      if (!base64Data) {
        return res.status(400).json({ success: false, error: 'Invalid video data URI format' });
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
        return res.status(uploadResponse.status).json({ 
          success: false, 
          error: `Failed to upload video: ${errorText.substring(0, 200)}` 
        });
      }

      const uploadData = await uploadResponse.json();
      const videoUrl = uploadData.url || uploadData.file?.url;
      
      if (!videoUrl) {
        return res.status(500).json({ success: false, error: 'No video URL returned from upload' });
      }

      res.json({ success: true, url: videoUrl });
    } catch (error) {
      logger.error('Wan-animate video upload error', { error: error.message });
      res.status(500).json({ success: false, error: 'Failed to upload video' });
    }
  });

  /**
   * Upload image
   * POST /api/wan-animate/upload-image
   */
  router.post('/upload-image', async (req, res) => {
    try {
      if (!FAL_API_KEY) {
        return res.status(500).json({ success: false, error: 'AI service not configured' });
      }

      const { imageDataUri } = req.body;
      
      if (!imageDataUri || !imageDataUri.startsWith('data:')) {
        return res.status(400).json({ success: false, error: 'Invalid image data URI' });
      }

      if (imageDataUri.length > MAX_IMAGE_SIZE) {
        return res.status(400).json({ 
          success: false, 
          error: `Image file too large. Maximum size is ${MAX_IMAGE_SIZE / (1024 * 1024)}MB.` 
        });
      }

      const base64Data = imageDataUri.split(',')[1];
      if (!base64Data) {
        return res.status(400).json({ success: false, error: 'Invalid image data URI format' });
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
        return res.status(uploadResponse.status).json({ 
          success: false, 
          error: `Failed to upload image: ${errorText.substring(0, 200)}` 
        });
      }

      const uploadData = await uploadResponse.json();
      const imageUrl = uploadData.url || uploadData.file?.url;
      
      if (!imageUrl) {
        return res.status(500).json({ success: false, error: 'No image URL returned from upload' });
      }

      res.json({ success: true, url: imageUrl });
    } catch (error) {
      logger.error('Wan-animate image upload error', { error: error.message });
      res.status(500).json({ success: false, error: 'Failed to upload image' });
    }
  });

  /**
   * Submit animation job
   * POST /api/wan-animate/submit
   */
  router.post('/submit', wanSubmitLimiter || ((req, res, next) => next()), requireCredits(2), async (req, res) => {
    try {
      const user = req.user;
      const minimumCredits = 2;
      
      const User = mongoose.model('User');
      const updateQuery = buildUserUpdateQuery(user);
      
      if (!updateQuery) {
        return res.status(400).json({ 
          success: false, 
          error: 'User account must have wallet address, userId, or email' 
        });
      }
      
      // Deduct credits
      const updateResult = await User.findOneAndUpdate(
        { ...updateQuery, credits: { $gte: minimumCredits } },
        { $inc: { credits: -minimumCredits, totalCreditsSpent: minimumCredits } },
        { new: true }
      );
      
      if (!updateResult) {
        return res.status(400).json({
          success: false,
          error: 'Insufficient credits for video generation'
        });
      }

      const { prompt, video_url, image_url, aspect_ratio = '16:9' } = req.body;
      
      if (!prompt) {
        return res.status(400).json({ success: false, error: 'Prompt is required' });
      }

      // Submit to FAL
      const requestBody = {
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
        const errorData = await submitResponse.json().catch(() => ({}));
        return res.status(submitResponse.status).json({ 
          success: false, 
          error: errorData.detail || 'Failed to submit animation request' 
        });
      }

      const submitData = await submitResponse.json();
      const requestId = submitData.request_id || submitData.requestId;

      if (!requestId) {
        return res.status(500).json({ success: false, error: 'No request ID returned' });
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
      logger.error('WAN animate submit error', { error: error.message });
      res.status(500).json({ success: false, error: 'Failed to submit animation' });
    }
  });

  /**
   * Check animation status
   * GET /api/wan-animate/status/:requestId
   */
  router.get('/status/:requestId', wanStatusLimiter || ((req, res, next) => next()), async (req, res) => {
    try {
      const { requestId } = req.params;

      const statusResponse = await fetch(
        `https://queue.fal.run/fal-ai/wan/v2.2-1.3b/animate/replace/requests/${requestId}/status`,
        {
          headers: { 'Authorization': `Key ${FAL_API_KEY}` }
        }
      );

      if (!statusResponse.ok) {
        return res.status(statusResponse.status).json({ 
          success: false, 
          error: 'Failed to check status' 
        });
      }

      const statusData = await statusResponse.json();
      
      res.json({
        success: true,
        status: statusData.status,
        ...statusData
      });
    } catch (error) {
      logger.error('WAN animate status error', { error: error.message });
      res.status(500).json({ success: false, error: 'Failed to check status' });
    }
  });

  /**
   * Get animation result
   * GET /api/wan-animate/result/:requestId
   */
  router.get('/result/:requestId', wanResultLimiter || ((req, res, next) => next()), async (req, res) => {
    try {
      const { requestId } = req.params;

      const resultResponse = await fetch(
        `https://queue.fal.run/fal-ai/wan/v2.2-1.3b/animate/replace/requests/${requestId}`,
        {
          headers: { 'Authorization': `Key ${FAL_API_KEY}` }
        }
      );

      if (!resultResponse.ok) {
        return res.status(resultResponse.status).json({ 
          success: false, 
          error: 'Failed to get result' 
        });
      }

      const resultData = await resultResponse.json();
      
      res.json({
        success: true,
        ...resultData
      });
    } catch (error) {
      logger.error('WAN animate result error', { error: error.message });
      res.status(500).json({ success: false, error: 'Failed to get result' });
    }
  });

  /**
   * Mark animation complete
   * POST /api/wan-animate/complete
   */
  router.post('/complete', authenticateToken, async (req, res) => {
    try {
      const { requestId, duration } = req.body;
      
      // Calculate additional credits based on duration
      // 2 credits per second, already deducted 2 at submit
      const additionalCredits = Math.max(0, Math.ceil(duration || 1) * 2 - 2);
      
      if (additionalCredits > 0 && req.user) {
        const User = mongoose.model('User');
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
      logger.error('WAN animate complete error', { error: error.message });
      res.status(500).json({ success: false, error: 'Failed to complete' });
    }
  });

  return router;
}

export default createWanAnimateRoutes;



