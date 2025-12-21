// Smart Image Generation Service
// Routes NFT holders to FastAPI/ComfyUI and others to FAL.ai

import { generateImage as generateWithFAL } from './falService.js';
import { generateImageWithFastAPI, isFastAPIAvailable } from './fastapiService.js';

/**
 * Smart image generation that routes based on user status
 */
export const generateImage = async (style, customPrompt = '', advancedSettings = {}, referenceImage = null) => {
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
