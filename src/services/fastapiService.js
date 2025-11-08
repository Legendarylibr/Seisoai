// FastAPI/ComfyUI service for NFT holders
// This service handles image generation using your local ComfyUI model via FastAPI

import { VISUAL_STYLES } from '../utils/styles.js';
import logger from '../utils/logger.js';

const FASTAPI_URL = import.meta.env.VITE_FASTAPI_URL || 'http://localhost:8000';
const FASTAPI_ENABLED = import.meta.env.VITE_FASTAPI_ENABLED === 'true';

// Get style prompt from the comprehensive styles configuration
const getStylePrompt = (styleId) => {
  if (!styleId) return 'artistic colors and lighting';
  
  const style = VISUAL_STYLES.find(s => s.id === styleId);
  return style ? style.prompt : 'artistic colors and lighting';
};

/**
 * Check if FastAPI service is available
 */
export const isFastAPIAvailable = async () => {
  if (!FASTAPI_ENABLED) return false;
  
  try {
    const response = await fetch(`${FASTAPI_URL}/health`, { 
      method: 'GET',
      timeout: 5000 
    });
    return response.ok;
  } catch (error) {
    console.warn('FastAPI service not available:', error.message);
    return false;
  }
};

/**
 * Generate image using FastAPI/ComfyUI
 */
export const generateImageWithFastAPI = async (style, customPrompt = '', advancedSettings = {}, referenceImage = null) => {
  if (!FASTAPI_ENABLED) {
    throw new Error('FastAPI service is disabled');
  }

  // Input validation
  if (style && typeof style !== 'object') {
    throw new Error('Style parameter must be an object when provided');
  }
  
  if (customPrompt && typeof customPrompt !== 'string') {
    throw new Error('Custom prompt must be a string');
  }
  
  if (advancedSettings && typeof advancedSettings !== 'object') {
    throw new Error('Advanced settings must be an object');
  }
  
  if (referenceImage && typeof referenceImage !== 'string') {
    throw new Error('Reference image must be a string (base64 or URL)');
  }

  try {
    // Content Safety Check - DISABLED for user privacy
    // const safetyCheck = performContentSafetyCheck({
    //   prompt: customPrompt,
    //   style: style,
    //   imageDescription: referenceImage ? 'reference image provided' : ''
    // });
    
    // if (!safetyCheck.isSafe) {
    //   // Log the safety violation
    //   await logSafetyViolation(safetyCheck, advancedSettings.walletAddress);
    //   
    //   // Throw a user-friendly error
    //   const alternatives = getSafeAlternatives(customPrompt);
    //   throw new Error(
    //     `Content blocked for safety reasons: ${safetyCheck.reason}. ` +
    //     `Please try a different prompt. Suggestions: ${alternatives.join(', ')}`
    //   );
    // }

    logger.info('FastAPI generation started', { 
      style: style?.id, 
      hasCustomPrompt: !!customPrompt,
      hasAdvancedSettings: Object.keys(advancedSettings).length > 0
    });
    logger.info('Content safety check bypassed - no censorship enabled');
    
    // Extract advanced settings with defaults
    const {
      guidanceScale = 7.5,
      imageSize = 'square',
      numImages = 1,
      steps = 20
    } = advancedSettings;
    
    // Generate random seed each time
    const seed = Math.floor(Math.random() * 2147483647);
    console.log('🎲 [FastAPI] Using random seed:', seed);

    // Build optimized prompt for Flux Kontext
    // User's custom prompt takes priority, style enhances without overriding
    let basePrompt = '';
    
    if (customPrompt && typeof customPrompt === 'string' && customPrompt.trim().length > 0) {
      const userPrompt = customPrompt.trim();
      
      // Add style enhancement only if we have a style and it adds value
      if (style && style.id) {
        const stylePrompt = getStylePrompt(style.id);
        if (stylePrompt && stylePrompt !== 'artistic colors and lighting') {
          // Extract only key style modifiers (first 3-4 keywords) to avoid overload
          const styleWords = stylePrompt.split(', ');
          const keyModifiers = styleWords.slice(0, 3).join(', ');
          
          // Combine: user content first, style modifiers enhance
          basePrompt = `${userPrompt}, ${keyModifiers}`;
        } else {
          basePrompt = userPrompt;
        }
      } else {
        // No style selected - pass prompt through unmodified
        basePrompt = userPrompt;
      }
    } else if (style && style.id) {
      basePrompt = getStylePrompt(style.id);
    } else {
      basePrompt = 'high quality, detailed, artistic image';
    }
    
    // Optimize prompt length (prefers concise prompts)
    if (basePrompt.length > 500) {
      basePrompt = basePrompt.substring(0, 500).trim();
    }
    
    logger.info('Using FastAPI/ComfyUI generation', {
      prompt: basePrompt,
      hasReferenceImage: !!referenceImage
    });
    
    // Map image sizes to dimensions
    const sizeMap = {
      'square': { width: 512, height: 512 },
      'portrait_4_3': { width: 512, height: 683 },
      'portrait_16_9': { width: 512, height: 912 },
      'portrait_3_2': { width: 512, height: 768 },
      'landscape_4_3': { width: 683, height: 512 },
      'landscape_16_9': { width: 912, height: 512 },
      'landscape_3_2': { width: 768, height: 512 },
      'ultra_wide': { width: 1024, height: 512 }
    };

    const dimensions = sizeMap[imageSize] || sizeMap['square'];
    
    // Build request payload for FastAPI
    const payload = {
      prompt: basePrompt,
      negative_prompt: advancedSettings.negativePrompt || '',
      width: dimensions.width,
      height: dimensions.height,
      steps: steps,
      cfg_scale: guidanceScale,
      seed: seed,
      batch_size: numImages
    };

    // Add reference image if provided
    if (referenceImage) {
      payload.reference_image = referenceImage;
    }

    logger.debug('FastAPI request payload:', payload);

    const response = await fetch(`${FASTAPI_URL}/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      let errorMessage = `HTTP error! status: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.detail || errorData.message || errorData.error || JSON.stringify(errorData);
      } catch (parseError) {
        const errorText = await response.text();
        errorMessage = errorText || errorMessage;
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    logger.debug('FastAPI response received', { 
      hasImages: !!data.images,
      imageCount: data.images?.length || 0
    });
    
    if (data.images && Array.isArray(data.images) && data.images.length > 0) {
      logger.info(`Generated ${data.images.length} image(s) successfully with FastAPI`);
      return data.images[0].url || data.images[0];
    } else {
      throw new Error('No image generated by FastAPI');
    }
  } catch (error) {
    console.error('FastAPI generation error:', error);
    throw new Error(`Failed to generate image with FastAPI: ${error.message}`);
  }
};

/**
 * Get available models from FastAPI
 */
export const getAvailableModels = async () => {
  if (!FASTAPI_ENABLED) return [];

  try {
    const response = await fetch(`${FASTAPI_URL}/models`, { 
      method: 'GET',
      timeout: 10000 
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return data.models || [];
  } catch (error) {
    console.warn('Could not fetch models from FastAPI:', error.message);
    return [];
  }
};

/**
 * Get generation status
 */
export const getGenerationStatus = async (taskId) => {
  if (!FASTAPI_ENABLED) return null;

  try {
    const response = await fetch(`${FASTAPI_URL}/status/${taskId}`, { 
      method: 'GET',
      timeout: 5000 
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.warn('Could not fetch generation status:', error.message);
    return null;
  }
};
