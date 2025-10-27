// FAL.ai API service for Flux Kontext image generation
import { VISUAL_STYLES } from '../utils/styles.js';
import { performContentSafetyCheck, logSafetyViolation, getSafeAlternatives } from './contentSafetyService.js';
import { generationLogger as logger } from '../utils/logger.js';

const FAL_API_KEY = import.meta.env.VITE_FAL_API_KEY;

if (!FAL_API_KEY || FAL_API_KEY === 'your_fal_api_key_here') {
  console.error('⚠️ VITE_FAL_API_KEY is not set. Please add your FAL API key to .env file from https://fal.ai');
}

// FLUX.1 Kontext endpoints
const getFluxEndpoint = (hasReferenceImage = false, isMultipleImages = false) => {
  if (!hasReferenceImage) {
    // No reference image - text-to-image
    return 'https://fal.run/fal-ai/flux-pro/kontext/text-to-image';
  } else if (isMultipleImages) {
    // Multiple images - use multi model
    return 'https://fal.run/fal-ai/flux-pro/kontext/multi';
  } else {
    // Single image - use max model
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
      generationMode = 'flux-pro',
      referenceImageDimensions = null
    } = advancedSettings;

    // Build optimized prompt - avoid unnecessary concatenation
    let basePrompt = '';
    
    console.log('🔍 [PROMPT DEBUG] Custom prompt received:', {
      customPrompt,
      customPromptType: typeof customPrompt,
      customPromptLength: customPrompt?.length,
      customPromptTrimmed: customPrompt?.trim(),
      hasStyle: !!style,
      styleId: style?.id
    });
    
    // Optimized prompt building for Flux Kontext Pro Max
    // User's custom prompt takes priority, style enhances without overriding
    if (customPrompt && typeof customPrompt === 'string' && customPrompt.trim().length > 0) {
      const userPrompt = customPrompt.trim();
      console.log('✅ [PROMPT DEBUG] Using custom prompt as base:', userPrompt);
      
      // Add style enhancement only if we have a style and it adds value
      if (style && style.id) {
        const stylePrompt = getStylePrompt(style.id);
        if (stylePrompt && stylePrompt !== 'artistic colors and lighting') {
          // Extract only the key style modifiers (first 3-4 words) to avoid overload
          const styleWords = stylePrompt.split(', ');
          const keyModifiers = styleWords.slice(0, 3).join(', ');
          
          // Combine with user prompt: user content first, style modifiers enhance
          basePrompt = `${userPrompt}, ${keyModifiers}`;
          console.log('✅ [PROMPT DEBUG] Added concise style enhancement:', basePrompt);
        } else {
          basePrompt = userPrompt;
        }
      } else {
        // No style selected - pass prompt through unmodified
        basePrompt = userPrompt;
        console.log('✅ No preset selected - passing prompt through unchanged');
      }
    } else if (style && style.id) {
      // If no custom prompt but we have a style, use the style prompt
      basePrompt = getStylePrompt(style.id);
      console.log('✅ [PROMPT DEBUG] Using style prompt only:', basePrompt);
    } else {
      // If no prompt and no style, use a default optimized for Flux Kontext
      basePrompt = 'high quality, detailed, artistic image';
      console.log('⚠️ [PROMPT DEBUG] Using default prompt (no user input):', basePrompt);
    }
    
    // Optimize prompt length for Flux Kontext Pro Max (prefers concise prompts)
    if (basePrompt.length > 500) {
      console.log('⚠️ Prompt is long, truncating for optimal Flux Kontext performance');
      basePrompt = basePrompt.substring(0, 500).trim();
    }
    
    console.log('🎯 [PROMPT DEBUG] Final prompt being sent to API:', basePrompt);
    
    // Choose the right endpoint based on reference image type
    const hasRefImage = !!referenceImage;
    const isMultipleImages = Array.isArray(referenceImage);
    const fluxEndpoint = getFluxEndpoint(hasRefImage, isMultipleImages);
    
    const modeDesc = hasRefImage 
      ? (isMultipleImages ? 'Kontext [multi] multi-image' : 'Kontext [max] image-to-image')
      : 'Kontext [pro] text-to-image';
      
    logger.info(`Using ${modeDesc} generation`, {
      endpoint: fluxEndpoint,
      hasReferenceImage: hasRefImage,
      isMultipleImages: isMultipleImages
    });
    
    // Build request body according to the official API schema
      // Generate random seed each time
      const randomSeed = Math.floor(Math.random() * 2147483647); // Random seed for variety
      
      const requestBody = {
        prompt: basePrompt,
        guidance_scale: guidanceScale,
        num_images: numImages,
        output_format: "jpeg",
        safety_tolerance: enableSafetyChecker ? "2" : "6", // API expects string values
        enhance_prompt: true,
        seed: randomSeed // Randomized seed every time
      };
      
      console.log('🎲 Using random seed:', randomSeed);

    // Add reference image(s) if provided
    if (referenceImage) {
      if (Array.isArray(referenceImage)) {
        // Multiple images for multi model
        requestBody.image_urls = referenceImage;
        console.log(`📸 Using ${referenceImage.length} reference images for multi-image generation`);
      } else {
        // Single image for max model
        requestBody.image_url = referenceImage;
        console.log('📸 Using single reference image for image-to-image generation');
      }
    } else {
      // No reference image - using text-to-image mode
      console.log('📝 No reference image - using text-to-image generation');
    }

    // Add aspect ratio based on the selected size or reference image
    let aspectRatio = null;
    
    if (referenceImageDimensions && referenceImageDimensions.width && referenceImageDimensions.height) {
      // Calculate aspect ratio from reference image
      const width = referenceImageDimensions.width;
      const height = referenceImageDimensions.height;
      const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
      const divisor = gcd(width, height);
      aspectRatio = `${width / divisor}:${height / divisor}`;
      requestBody.aspect_ratio = aspectRatio;
      console.log('✅ Using reference image aspect ratio:', aspectRatio);
    } else if (imageSize && imageSize !== 'square_hd') {
      // Fall back to mapped aspect ratios
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
        console.log('✅ Using mapped aspect ratio:', aspectRatioMap[imageSize]);
      }
    }

    logger.debug('Generation request prepared', {
      prompt: requestBody.prompt,
      hasImage: !!requestBody.image_url,
      numImages: requestBody.num_images,
      aspectRatio: requestBody.aspect_ratio,
      guidanceScale: requestBody.guidance_scale,
      seed: requestBody.seed
    });
    
    console.log('📤 [FAL Request] Sending to FAL.ai:', {
      endpoint: fluxEndpoint,
      prompt: requestBody.prompt.substring(0, 100) + '...',
      hasImageUrl: !!requestBody.image_url,
      hasImageUrls: !!requestBody.image_urls,
      imageUrlCount: requestBody.image_urls?.length || 0,
      aspectRatio: requestBody.aspect_ratio,
      guidanceScale: requestBody.guidance_scale,
      seed: requestBody.seed
    });
    
    console.log('📤 [FAL Request] Full request body:', JSON.stringify(requestBody, null, 2));

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
    logger.debug('API response received', { 
      data,
      hasImages: !!data.images,
      imageCount: data.images?.length || 0
    });
    
    console.log('📥 [FAL Response] Full response:', JSON.stringify(data, null, 2));
    
    // Handle different response formats
    let imageUrl = null;
    
    if (data.images && Array.isArray(data.images) && data.images.length > 0) {
      // Standard format: images array with URL
      imageUrl = data.images[0].url || data.images[0];
      logger.info(`Generated ${data.images.length} image(s) successfully`);
    } else if (data.image_url) {
      // Alternative format: direct image_url
      imageUrl = data.image_url;
      logger.info('Generated image successfully (alternative format)');
    } else if (data.data && data.data.images && Array.isArray(data.data.images)) {
      // Wrapped format
      imageUrl = data.data.images[0].url || data.data.images[0];
      logger.info('Generated image successfully (wrapped format)');
    } else {
      throw new Error(`Unexpected response format from FAL API: ${JSON.stringify(data)}`);
    }
    
    if (imageUrl) {
      logger.info('Returning image URL:', imageUrl);
      return imageUrl;
    } else {
      throw new Error('No image URL found in response');
    }
  } catch (error) {
    console.error('FAL.ai API Error:', error);
    throw new Error(`Failed to generate image: ${error.message}`);
  }
};

