// Layer Extraction Service using Qwen Image Layered
// SECURITY: All API calls route through backend to ensure credit checks
import logger from '../utils/logger.js';
import { API_URL } from '../utils/apiConfig.js';
import { stripImagesMetadataToDataUri } from '../utils/imageOptimizer.js';

/**
 * Extract layers from an image using Qwen Image Layered
 * @param {string} imageUrl - URL of the image to extract layers from
 * @param {Object} options - Optional parameters
 * @param {string} options.prompt - Caption for the input image
 * @param {number} options.num_layers - Number of layers to generate (default: 4)
 * @param {number} options.num_inference_steps - Number of inference steps (default: 28)
 * @param {number} options.guidance_scale - Guidance scale (default: 5)
 * @param {number} options.seed - Random seed
 * @param {string} options.negative_prompt - Negative prompt
 * @param {boolean} options.enable_safety_checker - Enable safety checker (default: true)
 * @param {string} options.output_format - Output format: 'png' or 'webp' (default: 'png')
 * @param {string} options.acceleration - Acceleration level: 'none', 'regular', 'high' (default: 'regular')
 * @param {string} options.walletAddress - Wallet address for wallet users
 * @param {string} options.userId - User ID for email users
 * @param {string} options.email - Email for email users
 * @returns {Promise<{images: string[], imageUrl: string, remainingCredits: number, creditsDeducted: number}>} Object with layer URLs and credit info
 */
export const extractLayers = async (imageUrl, options = {}) => {
  if (!imageUrl || typeof imageUrl !== 'string') {
    throw new Error('Image URL is required');
  }

  try {
    logger.info('Starting layer extraction', { 
      imageUrl: imageUrl.substring(0, 100),
      numLayers: options.num_layers || 4
    });

    const requestBody = {
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

    const response = await fetch(`${API_URL}/api/extract-layers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
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
            ? errorData.detail.map(err => err.msg || err).join('; ')
            : errorData.detail;
        } else if (errorData.message) {
          errorMessage = errorData.message;
        }
      } catch (parseError) {
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
    const layerUrls = [];
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
    // This removes EXIF data, location info, and other sensitive metadata
    // Note: This adds ~1-2 seconds per image but ensures all outputs are clean
    // Downloads also clean metadata as a safety measure
    let cleanedLayerUrls;
    try {
      cleanedLayerUrls = await stripImagesMetadataToDataUri(layerUrls, { format: 'png' });
      logger.debug('Metadata stripped from layer images', { count: cleanedLayerUrls.length });
    } catch (error) {
      logger.warn('Failed to strip metadata from layer images, using originals', { error: error.message });
      // Fallback to original URLs if metadata stripping fails
      cleanedLayerUrls = layerUrls;
    }

    logger.info('Layer extraction completed', { 
      layerCount: cleanedLayerUrls.length,
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
    logger.error('Layer extraction error', { error: error.message });
    throw error;
  }
};

