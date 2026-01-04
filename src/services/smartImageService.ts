// Smart Image Generation Service
// Routes all users to FAL.ai, handles Qwen layer extraction, Face Swap, etc.

import { generateImage as generateWithFAL, ImageGenerationResult } from './falService';
import { extractLayers } from './layerExtractionService';
import type { VisualStyle } from '../types';
import { API_URL } from '../utils/apiConfig';
import logger from '../utils/logger';

// Types
interface AdvancedSettings {
  multiImageModel?: string;
  walletAddress?: string;
  userId?: string;
  email?: string;
  [key: string]: unknown;
}

/**
 * Face swap between two images
 */
const faceSwap = async (
  sourceImage: string,
  targetImage: string,
  advancedSettings: AdvancedSettings
): Promise<ImageGenerationResult> => {
  const response = await fetch(`${API_URL}/api/image-tools/face-swap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source_image_url: sourceImage,
      target_image_url: targetImage,
      walletAddress: advancedSettings.walletAddress,
      userId: advancedSettings.userId,
      email: advancedSettings.email
    })
  });

  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Face swap failed');
  }

  return {
    images: [data.image_url],
    imageUrl: data.image_url,
    remainingCredits: data.remainingCredits,
    creditsDeducted: data.creditsDeducted
  };
};

/**
 * Smart image generation - routes to appropriate service based on model selection
 */
export const generateImage = async (
  style: VisualStyle | null, 
  customPrompt: string = '', 
  advancedSettings: AdvancedSettings = {}, 
  referenceImage: string | string[] | null = null
): Promise<ImageGenerationResult> => {
  // Handle Qwen layer extraction
  if (advancedSettings.multiImageModel === 'qwen-image-layered' && referenceImage) {
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
  
  // Handle Face Swap (requires 2 images)
  if (advancedSettings.multiImageModel === 'face-swap' && referenceImage) {
    if (!Array.isArray(referenceImage) || referenceImage.length < 2) {
      throw new Error('Face swap requires exactly 2 images: source face and target image');
    }
    
    logger.info('Starting face swap', { 
      hasSource: !!referenceImage[0], 
      hasTarget: !!referenceImage[1] 
    });
    
    return await faceSwap(referenceImage[0], referenceImage[1], advancedSettings);
  }
  
  return await generateWithFAL(style, customPrompt, advancedSettings, referenceImage);
};

