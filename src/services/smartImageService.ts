// Smart Image Generation Service
// Routes all users to FAL.ai, handles Qwen layer extraction, Face Swap, etc.

import { generateImage as generateWithFAL, ImageGenerationResult, type AdvancedSettings } from './falService';
import { extractLayers } from './layerExtractionService';
import type { VisualStyle } from '../types';
import { API_URL, ensureCSRFToken, getAuthToken } from '../utils/apiConfig';
import logger from '../utils/logger';

/**
 * Response from batch variation analysis
 */
export interface BatchVariateResult {
  success: boolean;
  description?: string;
  prompts?: string[];
  useControlNet?: boolean;
  remainingCredits?: number;
  creditsDeducted?: number;
  error?: string;
}

/**
 * Analyze an image and generate variation prompts
 * Uses AI to describe the image and create prompts that preserve pose/character
 * while varying clothes, hair, background, etc.
 */
export const batchVariate = async (
  imageUrl: string,
  numOutputs: number,
  credentials: { walletAddress?: string; userId?: string },
  options: { useControlNet?: boolean } = {}
): Promise<BatchVariateResult> => {
  const csrfToken = await ensureCSRFToken();
  const authToken = getAuthToken();
  
  const response = await fetch(`${API_URL}/api/image-tools/batch-variate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(csrfToken && { 'X-CSRF-Token': csrfToken }),
      ...(authToken && { 'Authorization': `Bearer ${authToken}` })
    },
    credentials: 'include',
    body: JSON.stringify({
      image_url: imageUrl,
      num_outputs: numOutputs,
      walletAddress: credentials.walletAddress,
      userId: credentials.userId,
      use_controlnet: options.useControlNet || false
    })
  });

  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Failed to analyze image for variations');
  }

  return data as BatchVariateResult;
};

// Re-export AdvancedSettings from falService for type consistency
export type { AdvancedSettings };

/**
 * Face swap between two images
 */
const faceSwap = async (
  sourceImage: string,
  targetImage: string,
  advancedSettings: AdvancedSettings
): Promise<ImageGenerationResult> => {
  // Ensure CSRF token and auth token are available
  const csrfToken = await ensureCSRFToken();
  const authToken = getAuthToken();
  
  const response = await fetch(`${API_URL}/api/image-tools/face-swap`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(csrfToken && { 'X-CSRF-Token': csrfToken }),
      ...(authToken && { 'Authorization': `Bearer ${authToken}` })
    },
    credentials: 'include',
    body: JSON.stringify({
      source_image_url: sourceImage,
      target_image_url: targetImage,
      walletAddress: advancedSettings.walletAddress,
      userId: advancedSettings.userId
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
      userId: advancedSettings.userId
    });
  }
  
  // Handle LoRA model generation (trained custom models)
  if (advancedSettings.multiImageModel && advancedSettings.multiImageModel.startsWith('lora:')) {
    const loraModelId = advancedSettings.multiImageModel.replace('lora:', '');
    
    // Fetch user's trained models to get the LoRA URL and trigger word
    const { getTrainedModels } = await import('./trainingService');
    const models = await getTrainedModels({
      walletAddress: advancedSettings.walletAddress || undefined,
      userId: advancedSettings.userId || undefined
    });
    
    const loraModel = models.find(m => m.id === loraModelId);
    if (!loraModel || !loraModel.loraUrl) {
      throw new Error('Trained model not found or not ready');
    }

    const csrfToken = await ensureCSRFToken();
    const authToken = getAuthToken();
    const response = await fetch(`${API_URL}/api/training/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(csrfToken && { 'X-CSRF-Token': csrfToken }),
        ...(authToken && { 'Authorization': `Bearer ${authToken}` })
      },
      credentials: 'include',
      body: JSON.stringify({
        prompt: customPrompt || 'high quality image',
        lora_url: loraModel.loraUrl,
        trigger_word: loraModel.triggerWord,
        num_images: advancedSettings.numImages || 1,
        image_size: advancedSettings.imageSize || 'landscape_4_3',
        walletAddress: advancedSettings.walletAddress,
        userId: advancedSettings.userId
      })
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error || 'LoRA generation failed');
    }

    return {
      images: data.images || [],
      imageUrl: data.images?.[0] || '',
      remainingCredits: data.remainingCredits,
      creditsDeducted: data.creditsDeducted
    };
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

