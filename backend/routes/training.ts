/**
 * Training routes
 * LoRA model fine-tuning via fal.ai training APIs
 * 
 * Supports:
 * - FLUX LoRA Fast Training (fal-ai/flux-lora-fast-training)
 * - FLUX 2 Trainer (fal-ai/flux-2-trainer)
 * - FLUX 2 LoRA Inference (fal-ai/flux-2/lora)
 */
import { Router, type Request, type Response } from 'express';
import type { RequestHandler } from 'express';
import mongoose from 'mongoose';
import logger from '../utils/logger';
import { isValidPublicUrl } from '../utils/validation';
import { submitToQueue, checkQueueStatus, getQueueResult, isStatusCompleted, isStatusFailed, isStatusProcessing, normalizeStatus } from '../services/fal';
import { buildUserUpdateQuery } from '../services/user';
import type { IUser } from '../models/User';
import { applyClawMarkup } from '../middleware/credits';
import { CREDITS } from '../config/constants';
import config from '../config/env';

// Types
interface Dependencies {
  authenticateFlexible?: RequestHandler;
  requireCredits: (credits: number) => RequestHandler;
}

// Trainer endpoint mappings
const TRAINER_ENDPOINTS: Record<string, string> = {
  'flux-lora-fast': 'fal-ai/flux-lora-fast-training',
  'flux-2-trainer': 'fal-ai/flux-2-trainer'
};

/**
 * Calculate training credits based on trainer and steps
 * Uses constants from config (30% above fal.ai API cost, 1 credit = $0.10)
 */
function calculateTrainingCredits(trainer: string, steps: number): number {
  const costPerStep = trainer === 'flux-lora-fast'
    ? CREDITS.TRAINING_FLUX_LORA_FAST_PER_STEP   // 0.026 cr/step
    : CREDITS.TRAINING_FLUX_2_PER_STEP;           // 0.104 cr/step
  return Math.ceil(costPerStep * steps * 10) / 10; // Round to 1 decimal
}

export default function createTrainingRoutes(deps: Dependencies) {
  const router = Router();
  const { authenticateFlexible } = deps;
  const User = mongoose.model<IUser>('User');

  // ============================================================================
  // POST /submit - Submit a training job
  // ============================================================================
  const submitTraining: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
      const { trainer, images_data_url, trigger_word, steps = 1000, is_style = false, create_masks = true, default_caption } = req.body;
      const { walletAddress, userId } = req.body;

      // Validate trainer
      if (!trainer || !TRAINER_ENDPOINTS[trainer]) {
        res.status(400).json({ error: 'Invalid trainer. Must be "flux-lora-fast" or "flux-2-trainer"' });
        return;
      }

      // Validate images
      if (!images_data_url) {
        res.status(400).json({ error: 'images_data_url is required (URL to zip archive with training images)' });
        return;
      }

      // SECURITY FIX: Validate URL to prevent SSRF
      if (!isValidPublicUrl(images_data_url)) {
        res.status(400).json({ error: 'Invalid images data URL' });
        return;
      }

      // Validate steps
      const numSteps = Math.min(Math.max(Number(steps) || 1000, 100), 10000);

      // Find user & check credits
      const userQuery = buildUserUpdateQuery({ walletAddress, userId });
      if (!userQuery) {
        res.status(401).json({ error: 'No valid user identification provided. Wallet address required.' });
        return;
      }

      const user = await User.findOne(userQuery);
      if (!user) {
        res.status(401).json({ error: 'User not found' });
        return;
      }

      // Calculate credits needed
      const baseCredits = calculateTrainingCredits(trainer, numSteps);
      const creditsNeeded = applyClawMarkup(req, baseCredits);

      if ((user.credits || 0) < creditsNeeded) {
        res.status(402).json({
          error: `Insufficient credits. Training requires ${creditsNeeded} credits (${numSteps} steps). You have ${user.credits || 0} credits.`,
          creditsRequired: creditsNeeded,
          creditsAvailable: user.credits || 0
        });
        return;
      }

      // Build training input based on trainer
      const endpoint = TRAINER_ENDPOINTS[trainer];
      let trainingInput: Record<string, unknown>;

      if (trainer === 'flux-lora-fast') {
        trainingInput = {
          images_data_url,
          steps: numSteps,
          create_masks,
          is_style,
          ...(trigger_word && { trigger_word }),
        };
      } else {
        // flux-2-trainer
        trainingInput = {
          images_data_url,
          steps: numSteps,
          ...(trigger_word && { trigger_word }),
          ...(default_caption && { default_caption }),
        };
      }

      logger.info('Submitting training job', {
        trainer,
        steps: numSteps,
        credits: creditsNeeded,
        userId: user._id?.toString()
      });

      // Submit to FAL queue
      interface QueueResponse {
        request_id: string;
        status?: string;
      }
      const queueResult = await submitToQueue<QueueResponse>(endpoint, trainingInput);

      if (!queueResult?.request_id) {
        res.status(500).json({ error: 'Failed to submit training job - no request ID returned' });
        return;
      }

      // Deduct credits
      user.credits = (user.credits || 0) - creditsNeeded;
      
      // Store training job in user's trained models
      if (!user.trainedModels) {
        user.trainedModels = [];
      }
      
      const modelEntry = {
        id: queueResult.request_id,
        name: `${trainer === 'flux-lora-fast' ? 'FLUX LoRA' : 'FLUX 2'} - ${trigger_word || 'Custom'}`,
        trainer,
        loraUrl: '',
        triggerWord: trigger_word || '',
        createdAt: new Date().toISOString(),
        status: 'training' as const,
        requestId: queueResult.request_id
      };
      
      user.trainedModels.push(modelEntry);
      await user.save();

      res.json({
        success: true,
        requestId: queueResult.request_id,
        trainer,
        message: `Training job submitted successfully. ${numSteps} steps will take approximately ${Math.ceil(numSteps / 100)} minutes.`,
        creditsDeducted: creditsNeeded,
        remainingCredits: user.credits
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Training submission failed', { error: err.message });
      res.status(500).json({ error: `Training submission failed: ${err.message}` });
    }
  };

  // ============================================================================
  // GET /status/:requestId - Check training status
  // ============================================================================
  const getTrainingStatus: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
      const { requestId } = req.params;
      const trainer = (req.query.trainer as string) || 'flux-lora-fast';
      const endpoint = TRAINER_ENDPOINTS[trainer];

      if (!endpoint) {
        res.status(400).json({ error: 'Invalid trainer' });
        return;
      }

      interface StatusResponse {
        status?: string;
        logs?: Array<{ message: string }>;
        queue_position?: number;
      }

      const status = await checkQueueStatus<StatusResponse>(requestId, endpoint);
      const normalizedStatus = normalizeStatus(status?.status);

      res.json({
        status: normalizedStatus,
        logs: status?.logs?.map(l => l.message) || [],
        message: isStatusProcessing(normalizedStatus)
          ? 'Training in progress...'
          : isStatusCompleted(normalizedStatus)
            ? 'Training completed!'
            : isStatusFailed(normalizedStatus)
              ? 'Training failed'
              : `Status: ${normalizedStatus}`
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Training status check failed', { error: err.message });
      res.status(500).json({ error: `Status check failed: ${err.message}` });
    }
  };

  // ============================================================================
  // GET /result/:requestId - Get training result
  // ============================================================================
  const getTrainingResult: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
      const { requestId } = req.params;
      const trainer = (req.query.trainer as string) || 'flux-lora-fast';
      const endpoint = TRAINER_ENDPOINTS[trainer];

      if (!endpoint) {
        res.status(400).json({ error: 'Invalid trainer' });
        return;
      }

      interface TrainingResultResponse {
        diffusers_lora_file?: { url: string };
        config_file?: { url: string };
      }

      const result = await getQueueResult<TrainingResultResponse>(requestId, endpoint);

      if (!result?.diffusers_lora_file?.url) {
        res.status(404).json({ error: 'Training result not ready yet' });
        return;
      }

      // Update user's trained model entry
      const { walletAddress, userId } = req.query;
      if (walletAddress || userId) {
        const userQuery = buildUserUpdateQuery({
          walletAddress: walletAddress as string,
          userId: userId as string
        });
        if (userQuery) {
          await User.updateOne(
            { ...userQuery, 'trainedModels.requestId': requestId },
            {
              $set: {
                'trainedModels.$.status': 'ready',
                'trainedModels.$.loraUrl': result.diffusers_lora_file.url
              }
            }
          );
        }
      }

      res.json({
        success: true,
        loraUrl: result.diffusers_lora_file.url,
        configUrl: result.config_file?.url,
        trainer,
        triggerWord: req.query.triggerWord || ''
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Training result fetch failed', { error: err.message });
      res.status(500).json({ error: `Result fetch failed: ${err.message}` });
    }
  };

  // ============================================================================
  // GET /models - Get user's trained models
  // ============================================================================
  const getTrainedModels: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
      const { walletAddress, userId } = req.query;
      const userQuery = buildUserUpdateQuery({
        walletAddress: walletAddress as string,
        userId: userId as string
      });

      if (!userQuery) {
        res.status(401).json({ error: 'No valid user identification provided' });
        return;
      }

      const user = await User.findOne(userQuery).select('trainedModels');
      res.json({ models: user?.trainedModels || [] });
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to fetch trained models', { error: err.message });
      res.status(500).json({ error: err.message });
    }
  };

  // ============================================================================
  // DELETE /models/:modelId - Delete a trained model
  // ============================================================================
  const deleteTrainedModel: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
      const { modelId } = req.params;
      const { walletAddress, userId } = req.body;
      const userQuery = buildUserUpdateQuery({ walletAddress, userId });

      if (!userQuery) {
        res.status(401).json({ error: 'No valid user identification provided' });
        return;
      }

      await User.updateOne(userQuery, {
        $pull: { trainedModels: { id: modelId } }
      });

      res.json({ success: true });
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to delete trained model', { error: err.message });
      res.status(500).json({ error: err.message });
    }
  };

  // ============================================================================
  // POST /generate - Generate image with a trained LoRA model
  // ============================================================================
  const generateWithLora: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
      const { prompt, lora_url, lora_scale = 1.0, image_size = 'landscape_4_3', num_images = 1, guidance_scale = 2.5, num_inference_steps = 28, trigger_word } = req.body;
      const { walletAddress, userId } = req.body;

      if (!prompt) {
        res.status(400).json({ error: 'Prompt is required' });
        return;
      }

      if (!lora_url) {
        res.status(400).json({ error: 'LoRA URL is required' });
        return;
      }

      // SECURITY FIX: Validate URL to prevent SSRF
      if (!isValidPublicUrl(lora_url)) {
        res.status(400).json({ error: 'Invalid LoRA URL' });
        return;
      }

      // Find user & check credits
      const userQuery = buildUserUpdateQuery({ walletAddress, userId });
      if (!userQuery) {
        res.status(401).json({ error: 'No valid user identification provided. Wallet address required.' });
        return;
      }

      const user = await User.findOne(userQuery);
      if (!user) {
        res.status(401).json({ error: 'User not found' });
        return;
      }

      // LoRA generation: 30% above fal cost ($0.025/img × 1.3 = 0.35 credits)
      const baseCredits = CREDITS.LORA_INFERENCE_PER_IMAGE * (num_images || 1);
      const creditsNeeded = applyClawMarkup(req, baseCredits);

      if ((user.credits || 0) < creditsNeeded) {
        res.status(402).json({
          error: `Insufficient credits. Generation requires ${creditsNeeded} credits.`,
          creditsRequired: creditsNeeded,
          creditsAvailable: user.credits || 0
        });
        return;
      }

      // Prepend trigger word to prompt if provided
      const fullPrompt = trigger_word ? `${trigger_word} ${prompt}` : prompt;

      // Submit to FLUX 2 LoRA endpoint
      interface LoraQueueResponse {
        request_id: string;
      }

      const queueResult = await submitToQueue<LoraQueueResponse>('fal-ai/flux-2/lora', {
        prompt: fullPrompt,
        loras: [{ path: lora_url, scale: lora_scale }],
        image_size,
        num_images: num_images || 1,
        guidance_scale,
        num_inference_steps,
        output_format: 'png',
        enable_safety_checker: false
      });

      if (!queueResult?.request_id) {
        res.status(500).json({ error: 'Failed to submit generation request' });
        return;
      }

      // Poll for result (with timeout)
      const maxWaitMs = 120000; // 2 minutes
      const pollInterval = 2000;
      const startTime = Date.now();

      while (Date.now() - startTime < maxWaitMs) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));

        interface PollStatus {
          status?: string;
        }

        const status = await checkQueueStatus<PollStatus>(queueResult.request_id, 'fal-ai/flux-2/lora');
        const normalized = normalizeStatus(status?.status);

        if (isStatusCompleted(normalized)) {
          interface GenerationResult {
            images?: Array<{ url: string }>;
            seed?: number;
          }

          const result = await getQueueResult<GenerationResult>(queueResult.request_id, 'fal-ai/flux-2/lora');

          if (!result?.images?.length) {
            res.status(500).json({ error: 'Generation returned no images' });
            return;
          }

          // Deduct credits
          user.credits = (user.credits || 0) - creditsNeeded;
          await user.save();

          res.json({
            success: true,
            images: result.images.map(img => img.url),
            seed: result.seed,
            remainingCredits: user.credits,
            creditsDeducted: creditsNeeded
          });
          return;
        }

        if (isStatusFailed(normalized)) {
          res.status(500).json({ error: 'Generation failed' });
          return;
        }
      }

      res.status(408).json({ error: 'Generation timed out after 2 minutes' });
    } catch (error) {
      const err = error as Error;
      logger.error('LoRA generation failed', { error: err.message });
      res.status(500).json({ error: `Generation failed: ${err.message}` });
    }
  };

  // ============================================================================
  // POST /upload - Upload training zip to FAL storage
  // ============================================================================
  const uploadTrainingZip: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    try {
      const FAL_API_KEY = config.FAL_API_KEY;
      if (!FAL_API_KEY) {
        res.status(500).json({ error: 'AI service not configured' });
        return;
      }

      // Read raw body as buffer
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const bodyBuffer = Buffer.concat(chunks);

      if (bodyBuffer.length === 0) {
        res.status(400).json({ error: 'No file data received' });
        return;
      }

      if (bodyBuffer.length > 100 * 1024 * 1024) {
        res.status(413).json({ error: 'File too large. Maximum 100MB.' });
        return;
      }

      const filename = `training-${Date.now()}.zip`;

      // Step 1: Initiate upload to FAL storage
      const initiateResponse = await fetch('https://rest.fal.run/storage/upload/initiate', {
        method: 'POST',
        headers: {
          'Authorization': `Key ${FAL_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          file_name: filename,
          content_type: 'application/zip'
        })
      });

      if (!initiateResponse.ok) {
        const errorText = await initiateResponse.text();
        logger.error('Failed to initiate training upload', { status: initiateResponse.status, error: errorText.substring(0, 200) });
        res.status(500).json({ error: `Upload initiation failed: ${errorText.substring(0, 200)}` });
        return;
      }

      const initiateData = await initiateResponse.json() as { upload_url?: string; file_url?: string };
      if (!initiateData.upload_url || !initiateData.file_url) {
        res.status(500).json({ error: 'No upload URL returned from storage' });
        return;
      }

      // Step 2: Upload file to presigned URL
      const uploadResponse = await fetch(initiateData.upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/zip' },
        body: bodyBuffer
      });

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        logger.error('Failed to upload training zip', { status: uploadResponse.status, error: errorText.substring(0, 200) });
        res.status(500).json({ error: `File upload failed: ${errorText.substring(0, 200)}` });
        return;
      }

      logger.info('Training zip uploaded to FAL storage', { url: initiateData.file_url, size: bodyBuffer.length });
      res.json({ success: true, url: initiateData.file_url });
    } catch (error) {
      const err = error as Error;
      logger.error('Training zip upload error', { error: err.message });
      res.status(500).json({ error: `Upload failed: ${err.message}` });
    }
  };

  // Mount routes
  if (authenticateFlexible) {
    router.post('/upload', authenticateFlexible, uploadTrainingZip);
    router.post('/submit', authenticateFlexible, submitTraining);
    router.get('/status/:requestId', authenticateFlexible, getTrainingStatus);
    router.get('/result/:requestId', authenticateFlexible, getTrainingResult);
    router.get('/models', authenticateFlexible, getTrainedModels);
    router.delete('/models/:modelId', authenticateFlexible, deleteTrainedModel);
    router.post('/generate', authenticateFlexible, generateWithLora);
  } else {
    router.post('/upload', uploadTrainingZip);
    router.post('/submit', submitTraining);
    router.get('/status/:requestId', getTrainingStatus);
    router.get('/result/:requestId', getTrainingResult);
    router.get('/models', getTrainedModels);
    router.delete('/models/:modelId', deleteTrainedModel);
    router.post('/generate', generateWithLora);
  }

  return router;
}
