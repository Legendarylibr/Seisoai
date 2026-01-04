// Video-to-Audio service using fal.ai MMAudio V2
// Generates synchronized audio from video content
import logger from '../utils/logger';
import { API_URL } from '../utils/apiConfig';

// Types
export interface VideoToAudioOptions {
  videoUrl: string;
  prompt?: string;
  negativePrompt?: string;
  numSteps?: number;
  cfgStrength?: number;
  duration?: number;
  userId?: string | null;
  walletAddress?: string | null;
  email?: string | null;
}

export interface VideoToAudioResult {
  audioUrl: string;
  contentType?: string;
  fileName?: string;
  fileSize?: number;
  remainingCredits?: number;
  creditsDeducted?: number;
}

/**
 * Generate synchronized audio from a video using MMAudio V2
 * 
 * This model analyzes the video content and generates audio that
 * matches the visual elements - perfect for adding sound effects,
 * ambient audio, or music that syncs with video motion.
 * 
 * @param options - Configuration options
 * @param options.videoUrl - URL of the video to generate audio for
 * @param options.prompt - Optional text prompt to guide audio generation
 * @param options.negativePrompt - Optional negative prompt to avoid certain sounds
 * @param options.numSteps - Number of inference steps (10-50, default 25)
 * @param options.cfgStrength - Classifier-free guidance strength (1-10, default 4.5)
 * @param options.duration - Audio duration in seconds (1-30, default matches video)
 */
export const generateAudioFromVideo = async ({
  videoUrl,
  prompt = '',
  negativePrompt = '',
  numSteps = 25,
  cfgStrength = 4.5,
  duration = 8,
  userId,
  walletAddress,
  email
}: VideoToAudioOptions): Promise<VideoToAudioResult> => {
  // Validate required inputs
  if (!videoUrl || typeof videoUrl !== 'string' || videoUrl.trim().length === 0) {
    throw new Error('Video URL is required');
  }
  
  if (!userId && !walletAddress && !email) {
    throw new Error('User identification required. Please sign in.');
  }

  try {
    logger.debug('Video-to-audio generation started', { 
      hasPrompt: !!prompt,
      numSteps,
      cfgStrength,
      duration
    });

    const requestBody = {
      video_url: videoUrl.trim(),
      prompt: prompt?.trim() || '',
      negative_prompt: negativePrompt?.trim() || '',
      num_steps: Math.min(50, Math.max(10, numSteps)),
      cfg_strength: Math.min(10, Math.max(1, cfgStrength)),
      duration: Math.min(30, Math.max(1, duration)),
      userId,
      walletAddress,
      email
    };

    // Call backend endpoint
    const response = await fetch(`${API_URL}/api/generate/video-to-audio`, {
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
        logger.error('Video-to-audio API Error', { status: response.status, hasDetail: !!errorData.detail });
        
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
    
    logger.debug('Video-to-audio API response', { 
      success: data.success,
      hasAudio: !!data.audio,
      hasUrl: !!(data.audio?.url),
      keys: Object.keys(data)
    });
    
    if (data.audio && data.audio.url) {
      logger.debug('Audio generated successfully');
      
      return {
        audioUrl: data.audio.url,
        contentType: data.audio.content_type,
        fileName: data.audio.file_name,
        fileSize: data.audio.file_size,
        remainingCredits: data.remainingCredits,
        creditsDeducted: data.creditsDeducted
      };
    } else {
      logger.error('No audio in response', { data: JSON.stringify(data).substring(0, 500) });
      throw new Error('No audio generated');
    }
  } catch (error) {
    const err = error as Error;
    logger.error('Video-to-audio generation error', { error: err.message });
    throw new Error(`Failed to generate audio: ${err.message}`);
  }
};

/**
 * Calculate video-to-audio generation credits
 * Flat rate of 0.5 credits per generation
 */
export const calculateVideoToAudioCredits = (): number => {
  return 0.5;
};

/**
 * Calculate cost in dollars
 */
export const calculateVideoToAudioCost = (): string => {
  // $0.10 per credit
  const credits = calculateVideoToAudioCredits();
  return (credits * 0.10).toFixed(2);
};

export default { 
  generateAudioFromVideo, 
  calculateVideoToAudioCredits, 
  calculateVideoToAudioCost 
};



