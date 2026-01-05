// Video generation service using fal.ai Veo 3.1 variants
import logger from '../utils/logger';
import { API_URL } from '../utils/apiConfig';

// Types
type GenerationMode = 'text-to-video' | 'image-to-video' | 'first-last-frame';

interface ModeConfig {
  requiresFirstFrame: boolean;
  requiresLastFrame: boolean;
}

export interface VideoGenerationOptions {
  prompt: string;
  firstFrameUrl?: string;
  lastFrameUrl?: string;
  aspectRatio?: 'auto' | '16:9' | '9:16';
  duration?: '4s' | '6s' | '8s';
  resolution?: '720p' | '1080p';
  generateAudio?: boolean;
  generationMode?: GenerationMode;
  quality?: 'fast' | 'quality';
  userId?: string;
  walletAddress?: string;
  email?: string;
}

export interface VideoGenerationResult {
  videoUrl: string;
  contentType: string;
  fileName?: string;
  fileSize?: number;
  remainingCredits?: number;
  creditsDeducted?: number;
}

// Generation mode configurations
const GENERATION_MODES: Record<GenerationMode, ModeConfig> = {
  'text-to-video': {
    requiresFirstFrame: false,
    requiresLastFrame: false
  },
  'image-to-video': {
    requiresFirstFrame: true,
    requiresLastFrame: false
  },
  'first-last-frame': {
    requiresFirstFrame: true,
    requiresLastFrame: true
  }
};

/**
 * Generate video using Veo 3.1 (multiple modes supported)
 */
export const generateVideo = async ({
  prompt,
  firstFrameUrl,
  lastFrameUrl,
  aspectRatio = 'auto',
  duration = '8s',
  resolution = '720p',
  generateAudio = true,
  generationMode = 'first-last-frame',
  quality = 'fast',
  userId,
  walletAddress,
  email
}: VideoGenerationOptions): Promise<VideoGenerationResult> => {
  // Get mode configuration
  const modeConfig = GENERATION_MODES[generationMode] || GENERATION_MODES['first-last-frame'];
  
  // Validate required inputs
  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    throw new Error('Prompt is required and must be a non-empty string');
  }
  
  if (modeConfig.requiresFirstFrame && !firstFrameUrl) {
    throw new Error('First frame image is required for this mode');
  }
  
  if (modeConfig.requiresLastFrame && !lastFrameUrl) {
    throw new Error('Last frame image is required for this mode');
  }
  
  if (!userId && !walletAddress && !email) {
    throw new Error('User identification required. Please sign in.');
  }

  try {
    logger.debug('Video generation started', { 
      hasFirstFrame: !!firstFrameUrl,
      hasLastFrame: !!lastFrameUrl,
      duration,
      resolution,
      generationMode,
      quality
    });

    const requestBody = {
      prompt: prompt.trim(),
      first_frame_url: modeConfig.requiresFirstFrame ? firstFrameUrl : undefined,
      last_frame_url: modeConfig.requiresLastFrame ? lastFrameUrl : undefined,
      aspect_ratio: aspectRatio,
      duration,
      resolution,
      generate_audio: generateAudio,
      generation_mode: generationMode,
      quality,
      userId,
      walletAddress,
      email
    };

    // Call backend endpoint which checks credits before making external API call
    const response = await fetch(`${API_URL}/api/generate/video`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      let errorMessage = `HTTP error! status: ${response.status}`;
      try {
        const errorData = await response.json();
        logger.error('Video API Error Response', { status: response.status, hasDetail: !!errorData.detail });
        
        if (errorData.detail) {
          errorMessage = Array.isArray(errorData.detail) 
            ? errorData.detail.map((err: unknown) => typeof err === 'string' ? err : (err as { msg?: string }).msg || JSON.stringify(err)).join('; ')
            : errorData.detail;
        } else if (errorData.message) {
          errorMessage = errorData.message;
        } else if (errorData.error) {
          errorMessage = errorData.error;
        }
      } catch (parseError) {
        const parseErr = parseError as Error;
        logger.error('Failed to parse error response', { error: parseErr.message });
        const errorText = await response.text();
        errorMessage = errorText || errorMessage;
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    
    // Handle multiple possible response structures
    let videoUrl: string | null = null;
    let videoMeta: { content_type?: string; file_name?: string; file_size?: number } | null = null;
    
    if (data.video && data.video.url) {
      videoUrl = data.video.url;
      videoMeta = data.video;
    } else if (data.video && typeof data.video === 'string') {
      videoUrl = data.video;
    } else if (data.data?.video?.url) {
      videoUrl = data.data.video.url;
      videoMeta = data.data.video;
    } else if (data.url) {
      videoUrl = data.url;
    } else if (data.video_url) {
      videoUrl = data.video_url;
    }
    
    if (videoUrl) {
      logger.debug('Video generated successfully', { hasUrl: true });
      
      return {
        videoUrl: videoUrl,
        contentType: videoMeta?.content_type || data.video?.content_type || 'video/mp4',
        fileName: videoMeta?.file_name || data.video?.file_name,
        fileSize: videoMeta?.file_size || data.video?.file_size,
        remainingCredits: data.remainingCredits,
        creditsDeducted: data.creditsDeducted
      };
    } else {
      logger.error('No video URL in response', { responseKeys: Object.keys(data) });
      throw new Error('No video generated');
    }
  } catch (error) {
    const err = error as Error;
    logger.error('Video generation error', { error: err.message });
    throw new Error(`Failed to generate video: ${err.message}`);
  }
};

export default { generateVideo };




