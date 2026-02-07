/**
 * Audio routes
 * Voice cloning, TTS, audio separation, and sound effects
 */
import { Router, type Request, type Response } from 'express';
import type { RequestHandler } from 'express';
import logger from '../utils/logger';
import { isValidPublicUrl } from '../utils/validation';
import { submitToQueue, checkQueueStatus, getQueueResult, getFalApiKey, uploadToFal, isStatusCompleted, isStatusFailed } from '../services/fal';
import type { IUser } from '../models/User';
import { applyClawMarkup } from '../middleware/credits';
import { settleX402Payment, type X402Request } from '../middleware/x402Payment';
import { authenticateFlexible, requireVerifiedIdentity } from '../middleware/auth';
import {
  deductCredits,
  refundCredits,
  validateUser,
  handleCreditError,
  ServiceNotConfiguredError
} from '../services/creditTransaction';

// Types
interface Dependencies {
  rateLimiter?: RequestHandler;
  requireCredits: (credits: number) => RequestHandler;
}

interface AuthenticatedRequest extends Request {
  user?: IUser;
  hasFreeAccess?: boolean;
}

export function createAudioRoutes(deps: Dependencies) {
  const router = Router();
  const { rateLimiter, requireCredits } = deps;

  const limiter = rateLimiter || ((_req: Request, _res: Response, next: () => void) => next());

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
   * SECURITY: Requires verified identity (JWT or x402) for credit-spending operations
   */
  router.post('/voice-clone', limiter, authenticateFlexible, requireVerifiedIdentity, requireCredits(1), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user;
      validateUser(user);
      if (!getFalApiKey()) throw new ServiceNotConfiguredError();

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

      // SECURITY FIX: Validate URL to prevent SSRF
      if (voice_url && !isValidPublicUrl(voice_url)) {
        res.status(400).json({ success: false, error: 'Invalid voice URL' });
        return;
      }

      // Calculate credits based on text length (0.5 credits per 500 chars, min 1)
      const creditsRequired = applyClawMarkup(req, Math.max(1, Math.ceil(text.length / 500) * 0.5));
      const hasFreeAccess = req.hasFreeAccess || false;
      const { remainingCredits, actualCreditsDeducted } = await deductCredits(user, creditsRequired, hasFreeAccess);

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
                remainingCredits,
                creditsDeducted: actualCreditsDeducted
              });
              return;
            } else {
              await refundCredits(user, actualCreditsDeducted, 'No audio URL in response');
              res.status(500).json({ success: false, error: 'No audio generated', creditsRefunded: actualCreditsDeducted });
              return;
            }
          } else if (isStatusFailed(normalizedStatus)) {
            await refundCredits(user, actualCreditsDeducted, 'TTS generation failed');
            res.status(500).json({ success: false, error: 'Voice generation failed', creditsRefunded: actualCreditsDeducted });
            return;
          }
        } catch (pollError) {
          logger.warn('Voice clone polling error', { error: (pollError as Error).message });
        }
      }

      await refundCredits(user, actualCreditsDeducted, 'TTS generation timed out');
      res.status(504).json({ success: false, error: 'Voice generation timed out', creditsRefunded: actualCreditsDeducted });
    } catch (error) {
      const err = error as Error;
      logger.error('Voice clone error:', { error: err.message });
      if (handleCreditError(error, res)) return;
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
   * SECURITY: Requires verified identity (JWT or x402) for credit-spending operations
   */
  router.post('/separate', limiter, authenticateFlexible, requireVerifiedIdentity, requireCredits(2), async (req: AuthenticatedRequest, res: Response) => {
    let user: IUser | undefined;
    let actualCreditsDeducted = 0;
    
    try {
      user = req.user;
      validateUser(user);
      if (!getFalApiKey()) throw new ServiceNotConfiguredError();

      const { audio_url } = req.body as {
        audio_url?: string;
      };

      if (!audio_url) {
        res.status(400).json({ success: false, error: 'audio_url is required' });
        return;
      }

      // SECURITY FIX: Validate URL to prevent SSRF
      if (!isValidPublicUrl(audio_url)) {
        res.status(400).json({ success: false, error: 'Invalid audio URL' });
        return;
      }

      const creditsRequired = applyClawMarkup(req, 2); // Fixed cost for separation
      const hasFreeAccess = req.hasFreeAccess || false;
      const deductResult = await deductCredits(user, creditsRequired, hasFreeAccess);
      actualCreditsDeducted = deductResult.actualCreditsDeducted;

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
        await refundCredits(user, actualCreditsDeducted, 'No request ID returned');
        res.status(500).json({ success: false, error: 'Failed to submit separation request', creditsRefunded: actualCreditsDeducted });
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
              remainingCredits: deductResult.remainingCredits,
              creditsDeducted: actualCreditsDeducted
            });
            return;
          } else if (isStatusFailed(normalizedStatus)) {
            await refundCredits(user, actualCreditsDeducted, 'Audio separation failed');
            res.status(500).json({ success: false, error: 'Audio separation failed', creditsRefunded: actualCreditsDeducted });
            return;
          }
        } catch (pollError) {
          logger.warn('Audio separation polling error', { error: (pollError as Error).message });
        }
      }

      await refundCredits(user, actualCreditsDeducted, 'Audio separation timed out');
      res.status(504).json({ success: false, error: 'Audio separation timed out', creditsRefunded: actualCreditsDeducted });
    } catch (error) {
      const err = error as Error;
      logger.error('Audio separation error:', { error: err.message });
      if (handleCreditError(error, res)) return;
      if (user && actualCreditsDeducted > 0) {
        await refundCredits(user, actualCreditsDeducted, `Audio separation error: ${err.message}`);
      }
      res.status(500).json({ success: false, error: err.message, creditsRefunded: actualCreditsDeducted });
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
   * SECURITY: Requires verified identity (JWT or x402) for credit-spending operations
   */
  router.post('/lip-sync', limiter, authenticateFlexible, requireVerifiedIdentity, requireCredits(3), async (req: AuthenticatedRequest, res: Response) => {
    let user: IUser | undefined;
    let actualCreditsDeducted = 0;
    
    try {
      user = req.user;
      validateUser(user);
      if (!getFalApiKey()) throw new ServiceNotConfiguredError();

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

      // SECURITY FIX: Validate URLs to prevent SSRF
      if (!isValidPublicUrl(image_url)) {
        res.status(400).json({ success: false, error: 'Invalid image URL' });
        return;
      }

      if (!isValidPublicUrl(audio_url)) {
        res.status(400).json({ success: false, error: 'Invalid audio URL' });
        return;
      }

      const creditsRequired = applyClawMarkup(req, 3); // Fixed cost for lip sync
      const hasFreeAccess = req.hasFreeAccess || false;
      const deductResult = await deductCredits(user, creditsRequired, hasFreeAccess);
      actualCreditsDeducted = deductResult.actualCreditsDeducted;

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
        await refundCredits(user, actualCreditsDeducted, 'No request ID returned');
        res.status(500).json({ success: false, error: 'Failed to submit lip sync request', creditsRefunded: actualCreditsDeducted });
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
                remainingCredits: deductResult.remainingCredits,
                creditsDeducted: actualCreditsDeducted
              });
              return;
            } else {
              await refundCredits(user, actualCreditsDeducted, 'No video URL in response');
              res.status(500).json({ success: false, error: 'No video generated', creditsRefunded: actualCreditsDeducted });
              return;
            }
          } else if (isStatusFailed(normalizedStatus)) {
            await refundCredits(user, actualCreditsDeducted, 'Lip sync failed');
            res.status(500).json({ success: false, error: 'Lip sync generation failed', creditsRefunded: actualCreditsDeducted });
            return;
          }
        } catch (pollError) {
          logger.warn('Lip sync polling error', { error: (pollError as Error).message });
        }
      }

      await refundCredits(user, actualCreditsDeducted, 'Lip sync timed out');
      res.status(504).json({ success: false, error: 'Lip sync generation timed out', creditsRefunded: actualCreditsDeducted });
    } catch (error) {
      const err = error as Error;
      logger.error('Lip sync error:', { error: err.message });
      if (handleCreditError(error, res)) return;
      if (user && actualCreditsDeducted > 0) {
        await refundCredits(user, actualCreditsDeducted, `Lip sync error: ${err.message}`);
      }
      res.status(500).json({ success: false, error: err.message, creditsRefunded: actualCreditsDeducted });
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
   * SECURITY: Requires verified identity (JWT or x402) for credit-spending operations
   */
  router.post('/sfx', limiter, authenticateFlexible, requireVerifiedIdentity, requireCredits(1), async (req: AuthenticatedRequest, res: Response) => {
    let user: IUser | undefined;
    let actualCreditsDeducted = 0;
    let remainingCredits = 0;
    
    try {
      user = req.user;
      validateUser(user);
      if (!getFalApiKey()) throw new ServiceNotConfiguredError();

      const { prompt, duration = 5 } = req.body as {
        prompt?: string;
        duration?: number;
      };

      if (!prompt || prompt.trim().length === 0) {
        res.status(400).json({ success: false, error: 'Prompt is required' });
        return;
      }

      const clampedDuration = Math.max(1, Math.min(30, duration));
      const creditsRequired = applyClawMarkup(req, Math.max(0.5, Math.ceil(clampedDuration / 10) * 0.5));
      const hasFreeAccess = req.hasFreeAccess || false;

      const deductResult = await deductCredits(user, creditsRequired, hasFreeAccess);
      remainingCredits = deductResult.remainingCredits;
      actualCreditsDeducted = deductResult.actualCreditsDeducted;

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
        await refundCredits(user, actualCreditsDeducted, 'No request ID returned');
        res.status(500).json({ success: false, error: 'Failed to submit SFX request', creditsRefunded: actualCreditsDeducted });
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
              
              // x402: Settle payment after successful SFX generation
              const x402Req = req as X402Request;
              if (x402Req.isX402Paid && x402Req.x402Payment) {
                const settlement = await settleX402Payment(x402Req);
                if (!settlement.success) {
                  logger.error('x402 settlement failed after SFX generation', { error: settlement.error });
                }
              }

              const responseData: Record<string, unknown> = {
                success: true,
                audio_url: audioUrl,
                duration: clampedDuration,
                remainingCredits,
                creditsDeducted: actualCreditsDeducted
              };
              
              if (x402Req.isX402Paid && x402Req.x402Payment) {
                responseData.x402 = {
                  settled: x402Req.x402Payment.settled,
                  transactionHash: x402Req.x402Payment.transactionHash,
                };
              }

              res.json(responseData);
              return;
            } else {
              if (actualCreditsDeducted > 0) {
                await refundCredits(user, actualCreditsDeducted, 'No audio URL in response');
              }
              res.status(500).json({ success: false, error: 'No audio generated', creditsRefunded: actualCreditsDeducted });
              return;
            }
          } else if (isStatusFailed(normalizedStatus)) {
            if (actualCreditsDeducted > 0) {
              await refundCredits(user, actualCreditsDeducted, 'SFX generation failed');
            }
            res.status(500).json({ success: false, error: 'SFX generation failed', creditsRefunded: actualCreditsDeducted });
            return;
          }
        } catch (pollError) {
          logger.warn('SFX polling error', { error: (pollError as Error).message });
        }
      }

      if (actualCreditsDeducted > 0) {
        await refundCredits(user, actualCreditsDeducted, 'SFX generation timed out');
      }
      res.status(504).json({ success: false, error: 'SFX generation timed out', creditsRefunded: actualCreditsDeducted });
    } catch (error) {
      const err = error as Error;
      logger.error('SFX generation error:', { error: err.message });
      if (handleCreditError(error, res)) return;
      if (user && actualCreditsDeducted > 0) {
        await refundCredits(user, actualCreditsDeducted, `SFX error: ${err.message}`);
      }
      res.status(500).json({ success: false, error: err.message, creditsRefunded: actualCreditsDeducted });
    }
  });

  // ============================================================================
  // EXTRACT AUDIO FROM VIDEO
  // Extracts audio track from video files using FFmpeg
  // ============================================================================

  /**
   * Extract audio from video file
   * POST /api/audio/extract-audio
   * SECURITY: Requires verified identity (JWT or x402) for credit-spending operations
   */
  router.post('/extract-audio', limiter, authenticateFlexible, requireVerifiedIdentity, requireCredits(0.5), async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }
    try {
      // Import utilities at the start
      const { execFile } = await import('child_process');
      const { promisify } = await import('util');
      const { createWriteStream, unlink } = await import('fs');
      const { tmpdir } = await import('os');
      const { resolve } = await import('path');
      const execFileAsync = promisify(execFile);
      const unlinkAsync = promisify(unlink);
      const fs = await import('fs/promises');

      // SECURITY FIX: Use execFile to prevent command injection
      // Check if FFmpeg is available
      try {
        const versionCheck = await execFileAsync('ffmpeg', ['-version'], { timeout: 5000 });
        logger.debug('FFmpeg version check passed', { 
          stdout: (versionCheck.stdout as string)?.substring(0, 100) 
        });
      } catch (error) {
        const err = error as Error;
        logger.error('FFmpeg not available for audio extraction', { error: err.message });
        res.status(503).json({ 
          success: false, 
          error: 'Audio extraction service unavailable. FFmpeg is not installed on this server. Please ensure full ffmpeg package (not ffmpeg-headless) is installed.' 
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
      
      let buffer: Buffer | null = Buffer.from(base64Data, 'base64');
      const mimeMatch = videoDataUri.match(/data:([^;]+)/);
      const mimeType = mimeMatch ? mimeMatch[1] : 'video/mp4';
      
      // Check if it's actually a video file
      if (!mimeType.startsWith('video/')) {
        buffer = null; // Memory optimization: release buffer early
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

      // SECURITY: Generate random filenames and validate they're within tmpdir
      const randomSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
      const tempInput = resolve(tmpdir(), `video-input-${randomSuffix}.${inputExt}`);
      const tempOutput = resolve(tmpdir(), `audio-output-${randomSuffix}.wav`);
      
      // SECURITY: Validate paths are within tmpdir (prevent path traversal)
      const tmpDirResolved = resolve(tmpdir());
      if (!tempInput.startsWith(tmpDirResolved) || !tempOutput.startsWith(tmpDirResolved)) {
        res.status(500).json({ success: false, error: 'Invalid temporary file path' });
        return;
      }

      try {
        // Write video buffer to temp file
        const writeStream = createWriteStream(tempInput);
        writeStream.write(buffer);
        writeStream.end();
        await new Promise<void>((resolve, reject) => {
          writeStream.on('finish', resolve);
          writeStream.on('error', reject);
        });
        
        // Memory optimization: release large buffer after writing to disk
        buffer = null;

        // SECURITY FIX: Use execFile with array arguments instead of exec with string
        // This prevents shell interpretation and command injection
        // -vn removes video, -acodec pcm_s16le outputs WAV
        const ffmpegArgs = [
          '-i', tempInput,
          '-vn',
          '-acodec', 'pcm_s16le',
          '-ar', '44100',
          '-ac', '2',
          tempOutput,
          '-y'
        ];
        
        // SECURITY: Set timeout and maxBuffer to prevent DoS
        try {
          await execFileAsync('ffmpeg', ffmpegArgs, {
            timeout: 300000, // 5 minutes max
            maxBuffer: 10 * 1024 * 1024 // 10MB max output
          });
        } catch (ffmpegExecError) {
          const execErr = ffmpegExecError as Error;
          // Provide more specific error messages
          if (execErr.message.includes('codec') || execErr.message.includes('Unknown encoder')) {
            logger.error('FFmpeg codec error during audio extraction', { 
              error: execErr.message,
              suggestion: 'Ensure full ffmpeg package with all codecs is installed'
            });
            throw new Error(`FFmpeg codec error: ${execErr.message}. Ensure full ffmpeg package is installed.`);
          }
          throw ffmpegExecError;
        }

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
  /**
   * Upload audio file
   * POST /api/audio/upload
   * SECURITY: Requires verified identity (JWT or x402)
   */
  router.post('/upload', limiter, authenticateFlexible, requireVerifiedIdentity, requireCredits(0), async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

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
      
      let buffer: Buffer | null = Buffer.from(base64Data, 'base64');
      const mimeMatch = audioDataUri.match(/data:([^;]+)/);
      const mimeType = mimeMatch ? mimeMatch[1] : 'audio/wav';
      
      // Determine extension from mime type
      let extension = 'wav';
      if (mimeType.includes('mp3') || mimeType.includes('mpeg')) extension = 'mp3';
      else if (mimeType.includes('ogg')) extension = 'ogg';
      else if (mimeType.includes('webm')) extension = 'webm';
      else if (mimeType.includes('m4a')) extension = 'm4a';
      
      const audioUrl = await uploadToFal(buffer, mimeType, `audio.${extension}`);
      
      // Memory optimization: release buffer after upload
      buffer = null;
      
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

  // ============================================================================
  // SPEECH-TO-TEXT (Transcription)
  // Uses Whisper for audio/video transcription
  // ============================================================================

  /**
   * Transcribe audio or video to text
   * POST /api/audio/transcribe
   * 
   * Inputs:
   * - audio_url: URL of audio/video file to transcribe
   * - language: Language code hint (optional, auto-detected if omitted)
   * - task: 'transcribe' (default) or 'translate' (translate to English)
   * - chunk_level: 'segment' (default) or 'word' for word-level timestamps
   * SECURITY: Requires verified identity (JWT or x402) for credit-spending operations
   */
  router.post('/transcribe', limiter, authenticateFlexible, requireVerifiedIdentity, requireCredits(1), async (req: AuthenticatedRequest, res: Response) => {
    let user: IUser | undefined;
    let actualCreditsDeducted = 0;
    let remainingCredits = 0;
    
    try {
      user = req.user;
      validateUser(user);
      if (!getFalApiKey()) throw new ServiceNotConfiguredError();

      const {
        audio_url,
        language,
        task = 'transcribe',
        chunk_level = 'segment',
      } = req.body as {
        audio_url?: string;
        language?: string;
        task?: 'transcribe' | 'translate';
        chunk_level?: 'segment' | 'word';
      };

      if (!audio_url || typeof audio_url !== 'string') {
        res.status(400).json({ success: false, error: 'audio_url is required' });
        return;
      }

      // SECURITY FIX: Validate URL to prevent SSRF (replaces basic URL check)
      if (!isValidPublicUrl(audio_url)) {
        res.status(400).json({ success: false, error: 'Invalid audio URL' });
        return;
      }

      const creditsRequired = applyClawMarkup(req, 1);
      const hasFreeAccess = req.hasFreeAccess || false;
      const deductResult = await deductCredits(user, creditsRequired, hasFreeAccess);
      remainingCredits = deductResult.remainingCredits;
      actualCreditsDeducted = deductResult.actualCreditsDeducted;

      logger.info('Transcription request', {
        audioUrl: audio_url.substring(0, 60),
        language,
        task,
        chunk_level,
        userId: user.userId,
      });

      // Build request for Whisper
      const requestBody: Record<string, unknown> = {
        audio_url,
        task,
        chunk_level,
      };

      if (language) {
        requestBody.language = language;
      }

      // Submit to FAL queue (Whisper large-v3)
      const result = await submitToQueue<{ request_id?: string }>('fal-ai/whisper', requestBody);
      const requestId = result.request_id;

      if (!requestId) {
        await refundCredits(user, actualCreditsDeducted, 'No request ID returned for transcription');
        res.status(500).json({ success: false, error: 'Failed to submit transcription request', creditsRefunded: actualCreditsDeducted });
        return;
      }

      // Poll for completion
      const maxWaitTime = 120 * 1000; // 2 minutes for long audio
      const pollInterval = 1000;
      const startTime = Date.now();

      while (Date.now() - startTime < maxWaitTime) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));

        try {
          const statusData = await checkQueueStatus<{ status?: string }>(requestId, 'fal-ai/whisper');
          const normalizedStatus = (statusData.status || '').toUpperCase();

          if (isStatusCompleted(normalizedStatus)) {
            const resultData = await getQueueResult<{
              text?: string;
              chunks?: Array<{
                text: string;
                timestamp: [number, number];
              }>;
              language?: string;
            }>(requestId, 'fal-ai/whisper');

            logger.info('Transcription completed', { requestId, userId: user.userId });

            // Settle x402 payment if applicable
            const x402Req = req as X402Request;
            if (x402Req.isX402Paid) {
              await settleX402Payment(x402Req);
            }

            res.json({
              success: true,
              text: resultData.text || '',
              chunks: resultData.chunks || [],
              detectedLanguage: resultData.language,
              task,
              remainingCredits,
              creditsDeducted: actualCreditsDeducted,
            });
            return;
          } else if (isStatusFailed(normalizedStatus)) {
            await refundCredits(user, actualCreditsDeducted, 'Transcription generation failed');
            res.status(500).json({ success: false, error: 'Transcription failed', creditsRefunded: actualCreditsDeducted });
            return;
          }
        } catch (pollError) {
          logger.warn('Transcription polling error', { error: (pollError as Error).message });
        }
      }

      await refundCredits(user, actualCreditsDeducted, 'Transcription timed out');
      res.status(504).json({ success: false, error: 'Transcription timed out', creditsRefunded: actualCreditsDeducted });
    } catch (error) {
      const err = error as Error;
      logger.error('Transcription error:', { error: err.message });
      if (handleCreditError(error, res)) return;
      if (user && actualCreditsDeducted > 0) {
        await refundCredits(user, actualCreditsDeducted, `Transcription error: ${err.message}`);
      }
      res.status(500).json({ success: false, error: err.message, creditsRefunded: actualCreditsDeducted });
    }
  });

  return router;
}

export default createAudioRoutes;

