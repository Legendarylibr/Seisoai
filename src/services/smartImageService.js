// Smart Image Generation Service
// Routes NFT holders to FastAPI/ComfyUI and others to FAL.ai
// Also handles Qwen layer extraction

import { generateImage as generateWithFAL } from './falService.js';
import { generateImageWithFastAPI, isFastAPIAvailable } from './fastapiService.js';
import { extractLayers } from './layerExtractionService.js';
import logger from '../utils/logger.js';

/**
 * Smart image generation that routes based on user status and model selection
 */
export const generateImage = async (style, customPrompt = '', advancedSettings = {}, referenceImage = null) => {
  // Check if Qwen layer extraction is selected
  const multiImageModel = advancedSettings.multiImageModel;
  const isQwenModel = multiImageModel === 'qwen-image-layered';
  
  // If Qwen is selected and we have a reference image, use layer extraction
  if (isQwenModel && referenceImage) {
    logger.info('Using Qwen Image Layered for layer extraction');
    try {
      // Handle both single image (string) and array of images - Qwen needs a single image
      let imageUrlForExtraction = referenceImage;
      if (Array.isArray(referenceImage) && referenceImage.length > 0) {
        // Use first image if array is provided
        imageUrlForExtraction = referenceImage[0];
        logger.debug('Using first image from array for Qwen layer extraction', { arrayLength: referenceImage.length });
      }
      
      if (!imageUrlForExtraction || typeof imageUrlForExtraction !== 'string') {
        throw new Error('Reference image is required for Qwen layer extraction');
      }
      
      const layerUrls = await extractLayers(imageUrlForExtraction, {
        prompt: customPrompt || undefined,
        num_layers: 4,
        walletAddress: advancedSettings.walletAddress,
        userId: advancedSettings.userId,
        email: advancedSettings.email
      });
      
      // Return all layers as array
      logger.info('Layer extraction completed', { layerCount: layerUrls.length });
      return layerUrls;
    } catch (error) {
      logger.error('Layer extraction failed', { error: error.message });
      throw error;
    }
  }
  
  // Check if user is an NFT holder
  const isNFTHolder = advancedSettings.isNFTHolder || false;
  const forceModel = advancedSettings.forceModel; // 'fal' or 'fastapi'
  
  // Check if FastAPI is available
  const fastAPIAvailable = await isFastAPIAvailable();
  
  // Route decision logic
  let useFastAPI = false;
  
  if (forceModel === 'fastapi') {
    useFastAPI = true;
  } else if (forceModel === 'fal') {
    useFastAPI = false;
  } else if (isNFTHolder && fastAPIAvailable) {
    // NFT holders get free FastAPI by default
    useFastAPI = true;
  } else {
    // Non-NFT holders or when FastAPI unavailable, use FAL
    useFastAPI = false;
  }
  
  try {
    if (useFastAPI) {
      return await generateImageWithFastAPI(style, customPrompt, advancedSettings, referenceImage);
    } else {
      return await generateWithFAL(style, customPrompt, advancedSettings, referenceImage);
    }
  } catch (error) {
    // Fallback logic: if FastAPI fails and user is NFT holder, try FAL
    if (useFastAPI && isNFTHolder) {
      try {
        return await generateWithFAL(style, customPrompt, advancedSettings, referenceImage);
      } catch (fallbackError) {
        throw new Error(`Image generation failed: ${error.message}. Fallback also failed: ${fallbackError.message}`);
      }
    }
    
    throw error;
  }
};

/**
 * Get available generation options for the user
 */
export const getGenerationOptions = async (isNFTHolder = false) => {
  const fastAPIAvailable = await isFastAPIAvailable();
  
  const options = {
    fal: {
      name: 'FAL.ai (Premium)',
      description: 'High-quality commercial model',
      available: true,
      cost: 'Credits required',
      features: ['High quality', 'Fast generation', 'Multiple styles']
    }
  };
  
  if (fastAPIAvailable) {
    options.fastapi = {
      name: 'Local ComfyUI (Free)',
      description: 'Free local model for NFT holders',
      available: isNFTHolder,
      cost: isNFTHolder ? 'Free' : 'NFT required',
      features: ['Free for NFT holders', 'Local processing', 'Custom models']
    };
  }
  
  return options;
};

/**
 * Get the recommended model for the user
 */
export const getRecommendedModel = async (isNFTHolder = false) => {
  const fastAPIAvailable = await isFastAPIAvailable();
  
  if (isNFTHolder && fastAPIAvailable) {
    return 'fastapi';
  } else {
    return 'fal';
  }
};
