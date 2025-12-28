// Smart Image Generation Service
// Routes all users to FAL.ai
// Also handles Qwen layer extraction

import { generateImage as generateWithFAL } from './falService.js';
import { extractLayers } from './layerExtractionService.js';
import logger from '../utils/logger.js';

/**
 * Smart image generation - all users use FAL.ai
 */
export const generateImage = async (style, customPrompt = '', advancedSettings = {}, referenceImage = null) => {
  const isQwenModel = advancedSettings.multiImageModel === 'qwen-image-layered';
  
  // Handle Qwen layer extraction
  if (isQwenModel && referenceImage) {
    const imageUrl = Array.isArray(referenceImage) ? referenceImage[0] : referenceImage;
    if (!imageUrl || typeof imageUrl !== 'string') {
      throw new Error('Reference image is required for Qwen layer extraction');
    }
    
    return await extractLayers(imageUrl, {
      prompt: customPrompt || undefined,
      num_layers: 4,
      walletAddress: advancedSettings.walletAddress,
      userId: advancedSettings.userId,
      email: advancedSettings.email
    });
  }
  
  // All users use FAL.ai
  return await generateWithFAL(style, customPrompt, advancedSettings, referenceImage);
};

/**
 * Get available generation options for the user
 */
export const getGenerationOptions = async (isNFTHolder = false) => {
  return {
    fal: {
      name: 'FAL.ai (Premium)',
      description: 'High-quality commercial model',
      available: true,
      cost: 'Credits required',
      features: ['High quality', 'Fast generation', 'Multiple styles']
    }
  };
};

/**
 * Get the recommended model for the user
 */
export const getRecommendedModel = async (isNFTHolder = false) => {
  return 'fal';
};
