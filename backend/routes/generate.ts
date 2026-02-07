/**
 * Generation routes
 * Image, video, and music generation endpoints
 */
import { Router, type Request, type Response } from 'express';
import type { RequestHandler } from 'express';
import mongoose from 'mongoose';
import logger from '../utils/logger';
import { requireAuth } from '../utils/responses';
import { submitToQueue, checkQueueStatus, getQueueResult, getFalApiKey, isStatusCompleted, isStatusFailed, normalizeStatus, FAL_STATUS } from '../services/fal';
import llmProvider, { DEFAULT_MODELS } from '../services/llmProvider';
import { buildUserUpdateQuery } from '../services/user';
import type { IUser } from '../models/User';
import { calculateVideoCredits, calculateMusicCredits, calculateUpscaleCredits, calculateVideoToAudioCredits } from '../utils/creditCalculations';
import { applyClawMarkup } from '../middleware/credits';
import { encrypt, isEncryptionConfigured } from '../utils/encryption';
import { withRetry } from '../utils/mongoRetry';
import { ethers } from 'ethers';
import { recordProvenance, getProvenanceAgentRegistry, isProvenanceConfigured } from '../services/provenanceService';
import { settleX402Payment, type X402Request } from '../middleware/x402Payment';
import { requireTokenGate } from '../middleware/tokenGate';
import config from '../config/env';
import {
  deductCredits,
  refundCredits,
  validateUser,
  ServiceNotConfiguredError
} from '../services/creditTransaction';
import {
  optimizePromptForFlux2T2I,
  optimizePromptForFlux2Edit,
  type PromptOptimizationResult
} from '../services/promptOptimizer';

// Re-export prompt optimizers (used by chatAssistant.ts)
export {
  optimizePromptForMusic,
  optimizePromptForFlux2T2I,
  optimizePromptForFlux2Edit,
  optimizePromptForFluxEdit,
  optimizePromptForNanoBananaEdit,
} from '../services/promptOptimizer';

// ============================================================================
// TYPES
// ============================================================================

interface Dependencies {
  authenticateFlexible?: RequestHandler;
  requireCreditsForModel: () => RequestHandler;
  requireCreditsForVideo: () => RequestHandler;
  requireCredits: (credits: number) => RequestHandler;
}

interface AuthenticatedRequest extends Request {
  user?: IUser;
  creditsRequired?: number;
  hasFreeAccess?: boolean;
}

interface FalImageResponse {
  images?: Array<{ url?: string } | string>;
  image?: { url?: string } | string;
}

// ============================================================================
// ASIAN LANGUAGE TO ENGLISH PROMPT TRANSLATION
// ============================================================================

function containsJapaneseKana(text: string): boolean {
  return /[\u3040-\u309F\u30A0-\u30FF]/.test(text);
}

function containsCJK(text: string): boolean {
  return /[\u4E00-\u9FFF\u3400-\u4DBF]/.test(text);
}

function detectAsianLanguage(text: string): 'japanese' | 'chinese' | null {
  if (containsJapaneseKana(text)) return 'japanese';
  if (containsCJK(text)) return 'chinese';
  return null;
}

interface TranslationResult {
  translatedPrompt: string;
  wasTranslated: boolean;
  sourceLanguage?: 'japanese' | 'chinese';
  error?: string;
}

async function translateAsianToEnglish(prompt: string): Promise<TranslationResult> {
  const sourceLanguage = detectAsianLanguage(prompt);
  if (!sourceLanguage) return { translatedPrompt: prompt, wasTranslated: false };

  if (!llmProvider.isLLMConfigured()) {
    logger.warn('Translation skipped: No LLM provider configured');
    return { translatedPrompt: prompt, wasTranslated: false, error: 'LLM not configured' };
  }

  try {
    const languageName = sourceLanguage === 'japanese' ? 'Japanese' : 'Chinese';
    const llmResponse = await llmProvider.complete({
      model: DEFAULT_MODELS.internal,
      prompt: `Translate the following ${languageName} text to English. This is a prompt for AI image/video/music generation, so preserve all descriptive details, style keywords, and artistic directions. Output ONLY the English translation, nothing else.\n\n${languageName} text: ${prompt}\n\nEnglish translation:`,
      maxTokens: 500,
      timeoutMs: 8000,
      useCase: 'translation',
    });

    const output = llmResponse.content.trim();
    if (output.length > 0) {
      logger.debug('Prompt translated', {
        sourceLanguage,
        original: prompt.substring(0, 50),
        translated: output.substring(0, 50)
      });
      return { translatedPrompt: output, wasTranslated: true, sourceLanguage };
    }

    return { translatedPrompt: prompt, wasTranslated: false, error: 'Empty translation response' };
  } catch (error) {
    const err = error as Error;
    logger.error('Translation error', { error: err.message, language: sourceLanguage });
    return { translatedPrompt: prompt, wasTranslated: false, error: err.message };
  }
}

// ============================================================================
// SHARED HELPERS
// ============================================================================

const ASPECT_TO_SIZE: Record<string, string> = {
  '1:1': 'square',
  '4:3': 'landscape_4_3',
  '16:9': 'landscape_16_9',
  '3:4': 'portrait_4_3',
  '9:16': 'portrait_16_9'
};

/** Extract image URLs from FAL API response */
function extractFalImageUrls(result: FalImageResponse): string[] {
  const images: string[] = [];
  if (result.images && Array.isArray(result.images)) {
    for (const img of result.images) {
      if (typeof img === 'string') images.push(img);
      else if (img?.url) images.push(img.url);
    }
  } else if (result.image) {
    if (typeof result.image === 'string') images.push(result.image);
    else if (result.image.url) images.push(result.image.url);
  }
  return images;
}

/** Extract video URL from deeply nested FAL response objects */
function extractVideoUrl(data: Record<string, unknown>): {
  url: string | null;
  meta: { content_type?: string; file_name?: string; file_size?: number } | null;
} {
  // Paths that may contain { url, content_type, ... } or a bare string
  const objectPaths = ['video', 'data.video', 'output.video', 'response.video', 'result.video', 'payload.video'];
  // Paths that only contain a bare string URL
  const stringPaths = ['url', 'video_url', 'output.url'];

  const resolve = (obj: unknown, dotPath: string): unknown => {
    let cur = obj;
    for (const key of dotPath.split('.')) {
      if (cur && typeof cur === 'object') cur = (cur as Record<string, unknown>)[key];
      else return undefined;
    }
    return cur;
  };

  for (const p of objectPaths) {
    const value = resolve(data, p);
    if (!value) continue;
    if (typeof value === 'string') return { url: value, meta: null };
    if (typeof value === 'object' && (value as { url?: string }).url) {
      return {
        url: (value as { url: string }).url,
        meta: value as { content_type?: string; file_name?: string; file_size?: number },
      };
    }
  }

  for (const p of stringPaths) {
    const value = resolve(data, p);
    if (typeof value === 'string') return { url: value, meta: null };
  }

  return { url: null, meta: null };
}

/** Translate Asian-language prompt to English if needed */
async function translatePromptIfNeeded(prompt: string, context: string): Promise<string> {
  try {
    const result = await translateAsianToEnglish(prompt);
    if (result.wasTranslated) {
      logger.info(`${context} prompt translated`, {
        sourceLanguage: result.sourceLanguage,
        originalLength: prompt.length,
        translatedLength: result.translatedPrompt.length
      });
      return result.translatedPrompt;
    }
  } catch (err) {
    logger.warn(`Translation failed for ${context}, using original`, { error: (err as Error).message });
  }
  return prompt;
}

/** Conditionally refund credits on failure */
async function tryRefundCredits(
  user: IUser | undefined,
  credits: number,
  hasFreeAccess: boolean,
  reason: string
): Promise<number> {
  if (!user || hasFreeAccess || credits <= 0) return 0;
  await refundCredits(user, credits, reason);
  return credits;
}

/** Settle x402 payment and record provenance for generated content */
async function settleAndRecordProvenance(
  req: AuthenticatedRequest,
  resultUrl: string,
  type: 'image' | 'video' | 'music'
): Promise<{ provenance: Record<string, unknown>; x402?: Record<string, unknown> }> {
  const contentHash = ethers.keccak256(ethers.toUtf8Bytes(resultUrl));
  const result: { provenance: Record<string, unknown>; x402?: Record<string, unknown> } = {
    provenance: { contentHash }
  };

  const x402Req = req as X402Request;
  if (x402Req.isX402Paid && x402Req.x402Payment) {
    const settlement = await settleX402Payment(x402Req);
    if (!settlement.success) {
      logger.error(`x402 settlement failed after ${type} generation`, { error: settlement.error });
    }
    result.x402 = {
      settled: x402Req.x402Payment.settled,
      transactionHash: x402Req.x402Payment.transactionHash,
    };

    // Mint provenance NFT for x402-paid requests (fire-and-forget)
    if (isProvenanceConfigured()) {
      const agentRegistry = getProvenanceAgentRegistry();
      const chainId = config.ERC8004_CHAIN_ID;
      const agentId = config.ERC8004_DEFAULT_AGENT_ID ?? 1;
      if (agentRegistry && chainId) {
        recordProvenance({ agentId, agentRegistry, chainId, type, resultUrl, recipient: req.user?.walletAddress })
          .catch(() => {});
      }
    }
  }

  return result;
}

/** Make an authenticated POST request to FAL API */
async function falFetch(endpoint: string, body: Record<string, unknown>): Promise<globalThis.Response> {
  return fetch(endpoint, {
    method: 'POST',
    headers: { 'Authorization': `Key ${getFalApiKey()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Make an authenticated GET request to FAL API */
async function falGet(endpoint: string): Promise<globalThis.Response> {
  return fetch(endpoint, {
    headers: { 'Authorization': `Key ${getFalApiKey()}` },
  });
}

// ============================================================================
// 360 PANORAMA PROMPT BUILDER
// ============================================================================

function build360PanoramaPrompt(userPrompt: string): string {
  const sceneDescription = userPrompt
    .replace(/\b360\s*(degree|°|view|panorama|panoramic)?\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  return JSON.stringify({
    type: '360 equirectangular panorama',
    scene: sceneDescription,
    style: 'Professional panoramic photography, seamless 360° coverage',
    constraints: { avoid: ['logos', 'watermarks', 'UI elements', 'text overlays', 'visible seams'] },
  });
}

function is360PanoramaRequest(prompt: string): boolean {
  return /\b360\b/i.test(prompt);
}

// ============================================================================
// ROUTE FACTORY
// ============================================================================

export function createGenerationRoutes(deps: Dependencies) {
  const router = Router();
  const { authenticateFlexible, requireCreditsForModel, requireCreditsForVideo, requireCredits } = deps;
  const flexibleAuth = authenticateFlexible || ((_req: Request, _res: Response, next: () => void) => next());

  // Token gate — bypasses x402-paid requests
  const generationTokenGate = (): RequestHandler => {
    const tokenGate = requireTokenGate();
    return (req: Request, res: Response, next: () => void) => {
      if ((req as X402Request).isX402Paid) return next();
      return tokenGate(req, res, next);
    };
  };

  // ==========================================================================
  // POST /api/generate/image — Generate image
  // ==========================================================================
  router.post('/image', flexibleAuth, generationTokenGate(), requireCreditsForModel(), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user;
      validateUser(user);
      if (!getFalApiKey()) throw new ServiceNotConfiguredError();

      const creditsRequired = req.creditsRequired || 1;
      const hasFreeAccess = req.hasFreeAccess || false;
      const { remainingCredits, actualCreditsDeducted } = await deductCredits(user, creditsRequired, hasFreeAccess);

      const {
        prompt,
        guidanceScale = 7.5,
        numImages: numImagesParam,
        num_images: numImagesSnake,
        image_url,
        image_urls,
        aspect_ratio,
        seed,
        model,
        optimizePrompt: shouldOptimize = false,
        enhancePrompt = true,
      } = req.body as {
        prompt?: string; guidanceScale?: number; numImages?: number; num_images?: number;
        image_url?: string; image_urls?: string[]; aspect_ratio?: string; seed?: number;
        model?: string; optimizePrompt?: boolean; enhancePrompt?: boolean;
      };

      const numImages = numImagesParam || numImagesSnake || 1;
      const hasImages = image_url || (image_urls && Array.isArray(image_urls) && image_urls.length > 0);
      let trimmedPrompt = (prompt && typeof prompt === 'string') ? prompt.trim() : '';

      if (!hasImages && !trimmedPrompt) {
        res.status(400).json({ success: false, error: 'prompt is required for text-to-image generation' });
        return;
      }

      // Translate Asian-language prompts
      if (trimmedPrompt) {
        trimmedPrompt = await translatePromptIfNeeded(trimmedPrompt, 'Image generation');
      }

      const isMultipleImages = image_urls && Array.isArray(image_urls) && image_urls.length >= 2;
      const isSingleImage = image_url || (image_urls && image_urls.length === 1);
      const isFlux2Model = model === 'flux-2';

      // Prompt optimization for FLUX 2
      let finalPrompt = trimmedPrompt || (hasImages ? 'enhance and refine the image' : '');
      let promptOptimizationResult: PromptOptimizationResult | null = null;

      if (shouldOptimize && isFlux2Model && trimmedPrompt) {
        try {
          promptOptimizationResult = hasImages
            ? await optimizePromptForFlux2Edit(trimmedPrompt)
            : await optimizePromptForFlux2T2I(trimmedPrompt);

          if (promptOptimizationResult && !promptOptimizationResult.skipped && promptOptimizationResult.optimizedPrompt) {
            finalPrompt = promptOptimizationResult.optimizedPrompt;
            logger.debug('FLUX 2 prompt optimized', {
              original: trimmedPrompt.substring(0, 50),
              optimized: finalPrompt.substring(0, 50)
            });
          }
        } catch (err) {
          logger.warn('FLUX 2 prompt optimization failed, using original', { error: (err as Error).message });
        }
      }

      // 360 panorama detection — forces Nano Banana Pro
      const is360Request = is360PanoramaRequest(finalPrompt);
      const isNanoBananaPro = model === 'nano-banana-pro' || is360Request;
      const isFlux2 = isFlux2Model && !is360Request;
      const isControlNet = model === 'controlnet-canny' && !is360Request;

      if (is360Request && model !== 'nano-banana-pro') {
        logger.info('360 panorama detected - switching to Nano Banana Pro', { originalModel: model });
      }

      // Determine endpoint
      let endpoint: string;
      if (isControlNet && hasImages) {
        endpoint = 'https://fal.run/fal-ai/flux-control-lora-canny';
      } else if (isNanoBananaPro) {
        endpoint = hasImages ? 'https://fal.run/fal-ai/nano-banana-pro/edit' : 'https://fal.run/fal-ai/nano-banana-pro';
      } else if (isFlux2 && hasImages) {
        endpoint = 'https://fal.run/fal-ai/flux-2/edit';
      } else if (isFlux2) {
        endpoint = 'https://fal.run/fal-ai/flux-2';
      } else if (isMultipleImages) {
        endpoint = 'https://fal.run/fal-ai/flux-pro/kontext/max/multi';
      } else if (isSingleImage) {
        endpoint = 'https://fal.run/fal-ai/flux-pro/kontext/max';
      } else {
        endpoint = 'https://fal.run/fal-ai/flux-pro/kontext/text-to-image';
      }

      // Build request body
      let requestBody: Record<string, unknown>;
      if (isControlNet && hasImages) {
        const controlImageUrl = image_url || (image_urls && image_urls[0]);
        requestBody = {
          prompt: finalPrompt,
          control_lora_image_url: controlImageUrl,
          num_images: 1,
          guidance_scale: guidanceScale || 6.0,
          num_inference_steps: 28,
          output_format: 'jpeg',
          enable_safety_checker: false,
          ...(seed !== undefined && { seed }),
        };
      } else if (isNanoBananaPro) {
        const nanoBananaPrompt = is360Request ? build360PanoramaPrompt(finalPrompt) : finalPrompt;
        requestBody = { prompt: nanoBananaPrompt, resolution: '1K' };
        if (isMultipleImages) {
          requestBody.image_urls = image_urls;
        } else if (isSingleImage) {
          requestBody.image_urls = [image_url || (image_urls && image_urls[0])];
        }
        requestBody.aspect_ratio = is360Request ? '16:9' : (aspect_ratio || undefined);
        if (numImages > 1) requestBody.num_images = numImages;
      } else if (isFlux2 && hasImages) {
        const imageUrlsArray: string[] = [];
        if (image_urls && Array.isArray(image_urls)) imageUrlsArray.push(...image_urls);
        else if (image_url) imageUrlsArray.push(image_url);
        requestBody = {
          prompt: finalPrompt, image_urls: imageUrlsArray,
          guidance_scale: 2.5, num_inference_steps: 28, num_images: numImages,
          output_format: 'png', enable_safety_checker: false, acceleration: 'regular',
          ...(seed !== undefined && { seed }),
        };
      } else if (isFlux2) {
        requestBody = {
          prompt: finalPrompt,
          guidance_scale: 2.5, num_inference_steps: 28, num_images: numImages,
          output_format: 'png', enable_safety_checker: false, acceleration: 'regular',
          image_size: ASPECT_TO_SIZE[aspect_ratio || ''] || 'landscape_4_3',
          ...(seed !== undefined && { seed }),
        };
      } else {
        requestBody = {
          prompt: finalPrompt,
          guidance_scale: guidanceScale,
          num_images: numImages,
          output_format: 'jpeg',
          safety_tolerance: '6',
          prompt_safety_tolerance: '6',
          enhance_prompt: enhancePrompt,
          seed: seed ?? Math.floor(Math.random() * 2147483647),
        };
        if (isMultipleImages) requestBody.image_urls = image_urls;
        else if (isSingleImage) requestBody.image_url = image_url || (image_urls && image_urls[0]);
        if (aspect_ratio) requestBody.aspect_ratio = aspect_ratio;
      }

      logger.debug('Calling FAL API', { endpoint, model: model || 'flux' });

      const response = await falFetch(endpoint, requestBody);

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('FAL API error', { status: response.status, error: errorText });
        await tryRefundCredits(user, creditsRequired, hasFreeAccess, `FAL API error: ${response.status}`);
        res.status(500).json({ success: false, error: `Image generation failed: ${response.status}`, creditsRefunded: creditsRequired });
        return;
      }

      const result = await response.json() as FalImageResponse;
      const images = extractFalImageUrls(result);

      // Build response
      const responseData: Record<string, unknown> = {
        success: true, images, remainingCredits,
        creditsDeducted: actualCreditsDeducted, freeAccess: hasFreeAccess,
      };

      if (promptOptimizationResult && !promptOptimizationResult.skipped) {
        responseData.promptOptimization = {
          originalPrompt: trimmedPrompt,
          optimizedPrompt: promptOptimizationResult.optimizedPrompt,
          reasoning: promptOptimizationResult.reasoning,
        };
      }

      if (images.length > 0) {
        const provenanceResult = await settleAndRecordProvenance(req, images[0], 'image');
        Object.assign(responseData, provenanceResult);
      }

      res.json(responseData);
    } catch (error) {
      const err = error as Error;
      logger.error('Image generation error:', { error: err.message });
      const creditsRefunded = await tryRefundCredits(req.user, req.creditsRequired || 1, req.hasFreeAccess || false, `Image generation error: ${err.message}`);
      res.status(500).json({ success: false, error: err.message, creditsRefunded });
    }
  });

  // ==========================================================================
  // POST /api/generate/image-stream — FLUX 2 with SSE streaming
  // ==========================================================================
  router.post('/image-stream', flexibleAuth, generationTokenGate(), requireCreditsForModel(), async (req: AuthenticatedRequest, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const sendEvent = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const user = req.user;
      if (!user) { sendEvent('error', { error: 'User authentication required' }); res.end(); return; }
      if (!getFalApiKey()) { sendEvent('error', { error: 'AI service not configured' }); res.end(); return; }

      const creditsRequired = req.creditsRequired || 1;
      const hasFreeAccess = req.hasFreeAccess || false;

      let remainingCredits: number;
      let actualCreditsDeducted: number;
      try {
        const result = await deductCredits(user, creditsRequired, hasFreeAccess);
        remainingCredits = result.remainingCredits;
        actualCreditsDeducted = result.actualCreditsDeducted;
        if (actualCreditsDeducted > 0) {
          sendEvent('credits', { creditsDeducted: creditsRequired, remainingCredits });
        }
      } catch (creditErr) {
        sendEvent('error', { error: (creditErr as Error).message });
        res.end();
        return;
      }

      const {
        prompt, image_url, image_urls, seed, numImages = 1, aspect_ratio, optimizePrompt: shouldOptimize = false
      } = req.body as {
        prompt?: string; image_url?: string; image_urls?: string[]; seed?: number;
        numImages?: number; aspect_ratio?: string; optimizePrompt?: boolean;
      };

      const imageUrlsArray: string[] = [];
      if (image_urls && Array.isArray(image_urls)) imageUrlsArray.push(...image_urls);
      else if (image_url) imageUrlsArray.push(image_url);

      const hasImages = imageUrlsArray.length > 0;
      const isTextToImage = !hasImages;
      const trimmedPrompt = (prompt && typeof prompt === 'string') ? prompt.trim() : '';
      if (isTextToImage && !trimmedPrompt) {
        sendEvent('error', { error: 'prompt is required for text-to-image generation' });
        res.end();
        return;
      }

      // Prompt optimization
      let finalPrompt = trimmedPrompt || (hasImages ? 'create variations of all features except pose and position' : '');
      let streamPromptOptimization: PromptOptimizationResult | null = null;

      if (shouldOptimize && trimmedPrompt) {
        sendEvent('status', {
          message: isTextToImage ? 'Optimizing prompt for FLUX 2 generation...' : 'Optimizing prompt for FLUX 2 editing...',
          progress: 5,
        });
        try {
          streamPromptOptimization = isTextToImage
            ? await optimizePromptForFlux2T2I(trimmedPrompt)
            : await optimizePromptForFlux2Edit(trimmedPrompt);

          if (streamPromptOptimization && !streamPromptOptimization.skipped && streamPromptOptimization.optimizedPrompt) {
            finalPrompt = streamPromptOptimization.optimizedPrompt;
            sendEvent('promptOptimized', {
              originalPrompt: trimmedPrompt,
              optimizedPrompt: finalPrompt,
              reasoning: streamPromptOptimization.reasoning,
            });
          }
        } catch (err) {
          logger.warn('FLUX 2 streaming prompt optimization failed', { error: (err as Error).message });
        }
      }

      sendEvent('status', {
        message: isTextToImage ? 'Starting FLUX 2 generation...' : 'Starting FLUX 2 image editing...',
        progress: 10,
      });

      // Build request
      let requestBody: Record<string, unknown>;
      let queueEndpoint: string;

      if (isTextToImage) {
        queueEndpoint = 'https://queue.fal.run/fal-ai/flux-2';
        requestBody = {
          prompt: finalPrompt,
          guidance_scale: 2.5, num_inference_steps: 28, num_images: numImages,
          image_size: ASPECT_TO_SIZE[aspect_ratio || ''] || 'landscape_4_3',
          output_format: 'png', enable_safety_checker: false, acceleration: 'regular',
          ...(seed !== undefined && { seed }),
        };
      } else {
        queueEndpoint = 'https://queue.fal.run/fal-ai/flux-2/edit';
        requestBody = {
          prompt: finalPrompt, image_urls: imageUrlsArray,
          guidance_scale: 2.5, num_inference_steps: 28, num_images: numImages,
          output_format: 'png', enable_safety_checker: false, acceleration: 'regular',
          ...(seed !== undefined && { seed }),
        };
      }

      logger.debug('FLUX 2 streaming request', {
        endpoint: queueEndpoint,
        mode: isTextToImage ? 'text-to-image' : 'edit',
        imageCount: imageUrlsArray.length,
      });

      const submitResponse = await falFetch(queueEndpoint, requestBody);

      if (!submitResponse.ok) {
        const errorText = await submitResponse.text();
        logger.error('FLUX 2 queue submit error', { status: submitResponse.status, error: errorText });
        const refunded = await tryRefundCredits(user, actualCreditsDeducted, false, `FLUX 2 queue submit error: ${submitResponse.status}`);
        sendEvent('error', { error: `Failed to start generation: ${submitResponse.status}`, creditsRefunded: refunded });
        res.end();
        return;
      }

      const queueData = await submitResponse.json() as { request_id: string };
      const requestId = queueData.request_id;
      const modelPath = isTextToImage ? 'fal-ai/flux-2' : 'fal-ai/flux-2/edit';

      sendEvent('status', { message: 'Processing...', progress: 10, requestId });

      // Poll for status
      let completed = false;
      let attempts = 0;
      const maxAttempts = 120;

      while (!completed && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;

        const statusResponse = await falGet(`https://queue.fal.run/${modelPath}/requests/${requestId}/status`);
        if (!statusResponse.ok) continue;

        const statusData = await statusResponse.json() as {
          status: string; logs?: Array<{ message: string }>; queue_position?: number;
        };
        const streamStatus = normalizeStatus(statusData.status);

        if (streamStatus === FAL_STATUS.IN_QUEUE) {
          sendEvent('status', { message: `In queue (position: ${statusData.queue_position ?? 0})...`, progress: 15, queuePosition: statusData.queue_position ?? 0 });
        } else if (streamStatus === FAL_STATUS.IN_PROGRESS) {
          sendEvent('status', { message: 'Generating...', progress: Math.min(20 + (attempts * 2), 90), logs: statusData.logs?.map(l => l.message) });
        } else if (isStatusCompleted(streamStatus)) {
          completed = true;
          sendEvent('status', { message: 'Finalizing...', progress: 95 });
        } else if (isStatusFailed(streamStatus)) {
          const refunded = await tryRefundCredits(user, actualCreditsDeducted, false, 'FLUX 2 streaming generation failed');
          sendEvent('error', { error: 'Generation failed', creditsRefunded: refunded });
          res.end();
          return;
        }
      }

      if (!completed) {
        const refunded = await tryRefundCredits(user, actualCreditsDeducted, false, 'FLUX 2 streaming generation timed out');
        sendEvent('error', { error: 'Generation timed out', creditsRefunded: refunded });
        res.end();
        return;
      }

      // Fetch result
      const resultResponse = await falGet(`https://queue.fal.run/${modelPath}/requests/${requestId}`);
      if (!resultResponse.ok) {
        const refunded = await tryRefundCredits(user, actualCreditsDeducted, false, 'Failed to fetch FLUX 2 streaming result');
        sendEvent('error', { error: 'Failed to fetch result', creditsRefunded: refunded });
        res.end();
        return;
      }

      const result = await resultResponse.json() as FalImageResponse;
      const images = extractFalImageUrls(result);

      const completeData: Record<string, unknown> = {
        success: true, images, remainingCredits,
        creditsDeducted: hasFreeAccess ? 0 : creditsRequired,
        freeAccess: hasFreeAccess,
      };

      if (images.length > 0) {
        const provenanceResult = await settleAndRecordProvenance(req, images[0], 'image');
        Object.assign(completeData, provenanceResult);
      }

      sendEvent('complete', completeData);
      res.end();
    } catch (error) {
      const err = error as Error;
      logger.error('FLUX 2 streaming error:', { error: err.message });
      const creditsRefunded = await tryRefundCredits(req.user, req.creditsRequired || 1, req.hasFreeAccess || false, `FLUX 2 streaming error: ${err.message}`);
      sendEvent('error', { error: err.message, creditsRefunded });
      res.end();
    }
  });

  // ==========================================================================
  // POST /api/generate/video — Video generation (Veo 3.1 / LTX-2)
  // ==========================================================================
  router.post('/video', flexibleAuth, generationTokenGate(), requireCreditsForVideo(), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user;
      validateUser(user);
      if (!getFalApiKey()) throw new ServiceNotConfiguredError();

      const {
        prompt,
        first_frame_url, last_frame_url,
        aspect_ratio = 'auto', duration = '8s', resolution = '720p',
        generate_audio = true, generation_mode = 'first-last-frame',
        quality = 'fast', model = 'veo',
      } = req.body as {
        prompt?: string; first_frame_url?: string; last_frame_url?: string;
        aspect_ratio?: string; duration?: string; resolution?: string;
        generate_audio?: boolean; generation_mode?: string; quality?: string; model?: string;
      };

      // Mode configuration
      const VIDEO_MODES: Record<string, { requiresFirstFrame: boolean; requiresLastFrame: boolean; endpoint: string }> = {
        'text-to-video': { requiresFirstFrame: false, requiresLastFrame: false, endpoint: '' },
        'image-to-video': { requiresFirstFrame: true, requiresLastFrame: false, endpoint: 'image-to-video' },
        'first-last-frame': { requiresFirstFrame: true, requiresLastFrame: true, endpoint: 'first-last-frame-to-video' },
      };
      const modeConfig = VIDEO_MODES[generation_mode] || VIDEO_MODES['first-last-frame'];

      // Validation
      if (!['veo', 'ltx'].includes(model)) {
        res.status(400).json({ success: false, error: 'model must be veo (quality) or ltx (cheap)' });
        return;
      }
      if (model === 'ltx' && generation_mode === 'first-last-frame') {
        res.status(400).json({ success: false, error: 'LTX-2 model only supports text-to-video and image-to-video modes' });
        return;
      }

      const creditsToDeduct = applyClawMarkup(req, calculateVideoCredits(duration, generate_audio, quality, model));
      const hasFreeAccess = req.hasFreeAccess || false;
      const { remainingCredits } = await deductCredits(user, creditsToDeduct, hasFreeAccess);

      if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
        res.status(400).json({ success: false, error: 'prompt is required and must be a non-empty string' });
        return;
      }

      const videoPrompt = await translatePromptIfNeeded(prompt.trim(), 'Video');

      if (modeConfig.requiresFirstFrame && !first_frame_url) {
        res.status(400).json({ success: false, error: 'first_frame_url is required for this mode' });
        return;
      }
      if (modeConfig.requiresLastFrame && !last_frame_url) {
        res.status(400).json({ success: false, error: 'last_frame_url is required for this mode' });
        return;
      }
      if (!['auto', '16:9', '9:16'].includes(aspect_ratio)) {
        res.status(400).json({ success: false, error: 'aspect_ratio must be auto, 16:9, or 9:16' });
        return;
      }

      const validVeoDurations = ['4s', '6s', '8s'];
      if (model === 'veo' && !validVeoDurations.includes(duration)) {
        res.status(400).json({ success: false, error: 'duration must be 4s, 6s, or 8s for Veo model' });
        return;
      }
      const ltxDurationSeconds = parseInt(duration.replace('s', '')) || 5;
      if (model === 'ltx' && (ltxDurationSeconds < 1 || ltxDurationSeconds > 10)) {
        res.status(400).json({ success: false, error: 'duration must be between 1-10 seconds for LTX model' });
        return;
      }
      if (!['720p', '1080p'].includes(resolution)) {
        res.status(400).json({ success: false, error: 'resolution must be 720p or 1080p' });
        return;
      }
      if (!['fast', 'quality'].includes(quality)) {
        res.status(400).json({ success: false, error: 'quality must be fast or quality' });
        return;
      }

      // Build request based on model
      const apiAspectRatio = aspect_ratio === 'auto' ? '16:9' : aspect_ratio;
      let requestBody: Record<string, unknown>;
      let endpoint: string;
      let modelPath: string;

      if (model === 'ltx') {
        const ltxVideoSizeMap: Record<string, string> = { '16:9': 'landscape_16_9', '9:16': 'portrait_16_9', '1:1': 'square', '4:3': 'landscape_4_3', '3:4': 'portrait_4_3' };
        requestBody = {
          prompt: videoPrompt,
          video_size: ltxVideoSizeMap[apiAspectRatio] || 'landscape_16_9',
          num_frames: Math.min(121, Math.max(25, ltxDurationSeconds * 25)),
          generate_audio, guidance_scale: 10, num_inference_steps: 50,
        };
        if (generation_mode === 'image-to-video' && first_frame_url) {
          requestBody.image_url = first_frame_url;
          requestBody.strength = 0.4;
          endpoint = 'https://queue.fal.run/fal-ai/ltx-2-19b/image-to-video';
          modelPath = 'fal-ai/ltx-2-19b/image-to-video';
        } else {
          endpoint = 'https://queue.fal.run/fal-ai/ltx-2-19b/text-to-video';
          modelPath = 'fal-ai/ltx-2-19b/text-to-video';
        }
      } else {
        requestBody = { prompt: videoPrompt, aspect_ratio: apiAspectRatio, duration, resolution, generate_audio };
        if (modeConfig.requiresFirstFrame && first_frame_url) {
          requestBody[generation_mode === 'image-to-video' ? 'image_url' : 'first_frame_url'] = first_frame_url;
        }
        if (modeConfig.requiresLastFrame && last_frame_url) {
          requestBody.last_frame_url = last_frame_url;
        }
        if (generation_mode === 'text-to-video') {
          endpoint = 'https://queue.fal.run/fal-ai/veo3.1';
          modelPath = 'fal-ai/veo3.1';
        } else {
          endpoint = `https://queue.fal.run/fal-ai/veo3.1/fast/${modeConfig.endpoint}`;
          modelPath = `fal-ai/veo3.1/fast/${modeConfig.endpoint}`;
        }
      }

      logger.info('Video generation request', {
        model: model === 'ltx' ? 'ltx-2-19b' : 'veo3.1', mode: generation_mode,
        quality, duration, resolution, aspect_ratio: apiAspectRatio,
        promptLength: prompt.length, hasFirstFrame: !!first_frame_url, hasLastFrame: !!last_frame_url,
        userId: user.userId,
      });

      // Submit to queue
      const submitResponse = await falFetch(endpoint, requestBody);

      if (!submitResponse.ok) {
        let errorMessage = `HTTP error! status: ${submitResponse.status}`;
        try {
          const errorData = await submitResponse.json() as { detail?: string | unknown[]; error?: string };
          logger.error('Video API submit error', { errorData });
          if (errorData.detail) {
            errorMessage = Array.isArray(errorData.detail)
              ? errorData.detail.map(e => typeof e === 'object' && e !== null ? (e as { msg?: string }).msg || JSON.stringify(e) : String(e)).join('; ')
              : String(errorData.detail);
          } else if (errorData.error) {
            errorMessage = errorData.error;
          }
        } catch { logger.error('Failed to parse video error response'); }
        await tryRefundCredits(user, creditsToDeduct, hasFreeAccess, `Video submit error: ${submitResponse.status}`);
        res.status(submitResponse.status).json({ success: false, error: errorMessage, creditsRefunded: creditsToDeduct });
        return;
      }

      const submitData = await submitResponse.json() as Record<string, unknown>;

      logger.info('Video submit response', {
        keys: Object.keys(submitData),
        data: JSON.stringify(submitData).substring(0, 500),
      });

      const requestId = (submitData.request_id || submitData.requestId || submitData.id) as string | undefined;
      const providedStatusUrl = submitData.status_url as string | undefined;
      const providedResponseUrl = submitData.response_url as string | undefined;

      if (!requestId) {
        logger.error('No request_id in submit response', { submitData: JSON.stringify(submitData).substring(0, 500) });
        res.status(500).json({ success: false, error: 'Failed to submit video generation request.' });
        return;
      }

      // Check if already completed synchronously
      const { url: syncVideoUrl, meta: syncVideoMeta } = extractVideoUrl(submitData);
      if (syncVideoUrl) {
        logger.info('Video completed synchronously', { requestId });
        res.json({
          success: true,
          video: { url: syncVideoUrl, content_type: syncVideoMeta?.content_type || 'video/mp4', file_name: syncVideoMeta?.file_name || `video-${requestId}.mp4`, file_size: syncVideoMeta?.file_size },
          remainingCredits, creditsDeducted: creditsToDeduct,
        });
        return;
      }

      // Poll for completion
      const statusEndpoint = providedStatusUrl || `https://queue.fal.run/${modelPath}/requests/${requestId}/status`;
      const resultEndpoint = providedResponseUrl || `https://queue.fal.run/${modelPath}/requests/${requestId}`;
      const maxWaitTime = 10 * 60 * 1000;
      const pollInterval = 3000;
      const startTime = Date.now();
      let firstCheck = true;

      while (Date.now() - startTime < maxWaitTime) {
        if (!firstCheck) await new Promise(resolve => setTimeout(resolve, pollInterval));
        firstCheck = false;

        const statusResponse = await falGet(statusEndpoint);
        if (!statusResponse.ok) {
          try { await statusResponse.text(); } catch { /* ignore */ }
          continue;
        }

        const statusData = await statusResponse.json() as Record<string, unknown>;
        const normalizedStatus = ((statusData.status as string) || '').toUpperCase();

        logger.info('Video polling status', {
          requestId, status: statusData.status, normalizedStatus,
          elapsed: Math.round((Date.now() - startTime) / 1000) + 's',
        });

        // Check if video URL is in status response
        const { url: statusVideoUrl, meta: statusVideoMeta } = extractVideoUrl(statusData);
        if (statusVideoUrl) {
          logger.info('Video found in status response', { requestId });
          res.json({
            success: true,
            video: { url: statusVideoUrl, content_type: statusVideoMeta?.content_type || 'video/mp4', file_name: statusVideoMeta?.file_name || `video-${requestId}.mp4`, file_size: statusVideoMeta?.file_size },
            remainingCredits, creditsDeducted: creditsToDeduct,
          });
          return;
        }

        if (isStatusCompleted(normalizedStatus)) {
          const fetchUrl = (statusData.response_url as string) || resultEndpoint;
          const resultResponse = await falGet(fetchUrl);

          if (!resultResponse.ok) {
            await tryRefundCredits(user, creditsToDeduct, hasFreeAccess, `Failed to fetch video result: ${resultResponse.status}`);
            res.status(500).json({ success: false, error: `Failed to fetch video result (${resultResponse.status})`, creditsRefunded: creditsToDeduct });
            return;
          }

          const resultData = await resultResponse.json() as Record<string, unknown>;
          logger.info('Video result response', { requestId, keys: Object.keys(resultData), data: JSON.stringify(resultData).substring(0, 1000) });

          const { url: videoUrl, meta: videoMeta } = extractVideoUrl(resultData);

          if (videoUrl) {
            logger.info('Video generation completed', { requestId, videoUrl: videoUrl.substring(0, 100) });
            const responseData: Record<string, unknown> = {
              success: true,
              video: { url: videoUrl, content_type: videoMeta?.content_type || 'video/mp4', file_name: videoMeta?.file_name || `video-${requestId}.mp4`, file_size: videoMeta?.file_size },
              remainingCredits, creditsDeducted: creditsToDeduct,
            };
            const provenanceResult = await settleAndRecordProvenance(req, videoUrl, 'video');
            Object.assign(responseData, provenanceResult);
            res.json(responseData);
            return;
          }

          logger.error('No video URL in result', { requestId, resultData: JSON.stringify(resultData).substring(0, 1000) });
          await tryRefundCredits(user, creditsToDeduct, hasFreeAccess, 'Video completed but no URL found');
          res.status(500).json({ success: false, error: 'Video generation completed but no video URL found', creditsRefunded: creditsToDeduct });
          return;
        }

        if (isStatusFailed(normalizedStatus)) {
          logger.error('Video generation failed', { requestId, status: normalizedStatus });
          await tryRefundCredits(user, creditsToDeduct, hasFreeAccess, `Video generation failed: ${normalizedStatus}`);
          res.status(500).json({ success: false, error: 'Video generation failed', creditsRefunded: creditsToDeduct });
          return;
        }
      }

      // Timeout
      logger.error('Video generation timeout', { requestId, elapsed: maxWaitTime / 1000 + 's' });
      await tryRefundCredits(user, creditsToDeduct, hasFreeAccess, 'Video generation timed out');
      res.status(504).json({ success: false, error: 'Video generation timed out. Please try again.', creditsRefunded: creditsToDeduct });
    } catch (error) {
      const err = error as Error;
      logger.error('Video generation error:', { error: err.message });
      const { duration = '8s', generate_audio = true, quality = 'fast', model = 'veo' } = req.body as { duration?: string; generate_audio?: boolean; quality?: string; model?: string };
      const creditsRefunded = await tryRefundCredits(req.user, applyClawMarkup(req, calculateVideoCredits(duration, generate_audio, quality, model)), req.hasFreeAccess || false, `Video generation error: ${err.message}`);
      res.status(500).json({ success: false, error: err.message, creditsRefunded });
    }
  });

  // ==========================================================================
  // POST /api/generate/music — Music generation
  // ==========================================================================
  router.post('/music', flexibleAuth, generationTokenGate(), requireCredits(1), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user;
      validateUser(user);

      const { prompt, duration = 30, optimizePrompt: shouldOptimize = false, selectedGenre = null } = req.body as {
        prompt?: string; duration?: number; optimizePrompt?: boolean; selectedGenre?: string | null;
      };

      const clampedDuration = Math.max(10, Math.min(180, duration));
      const creditsRequired = applyClawMarkup(req, calculateMusicCredits(clampedDuration));
      const hasFreeAccess = req.hasFreeAccess || false;
      const { remainingCredits, actualCreditsDeducted } = await deductCredits(user, creditsRequired, hasFreeAccess);

      if (!getFalApiKey()) {
        res.status(500).json({ success: false, error: 'AI service not configured' });
        return;
      }
      if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
        res.status(400).json({ success: false, error: 'Prompt is required' });
        return;
      }

      let musicPrompt = await translatePromptIfNeeded(prompt.trim(), 'Music');

      // Prompt optimization (off by default)
      let promptOptimizationResult: PromptOptimizationResult | null = null;
      if (shouldOptimize) {
        try {
          const { optimizePromptForMusic: optimizeMusic } = await import('../services/promptOptimizer');
          promptOptimizationResult = await optimizeMusic(musicPrompt, selectedGenre);
          if (promptOptimizationResult && !promptOptimizationResult.skipped && promptOptimizationResult.optimizedPrompt) {
            musicPrompt = promptOptimizationResult.optimizedPrompt;
            logger.debug('Music prompt optimized', { original: prompt.substring(0, 50), optimized: musicPrompt.substring(0, 50), selectedGenre });
          }
        } catch (optError) {
          logger.warn('Music prompt optimization failed, using original', { error: (optError as Error).message });
        }
      }

      const musicModel = 'CassetteAI/music-generator';
      const result = await submitToQueue<{ request_id?: string }>(musicModel, {
        prompt: musicPrompt,
        duration: clampedDuration,
      });

      const requestId = result.request_id;
      if (!requestId) {
        res.status(500).json({ success: false, error: 'Failed to submit music generation request' });
        return;
      }

      logger.info('Music generation submitted', { requestId });

      // Poll for completion
      const maxWaitTime = 60 * 1000;
      const pollInterval = 500;
      const startTime = Date.now();
      let pollCount = 0;
      let consecutiveErrors = 0;
      const maxConsecutiveErrors = 5;

      while (Date.now() - startTime < maxWaitTime) {
        if (pollCount > 0) await new Promise(resolve => setTimeout(resolve, pollInterval));
        pollCount++;

        try {
          const statusData = await checkQueueStatus<{ status?: string; response?: { audio_file?: { url?: string } } }>(requestId, musicModel);
          consecutiveErrors = 0;

          const normalizedStatus = (statusData.status || '').toUpperCase();
          logger.debug('Music polling status', { requestId, status: statusData.status, pollCount, elapsed: Math.round((Date.now() - startTime) / 1000) + 's' });

          if (isStatusCompleted(normalizedStatus)) {
            const resultData = await getQueueResult<{ audio_file?: { url?: string; content_type?: string; file_name?: string; file_size?: number } }>(requestId, musicModel);

            if (resultData.audio_file?.url) {
              logger.info('Music generation completed', { requestId, totalPolls: pollCount, elapsedMs: Date.now() - startTime });

              const responseData: Record<string, unknown> = {
                success: true, audio_file: resultData.audio_file,
                remainingCredits, creditsDeducted: actualCreditsDeducted, freeAccess: hasFreeAccess,
              };

              if (promptOptimizationResult && !promptOptimizationResult.skipped) {
                responseData.promptOptimization = {
                  originalPrompt: prompt.trim(),
                  optimizedPrompt: promptOptimizationResult.optimizedPrompt,
                  reasoning: promptOptimizationResult.reasoning,
                };
              }

              const provenanceResult = await settleAndRecordProvenance(req, resultData.audio_file.url, 'music');
              Object.assign(responseData, provenanceResult);

              res.json(responseData);
              return;
            } else {
              logger.error('Music completed but no audio in response', { requestId });
              await tryRefundCredits(user, actualCreditsDeducted, false, 'Music completed but no audio in response');
              res.status(500).json({ success: false, error: 'No audio in response', creditsRefunded: actualCreditsDeducted });
              return;
            }
          } else if (isStatusFailed(normalizedStatus)) {
            logger.error('Music generation failed', { requestId });
            await tryRefundCredits(user, actualCreditsDeducted, false, `Music generation failed: ${normalizedStatus}`);
            res.status(500).json({ success: false, error: 'Music generation failed', creditsRefunded: actualCreditsDeducted });
            return;
          }
        } catch (pollError) {
          consecutiveErrors++;
          logger.warn('Music polling error', { error: (pollError as Error).message, requestId, pollCount, consecutiveErrors });

          if (consecutiveErrors >= maxConsecutiveErrors) {
            logger.error('Music generation aborted due to repeated polling errors', { requestId, consecutiveErrors });
            await tryRefundCredits(user, actualCreditsDeducted, false, 'Music generation polling errors');
            res.status(500).json({ success: false, error: 'Music generation failed - polling errors', creditsRefunded: actualCreditsDeducted });
            return;
          }
        }
      }

      // Timeout
      logger.warn('Music generation timed out', { requestId, pollCount, elapsedMs: Date.now() - startTime });
      await tryRefundCredits(user, actualCreditsDeducted, false, 'Music generation timed out');
      res.status(504).json({ success: false, error: 'Music generation timed out. Please try again.', creditsRefunded: actualCreditsDeducted });
    } catch (error) {
      const err = error as Error;
      logger.error('Music generation error:', { error: err.message });
      const { duration = 30 } = req.body as { duration?: number };
      const hasFreeAccess = req.hasFreeAccess || false;
      const creditsRefunded = await tryRefundCredits(req.user, hasFreeAccess ? 0 : applyClawMarkup(req, calculateMusicCredits(Math.max(10, Math.min(180, duration)))), false, `Music generation error: ${err.message}`);
      res.status(500).json({ success: false, error: err.message, creditsRefunded });
    }
  });

  // ==========================================================================
  // GET /api/generate/status/:requestId — Check generation status
  // ==========================================================================
  router.get('/status/:requestId', flexibleAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!requireAuth(req, res)) return;

      const { requestId } = req.params;
      if (!requestId || !/^[a-zA-Z0-9._-]+$/.test(requestId) || requestId.length > 200) {
        res.status(400).json({ success: false, error: 'Invalid request ID format' });
        return;
      }

      const status = await checkQueueStatus<{ status?: string; [key: string]: unknown }>(requestId);
      res.json({ success: true, status: status.status, ...status });
    } catch (error) {
      logger.error('Status check error:', { error: (error as Error).message });
      res.status(500).json({ success: false, error: 'Failed to check status' });
    }
  });

  // ==========================================================================
  // GET /api/generate/result/:requestId — Get generation result
  // ==========================================================================
  router.get('/result/:requestId', flexibleAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!requireAuth(req, res)) return;

      const { requestId } = req.params;
      if (!requestId || !/^[a-zA-Z0-9._-]+$/.test(requestId) || requestId.length > 200) {
        res.status(400).json({ success: false, error: 'Invalid request ID format' });
        return;
      }

      const result = await getQueueResult<Record<string, unknown>>(requestId);
      res.json({ success: true, ...result });
    } catch (error) {
      logger.error('Result fetch error:', { error: (error as Error).message });
      res.status(500).json({ success: false, error: 'Failed to fetch result' });
    }
  });

  // ==========================================================================
  // POST /api/generate/upscale — Upscale image
  // ==========================================================================
  router.post('/upscale', flexibleAuth, generationTokenGate(), requireCredits(1), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user;
      validateUser(user);
      if (!getFalApiKey()) throw new ServiceNotConfiguredError();

      const { image_url, scale = 2 } = req.body as { image_url?: string; scale?: number };

      if (!image_url) {
        res.status(400).json({ success: false, error: 'image_url is required' });
        return;
      }

      const validScale = scale === 4 ? 4 : 2;
      const creditsRequired = applyClawMarkup(req, calculateUpscaleCredits(validScale));
      const hasFreeAccess = req.hasFreeAccess || false;
      const { remainingCredits, actualCreditsDeducted } = await deductCredits(user, creditsRequired, hasFreeAccess);

      logger.info('Upscale request', { scale: validScale, userId: user.userId, creditsRequired, freeAccess: hasFreeAccess });

      const response = await falFetch('https://fal.run/fal-ai/creative-upscaler', {
        image_url, scale: validScale, creativity: 0.3, detail: 1.0,
        shape_preservation: 0.75, prompt_suffix: '',
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('Upscale API error', { status: response.status, error: errorText });
        await tryRefundCredits(user, actualCreditsDeducted, false, `Upscale API error: ${response.status}`);
        res.status(500).json({ success: false, error: `Upscale failed: ${response.status}`, creditsRefunded: actualCreditsDeducted });
        return;
      }

      const result = await response.json() as { image?: { url?: string }; images?: Array<{ url?: string }> };
      const upscaledUrl = result.image?.url || result.images?.[0]?.url || null;

      if (!upscaledUrl) {
        await tryRefundCredits(user, actualCreditsDeducted, false, 'No upscaled image returned');
        res.status(500).json({ success: false, error: 'No upscaled image returned', creditsRefunded: actualCreditsDeducted });
        return;
      }

      logger.info('Upscale completed', { scale: validScale, userId: user.userId });

      const responseData: Record<string, unknown> = {
        success: true, image_url: upscaledUrl, scale: validScale,
        remainingCredits, creditsDeducted: actualCreditsDeducted, freeAccess: hasFreeAccess,
      };

      const x402Req = req as X402Request;
      if (x402Req.isX402Paid && x402Req.x402Payment) {
        const settlement = await settleX402Payment(x402Req);
        if (!settlement.success) logger.error('x402 settlement failed after upscale', { error: settlement.error });
        responseData.x402 = { settled: x402Req.x402Payment.settled, transactionHash: x402Req.x402Payment.transactionHash };
      }

      res.json(responseData);
    } catch (error) {
      const err = error as Error;
      logger.error('Upscale error:', { error: err.message });
      const { scale = 2 } = req.body as { scale?: number };
      const creditsRefunded = await tryRefundCredits(req.user, applyClawMarkup(req, calculateUpscaleCredits(scale === 4 ? 4 : 2)), req.hasFreeAccess || false, `Upscale error: ${err.message}`);
      res.status(500).json({ success: false, error: err.message, creditsRefunded });
    }
  });

  // ==========================================================================
  // POST /api/generate/video-to-audio — Generate audio from video (MMAudio V2)
  // ==========================================================================
  router.post('/video-to-audio', flexibleAuth, generationTokenGate(), requireCredits(1), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user;
      validateUser(user);
      if (!getFalApiKey()) throw new ServiceNotConfiguredError();

      const {
        video_url, prompt = '', negative_prompt = '',
        num_steps = 25, cfg_strength = 4.5, duration = 8,
      } = req.body as {
        video_url?: string; prompt?: string; negative_prompt?: string;
        num_steps?: number; cfg_strength?: number; duration?: number;
      };

      if (!video_url) {
        res.status(400).json({ success: false, error: 'video_url is required' });
        return;
      }

      const creditsRequired = applyClawMarkup(req, calculateVideoToAudioCredits());
      const hasFreeAccess = req.hasFreeAccess || false;
      const { remainingCredits, actualCreditsDeducted } = await deductCredits(user, creditsRequired, hasFreeAccess);

      logger.info('Video-to-audio request', { userId: user.userId, hasPrompt: !!prompt, duration, creditsRequired, freeAccess: hasFreeAccess });

      const requestBody: Record<string, unknown> = {
        video_url,
        num_steps: Math.min(50, Math.max(10, num_steps)),
        cfg_strength: Math.min(10, Math.max(1, cfg_strength)),
        duration: Math.min(30, Math.max(1, duration)),
      };
      if (prompt?.trim()) requestBody.prompt = prompt.trim();
      if (negative_prompt?.trim()) requestBody.negative_prompt = negative_prompt.trim();

      const submitResponse = await falFetch('https://queue.fal.run/fal-ai/mmaudio-v2', requestBody);

      if (!submitResponse.ok) {
        const errorText = await submitResponse.text();
        logger.error('MMAudio V2 submit error', { status: submitResponse.status, error: errorText });
        await tryRefundCredits(user, actualCreditsDeducted, false, `MMAudio submit error: ${submitResponse.status}`);
        res.status(500).json({ success: false, error: `Failed to start audio generation: ${submitResponse.status}`, creditsRefunded: actualCreditsDeducted });
        return;
      }

      const submitData = await submitResponse.json() as { request_id?: string };
      const requestId = submitData.request_id;

      if (!requestId) {
        logger.error('No request_id from MMAudio', { submitData });
        await tryRefundCredits(user, actualCreditsDeducted, false, 'No request_id from MMAudio');
        res.status(500).json({ success: false, error: 'Failed to submit audio generation request', creditsRefunded: actualCreditsDeducted });
        return;
      }

      logger.info('MMAudio V2 submitted', { requestId });

      // Poll for completion
      const mmModelPath = 'fal-ai/mmaudio-v2';
      const maxWaitTime = 3 * 60 * 1000;
      const pollInterval = 2000;
      const startTime = Date.now();

      while (Date.now() - startTime < maxWaitTime) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));

        const statusResponse = await falGet(`https://queue.fal.run/${mmModelPath}/requests/${requestId}/status`);
        if (!statusResponse.ok) continue;

        const statusData = await statusResponse.json() as {
          status?: string;
          audio?: { url?: string; content_type?: string; file_name?: string; file_size?: number };
        };
        const normalizedStatus = (statusData.status || '').toUpperCase();

        logger.debug('MMAudio polling', { requestId, status: normalizedStatus, elapsed: Math.round((Date.now() - startTime) / 1000) + 's' });

        // Audio in status response
        if (statusData.audio?.url) {
          logger.info('MMAudio completed (from status)', { requestId });
          res.json({ success: true, audio: statusData.audio, remainingCredits, creditsDeducted: actualCreditsDeducted, freeAccess: hasFreeAccess });
          return;
        }

        if (isStatusCompleted(normalizedStatus)) {
          const resultResponse = await falGet(`https://queue.fal.run/${mmModelPath}/requests/${requestId}`);

          if (!resultResponse.ok) {
            await tryRefundCredits(user, actualCreditsDeducted, false, 'Failed to fetch MMAudio result');
            res.status(500).json({ success: false, error: 'Failed to fetch audio result', creditsRefunded: actualCreditsDeducted });
            return;
          }

          const resultData = await resultResponse.json() as {
            audio?: { url?: string; content_type?: string; file_name?: string; file_size?: number };
            audio_url?: string; url?: string;
          };

          const audioUrl = resultData.audio?.url || resultData.audio_url || resultData.url || null;
          const audioMeta = resultData.audio || null;

          if (audioUrl) {
            logger.info('MMAudio V2 completed', { requestId, audioUrl: audioUrl.substring(0, 50) });
            res.json({
              success: true,
              audio: {
                url: audioUrl,
                content_type: audioMeta?.content_type || 'audio/wav',
                file_name: audioMeta?.file_name || `audio-${requestId}.wav`,
                file_size: audioMeta?.file_size,
              },
              remainingCredits, creditsDeducted: actualCreditsDeducted, freeAccess: hasFreeAccess,
            });
            return;
          }

          logger.error('No audio URL in MMAudio result', { resultData: JSON.stringify(resultData).substring(0, 500) });
          await tryRefundCredits(user, actualCreditsDeducted, false, 'No audio in MMAudio result');
          res.status(500).json({ success: false, error: 'Audio generation completed but no audio URL found', creditsRefunded: actualCreditsDeducted });
          return;
        }

        if (isStatusFailed(normalizedStatus)) {
          logger.error('MMAudio generation failed', { requestId, status: normalizedStatus });
          await tryRefundCredits(user, actualCreditsDeducted, false, `MMAudio failed: ${normalizedStatus}`);
          res.status(500).json({ success: false, error: 'Audio generation failed', creditsRefunded: actualCreditsDeducted });
          return;
        }
      }

      // Timeout
      logger.error('MMAudio generation timeout', { requestId });
      await tryRefundCredits(user, actualCreditsDeducted, false, 'MMAudio timeout');
      res.status(504).json({ success: false, error: 'Audio generation timed out. Please try again.', creditsRefunded: actualCreditsDeducted });
    } catch (error) {
      const err = error as Error;
      logger.error('Video-to-audio error:', { error: err.message });
      const creditsRefunded = await tryRefundCredits(req.user, applyClawMarkup(req, calculateVideoToAudioCredits()), req.hasFreeAccess || false, `Video-to-audio error: ${err.message}`);
      res.status(500).json({ success: false, error: err.message, creditsRefunded });
    }
  });

  // ==========================================================================
  // POST /api/generations/add — Add generation to history
  // ==========================================================================
  router.post('/add', flexibleAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ success: false, error: 'Authentication required. Please sign in with a valid token.' });
        return;
      }

      logger.debug('Generation add request received', {
        authenticatedUserId: user.userId,
        authenticatedWallet: user.walletAddress,
        hasImageUrl: !!req.body?.imageUrl,
        hasVideoUrl: !!req.body?.videoUrl,
      });

      const { prompt, style, imageUrl, videoUrl, requestId, status, creditsUsed } = req.body as {
        prompt?: string; style?: string; imageUrl?: string; videoUrl?: string;
        requestId?: string; status?: string; creditsUsed?: number;
      };

      if (!imageUrl && !videoUrl) {
        res.status(400).json({ success: false, error: 'Missing required field: imageUrl or videoUrl is required' });
        return;
      }

      if (!user.walletAddress) {
        res.status(400).json({ success: false, error: 'User account must have wallet address' });
        return;
      }

      const User = mongoose.model<IUser>('User');
      const updateQuery = buildUserUpdateQuery(user);

      if (!updateQuery) {
        res.status(400).json({ success: false, error: 'User account must have wallet address or userId' });
        return;
      }

      // Deduplication: prevent duplicate entries on client retries
      if (requestId) {
        const existingUser = await User.findOne({ ...updateQuery, 'generationHistory.requestId': requestId }).select('_id').lean();
        if (existingUser) {
          logger.debug('Generation already tracked (dedup)', { requestId });
          res.json({
            success: true, generationId: `existing_${requestId}`, deduplicated: true,
            credits: user.credits, totalCreditsEarned: user.totalCreditsEarned, totalCreditsSpent: user.totalCreditsSpent,
          });
          return;
        }
      }

      // Encrypt prompt if configured
      let encryptedPrompt = prompt || 'No prompt';
      if (encryptedPrompt && isEncryptionConfigured()) {
        const isAlreadyEncrypted = encryptedPrompt.includes(':') && encryptedPrompt.split(':').length === 3;
        if (!isAlreadyEncrypted) encryptedPrompt = encrypt(encryptedPrompt);
      }

      const generationId = `gen_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const generationItem = {
        id: generationId,
        prompt: encryptedPrompt,
        style: style || 'No Style',
        ...(imageUrl && { imageUrl }),
        ...(videoUrl && { videoUrl }),
        ...(requestId && { requestId }),
        ...(status && { status }),
        creditsUsed: creditsUsed || 1,
        timestamp: new Date(),
      };

      await withRetry(
        () => User.findOneAndUpdate(
          updateQuery,
          { $push: { generationHistory: { $each: [generationItem], $slice: -10 } } }
        ),
        { operation: 'Add generation to history', maxRetries: 3 }
      );

      logger.info('Generation tracked', { userId: user.userId, generationId, hasImage: !!imageUrl, hasVideo: !!videoUrl });

      // Provenance: always record if configured (not just for x402)
      const resultUrl = imageUrl || videoUrl;
      const provenanceData: Record<string, unknown> = {};
      if (resultUrl) {
        const contentHash = ethers.keccak256(ethers.toUtf8Bytes(resultUrl));
        provenanceData.contentHash = contentHash;
        if (isProvenanceConfigured()) {
          const agentRegistry = getProvenanceAgentRegistry();
          const chainId = config.ERC8004_CHAIN_ID;
          const agentId = config.ERC8004_DEFAULT_AGENT_ID ?? 1;
          if (agentRegistry && chainId) {
            recordProvenance({
              agentId, agentRegistry, chainId,
              type: imageUrl ? 'image' : 'video',
              resultUrl, recipient: req.user?.walletAddress,
            }).catch(() => {});
          }
        }
      }

      res.json({
        success: true, generationId,
        credits: user.credits, totalCreditsEarned: user.totalCreditsEarned, totalCreditsSpent: user.totalCreditsSpent,
        ...(provenanceData.contentHash ? { provenance: provenanceData } : {}),
      });
    } catch (error) {
      logger.error('Add generation error:', { error: (error as Error).message });
      res.status(500).json({ success: false, error: 'Failed to add generation' });
    }
  });

  // ==========================================================================
  // PUT /api/generations/update/:generationId — Update a generation
  // ==========================================================================
  router.put('/update/:generationId', flexibleAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!requireAuth(req, res)) return;

      const { generationId } = req.params;
      const { videoUrl, imageUrl, status } = req.body as { videoUrl?: string; imageUrl?: string; status?: string };

      if (!generationId) {
        res.status(400).json({ success: false, error: 'generationId is required' });
        return;
      }

      const user = req.user;
      const User = mongoose.model<IUser>('User');
      const updateQuery = buildUserUpdateQuery(user);

      if (!updateQuery) {
        res.status(400).json({ success: false, error: 'User account not properly configured' });
        return;
      }

      const userWithHistory = await User.findOne(updateQuery).select('generationHistory');
      if (!userWithHistory) {
        res.status(404).json({ success: false, error: 'User not found' });
        return;
      }

      // SECURITY: Verify the generation belongs to this user
      const existingGen = userWithHistory.generationHistory?.find(gen => gen.id === generationId);
      if (!existingGen) {
        logger.warn('SECURITY: Blocked generation update attempt for non-owned generation', {
          requestedGenerationId: generationId,
          authenticatedUserId: user?.userId,
          path: req.path, ip: req.ip,
        });
        res.status(404).json({ success: false, error: 'Generation not found or does not belong to you' });
        return;
      }

      const updateFields: Record<string, string> = {};
      if (videoUrl) updateFields['generationHistory.$.videoUrl'] = videoUrl;
      if (imageUrl) updateFields['generationHistory.$.imageUrl'] = imageUrl;
      if (status) updateFields['generationHistory.$.status'] = status;

      await User.updateOne(
        { ...updateQuery, 'generationHistory.id': generationId },
        { $set: updateFields }
      );

      logger.info('Generation updated', {
        generationId, userId: user?.userId, status,
        hasVideoUrl: !!videoUrl, hasImageUrl: !!imageUrl,
      });

      res.json({ success: true, message: 'Generation updated successfully' });
    } catch (error) {
      logger.error('Error updating generation:', { error: (error as Error).message });
      res.status(500).json({ success: false, error: 'Failed to update generation' });
    }
  });

  return router;
}

export default createGenerationRoutes;
