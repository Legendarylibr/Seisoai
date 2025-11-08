// Veo 3 Fast Image-to-Video Service
// Uses Google's Veo 3 Fast model via fal.ai API for image-to-video generation

import { optimizeImage, needsOptimization } from '../utils/imageOptimizer';
import logger from '../utils/logger.js';

const FAL_API_KEY = import.meta.env.VITE_FAL_API_KEY;

if (!FAL_API_KEY || FAL_API_KEY === 'your_fal_api_key_here') {
  logger.error('VITE_FAL_API_KEY environment variable is required');
}

/**
 * Upload image to backend and get URL, or return existing URL
 * This prevents sending huge base64 data URIs in JSON payloads
 */
const prepareImageUrl = async (image) => {
  if (!image) return null;
  
  // If already a URL (not data URI), return as is
  if (typeof image === 'string' && image.startsWith('http')) {
    return image;
  }
  
  // If it's a data URI, upload it first to get a URL
  if (typeof image === 'string' && image.startsWith('data:')) {
    // Optimize first if it's large
    let optimizedImage = image;
    if (needsOptimization(image, 200)) { // Optimize if > 200KB
      logger.debug('Optimizing image before upload');
      try {
        optimizedImage = await optimizeImage(image, {
          maxWidth: 2048,
          maxHeight: 2048,
          quality: 0.85,
          format: 'jpeg'
        });
      } catch (error) {
        logger.warn('Image optimization failed, using original', { error: error.message });
      }
    }
    
    // Upload to backend which will upload to fal storage
    logger.debug('Uploading image to fal storage');
    try {
      const backendBase = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const uploadResponse = await fetch(`${backendBase}/api/veo3/upload-image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ imageDataUri: optimizedImage })
      });
      
      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(errorData.error || 'Failed to upload image');
      }
      
      const { imageUrl } = await uploadResponse.json();
      if (!imageUrl) {
        throw new Error('No image URL returned from upload');
      }
      
      logger.debug('Image uploaded successfully');
      return imageUrl;
    } catch (error) {
      logger.error('Failed to upload image, falling back to data URI', { error: error.message });
      // Fallback to optimized data URI if upload fails
      return optimizedImage;
    }
  }
  
  // Otherwise assume it's base64 and return as data URI
  return image;
};

/**
 * Generate video using Veo 3 Fast Image-to-Video
 * @param {Object} params - { prompt, image (required), options }
 * @returns {Promise<string>} - URL of generated video
 */
export const generateVideo = async ({ prompt, image = null, options = {} }) => {
  try {
    if (!FAL_API_KEY) {
      throw new Error('FAL API key not configured. Please set VITE_FAL_API_KEY in your .env file.');
    }

    if (!image) {
      throw new Error('Image input is required for Veo 3 Fast Image-to-Video API');
    }

    // Optimize image before sending (async)
    const imageUrl = await prepareImageUrl(image);

    const input = {
      prompt: prompt,
      image_url: imageUrl, // Required for image-to-video
      aspect_ratio: options.aspectRatio || 'auto',
      duration: '8s', // Fixed duration for this model
      resolution: options.resolution || '720p',
      generate_audio: options.generateAudio !== false
    };

    logger.debug('Generating video with Veo 3 Fast', { 
      hasImage: !!input.image_url, 
      isDataUri: input.image_url?.startsWith('data:'),
      aspect_ratio: input.aspect_ratio, 
      duration: input.duration 
    });

    // Submit via backend proxy to avoid CORS
    // Use VITE_API_URL for consistency with other services
    const backendBase = import.meta.env.VITE_API_URL || 'http://localhost:3001';
    const response = await fetch(`${backendBase}/api/veo3/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ input })
    });

    if (!response.ok) {
      let errorMessage = `HTTP error! status: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.detail || errorData.message || errorMessage;
      } catch (e) {
        errorMessage = await response.text();
      }
      throw new Error(errorMessage);
    }

    const { request_id } = await response.json();
    logger.debug('Video generation request submitted', { request_id });

    // Poll for completion
    let attempts = 0;
    const maxAttempts = 120; // 2 minutes max
    let consecutiveErrors = 0;
    const maxConsecutiveErrors = 5; // Stop after 5 consecutive errors
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
      
      let statusResponse;
      try {
        statusResponse = await fetch(`${backendBase}/api/veo3/status/${request_id}`, {
          method: 'GET'
        });
      } catch (fetchError) {
        consecutiveErrors++;
        logger.warn('Status check failed', { attempt: attempts + 1, error: fetchError.message });
        
        if (consecutiveErrors >= maxConsecutiveErrors) {
          throw new Error(`Failed to check status after ${maxConsecutiveErrors} attempts: ${fetchError.message}`);
        }
        attempts++;
        continue; // Retry on network errors
      }

      let status;
      try {
        if (!statusResponse.ok) {
          // If status is 404, the request ID might be invalid or expired
          if (statusResponse.status === 404) {
            throw new Error('Request ID not found. The video generation request may have expired.');
          }
          
          const errorData = await statusResponse.json().catch(() => ({ 
            error: `HTTP ${statusResponse.status}` 
          }));
          throw new Error(errorData.error || `Status check failed with status ${statusResponse.status}`);
        }
        
        const responseData = await statusResponse.json();
        
        // Check if the backend returned an error
        if (!responseData.success) {
          throw new Error(responseData.error || 'Status check returned an error');
        }
        
        status = responseData;
        consecutiveErrors = 0; // Reset error counter on success
      } catch (parseError) {
        consecutiveErrors++;
        logger.warn('Status response parse error', { attempt: attempts + 1, error: parseError.message });
        
        if (consecutiveErrors >= maxConsecutiveErrors) {
          throw new Error(`Failed to parse status after ${maxConsecutiveErrors} attempts: ${parseError.message}`);
        }
        attempts++;
        continue;
      }

      logger.debug('Video generation status', { status: status.status });

      if (status.status === 'COMPLETED') {
        // Get the result
        let resultResponse;
        try {
          resultResponse = await fetch(`${backendBase}/api/veo3/result/${request_id}`, {
            method: 'GET'
          });

          if (!resultResponse.ok) {
            const errorData = await resultResponse.json().catch(() => ({ 
              error: `HTTP ${resultResponse.status}` 
            }));
            throw new Error(errorData.error || `Failed to get result: ${resultResponse.status}`);
          }

          const resultData = await resultResponse.json();
          
          if (!resultData.success) {
            throw new Error(resultData.error || 'Result check returned an error');
          }
          
          const result = resultData;
          
          if (result.video && result.video.url) {
            logger.info('Video generated successfully');
            return result.video.url;
          } else {
            throw new Error('No video URL in response');
          }
        } catch (resultError) {
          throw new Error(`Failed to retrieve video result: ${resultError.message}`);
        }
      } else if (status.status === 'FAILED') {
        throw new Error(status.error || 'Video generation failed');
      }
      
      attempts++;
    }

    throw new Error('Video generation timeout');
  } catch (error) {
    logger.error('Veo 3 video generation error', { error: error.message });
    throw new Error(`Failed to generate video: ${error.message}`);
  }
};

/**
 * Get video generation options for Veo 3 Fast Image-to-Video
 */
export const getVideoOptions = () => {
  return {
    aspectRatio: [
      { value: 'auto', label: 'Auto (Match Image)' },
      { value: '16:9', label: '16:9 (Landscape)' },
      { value: '9:16', label: '9:16 (Portrait)' },
      { value: '1:1', label: '1:1 (Square)' }
    ],
    duration: [
      { value: '8s', label: '8 seconds' }
      // Note: Veo 3 Fast Image-to-Video only supports 8s duration
    ],
    resolution: [
      { value: '720p', label: '720p HD' },
      { value: '1080p', label: '1080p Full HD' }
    ]
  };
};

