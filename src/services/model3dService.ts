/**
 * 3D Model Generation Service
 * Handles API calls to generate 3D models using Hunyuan3D V3
 * 
 * Uses async polling pattern:
 * 1. Submit generation request -> Backend returns 202 with requestId
 * 2. Poll status endpoint every 5 seconds until completion
 */
import { API_URL, ensureCSRFToken } from '../utils/apiConfig';
import logger from '../utils/logger';
import { getAuthToken } from './emailAuthService';

export interface Model3dGenerationParams {
  input_image_url: string;
  back_image_url?: string;
  left_image_url?: string;
  right_image_url?: string;
  enable_pbr?: boolean;
  face_count?: number;
  generate_type?: 'Normal' | 'LowPoly' | 'Geometry';
  polygon_type?: 'triangle' | 'quadrilateral';
  walletAddress?: string;
  userId?: string;
  email?: string;
  onProgress?: (status: string, elapsed: number) => void;
}

export interface ModelFile {
  url: string;
  file_size?: number;
  file_name?: string;
  content_type?: string;
}

export interface Model3dGenerationResult {
  success: boolean;
  model_glb?: ModelFile;
  thumbnail?: ModelFile;
  model_urls?: {
    glb?: ModelFile;
    obj?: ModelFile;
    fbx?: ModelFile;
    usdz?: ModelFile;
  };
  seed?: number;
  remainingCredits?: number;
  creditsDeducted?: number;
  creditsRefunded?: number;
  generationId?: string;
  requestId?: string;
  statusEndpoint?: string;
  message?: string;
  error?: string;
}

interface StatusResponse {
  success: boolean;
  status?: string;
  model_glb?: ModelFile;
  glb?: ModelFile;
  thumbnail?: ModelFile;
  model_urls?: {
    glb?: ModelFile;
    obj?: ModelFile;
    fbx?: ModelFile;
    usdz?: ModelFile;
  };
  error?: string;
}

/**
 * Generate a 3D model from an image using Hunyuan3D V3
 */
export async function generate3dModel(params: Model3dGenerationParams): Promise<Model3dGenerationResult> {
  const {
    input_image_url,
    back_image_url,
    left_image_url,
    right_image_url,
    enable_pbr = true,
    face_count = 500000,
    generate_type = 'Normal',
    polygon_type = 'triangle',
    walletAddress,
    userId,
    email,
    onProgress
  } = params;

  if (!input_image_url) {
    throw new Error('Input image URL is required');
  }

  if (!walletAddress && !userId && !email) {
    throw new Error('User identification required');
  }

  // Step 1: Submit the generation request
  const apiEndpoint = `${API_URL}/api/model3d/generate`;
  logger.info('Submitting 3D model generation', { generate_type, face_count });

  const token = getAuthToken() || '';
  const csrfToken = await ensureCSRFToken();

  const response = await fetch(apiEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...(csrfToken && { 'X-CSRF-Token': csrfToken })
    },
    credentials: 'include',
    body: JSON.stringify({
      input_image_url,
      back_image_url,
      left_image_url,
      right_image_url,
      enable_pbr,
      face_count,
      generate_type,
      polygon_type,
      walletAddress,
      userId,
      email
    })
  });

  const responseText = await response.text();
  
  // Check for HTML error response
  if (responseText.trim().startsWith('<!DOCTYPE') || responseText.trim().startsWith('<html')) {
    throw new Error('Server error. Please try again.');
  }

  const submitResult = JSON.parse(responseText) as Model3dGenerationResult;

  if (!response.ok && response.status !== 202) {
    throw new Error(submitResult.error || `Submit failed: ${response.status}`);
  }

  // If no requestId, can't poll
  if (!submitResult.requestId) {
    logger.warn('No requestId returned from 3D generation submit');
    return submitResult;
  }

  logger.info('3D generation submitted', { requestId: submitResult.requestId });

  // Step 2: Poll for completion
  const maxWaitTime = 8 * 60 * 1000; // 8 minutes max
  const pollInterval = 5000; // 5 seconds between polls
  const initialDelay = 10000; // Wait 10 seconds before first poll
  const startTime = Date.now();
  const statusEndpoint = `${API_URL}/api/model3d/status/${submitResult.requestId}`;

  // Report initial progress
  if (onProgress) {
    onProgress('PROCESSING', 0);
  }

  // Short initial delay before first poll
  await new Promise(resolve => setTimeout(resolve, initialDelay));

  while (Date.now() - startTime < maxWaitTime) {
    const elapsed = Math.round((Date.now() - startTime) / 1000);

    try {
      const statusResponse = await fetch(statusEndpoint, {
        headers: { 'Authorization': `Bearer ${getAuthToken() || ''}` },
        credentials: 'include'
      });

      if (!statusResponse.ok) {
        // Continue polling on errors
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        continue;
      }

      const statusText = await statusResponse.text();
      
      // Skip HTML responses
      if (statusText.trim().startsWith('<!DOCTYPE') || statusText.trim().startsWith('<html')) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        continue;
      }

      const data = JSON.parse(statusText) as StatusResponse;
      const status = (data.status || '').toUpperCase();

      // Report progress
      if (onProgress) {
        onProgress(status || 'PROCESSING', elapsed);
      }

      // Check for model URL
      const modelGlb = data.model_glb || data.glb;
      const modelUrls = data.model_urls;

      if (modelGlb?.url || modelUrls?.glb?.url) {
        logger.info('3D generation completed!', { elapsed });
        return {
          success: true,
          model_glb: modelGlb,
          thumbnail: data.thumbnail,
          model_urls: modelUrls,
          generationId: submitResult.generationId,
          requestId: submitResult.requestId,
          remainingCredits: submitResult.remainingCredits,
          creditsDeducted: submitResult.creditsDeducted
        };
      }

      // Check for failure
      if (status === 'FAILED' || status === 'ERROR' || status === 'CANCELLED') {
        throw new Error(data.error || '3D generation failed. Credits will be refunded.');
      }

      // Still processing - wait and poll again
      await new Promise(resolve => setTimeout(resolve, pollInterval));

    } catch (error) {
      const err = error as Error;
      
      // Re-throw user-facing errors
      if (err.message.includes('failed') || err.message.includes('Credits')) {
        throw err;
      }
      
      // Log and continue for transient errors
      logger.warn('Poll request failed, retrying', { error: err.message });
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
  }

  // Timeout - return info for UI
  return {
    success: false,
    error: '3D generation is taking longer than expected. It will appear in your gallery when complete.',
    generationId: submitResult.generationId,
    requestId: submitResult.requestId,
    remainingCredits: submitResult.remainingCredits,
    creditsDeducted: submitResult.creditsDeducted
  };
}

/**
 * Check the status of a 3D generation request
 */
export async function check3dStatus(requestId: string): Promise<{ status: string; [key: string]: unknown }> {
  const token = getAuthToken() || '';
  const response = await fetch(`${API_URL}/api/model3d/status/${requestId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  if (!response.ok) {
    throw new Error('Status check failed');
  }
  
  return response.json();
}

export default {
  generate3dModel,
  check3dStatus
};
