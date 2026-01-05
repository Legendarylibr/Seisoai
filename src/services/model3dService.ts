/**
 * 3D Model Generation Service
 * Handles API calls to generate 3D models using Hunyuan3D V3
 */
import { API_URL } from '../utils/apiConfig';
import logger from '../utils/logger';

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
    logger.info('Starting 3D model generation', { 
      generate_type, 
      face_count,
      hasBackImage: !!back_image_url 
    });

    const response = await fetch(`${API_URL}/api/model3d/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
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
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `3D generation failed: ${response.status}`);
    }

    logger.info('3D model generation completed', { 
      hasGlb: !!data.model_glb?.url,
      hasObj: !!data.model_urls?.obj?.url,
      creditsDeducted: data.creditsDeducted
    });

    return data as Model3dGenerationResult;
  } catch (error) {
    const err = error as Error;
    logger.error('3D model generation error', { error: err.message });
    throw new Error(`Failed to generate 3D model: ${err.message}`);
  }
}

/**
 * Check the status of a 3D generation request
 */
export async function check3dStatus(requestId: string): Promise<{ status: string; [key: string]: unknown }> {
  try {
    const response = await fetch(`${API_URL}/api/model3d/status/${requestId}`);
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Status check failed');
    }
    
    return data;
  } catch (error) {
    const err = error as Error;
    logger.error('3D status check error', { error: err.message });
    throw err;
  }
}

export default {
  generate3dModel,
  check3dStatus
};




