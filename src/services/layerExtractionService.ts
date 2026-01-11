// Layer Extraction Service using Qwen Image Layered
// SECURITY: All API calls route through backend to ensure credit checks
import logger from '../utils/logger';
import { API_URL, ensureCSRFToken } from '../utils/apiConfig';
import { stripImagesMetadataToDataUri } from '../utils/imageOptimizer';

// Types
export interface LayerExtractionOptions {
  prompt?: string;
  num_layers?: number;
  num_inference_steps?: number;
  guidance_scale?: number;
  seed?: number;
  negative_prompt?: string;
  enable_safety_checker?: boolean;
  output_format?: 'png' | 'webp';
  acceleration?: 'none' | 'regular' | 'high';
  walletAddress?: string;
  userId?: string;
  email?: string;
}

export interface LayerExtractionResult {
  images: string[];
  imageUrl: string;
  remainingCredits?: number;
  creditsDeducted?: number;
}

/**
 * Extract layers from an image using Qwen Image Layered
 */
export const extractLayers = async (
  imageUrl: string, 
  options: LayerExtractionOptions = {}
): Promise<LayerExtractionResult> => {
  if (!imageUrl || typeof imageUrl !== 'string') {
    throw new Error('Image URL is required');
  }

  try {
    logger.info('Starting layer extraction', { 
      imageUrl: imageUrl.substring(0, 100),
      numLayers: options.num_layers || 4
    });

    const requestBody: Record<string, unknown> = {
      image_url: imageUrl,
      num_layers: options.num_layers || 4,
      num_inference_steps: options.num_inference_steps || 28,
      guidance_scale: options.guidance_scale || 5,
      enable_safety_checker: options.enable_safety_checker !== false,
      output_format: options.output_format || 'png',
      acceleration: options.acceleration || 'regular',
      walletAddress: options.walletAddress,
      userId: options.userId,
      email: options.email
    };

    // Add optional parameters
    if (options.prompt && typeof options.prompt === 'string' && options.prompt.trim()) {
      requestBody.prompt = options.prompt.trim();
    }
    if (options.negative_prompt && typeof options.negative_prompt === 'string' && options.negative_prompt.trim()) {
      requestBody.negative_prompt = options.negative_prompt.trim();
    }
    if (options.seed !== undefined && options.seed !== null) {
      requestBody.seed = options.seed;
    }

    logger.debug('Layer extraction request', {
      hasImageUrl: !!requestBody.image_url,
      numLayers: requestBody.num_layers,
      hasPrompt: !!requestBody.prompt
    });

    // Ensure CSRF token is available
    const csrfToken = await ensureCSRFToken();

    const response = await fetch(`${API_URL}/api/extract-layers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(csrfToken && { 'X-CSRF-Token': csrfToken })
      },
      credentials: 'include',
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      let errorMessage = `HTTP error! status: ${response.status}`;
      try {
        const errorData = await response.json();
        if (errorData.error) {
          errorMessage = errorData.error;
        } else if (errorData.detail) {
          errorMessage = Array.isArray(errorData.detail)
            ? errorData.detail.map((err: unknown) => (err as { msg?: string }).msg || err).join('; ')
            : errorData.detail;
        } else if (errorData.message) {
          errorMessage = errorData.message;
        }
      } catch {
        const errorText = await response.text();
        errorMessage = errorText || errorMessage;
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Layer extraction failed');
    }

    // Extract all layer images - return as array of URLs
    const layerUrls: string[] = [];
    if (data.images && Array.isArray(data.images)) {
      for (const img of data.images) {
        if (typeof img === 'string') {
          layerUrls.push(img);
        } else if (img.url) {
          layerUrls.push(img.url);
        }
      }
    }

    if (layerUrls.length === 0) {
      throw new Error('No layers extracted from image');
    }

    // SECURITY: Strip metadata from all layer images before returning
    let cleanedLayerUrls: string | string[];
    try {
      cleanedLayerUrls = await stripImagesMetadataToDataUri(layerUrls, { format: 'png' });
      const count = Array.isArray(cleanedLayerUrls) ? cleanedLayerUrls.length : 1;
      logger.debug('Metadata stripped from layer images', { count });
    } catch (error) {
      const err = error as Error;
      logger.warn('Failed to strip metadata from layer images, using originals', { error: err.message });
      // Fallback to original URLs if metadata stripping fails
      cleanedLayerUrls = layerUrls;
    }

    logger.info('Layer extraction completed', { 
      layerCount: Array.isArray(cleanedLayerUrls) ? cleanedLayerUrls.length : 1,
      seed: data.seed
    });

    // Return object with images array for consistency with falService
    const cleanedArray = Array.isArray(cleanedLayerUrls) ? cleanedLayerUrls : [cleanedLayerUrls];
    return {
      images: cleanedArray,
      imageUrl: cleanedArray[0],
      remainingCredits: data.remainingCredits,
      creditsDeducted: data.creditsDeducted
    };
  } catch (error) {
    const err = error as Error;
    logger.error('Layer extraction error', { error: err.message });
    throw error;
  }
};





