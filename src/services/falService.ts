// FAL.ai API service for Flux Kontext image generation
// SECURITY: All API calls now route through backend to ensure credit checks
import { VISUAL_STYLES } from '../utils/styles';
import logger from '../utils/logger';
import { optimizeImages, stripImagesMetadataToDataUri } from '../utils/imageOptimizer';
import { API_URL } from '../utils/apiConfig';
import type { VisualStyle } from '../types';

// Types
export interface AdvancedSettings {
  guidanceScale?: number;
  imageSize?: string;
  numImages?: number;
  walletAddress?: string;
  userId?: string;
  email?: string;
  multiImageModel?: string;
  optimizePrompt?: boolean;
  [key: string]: unknown;
}

export interface PromptOptimizationResult {
  originalPrompt?: string;
  optimizedPrompt?: string;
  reasoning?: string;
}

export interface ImageGenerationResult {
  images: string[];
  imageUrl: string;
  remainingCredits?: number;
  creditsDeducted?: number;
  promptOptimization?: PromptOptimizationResult;
}

interface RequestBody {
  prompt: string;
  guidance_scale: number;
  num_images: number;
  output_format: string;
  safety_tolerance: string;
  prompt_safety_tolerance: string;
  enhance_prompt: boolean;
  seed: number;
  image_url?: string;
  image_urls?: string[];
  aspect_ratio?: string;
  walletAddress?: string;
  userId?: string;
  email?: string;
  model?: string | null;
  optimizePrompt?: boolean;
}

/**
 * Get the correct FLUX Kontext endpoint based on image count
 */
const getFluxEndpoint = (hasReferenceImage: boolean = false, isMultipleImages: boolean = false): string => {
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
const getStylePrompt = (styleId: string | undefined): string => {
  if (!styleId) return 'artistic colors and lighting';
  
  const style = VISUAL_STYLES.find(s => s.id === styleId);
  return style ? style.prompt : 'artistic colors and lighting';
};

// Aspect ratio map - moved outside function for performance
const ASPECT_RATIO_MAP: Record<string, string> = {
  'square': '1:1',
  'portrait_4_3': '3:4',
  'portrait_16_9': '9:16',
  'portrait_3_2': '2:3',
  'landscape_4_3': '4:3',
  'landscape_16_9': '16:9',
  'landscape_3_2': '3:2',
  'ultra_wide': '21:9'
};

export const generateImage = async (
  style: VisualStyle | null, 
  customPrompt: string = '', 
  advancedSettings: AdvancedSettings = {}, 
  referenceImage: string | string[] | null = null
): Promise<ImageGenerationResult> => {
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
    // Reduced logging for performance - only log essential info
    logger.debug('Generation started', { 
      style: style?.id, 
      hasCustomPrompt: !!customPrompt
    });

    // Extract advanced settings with defaults
    const {
      guidanceScale = 7.5,
      imageSize = 'square',
      numImages = 1
    } = advancedSettings;

    // Build optimized prompt - avoid unnecessary concatenation
    let basePrompt = '';
    
    // If we have a custom prompt, use it as the base
    const trimmedPrompt = customPrompt && typeof customPrompt === 'string' ? customPrompt.trim() : '';
    if (trimmedPrompt.length > 0) {
      basePrompt = trimmedPrompt;
      
      // Add style prompt only if we have a style and it adds value
      if (style?.id) {
        const stylePrompt = getStylePrompt(style.id);
        if (stylePrompt && stylePrompt !== 'artistic colors and lighting') {
          basePrompt = `${basePrompt}, ${stylePrompt}`;
        }
      }
    } else if (style?.id) {
      // If no custom prompt but we have a style, use the style prompt
      basePrompt = getStylePrompt(style.id);
    } else {
      // If no prompt and no style, use a default
      basePrompt = 'artistic image, high quality, detailed';
    }
    
    // Determine image count and type for model selection
    // 0 images: text-to-image
    // 1 image: image-to-image (single)
    // 2+ images: multi-image
    let imageCount = 0;
    let isMultipleImages = false;
    let processedReferenceImage: string | string[] | null = referenceImage;
    
    if (referenceImage) {
      if (Array.isArray(referenceImage)) {
        // Filter out empty/null values
        const validImages = referenceImage.filter(img => img && (typeof img === 'string' && img.trim().length > 0));
        imageCount = validImages.length;
        isMultipleImages = imageCount >= 2;
        
        // If array becomes empty after filtering, treat as no images
        if (imageCount === 0) {
          processedReferenceImage = null;
        }
      } else if (typeof referenceImage === 'string' && referenceImage.trim().length > 0) {
        // Single string image (non-empty)
        imageCount = 1;
        isMultipleImages = false;
      } else {
        // Invalid reference image, treat as no images
        processedReferenceImage = null;
        imageCount = 0;
        isMultipleImages = false;
      }
    }
    
    // Choose the right endpoint based on image count
    const hasRefImage = imageCount > 0;
    
    // Generate random seed each time
    const randomSeed = Math.floor(Math.random() * 2147483647);
    
    // Build request body according to the official API schema
    const requestBody: RequestBody = {
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
    // OPTIMIZATION: Streamlined image processing with single-pass optimization check
    if (hasRefImage && processedReferenceImage) {
      // Shared optimization config (defined once)
      const optimizeConfig = { maxWidth: 2048, maxHeight: 2048, quality: 0.85, format: 'jpeg' as const };
      
      if (isMultipleImages && Array.isArray(processedReferenceImage)) {
        // Multiple images (2+) - use multi model
        const validImages = processedReferenceImage.filter(img => img && typeof img === 'string' && img.trim().length > 0);
        
        // OPTIMIZATION: Single-pass check - only check data: URIs that are large
        const hasLargeDataUri = validImages.some(img => img.startsWith('data:') && img.length > 300000);
        
        requestBody.image_urls = hasLargeDataUri 
          ? (await optimizeImages(validImages, optimizeConfig) as string[])
          : validImages;
      } else if (imageCount === 1) {
        // Single image - use max model
        const singleImage = Array.isArray(processedReferenceImage) 
          ? processedReferenceImage.find(img => img && typeof img === 'string' && img.trim().length > 0)
          : processedReferenceImage;
        
        if (singleImage && typeof singleImage === 'string') {
          // OPTIMIZATION: Only optimize large data URIs (>300KB)
          requestBody.image_url = (singleImage.startsWith('data:') && singleImage.length > 300000)
            ? (await optimizeImages(singleImage, optimizeConfig) as string)
            : singleImage;
        }
      }
    }

    // Add aspect ratio based on the selected size (optimized lookup)
    if (imageSize && imageSize !== 'square_hd' && ASPECT_RATIO_MAP[imageSize]) {
      requestBody.aspect_ratio = ASPECT_RATIO_MAP[imageSize];
    }

    // SECURITY: Route through backend to ensure credit checks
    // Extract user identification from advancedSettings
    const { walletAddress, userId, email, multiImageModel, optimizePrompt = true } = advancedSettings;
    
    if (!walletAddress && !userId && !email) {
      throw new Error('User identification required. Please provide walletAddress, userId, or email in advancedSettings.');
    }

    // Determine model to use for image editing (single or multi) or prompt-only generation
    let model: string | null = null;
    if (multiImageModel === 'nano-banana-pro') {
      // Nano Banana Pro works for prompt-only, single, and multiple images
      model = 'nano-banana-pro';
    } else if (!hasRefImage && multiImageModel === 'flux') {
      // FLUX for text-to-image generation
      model = 'flux';
    }

    // Call backend endpoint which checks credits before making external API call
    const response = await fetch(`${API_URL}/api/generate/image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...requestBody,
        walletAddress,
        userId,
        email,
        model, // Pass model selection to backend
        optimizePrompt // Pass prompt optimization toggle to backend
      })
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
            errorMessage = errorData.detail.map((err: unknown) => 
              typeof err === 'string' ? err : 
              typeof err === 'object' && err !== null && 'msg' in err ? (err as { msg: string }).msg :
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
        const err = parseError as Error;
        logger.error('Failed to parse error response', { error: err.message });
        const errorText = await response.text();
        errorMessage = errorText || errorMessage;
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    
    if (data.images && Array.isArray(data.images) && data.images.length > 0) {
      // Reduced logging for performance - only log on success
      logger.debug(`Generated ${data.images.length} image(s) successfully`);
      
      // Extract all image URLs
      const imageUrls = data.images.map((img: string | { url?: string }) => 
        typeof img === 'string' ? img : img.url || ''
      ).filter((url: string) => url.length > 0);
      
      // SECURITY: Strip metadata from all images before returning
      let cleanedImageUrls: string | string[];
      try {
        cleanedImageUrls = await stripImagesMetadataToDataUri(imageUrls, { format: 'png' });
        const count = Array.isArray(cleanedImageUrls) ? cleanedImageUrls.length : 1;
        logger.debug('Metadata stripped from generated images', { count });
      } catch (error) {
        const err = error as Error;
        logger.warn('Failed to strip metadata from images, using originals', { error: err.message });
        // Fallback to original URLs if metadata stripping fails
        cleanedImageUrls = imageUrls;
      }
      
      // Always return object with images and credits info for consistency
      const result: ImageGenerationResult = {
        images: Array.isArray(cleanedImageUrls) ? cleanedImageUrls : [cleanedImageUrls],
        imageUrl: Array.isArray(cleanedImageUrls) ? cleanedImageUrls[0] : cleanedImageUrls, // First image for backward compatibility
        remainingCredits: data.remainingCredits,
        creditsDeducted: data.creditsDeducted
      };
      
      // Include prompt optimization info if available
      if (data.promptOptimization) {
        result.promptOptimization = data.promptOptimization;
        logger.debug('Prompt was optimized', { 
          original: data.promptOptimization.originalPrompt?.substring(0, 30) + '...',
          reasoning: data.promptOptimization.reasoning
        });
      }
      
      return result;
    } else {
      throw new Error('No image generated');
    }
  } catch (error) {
    const err = error as Error;
    logger.error('FAL.ai API Error', { error: err.message });
    throw new Error(`Failed to generate image: ${err.message}`);
  }
};

