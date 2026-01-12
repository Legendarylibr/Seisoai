/**
 * FAL.ai Service
 * Handles all AI generation requests
 */
import config from '../config/index.js';
import logger from '../utils/logger.js';

const FAL_API_KEY = config.fal.apiKey;

// FAL Status Constants
export const FAL_STATUS = {
  IN_QUEUE: 'IN_QUEUE',
  IN_PROGRESS: 'IN_PROGRESS',
  PENDING: 'PENDING',
  COMPLETED: 'COMPLETED',
  OK: 'OK',
  SUCCESS: 'SUCCESS',
  SUCCEEDED: 'SUCCEEDED',
  DONE: 'DONE',
  FAILED: 'FAILED',
  ERROR: 'ERROR',
  CANCELLED: 'CANCELLED'
} as const;

export function isStatusCompleted(status: string | undefined): boolean {
  if (!status) return false;
  const normalized = status.toUpperCase();
  return ['COMPLETED', 'OK', 'SUCCESS', 'SUCCEEDED', 'DONE'].includes(normalized);
}

export function isStatusFailed(status: string | undefined): boolean {
  if (!status) return false;
  const normalized = status.toUpperCase();
  return ['FAILED', 'ERROR', 'CANCELLED'].includes(normalized);
}

export function isStatusProcessing(status: string | undefined): boolean {
  if (!status) return false;
  const normalized = status.toUpperCase();
  return ['IN_QUEUE', 'IN_PROGRESS', 'PENDING'].includes(normalized);
}

/**
 * Submit to FAL queue
 */
export async function submitToQueue<T = unknown>(
  endpoint: string, 
  body: Record<string, unknown>
): Promise<T> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Key ${FAL_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`FAL API error: ${response.status} - ${error}`);
  }

  return response.json() as Promise<T>;
}

/**
 * Check queue status
 */
export async function checkQueueStatus<T = unknown>(
  requestId: string, 
  modelPath: string
): Promise<T> {
  const endpoint = `https://queue.fal.run/${modelPath}/requests/${requestId}/status`;
  
  const response = await fetch(endpoint, {
    headers: {
      'Authorization': `Key ${FAL_API_KEY}`
    }
  });

  if (!response.ok) {
    throw new Error(`Status check failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

/**
 * Get queue result
 */
export async function getQueueResult<T = unknown>(
  requestId: string, 
  modelPath: string
): Promise<T> {
  const endpoint = `https://queue.fal.run/${modelPath}/requests/${requestId}`;
  
  const response = await fetch(endpoint, {
    headers: {
      'Authorization': `Key ${FAL_API_KEY}`
    }
  });

  if (!response.ok) {
    throw new Error(`Result fetch failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

/**
 * Upload file to FAL storage
 */
export async function uploadToFal(
  buffer: Buffer, 
  mimeType: string, 
  filename: string
): Promise<string> {
  // Step 1: Initiate upload
  const initiateResponse = await fetch('https://rest.fal.run/storage/upload/initiate', {
    method: 'POST',
    headers: {
      'Authorization': `Key ${FAL_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      file_name: filename,
      content_type: mimeType
    })
  });

  if (!initiateResponse.ok) {
    throw new Error(`Upload initiate failed: ${initiateResponse.status}`);
  }

  const initiateData = await initiateResponse.json() as { 
    upload_url: string; 
    file_url: string;
  };

  // Step 2: Upload file
  const uploadResponse = await fetch(initiateData.upload_url, {
    method: 'PUT',
    headers: {
      'Content-Type': mimeType
    },
    body: buffer
  });

  if (!uploadResponse.ok) {
    throw new Error(`File upload failed: ${uploadResponse.status}`);
  }

  logger.info('File uploaded to FAL storage', { filename, url: initiateData.file_url });
  return initiateData.file_url;
}

// Generation Types
export interface ImageGenerationOptions {
  prompt: string;
  model?: 'flux' | 'flux-multi' | 'flux-2' | 'nano-banana-pro' | 'qwen-image-layered';
  aspectRatio?: string;
  numImages?: number;
  guidanceScale?: number;
  seed?: number;
  imageUrl?: string;
  imageUrls?: string[];
}

export interface VideoGenerationOptions {
  prompt: string;
  firstFrameUrl?: string;
  lastFrameUrl?: string;
  aspectRatio?: string;
  duration?: '4s' | '6s' | '8s';
  resolution?: '720p' | '1080p';
  generateAudio?: boolean;
  mode?: 'text-to-video' | 'image-to-video' | 'first-last-frame';
}

export interface MusicGenerationOptions {
  prompt: string;
  duration?: number; // 10-180 seconds
  genre?: string;
}

export interface Model3DGenerationOptions {
  inputImageUrl: string;
  backImageUrl?: string;
  leftImageUrl?: string;
  rightImageUrl?: string;
  enablePbr?: boolean;
  faceCount?: number;
  generateType?: 'Normal' | 'LowPoly' | 'Geometry';
}

/**
 * Generate image using FLUX
 */
export async function generateImage(options: ImageGenerationOptions): Promise<{
  requestId?: string;
  images?: string[];
  sync?: boolean;
}> {
  const {
    prompt,
    model = 'flux',
    aspectRatio = '16:9',
    numImages = 1,
    guidanceScale = 7.5,
    seed,
    imageUrl,
    imageUrls
  } = options;

  const hasImages = imageUrl || (imageUrls && imageUrls.length > 0);
  const isMultipleImages = imageUrls && imageUrls.length >= 2;

  // Handle Qwen layer extraction (requires image)
  if (model === 'qwen-image-layered') {
    if (!imageUrl && (!imageUrls || imageUrls.length === 0)) {
      throw new Error('Qwen layer extraction requires a reference image');
    }
    
    // Use the first image for layer extraction
    const targetImageUrl = imageUrl || (imageUrls && imageUrls[0]);
    if (!targetImageUrl) {
      throw new Error('No image provided for layer extraction');
    }
    
    // Call layer extraction endpoint
    const endpoint = 'https://queue.fal.run/fal-ai/birefnet';
    const body: Record<string, unknown> = {
      image_url: targetImageUrl,
      model: 'General Use (Light)',
      operating_resolution: '1024x1024',
      output_format: 'png'
    };
    
    // Add prompt if provided (optional for layer extraction)
    if (prompt && prompt.trim()) {
      body.prompt = prompt.trim();
    }
    
    logger.debug('Layer extraction request', { endpoint, hasPrompt: !!prompt });
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Key ${FAL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Layer extraction failed: ${response.status} - ${error}`);
    }
    
    const result = await response.json() as {
      image?: { url?: string } | string;
    };
    
    // Extract image URL
    let extractedImageUrl: string | undefined;
    if (typeof result.image === 'string') {
      extractedImageUrl = result.image;
    } else if (result.image?.url) {
      extractedImageUrl = result.image.url;
    }
    
    if (!extractedImageUrl) {
      throw new Error('No image returned from layer extraction');
    }
    
    return { images: [extractedImageUrl], sync: true };
  }

  // Determine endpoint based on model and inputs
  let endpoint: string;
  if (model === 'nano-banana-pro') {
    endpoint = hasImages 
      ? 'https://fal.run/fal-ai/nano-banana-pro/edit'
      : 'https://fal.run/fal-ai/nano-banana-pro';
  } else if (model === 'flux-2' && hasImages) {
    endpoint = 'https://fal.run/fal-ai/flux-2/edit';
  } else if (model === 'flux-2') {
    endpoint = 'https://fal.run/fal-ai/flux-2';
  } else if (model === 'flux-multi' || isMultipleImages) {
    // Use multi-image endpoint for flux-multi or when multiple images provided
    endpoint = 'https://fal.run/fal-ai/flux-pro/kontext/max/multi';
  } else if (hasImages) {
    endpoint = 'https://fal.run/fal-ai/flux-pro/kontext/max';
  } else {
    endpoint = 'https://fal.run/fal-ai/flux-pro/kontext/text-to-image';
  }

  // Build request body
  const body: Record<string, unknown> = {
    prompt,
    num_images: numImages,
    guidance_scale: guidanceScale,
    output_format: 'png',
    enable_safety_checker: false
  };

  if (model === 'flux-2') {
    body.guidance_scale = 2.5;
    body.num_inference_steps = 28;
    const aspectToSize: Record<string, string> = {
      '1:1': 'square',
      '4:3': 'landscape_4_3',
      '16:9': 'landscape_16_9',
      '3:4': 'portrait_4_3',
      '9:16': 'portrait_16_9'
    };
    body.image_size = aspectToSize[aspectRatio] || 'landscape_4_3';
  } else {
    body.aspect_ratio = aspectRatio;
    body.safety_tolerance = '6';
    body.prompt_safety_tolerance = '6';
    body.enhance_prompt = true;
    body.seed = seed ?? Math.floor(Math.random() * 2147483647);
  }

  if (imageUrls && imageUrls.length > 0) {
    if (isMultipleImages) {
      body.image_urls = imageUrls;
    } else {
      body.image_url = imageUrls[0];
    }
  } else if (imageUrl) {
    body.image_url = imageUrl;
  }

  logger.debug('Image generation request', { endpoint, model });

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Key ${FAL_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Image generation failed: ${response.status} - ${error}`);
  }

  const result = await response.json() as {
    images?: Array<{ url?: string } | string>;
    image?: { url?: string } | string;
  };

  // Extract image URLs
  const images: string[] = [];
  if (result.images && Array.isArray(result.images)) {
    for (const img of result.images) {
      if (typeof img === 'string') {
        images.push(img);
      } else if (img && img.url) {
        images.push(img.url);
      }
    }
  } else if (result.image) {
    if (typeof result.image === 'string') {
      images.push(result.image);
    } else if (result.image.url) {
      images.push(result.image.url);
    }
  }

  return { images, sync: true };
}

/**
 * Generate video using Veo 3.1
 */
export async function generateVideo(options: VideoGenerationOptions): Promise<{
  requestId: string;
  modelPath: string;
}> {
  const {
    prompt,
    firstFrameUrl,
    lastFrameUrl,
    aspectRatio = '16:9',
    duration = '8s',
    resolution = '720p',
    generateAudio = true,
    mode = 'text-to-video'
  } = options;

  // Determine endpoint based on mode
  let endpoint: string;
  let modelPath: string;
  
  if (mode === 'text-to-video') {
    endpoint = 'https://queue.fal.run/fal-ai/veo3.1';
    modelPath = 'fal-ai/veo3.1';
  } else if (mode === 'image-to-video') {
    endpoint = 'https://queue.fal.run/fal-ai/veo3.1/fast/image-to-video';
    modelPath = 'fal-ai/veo3.1/fast/image-to-video';
  } else {
    endpoint = 'https://queue.fal.run/fal-ai/veo3.1/fast/first-last-frame-to-video';
    modelPath = 'fal-ai/veo3.1/fast/first-last-frame-to-video';
  }

  const body: Record<string, unknown> = {
    prompt,
    aspect_ratio: aspectRatio,
    duration,
    resolution,
    generate_audio: generateAudio
  };

  if (mode === 'image-to-video' && firstFrameUrl) {
    body.image_url = firstFrameUrl;
  } else if (mode === 'first-last-frame') {
    if (firstFrameUrl) body.first_frame_url = firstFrameUrl;
    if (lastFrameUrl) body.last_frame_url = lastFrameUrl;
  }

  logger.debug('Video generation request', { endpoint, mode });

  const result = await submitToQueue<{ request_id: string }>(endpoint, body);

  if (!result.request_id) {
    throw new Error('No request_id returned from video generation');
  }

  return {
    requestId: result.request_id,
    modelPath
  };
}

/**
 * Generate music using CassetteAI
 */
export async function generateMusic(options: MusicGenerationOptions): Promise<{
  requestId: string;
  modelPath: string;
}> {
  const {
    prompt,
    duration = 30
  } = options;

  const endpoint = 'https://queue.fal.run/CassetteAI/music-generator';
  const modelPath = 'CassetteAI/music-generator';

  const body = {
    prompt,
    duration: Math.max(10, Math.min(180, duration))
  };

  logger.debug('Music generation request', { endpoint, duration });

  const result = await submitToQueue<{ request_id: string }>(endpoint, body);

  if (!result.request_id) {
    throw new Error('No request_id returned from music generation');
  }

  return {
    requestId: result.request_id,
    modelPath
  };
}

/**
 * Generate 3D model using Hunyuan3D V3
 */
export async function generate3DModel(options: Model3DGenerationOptions): Promise<{
  requestId: string;
  modelPath: string;
}> {
  const {
    inputImageUrl,
    backImageUrl,
    leftImageUrl,
    rightImageUrl,
    enablePbr = true,
    faceCount = 500000,
    generateType = 'Normal'
  } = options;

  const endpoint = 'https://queue.fal.run/fal-ai/hunyuan3d-v3/image-to-3d';
  const modelPath = 'fal-ai/hunyuan3d-v3/image-to-3d';

  const body: Record<string, unknown> = {
    input_image_url: inputImageUrl,
    face_count: Math.max(40000, Math.min(1500000, faceCount)),
    generate_type: generateType,
    polygon_type: 'triangle'
  };

  if (enablePbr && generateType !== 'Geometry') {
    body.enable_pbr = enablePbr;
  }
  if (backImageUrl) body.back_image_url = backImageUrl;
  if (leftImageUrl) body.left_image_url = leftImageUrl;
  if (rightImageUrl) body.right_image_url = rightImageUrl;

  logger.debug('3D model generation request', { endpoint, generateType });

  const result = await submitToQueue<{ request_id: string }>(endpoint, body);

  if (!result.request_id) {
    throw new Error('No request_id returned from 3D generation');
  }

  return {
    requestId: result.request_id,
    modelPath
  };
}

/**
 * Poll for generation result
 */
export async function pollForResult<T>(
  requestId: string,
  modelPath: string,
  options: {
    maxWaitTime?: number;
    pollInterval?: number;
    onProgress?: (status: string, elapsed: number) => void;
  } = {}
): Promise<T> {
  const {
    maxWaitTime = 5 * 60 * 1000, // 5 minutes default
    pollInterval = 2000,
    onProgress
  } = options;

  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitTime) {
    await new Promise(resolve => setTimeout(resolve, pollInterval));

    try {
      const statusData = await checkQueueStatus<{
        status?: string;
        response_url?: string;
      }>(requestId, modelPath);

      const status = statusData.status?.toUpperCase() || '';
      const elapsed = Date.now() - startTime;

      if (onProgress) {
        onProgress(status, elapsed);
      }

      if (isStatusCompleted(status)) {
        const resultUrl = statusData.response_url || 
          `https://queue.fal.run/${modelPath}/requests/${requestId}`;
        return getQueueResult<T>(requestId, modelPath);
      }

      if (isStatusFailed(status)) {
        throw new Error(`Generation failed with status: ${status}`);
      }

    } catch (error) {
      const err = error as Error;
      if (err.message.includes('failed with status')) {
        throw error;
      }
      logger.warn('Poll error (will retry)', { error: err.message, requestId });
    }
  }

  throw new Error('Generation timed out');
}

export default {
  generateImage,
  generateVideo,
  generateMusic,
  generate3DModel,
  pollForResult,
  uploadToFal,
  isStatusCompleted,
  isStatusFailed,
  isStatusProcessing
};

