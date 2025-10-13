// FAL.ai API service for Flux Kontext image generation
import { VISUAL_STYLES } from '../utils/styles.js';
import { performContentSafetyCheck, logSafetyViolation, getSafeAlternatives } from './contentSafetyService.js';
import { generationLogger as logger } from '../utils/logger.js';

const FAL_API_KEY = import.meta.env.VITE_FAL_API_KEY;

if (!FAL_API_KEY || FAL_API_KEY === 'your_fal_api_key_here') {
  throw new Error('VITE_FAL_API_KEY environment variable is required. Please check your .env file and add your FAL API key from https://fal.ai');
}

// FLUX.1 Kontext [max] endpoint - Updated to use the premium model
const getFluxEndpoint = () => {
  // Use the official FLUX.1 Kontext [max] model endpoint for premium quality
  return 'https://fal.run/fal-ai/flux-pro/kontext/max';
};

// Get style prompt from the comprehensive styles configuration
const getStylePrompt = (styleId) => {
  if (!styleId) return 'artistic colors and lighting';
  
  const style = VISUAL_STYLES.find(s => s.id === styleId);
  return style ? style.prompt : 'artistic colors and lighting';
};

export const generateImage = async (style, customPrompt = '', advancedSettings = {}, referenceImage = null) => {
  // Input validation - style is now optional
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
    // Content Safety Check - CRITICAL for CSAM protection
    const safetyCheck = performContentSafetyCheck({
      prompt: customPrompt,
      style: style,
      imageDescription: referenceImage ? 'reference image provided' : ''
    });
    
    if (!safetyCheck.isSafe) {
      // Log the safety violation
      await logSafetyViolation(safetyCheck, advancedSettings.walletAddress);
      
      // Throw a user-friendly error
      const alternatives = getSafeAlternatives(customPrompt);
      throw new Error(
        `Content blocked for safety reasons: ${safetyCheck.reason}. ` +
        `Please try a different prompt. Suggestions: ${alternatives.join(', ')}`
      );
    }

    logger.info('Generation started', { 
      style: style?.id, 
      hasCustomPrompt: !!customPrompt,
      hasAdvancedSettings: Object.keys(advancedSettings).length > 0
    });
    logger.info('Content safety check passed');
    
    // Log which endpoint will be used
    logger.debug('Using Flux Kontext endpoint based on settings');

    // Extract advanced settings with defaults
    const {
      guidanceScale = 7.5,
      imageSize = 'square',
      numImages = 1,
      enableSafetyChecker = false,
      generationMode = 'flux-pro'
    } = advancedSettings;

    // Build optimized prompt - avoid unnecessary concatenation
    let basePrompt = '';
    
    // If we have a custom prompt, use it as the base
    if (customPrompt && typeof customPrompt === 'string' && customPrompt.trim().length > 0) {
      basePrompt = customPrompt.trim();
      
      // Add style prompt only if we have a style and it adds value
      if (style && style.id) {
        const stylePrompt = getStylePrompt(style.id);
        if (stylePrompt && stylePrompt !== 'artistic colors and lighting') {
          basePrompt = `${basePrompt}, ${stylePrompt}`;
        }
      }
    } else if (style && style.id) {
      // If no custom prompt but we have a style, use the style prompt
      basePrompt = getStylePrompt(style.id);
    } else {
      // If no prompt and no style, use a default
      basePrompt = 'artistic image, high quality, detailed';
    }
    
    // Use FLUX.1 Kontext [max] for premium image generation
    const fluxEndpoint = getFluxEndpoint();
    logger.info('Using FLUX.1 Kontext [max] generation', {
      endpoint: fluxEndpoint,
      hasReferenceImage: !!referenceImage
    });
    
    // Build request body according to the official API schema
    const requestBody = {
      prompt: basePrompt,
      guidance_scale: guidanceScale,
      num_images: numImages,
      output_format: "jpeg",
      safety_tolerance: enableSafetyChecker ? "2" : "6", // API expects string values
      enhance_prompt: true,
      seed: Math.floor(Math.random() * 1000000) // Add random seed for variety
    };

    // Add reference image if provided (required for Kontext model)
    if (referenceImage) {
      requestBody.image_url = referenceImage;
      logger.debug('Using reference image for Kontext generation');
    } else {
      // Kontext [max] model requires an image_url, so we need to provide a default or throw an error
      throw new Error('FLUX.1 Kontext [max] requires a reference image. Please upload an image to use this model.');
    }

    // Add aspect ratio based on the selected size
    if (imageSize && imageSize !== 'square_hd') {
      // Map our image sizes to aspect ratios according to the API schema
      const aspectRatioMap = {
        'square': '1:1',
        'portrait_4_3': '3:4',
        'portrait_16_9': '9:16',
        'portrait_3_2': '2:3',
        'landscape_4_3': '4:3',
        'landscape_16_9': '16:9',
        'landscape_3_2': '3:2',
        'ultra_wide': '21:9'
      };
      
      if (aspectRatioMap[imageSize]) {
        requestBody.aspect_ratio = aspectRatioMap[imageSize];
      }
    }

    logger.debug('Generation request prepared', {
      prompt: requestBody.prompt,
      hasImage: !!requestBody.image_url,
      numImages: requestBody.num_images,
      aspectRatio: requestBody.aspect_ratio
    });

    const response = await fetch(fluxEndpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Key ${FAL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    logger.debug('API response received', { 
      status: response.status,
      statusText: response.statusText
    });

    if (!response.ok) {
      let errorMessage = `HTTP error! status: ${response.status}`;
      try {
        const errorData = await response.json();
        console.error('API Error Response:', errorData);
        
        // Handle different error response formats
        if (errorData.detail) {
          if (Array.isArray(errorData.detail)) {
            // If detail is an array, join the messages
            errorMessage = errorData.detail.map(err => 
              typeof err === 'string' ? err : 
              typeof err === 'object' && err.msg ? err.msg :
              JSON.stringify(err)
            ).join('; ');
          } else {
            errorMessage = errorData.detail;
          }
        } else if (errorData.message) {
          errorMessage = errorData.message;
        } else if (errorData.error) {
          errorMessage = errorData.error;
        } else {
          errorMessage = JSON.stringify(errorData);
        }
      } catch (parseError) {
        console.error('Failed to parse error response:', parseError);
        const errorText = await response.text();
        console.error('Raw error response:', errorText);
        errorMessage = errorText || errorMessage;
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    logger.debug('Text-only API response received', { 
      hasImages: !!data.images,
      imageCount: data.images?.length || 0
    });
    
    if (data.images && Array.isArray(data.images) && data.images.length > 0) {
      // For single image, return the first image
      // For multiple images, return the first image (you might want to handle this differently)
      logger.info(`Generated ${data.images.length} image(s) successfully`);
      return data.images[0].url;
    } else {
      throw new Error('No image generated');
    }
  } catch (error) {
    console.error('FAL.ai API Error:', error);
    throw new Error(`Failed to generate image: ${error.message}`);
  }
};

