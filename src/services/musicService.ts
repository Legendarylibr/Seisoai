// Music generation service using fal.ai CassetteAI music generator
import logger from '../utils/logger';
import { API_URL } from '../utils/apiConfig';

// Types
export interface MusicGenerationOptions {
  prompt: string;
  duration?: number;
  userId?: string | null;
  walletAddress?: string | null;
  email?: string | null;
  optimizePrompt?: boolean;
  selectedGenre?: string | null;
}

export interface MusicGenerationResult {
  audioUrl: string;
  contentType?: string;
  fileName?: string;
  fileSize?: number;
  remainingCredits?: number;
  creditsDeducted?: number;
}

/**
 * Generate music from a text prompt using CassetteAI
 */
export const generateMusic = async ({
  prompt,
  duration = 30,
  userId,
  walletAddress,
  email,
  optimizePrompt = false,
  selectedGenre = null
}: MusicGenerationOptions): Promise<MusicGenerationResult> => {
  // Validate required inputs
  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    throw new Error('Prompt is required and must be a non-empty string');
  }
  
  // Clamp duration between 10 and 180 seconds
  const clampedDuration = Math.max(10, Math.min(180, duration));
  
  if (!userId && !walletAddress && !email) {
    throw new Error('User identification required. Please sign in.');
  }

  try {
    logger.debug('Music generation started', { 
      promptLength: prompt.length,
      duration: clampedDuration,
      optimizePrompt,
      selectedGenre
    });

    const requestBody = {
      prompt: prompt.trim(),
      duration: clampedDuration,
      userId,
      walletAddress,
      email,
      optimizePrompt,
      selectedGenre
    };

    // Call backend endpoint which checks credits before making external API call
    const response = await fetch(`${API_URL}/api/generate/music`, {
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
        logger.error('Music API Error Response', { status: response.status, hasDetail: !!errorData.detail });
        
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
    
    logger.debug('Music API response', { 
      success: data.success,
      hasAudioFile: !!data.audio_file,
      hasUrl: !!(data.audio_file?.url),
      keys: Object.keys(data)
    });
    
    if (data.audio_file && data.audio_file.url) {
      logger.debug('Music generated successfully');
      
      return {
        audioUrl: data.audio_file.url,
        contentType: data.audio_file.content_type,
        fileName: data.audio_file.file_name,
        fileSize: data.audio_file.file_size,
        remainingCredits: data.remainingCredits,
        creditsDeducted: data.creditsDeducted
      };
    } else {
      logger.error('No audio in response', { data: JSON.stringify(data).substring(0, 500) });
      throw new Error('No audio generated');
    }
  } catch (error) {
    const err = error as Error;
    logger.error('Music generation error', { error: err.message });
    throw new Error(`Failed to generate music: ${err.message}`);
  }
};

/**
 * Calculate music generation credits based on duration
 * Pricing: 1 credit per minute (rounded up), minimum 1 credit
 * 1 credit = $0.10
 */
export const calculateMusicCredits = (duration: number): number => {
  // 1 credit per minute (60 seconds), rounded up, minimum 1
  const seconds = Math.max(10, Math.min(180, duration || 30));
  const minutes = seconds / 60;
  return Math.max(1, Math.ceil(minutes));
};

/**
 * Calculate cost in dollars
 */
export const calculateMusicCost = (duration: number): string => {
  // $0.10 per credit (1 credit per minute)
  const credits = calculateMusicCredits(duration);
  return (credits * 0.10).toFixed(2);
};

export default { generateMusic, calculateMusicCredits, calculateMusicCost };

