/**
 * Audio routes
 * Voice cloning, TTS, audio separation, and sound effects
 */
import { Router, type Request, type Response } from 'express';
import type { RequestHandler } from 'express';
import mongoose from 'mongoose';
import logger from '../utils/logger';
import { submitToQueue, checkQueueStatus, getQueueResult, getFalApiKey, uploadToFal, isStatusCompleted, isStatusFailed } from '../services/fal';
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
      logger.info('Credits refunded for failed audio generation', {
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

export function createAudioRoutes(deps: Dependencies) {
  const router = Router();
  const { rateLimiter, requireCredits } = deps;

  const limiter = rateLimiter || ((req: Request, res: Response, next: () => void) => next());

  // ============================================================================
  // VOICE CLONE / TEXT-TO-SPEECH
  // Uses XTTS-v2 for voice cloning
  // ============================================================================

  /**
   * Clone voice and generate speech
   * POST /api/audio/voice-clone
   * 
   * Inputs:
   * - text: Text to speak
   * - voice_url: Reference audio for voice cloning (optional)
   * - language: Language code (default: 'en')
   */
  router.post('/voice-clone', limiter, requireCredits(1), async (req: AuthenticatedRequest, res: Response) => {
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

      const { text, voice_url, language = 'en' } = req.body as {
        text?: string;
        voice_url?: string;
        language?: string;
      };

      if (!text || text.trim().length === 0) {
        res.status(400).json({ success: false, error: 'Text is required' });
        return;
      }

      if (text.length > 5000) {
        res.status(400).json({ success: false, error: 'Text too long. Maximum 5000 characters.' });
        return;
      }

      // Calculate credits based on text length (0.5 credits per 500 chars, min 1)
      const creditsRequired = Math.max(1, Math.ceil(text.length / 500) * 0.5);

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

      logger.info('Voice clone request', {
        textLength: text.length,
        hasVoiceRef: !!voice_url,
        language,
        userId: user.userId
      });

      // Build request for XTTS-v2
      const requestBody: Record<string, unknown> = {
        text: text.trim(),
        language
      };

      // Add voice reference if provided (for cloning)
      if (voice_url) {
        requestBody.audio_url = voice_url;
      }

      // Submit to FAL queue
      const result = await submitToQueue<{ request_id?: string }>('fal-ai/xtts-v2', requestBody);
      const requestId = result.request_id;

      if (!requestId) {
        await refundCredits(user, creditsRequired, 'No request ID returned');
        res.status(500).json({ success: false, error: 'Failed to submit TTS request' });
        return;
      }

      // Poll for completion (TTS is usually fast)
      const maxWaitTime = 60 * 1000;
      const pollInterval = 500;
      const startTime = Date.now();

      while (Date.now() - startTime < maxWaitTime) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));

        try {
          const statusData = await checkQueueStatus<{ status?: string }>( requestId, 'fal-ai/xtts-v2');
          const normalizedStatus = (statusData.status || '').toUpperCase();

          if (isStatusCompleted(normalizedStatus)) {
            const resultData = await getQueueResult<{ audio?: { url?: string }; audio_url?: string }>(
              requestId, 
              'fal-ai/xtts-v2'
            );

            const audioUrl = resultData.audio?.url || resultData.audio_url;

            if (audioUrl) {
              logger.info('Voice clone completed', { requestId, userId: user.userId });
              res.json({
                success: true,
                audio_url: audioUrl,
                remainingCredits: updateResult.credits,
                creditsDeducted: creditsRequired
              });
              return;
            } else {
              await refundCredits(user, creditsRequired, 'No audio URL in response');
              res.status(500).json({ success: false, error: 'No audio generated' });
              return;
            }
          } else if (isStatusFailed(normalizedStatus)) {
            await refundCredits(user, creditsRequired, 'TTS generation failed');
            res.status(500).json({ success: false, error: 'Voice generation failed' });
            return;
          }
        } catch (pollError) {
          logger.warn('Voice clone polling error', { error: (pollError as Error).message });
        }
      }

      await refundCredits(user, creditsRequired, 'TTS generation timed out');
      res.status(504).json({ success: false, error: 'Voice generation timed out' });
    } catch (error) {
      const err = error as Error;
      logger.error('Voice clone error:', { error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ============================================================================
  // AUDIO SEPARATION (Stem Extraction)
  // Uses Demucs for separating vocals, drums, bass, other
  // ============================================================================

  /**
   * Separate audio into stems
   * POST /api/audio/separate
   * 
   * Inputs:
   * - audio_url: URL of audio file to separate
   * - stems: Which stems to extract (default: all)
   */
  router.post('/separate', limiter, requireCredits(2), async (req: AuthenticatedRequest, res: Response) => {
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

      const { audio_url } = req.body as {
        audio_url?: string;
      };

      if (!audio_url) {
        res.status(400).json({ success: false, error: 'audio_url is required' });
        return;
      }

      const creditsRequired = 2; // Fixed cost for separation

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

      logger.info('Audio separation request', { userId: user.userId });

      // Submit to Demucs - using htdemucs_ft (fine-tuned) for best quality
      const result = await submitToQueue<{ request_id?: string }>('fal-ai/demucs', {
        audio_url,
        model: 'htdemucs_ft', // Fine-tuned model - highest quality (~9.0 dB SDR)
        shifts: 2, // More shifts = better quality, slightly slower
        overlap: 0.25
      });

      const requestId = result.request_id;

      if (!requestId) {
        await refundCredits(user, creditsRequired, 'No request ID returned');
        res.status(500).json({ success: false, error: 'Failed to submit separation request' });
        return;
      }

      // Poll for completion (separation takes 30-120 seconds typically)
      const maxWaitTime = 3 * 60 * 1000; // 3 minutes
      const pollInterval = 2000;
      const startTime = Date.now();

      while (Date.now() - startTime < maxWaitTime) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));

        try {
          const statusData = await checkQueueStatus<{ status?: string }>(requestId, 'fal-ai/demucs');
          const normalizedStatus = (statusData.status || '').toUpperCase();

          if (isStatusCompleted(normalizedStatus)) {
            const resultData = await getQueueResult<{
              vocals?: { url?: string };
              drums?: { url?: string };
              bass?: { url?: string };
              other?: { url?: string };
            }>(requestId, 'fal-ai/demucs');

            logger.info('Audio separation completed', { requestId, userId: user.userId });
            
            res.json({
              success: true,
              stems: {
                vocals: resultData.vocals?.url || null,
                drums: resultData.drums?.url || null,
                bass: resultData.bass?.url || null,
                other: resultData.other?.url || null
              },
              remainingCredits: updateResult.credits,
              creditsDeducted: creditsRequired
            });
            return;
          } else if (isStatusFailed(normalizedStatus)) {
            await refundCredits(user, creditsRequired, 'Audio separation failed');
            res.status(500).json({ success: false, error: 'Audio separation failed' });
            return;
          }
        } catch (pollError) {
          logger.warn('Audio separation polling error', { error: (pollError as Error).message });
        }
      }

      await refundCredits(user, creditsRequired, 'Audio separation timed out');
      res.status(504).json({ success: false, error: 'Audio separation timed out' });
    } catch (error) {
      const err = error as Error;
      logger.error('Audio separation error:', { error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ============================================================================
  // LIP SYNC
  // Uses SadTalker to animate portraits with audio
  // ============================================================================

  /**
   * Generate lip-synced video from portrait and audio
   * POST /api/audio/lip-sync
   * 
   * Inputs:
   * - image_url: Portrait image URL
   * - audio_url: Audio file URL
   * - expression_scale: How expressive (0.0-1.0, default 1.0)
   */
  router.post('/lip-sync', limiter, requireCredits(3), async (req: AuthenticatedRequest, res: Response) => {
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
        audio_url, 
        expression_scale = 1.0,
        pose_style = 0
      } = req.body as {
        image_url?: string;
        audio_url?: string;
        expression_scale?: number;
        pose_style?: number;
      };

      if (!image_url) {
        res.status(400).json({ success: false, error: 'image_url is required' });
        return;
      }

      if (!audio_url) {
        res.status(400).json({ success: false, error: 'audio_url is required' });
        return;
      }

      const creditsRequired = 3; // Fixed cost for lip sync

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

      logger.info('Lip sync request', { userId: user.userId });

      // Submit to SadTalker
      const result = await submitToQueue<{ request_id?: string }>('fal-ai/sadtalker', {
        source_image_url: image_url,
        driven_audio_url: audio_url,
        expression_scale: Math.max(0, Math.min(1, expression_scale)),
        pose_style,
        preprocess: 'full', // Full face preprocessing
        still_mode: false, // Allow head movement
        use_enhancer: true, // Enhance face quality
        batch_size: 2,
        size: 512
      });

      const requestId = result.request_id;

      if (!requestId) {
        await refundCredits(user, creditsRequired, 'No request ID returned');
        res.status(500).json({ success: false, error: 'Failed to submit lip sync request' });
        return;
      }

      // Poll for completion (lip sync takes 1-3 minutes)
      const maxWaitTime = 5 * 60 * 1000; // 5 minutes
      const pollInterval = 3000;
      const startTime = Date.now();

      while (Date.now() - startTime < maxWaitTime) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));

        try {
          const statusData = await checkQueueStatus<{ status?: string }>(requestId, 'fal-ai/sadtalker');
          const normalizedStatus = (statusData.status || '').toUpperCase();

          logger.debug('Lip sync status', { requestId, status: normalizedStatus });

          if (isStatusCompleted(normalizedStatus)) {
            const resultData = await getQueueResult<{
              video?: { url?: string };
              video_url?: string;
            }>(requestId, 'fal-ai/sadtalker');

            const videoUrl = resultData.video?.url || resultData.video_url;

            if (videoUrl) {
              logger.info('Lip sync completed', { requestId, userId: user.userId });
              res.json({
                success: true,
                video_url: videoUrl,
                remainingCredits: updateResult.credits,
                creditsDeducted: creditsRequired
              });
              return;
            } else {
              await refundCredits(user, creditsRequired, 'No video URL in response');
              res.status(500).json({ success: false, error: 'No video generated' });
              return;
            }
          } else if (isStatusFailed(normalizedStatus)) {
            await refundCredits(user, creditsRequired, 'Lip sync failed');
            res.status(500).json({ success: false, error: 'Lip sync generation failed' });
            return;
          }
        } catch (pollError) {
          logger.warn('Lip sync polling error', { error: (pollError as Error).message });
        }
      }

      await refundCredits(user, creditsRequired, 'Lip sync timed out');
      res.status(504).json({ success: false, error: 'Lip sync generation timed out' });
    } catch (error) {
      const err = error as Error;
      logger.error('Lip sync error:', { error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ============================================================================
  // SOUND EFFECTS GENERATION
  // Uses AudioLDM for generating sound effects from text
  // ============================================================================

  /**
   * Generate sound effects from text description
   * POST /api/audio/sfx
   * 
   * Inputs:
   * - prompt: Description of sound effect
   * - duration: Duration in seconds (1-30)
   */
  router.post('/sfx', limiter, requireCredits(1), async (req: AuthenticatedRequest, res: Response) => {
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

      const { prompt, duration = 5 } = req.body as {
        prompt?: string;
        duration?: number;
      };

      if (!prompt || prompt.trim().length === 0) {
        res.status(400).json({ success: false, error: 'Prompt is required' });
        return;
      }

      const clampedDuration = Math.max(1, Math.min(30, duration));
      const creditsRequired = Math.max(0.5, Math.ceil(clampedDuration / 10) * 0.5);

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

      logger.info('SFX generation request', { 
        prompt: prompt.substring(0, 50), 
        duration: clampedDuration,
        userId: user.userId 
      });

      // Submit to AudioLDM
      const result = await submitToQueue<{ request_id?: string }>('fal-ai/audioldm2', {
        prompt: prompt.trim(),
        audio_length_in_s: clampedDuration,
        num_inference_steps: 200,
        guidance_scale: 3.5
      });

      const requestId = result.request_id;

      if (!requestId) {
        await refundCredits(user, creditsRequired, 'No request ID returned');
        res.status(500).json({ success: false, error: 'Failed to submit SFX request' });
        return;
      }

      // Poll for completion
      const maxWaitTime = 60 * 1000;
      const pollInterval = 1000;
      const startTime = Date.now();

      while (Date.now() - startTime < maxWaitTime) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));

        try {
          const statusData = await checkQueueStatus<{ status?: string }>(requestId, 'fal-ai/audioldm2');
          const normalizedStatus = (statusData.status || '').toUpperCase();

          if (isStatusCompleted(normalizedStatus)) {
            const resultData = await getQueueResult<{
              audio?: { url?: string };
              audio_url?: string;
            }>(requestId, 'fal-ai/audioldm2');

            const audioUrl = resultData.audio?.url || resultData.audio_url;

            if (audioUrl) {
              logger.info('SFX generation completed', { requestId, userId: user.userId });
              res.json({
                success: true,
                audio_url: audioUrl,
                duration: clampedDuration,
                remainingCredits: updateResult.credits,
                creditsDeducted: creditsRequired
              });
              return;
            } else {
              await refundCredits(user, creditsRequired, 'No audio URL in response');
              res.status(500).json({ success: false, error: 'No audio generated' });
              return;
            }
          } else if (isStatusFailed(normalizedStatus)) {
            await refundCredits(user, creditsRequired, 'SFX generation failed');
            res.status(500).json({ success: false, error: 'SFX generation failed' });
            return;
          }
        } catch (pollError) {
          logger.warn('SFX polling error', { error: (pollError as Error).message });
        }
      }

      await refundCredits(user, creditsRequired, 'SFX generation timed out');
      res.status(504).json({ success: false, error: 'SFX generation timed out' });
    } catch (error) {
      const err = error as Error;
      logger.error('SFX generation error:', { error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ============================================================================
  // EXTRACT AUDIO FROM VIDEO
  // Extracts audio track from video files using FFmpeg
  // ============================================================================

  /**
   * Extract audio from video file
   * POST /api/audio/extract-audio
   */
  router.post('/extract-audio', async (req: Request, res: Response) => {
    try {
      // Import utilities at the start
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const { createWriteStream, unlink } = await import('fs');
      const { tmpdir } = await import('os');
      const { join } = await import('path');
      const execAsync = promisify(exec);
      const unlinkAsync = promisify(unlink);
      const fs = await import('fs/promises');

      // Check if FFmpeg is available
      try {
        await execAsync('ffmpeg -version');
      } catch {
        logger.error('FFmpeg not available for audio extraction');
        res.status(503).json({ 
          success: false, 
          error: 'Audio extraction service unavailable. FFmpeg is not installed on this server.' 
        });
        return;
      }

      const { videoDataUri } = req.body as { videoDataUri?: string };
      
      if (!videoDataUri || !videoDataUri.startsWith('data:')) {
        res.status(400).json({ success: false, error: 'Invalid video data URI. Please upload a valid video file.' });
        return;
      }

      // Calculate actual file size from base64 (base64 is ~33% larger than binary)
      const base64Data = videoDataUri.split(',')[1];
      if (!base64Data) {
        res.status(400).json({ success: false, error: 'Invalid video data URI format' });
        return;
      }

      const actualSize = Math.ceil(base64Data.length * 0.75); // Approximate binary size
      const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100MB
      if (actualSize > MAX_VIDEO_SIZE) {
        res.status(400).json({ 
          success: false, 
          error: `Video file too large (${Math.round(actualSize / (1024 * 1024))}MB). Maximum size is ${MAX_VIDEO_SIZE / (1024 * 1024)}MB.` 
        });
        return;
      }
      
      const buffer = Buffer.from(base64Data, 'base64');
      const mimeMatch = videoDataUri.match(/data:([^;]+)/);
      const mimeType = mimeMatch ? mimeMatch[1] : 'video/mp4';
      
      // Check if it's actually a video file
      if (!mimeType.startsWith('video/')) {
        res.status(400).json({ success: false, error: 'File must be a video' });
        return;
      }

      logger.info('Extracting audio from video', { 
        mimeType, 
        sizeBytes: buffer.length,
        sizeMB: Math.round(buffer.length / (1024 * 1024) * 10) / 10 
      });

      // Determine input format from mime type
      let inputExt = 'mp4';
      if (mimeType.includes('webm')) inputExt = 'webm';
      else if (mimeType.includes('mov')) inputExt = 'mov';
      else if (mimeType.includes('avi')) inputExt = 'avi';
      else if (mimeType.includes('mkv')) inputExt = 'mkv';

      const tempInput = join(tmpdir(), `video-input-${Date.now()}-${Math.random().toString(36).substring(7)}.${inputExt}`);
      const tempOutput = join(tmpdir(), `audio-output-${Date.now()}-${Math.random().toString(36).substring(7)}.wav`);

      try {
        // Write video buffer to temp file
        const writeStream = createWriteStream(tempInput);
        writeStream.write(buffer);
        writeStream.end();
        await new Promise<void>((resolve, reject) => {
          writeStream.on('finish', resolve);
          writeStream.on('error', reject);
        });

        // Extract audio using FFmpeg: -vn removes video, -acodec pcm_s16le outputs WAV
        const ffmpegCommand = `ffmpeg -i "${tempInput}" -vn -acodec pcm_s16le -ar 44100 -ac 2 "${tempOutput}" -y`;
        
        await execAsync(ffmpegCommand);

        // Read extracted audio
        const audioBuffer = await fs.readFile(tempOutput);

        // Upload extracted audio to FAL storage
        const audioUrl = await uploadToFal(audioBuffer, 'audio/wav', 'extracted-audio.wav');

        if (!audioUrl) {
          res.status(500).json({ success: false, error: 'No audio URL returned from upload' });
          return;
        }

        // Clean up temp files
        try {
          await unlinkAsync(tempInput);
          await unlinkAsync(tempOutput);
        } catch (cleanupError) {
          const err = cleanupError as Error;
          logger.warn('Failed to cleanup temp files', { error: err.message });
        }

        res.json({ success: true, url: audioUrl });
      } catch (ffmpegError) {
        const err = ffmpegError as Error;
        logger.error('Audio extraction error', { error: err.message });
        
        // Clean up temp files on error
        try {
          await unlinkAsync(tempInput).catch(() => {});
          await unlinkAsync(tempOutput).catch(() => {});
        } catch {
          // Ignore cleanup errors
        }

        res.status(500).json({ 
          success: false, 
          error: `Failed to extract audio: ${err.message}. Make sure FFmpeg is installed.` 
        });
      }
    } catch (error) {
      const err = error as Error;
      logger.error('Audio extraction error', { error: err.message, stack: err.stack });
      res.status(500).json({ success: false, error: err.message || 'Failed to extract audio' });
    }
  });

  // ============================================================================
  // UPLOAD AUDIO FILE
  // Helper endpoint to upload audio to FAL storage
  // ============================================================================

  /**
   * Upload audio file
   * POST /api/audio/upload
   */
  router.post('/upload', async (req: Request, res: Response) => {
    try {
      const FAL_API_KEY = getFalApiKey();
      if (!FAL_API_KEY) {
        res.status(500).json({ success: false, error: 'AI service not configured' });
        return;
      }

      const { audioDataUri } = req.body as { audioDataUri?: string };
      
      if (!audioDataUri || !audioDataUri.startsWith('data:')) {
        res.status(400).json({ success: false, error: 'Invalid audio data URI' });
        return;
      }

      const MAX_AUDIO_SIZE = 25 * 1024 * 1024; // 25MB
      if (audioDataUri.length > MAX_AUDIO_SIZE) {
        res.status(400).json({ 
          success: false, 
          error: `Audio file too large. Maximum size is ${MAX_AUDIO_SIZE / (1024 * 1024)}MB.` 
        });
        return;
      }

      const base64Data = audioDataUri.split(',')[1];
      if (!base64Data) {
        res.status(400).json({ success: false, error: 'Invalid audio data URI format' });
        return;
      }
      
      const buffer = Buffer.from(base64Data, 'base64');
      const mimeMatch = audioDataUri.match(/data:([^;]+)/);
      const mimeType = mimeMatch ? mimeMatch[1] : 'audio/wav';
      
      // Determine extension from mime type
      let extension = 'wav';
      if (mimeType.includes('mp3') || mimeType.includes('mpeg')) extension = 'mp3';
      else if (mimeType.includes('ogg')) extension = 'ogg';
      else if (mimeType.includes('webm')) extension = 'webm';
      else if (mimeType.includes('m4a')) extension = 'm4a';
      
      const audioUrl = await uploadToFal(buffer, mimeType, `audio.${extension}`);
      
      if (!audioUrl) {
        res.status(500).json({ success: false, error: 'No audio URL returned from upload' });
        return;
      }

      res.json({ success: true, url: audioUrl });
    } catch (error) {
      const err = error as Error;
      logger.error('Audio upload error', { error: err.message, stack: err.stack });
      res.status(500).json({ success: false, error: err.message || 'Failed to upload audio' });
    }
  });

  return router;
}

export default createAudioRoutes;

