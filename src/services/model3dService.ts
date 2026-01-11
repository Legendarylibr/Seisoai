/**
 * 3D Model Generation Service
 * Handles API calls to generate 3D models using Hunyuan3D V3
 * 
 * CLOUDFLARE FIX: Uses async polling pattern to avoid 100-second timeout:
 * 1. Submit generation request -> Backend returns 202 with requestId immediately
 * 2. Poll status endpoint every 5 seconds until completion
 * 3. Each poll request is short, avoiding Cloudflare timeout
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
  // Optional callback for progress updates
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

// Status response from the polling endpoint
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
  data?: {
    model_glb?: ModelFile;
    glb?: ModelFile;
    thumbnail?: ModelFile;
    model_urls?: {
      glb?: ModelFile;
      obj?: ModelFile;
      fbx?: ModelFile;
      usdz?: ModelFile;
    };
  };
  error?: string;
}

/**
 * Generate a 3D model from an image using Hunyuan3D V3
 * Uses async polling pattern to avoid Cloudflare timeout issues
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

  try {
    // Step 1: Submit the generation request
    const submitResult = await submitGeneration({
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
    });

    // If we already have a model URL (unlikely but handle it), return immediately
    if (submitResult.model_glb?.url || submitResult.model_urls?.glb?.url) {
      return submitResult;
    }

    // If no requestId, we can't poll - return the result as-is
    if (!submitResult.requestId) {
      logger.warn('No requestId returned from 3D generation submit', { submitResult });
      return submitResult;
    }

    // Step 2: Poll for completion
    const pollResult = await pollForCompletion(
      submitResult.requestId,
      submitResult.generationId,
      submitResult.remainingCredits,
      submitResult.creditsDeducted,
      onProgress
    );

    return pollResult;

  } catch (error) {
    const err = error as Error;
    logger.error('3D model generation error', { 
      error: err.message,
      errorName: err.name,
      stack: err.stack,
      apiEndpoint: `${API_URL}/api/model3d/generate`
    });
    throw new Error(`Failed to generate 3D model: ${err.message}`);
  }
}

/**
 * Submit the initial generation request
 * Returns immediately with requestId for polling
 */
async function submitGeneration(params: Omit<Model3dGenerationParams, 'onProgress'>): Promise<Model3dGenerationResult> {
  const {
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
  } = params;

  const apiEndpoint = `${API_URL}/api/model3d/generate`;
  logger.info('Submitting 3D model generation', { 
    apiEndpoint,
    generate_type, 
    face_count,
    hasInputImage: !!input_image_url
  });

  // Short timeout for the submit request (30 seconds should be plenty)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  const token = getAuthToken() || '';
  const csrfToken = await ensureCSRFToken();

  try {
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
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    const responseText = await response.text();
    
    // Check for HTML response (Cloudflare error, etc.)
    const isHtml = responseText.trim().startsWith('<!DOCTYPE') || 
                   responseText.trim().startsWith('<html') ||
                   responseText.trim().startsWith('<!doctype');
    
    if (isHtml) {
      const htmlTitle = responseText.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || 'Unknown';
      const isCloudflare = responseText.includes('cloudflare') || responseText.includes('cf-');
      
      logger.error('3D generation submit returned HTML', { 
        status: response.status,
        htmlTitle,
        isCloudflare
      });
      
      if (isCloudflare) {
        throw new Error('Request blocked by Cloudflare. Please try again.');
      }
      throw new Error(`Server error (${htmlTitle}). Please try again.`);
    }

    const data = JSON.parse(responseText) as Model3dGenerationResult;

    if (!response.ok && response.status !== 202) {
      throw new Error(data.error || `Submit failed: ${response.status}`);
    }

    logger.info('3D generation submitted successfully', {
      requestId: data.requestId,
      generationId: data.generationId,
      status: response.status
    });

    return data;

  } catch (error) {
    clearTimeout(timeoutId);
    const err = error as Error;
    
    if (err.name === 'AbortError') {
      throw new Error('Request timed out. Please try again.');
    }
    throw err;
  }
}

/**
 * Poll the status endpoint until generation completes
 * Each poll is a short request, avoiding Cloudflare timeout
 */
async function pollForCompletion(
  requestId: string,
  generationId: string | undefined,
  remainingCredits: number | undefined,
  creditsDeducted: number | undefined,
  onProgress?: (status: string, elapsed: number) => void
): Promise<Model3dGenerationResult> {
  const maxWaitTime = 10 * 60 * 1000; // 10 minutes max
  const basePollInterval = 6000; // Base: 6 seconds between polls
  const startTime = Date.now();
  
  const statusEndpoint = `${API_URL}/api/model3d/status/${requestId}`;
  
  logger.info('Starting to poll for 3D generation completion', { requestId, statusEndpoint });

  // Track consecutive errors for backoff
  let consecutiveErrors = 0;

  while (Date.now() - startTime < maxWaitTime) {
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    
    try {
      // Refresh token on each poll in case it changed during long polling
      const token = getAuthToken() || '';
      
      // Short timeout for each poll request
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      // Use browser-like headers to avoid Cloudflare bot detection
      const response = await fetch(statusEndpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        },
        credentials: 'include',
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        // Log detailed error info for debugging
        const contentType = response.headers.get('content-type') || '';
        const responseText = await response.text();
        const isHtml = responseText.trim().startsWith('<!DOCTYPE') || responseText.trim().startsWith('<html');
        const isCloudflare = responseText.includes('cloudflare') || responseText.includes('cf-ray');
        
        logger.warn('Status poll returned error', { 
          status: response.status, 
          statusText: response.statusText,
          elapsed,
          contentType,
          isHtml,
          isCloudflare,
          responsePreview: responseText.substring(0, 200)
        });
        
        // Continue polling on server errors (5xx) or 405 (might be transient/Cloudflare)
        if (response.status >= 500 || response.status === 405) {
          consecutiveErrors++;
          // Exponential backoff with jitter to avoid Cloudflare rate limiting
          const backoffTime = Math.min(basePollInterval * Math.pow(1.5, consecutiveErrors), 30000);
          const jitter = Math.random() * 2000; // 0-2 seconds random jitter
          await new Promise(resolve => setTimeout(resolve, backoffTime + jitter));
          continue;
        }
        // For auth errors (401/403), try to get error message and continue
        // The token might get refreshed on next poll
        if (response.status === 401 || response.status === 403) {
          logger.warn('Auth error during poll, will retry with fresh token', { status: response.status });
          consecutiveErrors++;
          const backoffTime = Math.min(basePollInterval * Math.pow(1.5, consecutiveErrors), 30000);
          const jitter = Math.random() * 2000;
          await new Promise(resolve => setTimeout(resolve, backoffTime + jitter));
          continue;
        }
        // For other client errors (4xx), try to parse error and throw
        try {
          const errorData = JSON.parse(responseText);
          throw new Error(errorData.error || `Poll failed: ${response.status}`);
        } catch {
          throw new Error(`Poll failed with status ${response.status}`);
        }
      }

      // Reset consecutive errors on successful response
      consecutiveErrors = 0;
      
      const responseText = await response.text();
      
      // Skip if HTML response (Cloudflare challenge page)
      if (responseText.trim().startsWith('<!DOCTYPE') || responseText.trim().startsWith('<html')) {
        logger.warn('Status poll returned HTML (possible Cloudflare challenge), retrying', { elapsed });
        // Wait longer if we're getting HTML responses (Cloudflare might be blocking)
        const waitTime = basePollInterval * 2 + Math.random() * 3000;
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }

      const data = JSON.parse(responseText) as StatusResponse;
      const status = (data.status || '').toUpperCase();

      // Report progress
      if (onProgress) {
        onProgress(status || 'PROCESSING', elapsed);
      }

      logger.debug('3D generation poll status', { requestId, status, elapsed });

      // Check for model URL in response (may be in data wrapper or at top level)
      const resultData = data.data || data;
      const modelGlb = resultData.model_glb || resultData.glb;
      const modelUrls = resultData.model_urls;
      const thumbnail = resultData.thumbnail;

      if (modelGlb?.url || modelUrls?.glb?.url) {
        logger.info('3D generation completed!', { 
          requestId, 
          elapsed,
          hasModelGlb: !!modelGlb?.url,
          hasModelUrls: !!modelUrls?.glb?.url
        });

        return {
          success: true,
          model_glb: modelGlb,
          thumbnail: thumbnail,
          model_urls: modelUrls,
          generationId,
          requestId,
          remainingCredits,
          creditsDeducted
        };
      }

      // Check for completion status
      if (status === 'COMPLETED' || status === 'OK' || status === 'SUCCEEDED') {
        // Status says complete but no model yet - might need another poll
        logger.info('Status shows completed, checking for model URL', { requestId, data });
        
        // If no model URL in completed status, continue polling briefly
        // The model URL might come in the next poll
        await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 1000));
        continue;
      }

      // Check for failure
      if (status === 'FAILED' || status === 'ERROR' || status === 'CANCELLED') {
        logger.error('3D generation failed', { requestId, status, error: data.error });
        throw new Error(data.error || '3D generation failed. Credits will be refunded.');
      }

      // Still processing - wait and poll again with jitter to avoid bot detection
      const jitter = Math.random() * 2000; // 0-2 seconds random jitter
      await new Promise(resolve => setTimeout(resolve, basePollInterval + jitter));

    } catch (error) {
      const err = error as Error;
      
      // Re-throw user-facing errors
      if (err.message.includes('3D generation failed') || err.message.includes('Credits')) {
        throw err;
      }
      
      // Log and continue for transient errors with backoff
      consecutiveErrors++;
      logger.warn('Poll request failed, retrying', { 
        error: err.message, 
        elapsed: Math.round((Date.now() - startTime) / 1000),
        consecutiveErrors
      });
      const backoffTime = Math.min(basePollInterval * Math.pow(1.5, consecutiveErrors), 30000);
      const jitter = Math.random() * 2000;
      await new Promise(resolve => setTimeout(resolve, backoffTime + jitter));
    }
  }

  // Timeout reached
  logger.warn('3D generation polling timed out', { requestId, maxWaitTime });
  
  // Return with info so UI can show appropriate message
  return {
    success: false,
    error: '3D generation is taking longer than expected. It will appear in your gallery when complete.',
    generationId,
    requestId,
    statusEndpoint: `/api/model3d/status/${requestId}`,
    message: 'Generation still processing. Check your gallery in a few minutes.',
    remainingCredits,
    creditsDeducted
  };
}

/**
 * Check the status of a 3D generation request
 */
export async function check3dStatus(requestId: string): Promise<{ status: string; [key: string]: unknown }> {
  try {
    const token = getAuthToken() || '';
    const apiEndpoint = `${API_URL}/api/model3d/status/${requestId}`;
    
    logger.debug('Checking 3D generation status', { requestId, apiEndpoint, hasToken: !!token });
    
    const response = await fetch(apiEndpoint, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    logger.debug('3D status response received', {
      status: response.status,
      statusText: response.statusText,
      contentType: response.headers.get('content-type'),
      ok: response.ok
    });
    
    // Check if response is JSON before parsing
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      const text = await response.text();
      const isHtml = text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html');
      
      logger.error('3D status check returned non-JSON response', { 
        status: response.status,
        statusText: response.statusText,
        contentType,
        isHtml,
        responseLength: text.length,
        responsePreview: text.substring(0, 500),
        url: response.url
      });
      throw new Error('Invalid response from server');
    }
    
    const data = await response.json();
    
    if (!response.ok) {
      logger.error('3D status check failed', {
        status: response.status,
        error: data.error,
        requestId
      });
      throw new Error(data.error || 'Status check failed');
    }
    
    logger.debug('3D status check successful', { requestId, status: data.status });
    return data;
  } catch (error) {
    const err = error as Error;
    logger.error('3D status check error', { 
      error: err.message,
      errorName: err.name,
      requestId
    });
    throw err;
  }
}

export default {
  generate3dModel,
  check3dStatus
};




