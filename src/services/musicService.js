// Music generation service using fal.ai CassetteAI music generator
import logger from '../utils/logger.js';
import { API_URL } from '../utils/apiConfig.js';

/**
 * Generate music from a text prompt using CassetteAI
 * @param {Object} options - Generation options
 * @param {string} options.prompt - Text description of the music to generate
 * @param {number} options.duration - Duration in seconds (10-180 seconds)
 * @param {string} options.userId - User ID for credit tracking
 * @param {string} options.walletAddress - Wallet address for credit tracking
 * @param {string} options.email - Email for credit tracking
 * @returns {Promise<Object>} - Generated audio URL and credits info
 */
export const generateMusic = async ({
  prompt,
  duration = 30,
  userId,
  walletAddress,
  email
}) => {
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
      duration: clampedDuration
    });

    const requestBody = {
      prompt: prompt.trim(),
      duration: clampedDuration,
      userId,
      walletAddress,
      email
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
      throw new Error('No audio generated');
    }
  } catch (error) {
    logger.error('Music generation error', { error: error.message });
    throw new Error(`Failed to generate music: ${error.message}`);
  }
};

/**
 * Calculate music generation credits based on duration
 * Pricing: 1 credit per minute (rounded up), minimum 1 credit
 * 1 credit = $0.10
 * @param {number} duration - Duration in seconds
 * @returns {number} - Credits required
 */
export const calculateMusicCredits = (duration) => {
  // 1 credit per minute (60 seconds), rounded up, minimum 1
  const seconds = Math.max(10, Math.min(180, duration || 30));
  const minutes = seconds / 60;
  return Math.max(1, Math.ceil(minutes));
};

/**
 * Calculate cost in dollars
 * @param {number} duration - Duration in seconds
 * @returns {string} - Cost as a formatted string
 */
export const calculateMusicCost = (duration) => {
  // $0.10 per credit (1 credit per minute)
  const credits = calculateMusicCredits(duration);
  return (credits * 0.10).toFixed(2);
};

export default { generateMusic, calculateMusicCredits, calculateMusicCost };

