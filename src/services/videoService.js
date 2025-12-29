// Video generation service using fal.ai Veo 3.1 variants
import logger from '../utils/logger.js';
import { API_URL } from '../utils/apiConfig.js';

// Generation mode configurations
// Note: Actual endpoint construction is handled by the backend
const GENERATION_MODES = {
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
 * @param {Object} options - Generation options
 * @param {string} options.prompt - Description of the video/animation
 * @param {string} options.firstFrameUrl - URL or base64 of the first frame (optional for text-to-video)
 * @param {string} options.lastFrameUrl - URL or base64 of the last frame (only for first-last-frame mode)
 * @param {string} options.aspectRatio - 'auto', '16:9', or '9:16'
 * @param {string} options.duration - '4s', '6s', or '8s'
 * @param {string} options.resolution - '720p' or '1080p'
 * @param {boolean} options.generateAudio - Whether to generate audio
 * @param {string} options.generationMode - 'text-to-video', 'image-to-video', or 'first-last-frame'
 * @param {string} options.quality - 'fast' or 'quality'
 * @param {string} options.userId - User ID for credit tracking
 * @param {string} options.walletAddress - Wallet address for credit tracking
 * @param {string} options.email - Email for credit tracking
 * @returns {Promise<Object>} - Generated video URL and credits info
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
}) => {
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
            ? errorData.detail.map(err => typeof err === 'string' ? err : err.msg || JSON.stringify(err)).join('; ')
            : errorData.detail;
        } else if (errorData.message) {
          errorMessage = errorData.message;
        } else if (errorData.error) {
          errorMessage = errorData.error;
        }
      } catch (parseError) {
        logger.error('Failed to parse error response', { error: parseError.message });
        const errorText = await response.text();
        errorMessage = errorText || errorMessage;
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    
    // Handle multiple possible response structures
    let videoUrl = null;
    let videoMeta = null;
    
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
      
      // NOTE: Video metadata cleaning (creation date, camera info, location, etc.)
      // Videos from fal.ai typically have minimal metadata. For additional cleaning,
      // use backend FFmpeg processing (backend/utils/videoMetadata.js) if needed.
      
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
    logger.error('Video generation error', { error: error.message });
    throw new Error(`Failed to generate video: ${error.message}`);
  }
};

export default { generateVideo };

