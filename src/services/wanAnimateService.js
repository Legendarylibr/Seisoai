// Wan 2.2 Animate Replace Service
// Uses fal.ai Wan-Animate Replace model for video-to-video character replacement
// API: https://fal.ai/models/fal-ai/wan/v2.2-14b/animate/replace/api

import logger from '../utils/logger.js';

const FAL_API_KEY = import.meta.env.VITE_FAL_API_KEY;

if (!FAL_API_KEY || FAL_API_KEY === 'your_fal_api_key_here') {
  logger.error('VITE_FAL_API_KEY environment variable is required');
}

/**
 * Upload video/image to backend and get URL, or return existing URL
 */
const prepareFileUrl = async (file, fileType = 'image') => {
  if (!file) return null;
  
  // If already a URL (not data URI), return as is
  if (typeof file === 'string' && file.startsWith('http')) {
    return file;
  }
  
  // If it's a data URI, upload it first to get a URL
  if (typeof file === 'string' && file.startsWith('data:')) {
    logger.debug(`Uploading ${fileType} to backend`);
    try {
      const backendBase = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const uploadResponse = await fetch(`${backendBase}/api/wan-animate/upload-${fileType}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          [`${fileType}DataUri`]: file 
        })
      });
      
      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(errorData.error || 'Failed to upload file');
      }
      
      const { url } = await uploadResponse.json();
      if (!url) {
        throw new Error(`No ${fileType} URL returned from upload`);
      }
      
      logger.debug(`${fileType} uploaded successfully`);
      return url;
    } catch (error) {
      logger.error(`Failed to upload ${fileType}, falling back to data URI`, { error: error.message });
      // Fallback to data URI if upload fails
      return file;
    }
  }
  
  return file;
};

/**
 * Generate video using Wan 2.2 Animate Replace
 * @param {string} videoUrl - URL of the input video
 * @param {string} imageUrl - URL of the character image to replace with
 * @param {Object} options - Generation options
 * @param {Function} onProgress - Optional progress callback (0-100)
 * @returns {Promise<string>} - URL of the generated video
 */
export const generateVideo = async (videoUrl, imageUrl, options = {}, onProgress = null) => {
  try {
    if (!videoUrl || !imageUrl) {
      throw new Error('Both video URL and image URL are required');
    }

    const {
      guidanceScale = 1,
      resolution = '480p', // 480p, 580p, or 720p
      seed = null,
      numInferenceSteps = 6,
      enableSafetyChecker = true,
      enableOutputSafetyChecker = true,
      shift = 5,
      videoQuality = 'high', // low, medium, high, maximum
      videoWriteMode = 'balanced', // fast, balanced, small
      returnFramesZip = false,
      useTurbo = false
    } = options;

    // Prepare file URLs (upload if needed)
    const preparedVideoUrl = await prepareFileUrl(videoUrl, 'video');
    const preparedImageUrl = await prepareFileUrl(imageUrl, 'image');

    logger.debug('Generating video with Wan 2.2 Animate Replace', {
      hasVideoUrl: !!preparedVideoUrl,
      hasImageUrl: !!preparedImageUrl,
      resolution,
      videoQuality,
      videoWriteMode
    });

    // Submit via backend proxy to avoid CORS and protect API key
    const backendBase = import.meta.env.VITE_API_URL || 'http://localhost:3001';
    const response = await fetch(`${backendBase}/api/wan-animate/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: {
          video_url: preparedVideoUrl,
          image_url: preparedImageUrl,
          guidance_scale: guidanceScale,
          resolution,
          ...(seed !== null && seed !== undefined ? { seed } : {}),
          num_inference_steps: numInferenceSteps,
          enable_safety_checker: enableSafetyChecker,
          enable_output_safety_checker: enableOutputSafetyChecker,
          shift,
          video_quality: videoQuality,
          video_write_mode: videoWriteMode,
          return_frames_zip: returnFramesZip,
          use_turbo: useTurbo
        }
      })
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

    const responseData = await response.json();
    
    // Extract request_id - handle both direct response and wrapped response
    const request_id = responseData.request_id || responseData.requestId;
    
    if (!request_id) {
      logger.error('No request_id in submit response', { responseData });
      throw new Error('No request ID returned from video generation request');
    }
    
    logger.debug('Video generation request submitted', { request_id });

    if (onProgress) onProgress(30, request_id);

    // Poll for completion
    let attempts = 0;
    const maxAttempts = 300; // 5 minutes max (video generation takes longer)
    let consecutiveErrors = 0;
    const maxConsecutiveErrors = 5;
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds
      
      // Update progress (30-80% during polling)
      if (onProgress) {
        const progress = 30 + Math.min(50, (attempts / maxAttempts) * 50);
        onProgress(Math.round(progress));
      }
      
      let statusResponse;
      try {
        statusResponse = await fetch(`${backendBase}/api/wan-animate/status/${request_id}`, {
          method: 'GET'
        });
      } catch (fetchError) {
        consecutiveErrors++;
        logger.warn('Status check failed', { attempt: attempts + 1, error: fetchError.message });
        
        if (consecutiveErrors >= maxConsecutiveErrors) {
          throw new Error(`Failed to check status after ${maxConsecutiveErrors} attempts: ${fetchError.message}`);
        }
        attempts++;
        continue;
      }

      let status;
      try {
        if (!statusResponse.ok) {
          if (statusResponse.status === 404) {
            throw new Error('Request ID not found. The video generation request may have expired.');
          }
          
          const errorData = await statusResponse.json().catch(() => ({ 
            error: `HTTP ${statusResponse.status}` 
          }));
          throw new Error(errorData.error || `Status check failed with status ${statusResponse.status}`);
        }
        
        const responseData = await statusResponse.json();
        
        if (!responseData.success) {
          throw new Error(responseData.error || 'Status check returned an error');
        }
        
        status = responseData;
        consecutiveErrors = 0;
      } catch (parseError) {
        consecutiveErrors++;
        logger.warn('Status response parse error', { attempt: attempts + 1, error: parseError.message });
        
        if (consecutiveErrors >= maxConsecutiveErrors) {
          throw new Error(`Failed to parse status after ${maxConsecutiveErrors} attempts: ${parseError.message}`);
        }
        attempts++;
        continue;
      }

      // Handle different status formats from API
      // Status might be: "IN_QUEUE", "IN_PROGRESS", "COMPLETED", "FAILED"
      const currentStatus = status.status || status;
      
      logger.debug('Video generation status', { 
        status: currentStatus,
        fullStatus: status 
      });

      if (currentStatus === 'COMPLETED' || currentStatus === 'completed') {
        if (onProgress) onProgress(85);
        
        // Get the result
        let resultResponse;
        try {
          resultResponse = await fetch(`${backendBase}/api/wan-animate/result/${request_id}`, {
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
          
          // Backend wraps the response in { success: true, ...data }
          // So we need to extract the actual data (excluding success field)
          const { success, ...falResponse } = resultData;
          const result = falResponse;
          
          // Log full result structure for debugging
          logger.debug('Wan-animate result response', { 
            resultKeys: Object.keys(result),
            hasVideo: !!result.video,
            hasData: !!result.data,
            hasSuccess: !!result.success,
            resultPreview: JSON.stringify(result).substring(0, 500)
          });
          
          // Handle different possible response structures from fal.ai API
          // The API may return: 
          // - { video: { url: "..." } } 
          // - { video: "..." } 
          // - { data: { video: { url: "..." } } }
          // - { data: { video: "..." } }
          // - Direct video URL in result
          // - Backend may wrap: { success: true, video: {...} }
          let videoUrl = null;
          
          // Check result.video first
          if (result.video) {
            if (typeof result.video === 'string') {
              videoUrl = result.video;
            } else if (result.video.url) {
              videoUrl = result.video.url;
            } else if (result.video.file?.url) {
              videoUrl = result.video.file.url;
            }
          } 
          // Check result.data.video
          else if (result.data) {
            if (result.data.video) {
              if (typeof result.data.video === 'string') {
                videoUrl = result.data.video;
              } else if (result.data.video.url) {
                videoUrl = result.data.video.url;
              } else if (result.data.video.file?.url) {
                videoUrl = result.data.video.file.url;
              }
            }
            // Check if data itself is the video URL
            else if (typeof result.data === 'string' && result.data.startsWith('http')) {
              videoUrl = result.data;
            }
          }
          // Check if result itself is a URL string
          else if (typeof result === 'string' && result.startsWith('http')) {
            videoUrl = result;
          }
          // Check all string values in result that look like URLs
          else {
            for (const [key, value] of Object.entries(result)) {
              if (typeof value === 'string' && value.startsWith('http') && (value.includes('.mp4') || value.includes('video') || value.includes('fal.media'))) {
                videoUrl = value;
                logger.debug('Found video URL in result field', { key, videoUrl });
                break;
              }
            }
          }
          
          if (videoUrl) {
            if (onProgress) onProgress(95);
            logger.info('Video generated successfully', { videoUrl, request_id });
            return videoUrl;
          } else {
            logger.error('No video URL in response', { 
              result,
              resultKeys: Object.keys(result),
              resultString: JSON.stringify(result).substring(0, 500)
            });
            throw new Error('No video URL in response. Response structure: ' + JSON.stringify(result).substring(0, 500));
          }
        } catch (resultError) {
          throw new Error(`Failed to retrieve video result: ${resultError.message}`);
        }
      } else if (currentStatus === 'FAILED' || currentStatus === 'failed') {
        const errorMessage = status.error || status.message || 'Video generation failed';
        logger.error('Video generation failed', { status, errorMessage });
        throw new Error(errorMessage);
      } else if (currentStatus === 'IN_QUEUE' || currentStatus === 'IN_PROGRESS' || 
                 currentStatus === 'in_queue' || currentStatus === 'in_progress') {
        // Continue polling for these statuses
        logger.debug('Video generation in progress', { status: currentStatus });
      } else {
        // Unknown status - log but continue polling
        logger.warn('Unknown video generation status', { status: currentStatus, fullStatus: status });
      }
      
      attempts++;
    }

    throw new Error('Video generation timeout');
  } catch (error) {
    logger.error('Wan 2.2 Animate Replace error', { error: error.message });
    throw new Error(`Failed to generate video: ${error.message}`);
  }
};

/**
 * Get video generation options for Wan 2.2 Animate Replace
 */
export const getVideoOptions = () => {
  return {
    resolutions: [
      { value: '480p', label: '480p (Fastest)' },
      { value: '580p', label: '580p (Balanced)' },
      { value: '720p', label: '720p (Best Quality)' }
    ],
    videoQualities: [
      { value: 'low', label: 'Low (Smallest file)' },
      { value: 'medium', label: 'Medium' },
      { value: 'high', label: 'High (Recommended)' },
      { value: 'maximum', label: 'Maximum (Best quality)' }
    ],
    videoWriteModes: [
      { value: 'fast', label: 'Fast (Larger file)' },
      { value: 'balanced', label: 'Balanced (Recommended)' },
      { value: 'small', label: 'Small (Smallest file)' }
    ]
  };
};

