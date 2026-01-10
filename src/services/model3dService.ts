/**
 * 3D Model Generation Service
 * Handles API calls to generate 3D models using Hunyuan3D V3
 */
import { API_URL } from '../utils/apiConfig';
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
    email
  } = params;

  if (!input_image_url) {
    throw new Error('Input image URL is required');
  }

  if (!walletAddress && !userId && !email) {
    throw new Error('User identification required');
  }

  try {
    // Note: API_URL can be empty string for same-origin production deployments
    // This is intentional - empty string means requests go to relative URLs like /api/model3d/generate

    const apiEndpoint = `${API_URL}/api/model3d/generate`;
    logger.info('Starting 3D model generation', { 
      apiEndpoint,
      API_URL,
      generate_type, 
      face_count,
      hasBackImage: !!back_image_url,
      hasWalletAddress: !!walletAddress,
      hasUserId: !!userId,
      hasEmail: !!email,
      hasInputImage: !!input_image_url
    });

    // Create abort controller with 10 minute timeout (3D gen can take 5-7 mins + polling overhead)
    // Backend polls for up to 7 minutes, so we need extra time for the response
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10 * 60 * 1000);

    // Get JWT token for authentication
    const token = getAuthToken() || '';
    const hasToken = !!token;
    const tokenPreview = token ? `${token.substring(0, 20)}...` : '(empty)';

    logger.info('3D generation request details', {
      apiEndpoint,
      hasToken,
      tokenPreview,
      requestBody: {
        hasInputImage: !!input_image_url,
        hasBackImage: !!back_image_url,
        hasLeftImage: !!left_image_url,
        hasRightImage: !!right_image_url,
        enable_pbr,
        face_count,
        generate_type,
        polygon_type,
        hasWalletAddress: !!walletAddress,
        hasUserId: !!userId,
        hasEmail: !!email
      }
    });

    let response: Response;
    try {
      logger.debug('Sending 3D generation request', { apiEndpoint, method: 'POST' });
      response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
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
      
      logger.info('3D generation response received', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        contentType: response.headers.get('content-type'),
        headers: Object.fromEntries(response.headers.entries())
      });
    } catch (fetchError) {
      clearTimeout(timeoutId);
      const err = fetchError as Error;
      
      // Check if this is an abort error (timeout or user cancellation)
      if (err.name === 'AbortError' || err.message.includes('aborted')) {
        logger.warn('3D generation request was aborted (likely timeout)', {
          error: err.message,
          errorName: err.name,
          apiEndpoint
        });
        throw new Error('3D generation request timed out. The generation may still be processing in the background. Please check your gallery in a few minutes.');
      }
      
      logger.error('3D generation fetch failed', {
        error: err.message,
        errorName: err.name,
        apiEndpoint,
        hasToken
      });
      throw err;
    }

    // Check if response is JSON before parsing
    const contentType = response.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    let data: Model3dGenerationResult;
    
    logger.debug('Processing 3D generation response', {
      status: response.status,
      contentType,
      isJson,
      url: response.url,
      redirected: response.redirected,
      type: response.type
    });
    
    // Always check the actual response body to detect HTML
    let responseText: string;
    try {
      responseText = await response.text();
    } catch (textError) {
      clearTimeout(timeoutId);
      const err = textError as Error;
      logger.error('Failed to read response text', {
        error: err.message,
        errorName: err.name,
        status: response.status
      });
      
      if (err.name === 'AbortError' || err.message.includes('aborted')) {
        throw new Error('3D generation request was interrupted. The generation may still be processing. Please check your gallery in a few minutes.');
      }
      throw new Error('Failed to read server response. Please try again.');
    } finally {
      clearTimeout(timeoutId);
    }
    
    const isHtml = responseText.trim().startsWith('<!DOCTYPE') || 
                   responseText.trim().startsWith('<html') ||
                   responseText.trim().startsWith('<!doctype');
    
    if (isHtml) {
      // Response is HTML (likely SPA fallback, Cloudflare error, or CDN issue)
      // Log detailed info for debugging
      const htmlTitle = responseText.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || 'No title';
      const isCloudflare = responseText.includes('cloudflare') || responseText.includes('cf-');
      const isRailway = responseText.includes('railway') || responseText.includes('Application not found');
      
      logger.error('3D generation API returned HTML instead of JSON', { 
        status: response.status,
        statusText: response.statusText,
        contentType,
        htmlTitle,
        isCloudflare,
        isRailway,
        responseLength: responseText.length,
        responsePreview: responseText.substring(0, 800),
        url: response.url,
        redirected: response.redirected,
        apiEndpoint: `${API_URL}/api/model3d/generate`,
        apiUrlValue: API_URL,
        windowLocation: typeof window !== 'undefined' ? window.location.href : 'N/A'
      });
      
      if (response.status === 404) {
        throw new Error('3D model generation endpoint not found. The API route may not be configured correctly.');
      } else if (response.status === 401 || response.status === 403) {
        throw new Error('Authentication failed. Please sign in again.');
      } else if (isCloudflare) {
        throw new Error('Request blocked by Cloudflare. Please try again or disable VPN/proxy if using one.');
      } else if (isRailway) {
        throw new Error('Server not found. The application may be restarting. Please wait a moment and try again.');
      } else {
        throw new Error(`Server returned HTML instead of JSON (${htmlTitle}). Try: 1) Hard refresh (Ctrl+Shift+R), 2) Clear browser cache, 3) Try incognito mode.`);
      }
    }
    
    if (!isJson && response.status !== 202) {
      // 202 is acceptable (async processing), but other non-JSON responses are errors
      logger.error('3D generation API returned non-JSON response', {
        status: response.status,
        contentType,
        responsePreview: responseText.substring(0, 500)
      });
      throw new Error(`Server returned an unexpected response (${response.status}). Please try again later.`);
    }

    try {
      logger.debug('Parsing JSON response');
      // Parse from the text we already read
      data = JSON.parse(responseText) as Model3dGenerationResult;
      logger.debug('JSON parsed successfully', {
        hasSuccess: 'success' in data,
        hasError: 'error' in data,
        keys: Object.keys(data)
      });
    } catch (parseError) {
      logger.error('Failed to parse JSON response', { 
        status: response.status,
        statusText: response.statusText,
        contentType,
        isHtml,
        responseLength: responseText.length,
        responsePreview: responseText.substring(0, 500),
        error: parseError instanceof Error ? parseError.message : 'Unknown error',
        errorName: parseError instanceof Error ? parseError.name : 'Unknown',
        url: response.url
      });
      
      if (isHtml) {
        throw new Error('Server returned HTML instead of JSON. The API endpoint may not be available.');
      } else {
        throw new Error(`Invalid JSON response from server: ${parseError instanceof Error ? parseError.message : 'Unknown error'}. Please try again.`);
      }
    }

    // Handle 202 Accepted (async processing - generation still in progress)
    if (response.status === 202) {
      logger.info('3D generation accepted, processing asynchronously', {
        generationId: (data as { generationId?: string }).generationId,
        requestId: (data as { requestId?: string }).requestId,
        message: (data as { message?: string }).message
      });
      // Return the response data which should include generationId and statusEndpoint
      return data;
    }

    if (!response.ok) {
      logger.error('3D generation API returned error', { 
        status: response.status,
        error: data.error,
        creditsRefunded: data.creditsRefunded
      });
      throw new Error(data.error || `3D generation failed: ${response.status}`);
    }

    logger.info('3D model generation completed', { 
      success: data.success,
      hasModelGlb: !!data.model_glb?.url,
      hasModelUrlsGlb: !!data.model_urls?.glb?.url,
      hasObj: !!data.model_urls?.obj?.url,
      hasThumbnail: !!data.thumbnail?.url,
      creditsDeducted: data.creditsDeducted,
      remainingCredits: data.remainingCredits
    });

    return data as Model3dGenerationResult;
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




