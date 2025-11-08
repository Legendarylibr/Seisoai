// FAL.ai API service for Flux Kontext image generation
import { VISUAL_STYLES } from '../utils/styles.js';
import logger from '../utils/logger.js';
import { optimizeImages, needsOptimization } from '../utils/imageOptimizer.js';

const FAL_API_KEY = import.meta.env.VITE_FAL_API_KEY;

if (!FAL_API_KEY || FAL_API_KEY === 'your_fal_api_key_here') {
  logger.error('VITE_FAL_API_KEY is not set');
}

/**
 * Get the correct FLUX Kontext endpoint based on image count
 * @param {boolean} hasReferenceImage - True if any reference images are provided
 * @param {boolean} isMultipleImages - True if 2+ images (false for 0 or 1 images)
 * @returns {string} The endpoint URL
 * 
 * Model selection logic:
 * - 0 images → text-to-image (pro model)
 * - 1 image → image-to-image (max model)  
 * - 2+ images → multi-image (multi model)
 */
const getFluxEndpoint = (hasReferenceImage = false, isMultipleImages = false) => {
  if (!hasReferenceImage) {
    // 0 images - text-to-image
    return 'https://fal.run/fal-ai/flux-pro/kontext/text-to-image';
  } else if (isMultipleImages) {
    // 2+ images - multi model
    return 'https://fal.run/fal-ai/flux-pro/kontext/max/multi';
  } else {
    // 1 image - max model
    return 'https://fal.run/fal-ai/flux-pro/kontext/max';
  }
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
  
  if (referenceImage && typeof referenceImage !== 'string' && !Array.isArray(referenceImage)) {
    throw new Error('Reference image must be a string, URL, or array of images');
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

    logger.info('Generation started', { 
      style: style?.id, 
      hasCustomPrompt: !!customPrompt,
      hasAdvancedSettings: Object.keys(advancedSettings).length > 0
    });
    logger.info('Content safety check bypassed - no censorship enabled');
    
    // Log which endpoint will be used
    logger.debug('Using Flux Kontext endpoint based on settings');

    // Extract advanced settings with defaults
    const {
      guidanceScale = 7.5,
      imageSize = 'square',
      numImages = 1
    } = advancedSettings;

    // Build optimized prompt - avoid unnecessary concatenation
    let basePrompt = '';
    
    logger.debug('Building prompt', {
      hasCustomPrompt: !!(customPrompt && customPrompt.trim().length > 0),
      hasStyle: !!style,
      styleId: style?.id
    });
    
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
    
    logger.debug('Final prompt prepared', { promptLength: basePrompt.length });
    
    // Determine image count and type for model selection
    // 0 images: text-to-image
    // 1 image: image-to-image (single)
    // 2+ images: multi-image
    let imageCount = 0;
    let isMultipleImages = false;
    
    if (referenceImage) {
      if (Array.isArray(referenceImage)) {
        // Filter out empty/null values
        const validImages = referenceImage.filter(img => img && (typeof img === 'string' && img.trim().length > 0));
        imageCount = validImages.length;
        isMultipleImages = imageCount >= 2;
        
        // If array becomes empty after filtering, treat as no images
        if (imageCount === 0) {
          referenceImage = null;
        }
      } else if (typeof referenceImage === 'string' && referenceImage.trim().length > 0) {
        // Single string image (non-empty)
        imageCount = 1;
        isMultipleImages = false;
      } else {
        // Invalid reference image, treat as no images
        referenceImage = null;
        imageCount = 0;
        isMultipleImages = false;
      }
    }
    
    // Choose the right endpoint based on image count
    const hasRefImage = imageCount > 0;
    const fluxEndpoint = getFluxEndpoint(hasRefImage, isMultipleImages);
    
    // Determine mode description
    let modeDesc;
    if (imageCount === 0) {
      modeDesc = 'Kontext [pro] text-to-image';
    } else if (isMultipleImages) {
      modeDesc = `Kontext [multi] multi-image (${imageCount} images)`;
    } else {
      modeDesc = 'Kontext [max] image-to-image (1 image)';
    }
      
    logger.info(`Using ${modeDesc} generation`, {
      endpoint: fluxEndpoint,
      imageCount,
      hasReferenceImage: hasRefImage,
      isMultipleImages: isMultipleImages
    });
    
    logger.debug('Model selection', { imageCount, isMultipleImages, mode: modeDesc });
    
    // Generate random seed each time
    const randomSeed = Math.floor(Math.random() * 2147483647);
    
    // Build request body according to the official API schema
    const requestBody = {
      prompt: basePrompt,
      guidance_scale: guidanceScale,
      num_images: numImages,
      output_format: "jpeg",
      safety_tolerance: "6", // Maximum leniency - no censorship
      prompt_safety_tolerance: "6", // Additional prompt-level filter bypass
      enhance_prompt: true,
      seed: randomSeed // Randomized seed every time
    };

    // Add reference image(s) if provided based on image count
    if (hasRefImage && referenceImage) {
      // Optimize images before sending to reduce payload size
      let optimizedImages;
      
      if (isMultipleImages && Array.isArray(referenceImage)) {
        // Multiple images (2+) - use multi model
        // Filter out any invalid images
        const validImages = referenceImage.filter(img => img && (typeof img === 'string' && img.trim().length > 0));
        
        // Check if optimization is needed for any image
        const needsOpt = validImages.some(img => 
          typeof img === 'string' && img.startsWith('data:') && needsOptimization(img, 300)
        );
        
        if (needsOpt) {
          logger.debug('Optimizing images', { count: validImages.length });
          optimizedImages = await optimizeImages(validImages, {
            maxWidth: 2048,
            maxHeight: 2048,
            quality: 0.85,
            format: 'jpeg'
          });
        } else {
          optimizedImages = validImages;
        }
        
        // Multiple images for multi model - use image_urls
        requestBody.image_urls = optimizedImages;
        logger.debug('Using multiple reference images', { count: optimizedImages.length });
        
        // Ensure image_url is not set when using image_urls
        delete requestBody.image_url;
      } else if (imageCount === 1) {
        // Single image - use max model
        let singleImage = referenceImage;
        
        // If it's an array with one element, extract it
        if (Array.isArray(referenceImage) && referenceImage.length >= 1) {
          singleImage = referenceImage.find(img => img && (typeof img === 'string' && img.trim().length > 0));
        }
        
        // Optimize if needed
        if (typeof singleImage === 'string' && singleImage.startsWith('data:') && needsOptimization(singleImage, 300)) {
          logger.debug('Optimizing single image');
          optimizedImages = await optimizeImages(singleImage, {
            maxWidth: 2048,
            maxHeight: 2048,
            quality: 0.85,
            format: 'jpeg'
          });
        } else {
          optimizedImages = singleImage;
        }
        
        // Single image for max model - use image_url
        requestBody.image_url = optimizedImages;
        logger.debug('Using single reference image');
        
        // Ensure image_urls is not set when using image_url
        delete requestBody.image_urls;
      }
    } else {
      // No reference image (0 images) - using text-to-image mode
      logger.debug('Using text-to-image generation');
      
      // Ensure no image fields are set for text-to-image
      delete requestBody.image_url;
      delete requestBody.image_urls;
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
      hasImages: !!requestBody.image_urls,
      referenceImageCount: imageCount,
      imageUrlsCount: requestBody.image_urls?.length || 0,
      numImages: requestBody.num_images,
      aspectRatio: requestBody.aspect_ratio,
      endpoint: fluxEndpoint,
      mode: modeDesc
    });
    
    logger.debug('Request details', {
      endpoint: fluxEndpoint,
      mode: modeDesc,
      promptLength: requestBody.prompt?.length || 0,
      hasImage_url: !!requestBody.image_url,
      hasImage_urls: !!requestBody.image_urls,
      imageUrlsCount: requestBody.image_urls?.length || 0,
      guidance_scale: requestBody.guidance_scale
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
        logger.error('API Error Response', { status: response.status, hasDetail: !!errorData.detail });
        
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
        logger.error('Failed to parse error response', { error: parseError.message });
        const errorText = await response.text();
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
    logger.error('FAL.ai API Error', { error: error.message });
    throw new Error(`Failed to generate image: ${error.message}`);
  }
};

