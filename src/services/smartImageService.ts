// Smart Image Generation Service
// Routes all users to FAL.ai, handles Qwen layer extraction

import { generateImage as generateWithFAL, ImageGenerationResult } from './falService';
import { extractLayers } from './layerExtractionService';
import type { VisualStyle } from '../types';

// Types
interface AdvancedSettings {
  multiImageModel?: string;
  walletAddress?: string;
  userId?: string;
  email?: string;
  [key: string]: unknown;
}

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
  
  return await generateWithFAL(style, customPrompt, advancedSettings, referenceImage);
};

