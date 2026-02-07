// Gallery and generation history service
import logger from '../utils/logger';
import { API_URL, apiFetch, ensureCSRFToken } from '../utils/apiConfig';
import { getAuthToken } from '../utils/apiConfig';

// Types
export interface GenerationData {
  imageUrl?: string;
  videoUrl?: string;
  prompt?: string;
  style?: string;
  model?: string;
  creditsUsed?: number;
  userId?: string | null;
  settings?: Record<string, unknown>;
  // 3D model fields
  modelType?: '3d' | 'image' | 'video';
  glbUrl?: string;
  objUrl?: string;
  fbxUrl?: string;
  thumbnailUrl?: string;
}

export interface AddGenerationResult {
  success: boolean;
  remainingCredits?: number;
  error?: string;
}

export interface GalleryItem {
  id: string;
  imageUrl: string;
  prompt?: string;
  style?: string;
  model?: string;
  createdAt: string;
  isPublic?: boolean;
  // 3D model fields
  modelType?: '3d' | 'image' | 'video';
  glbUrl?: string;
  objUrl?: string;
  fbxUrl?: string;
  thumbnailUrl?: string;
  expiresAt?: string;
}

export interface GalleryResponse {
  success: boolean;
  items?: GalleryItem[];
  total?: number;
  page?: number;
  pageSize?: number;
  error?: string;
}

export interface GalleryStats {
  totalGenerations: number;
  totalCreditsSpent: number;
  favoriteStyle?: string;
}

/**
 * Add generation to history and gallery
 */
export const addGeneration = async (
  identifier: string, 
  generationData: GenerationData
): Promise<AddGenerationResult> => {
  try {
    // Note: API_URL can be empty string for same-origin production deployments

    // Check if identifier is a wallet address or userId
    const isWalletAddress = identifier?.startsWith('0x') || 
                           (identifier && identifier.length > 20 && !identifier.startsWith('email_'));
    
    // Normalize wallet address (only lowercase EVM addresses, Solana addresses stay as-is)
    const normalizedIdentifier = isWalletAddress && identifier?.startsWith('0x')
      ? identifier.toLowerCase() 
      : identifier;

    logger.debug('Calling /api/generations/add', {
      identifier: normalizedIdentifier,
      isWalletAddress,
      creditsUsed: generationData.creditsUsed,
      hasImageUrl: !!generationData.imageUrl,
      hasUserId: !!generationData.userId
    });

    // Ensure CSRF token is available
    const csrfToken = await ensureCSRFToken();

    const response = await fetch(`${API_URL}/api/generations/add`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken() || ''}`,
        ...(csrfToken && { 'X-CSRF-Token': csrfToken })
      },
      credentials: 'include',
      body: JSON.stringify({
        walletAddress: isWalletAddress ? normalizedIdentifier : undefined,
        userId: !isWalletAddress ? normalizedIdentifier : undefined,
        ...generationData
      })
    });

    const responseText = await response.text();
    logger.debug('Response from /api/generations/add', { 
      status: response.status,
      statusText: response.statusText,
      hasResponseText: !!responseText
    });

    if (!response.ok) {
      let errorData: { error?: string };
      try {
        errorData = JSON.parse(responseText);
      } catch {
        errorData = { error: responseText || 'Failed to add generation' };
      }
      
      // Provide more specific error messages
      let errorMessage = errorData.error || `Failed to add generation: ${response.status} ${response.statusText}`;
      
      if (response.status === 401 || response.status === 403) {
        errorMessage = 'Authentication failed. Please connect your wallet.';
        logger.warn('Authentication error when saving generation', { 
          status: response.status,
          identifier: normalizedIdentifier 
        });
      } else if (response.status === 404) {
        errorMessage = 'User account not found. Please sign in again.';
        logger.warn('User not found when saving generation', { 
          identifier: normalizedIdentifier,
          isWalletAddress 
        });
      } else if (response.status === 400) {
        errorMessage = errorData.error || 'Invalid request. Missing required information.';
      }
      
      logger.error('Backend error adding generation', { 
        error: errorMessage, 
        status: response.status,
        errorData,
        identifier: normalizedIdentifier
      });
      throw new Error(errorMessage);
    }

    const data = JSON.parse(responseText) as AddGenerationResult;
    if (!data.success) {
      logger.error('Backend returned success=false', { error: data.error });
      throw new Error(data.error || 'Failed to add generation');
    }
    
    logger.info('Generation added successfully', { remainingCredits: data.remainingCredits });
    return data;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error adding generation', { error: errorMessage });
    throw error;
  }
};

/**
 * Get user gallery
 */
export const getGallery = async (
  identifier: string, 
  page: number = 1, 
  limit: number = 20, 
  userId: string | null = null
): Promise<GalleryResponse> => {
  try {
    // Note: API_URL can be empty string for same-origin production deployments

    if (!identifier) {
      throw new Error('Identifier is required');
    }

    let url = `${API_URL}/api/gallery/${encodeURIComponent(identifier)}?page=${page}&limit=${limit}`;
    if (userId) url += `&userId=${encodeURIComponent(userId)}`;

    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      let errorMessage = `Failed to fetch gallery: ${response.status} ${response.statusText}`;
      try {
        const errorData = await response.json();
        if (errorData.error) {
          errorMessage = errorData.error;
        }
      } catch {
        // If response is not JSON, use default error message
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    
    // Ensure response has expected structure
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid response format from gallery API');
    }
    
    return data;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error fetching gallery:', { error: errorMessage, identifier, page, limit });
    throw error;
  }
};

/**
 * Delete generation from gallery
 */
export const deleteGeneration = async (
  walletAddress: string, 
  generationId: string
): Promise<{ success: boolean }> => {
  try {
    // Note: API_URL can be empty string for same-origin production deployments
    
    // Ensure CSRF token is available
    const csrfToken = await ensureCSRFToken();

    const response = await fetch(`${API_URL}/api/gallery/${walletAddress}/${generationId}`, {
      method: 'DELETE',
      headers: {
        ...(csrfToken && { 'X-CSRF-Token': csrfToken })
      },
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error('Failed to delete generation');
    }

    const data = await response.json();
    return data;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error deleting generation:', { error: errorMessage, walletAddress, generationId });
    throw error;
  }
};

/**
 * Get gallery statistics
 */
export const getGalleryStats = async (walletAddress: string): Promise<GalleryStats> => {
  try {
    // Note: API_URL can be empty string for same-origin production deployments

    const response = await fetch(`${API_URL}/api/gallery/${walletAddress}/stats`);

    if (!response.ok) {
      throw new Error('Failed to fetch gallery stats');
    }

    const data = await response.json();
    return data;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error fetching gallery stats:', { error: errorMessage, walletAddress });
    throw error;
  }
};

/**
 * Update user settings
 */
export const updateSettings = async (
  walletAddress: string, 
  settings: Record<string, unknown>
): Promise<{ success: boolean }> => {
  try {
    const response = await apiFetch(`${API_URL}/api/users/${walletAddress}/settings`, {
      method: 'PUT',
      body: JSON.stringify({ settings })
    });

    if (!response.ok) {
      throw new Error('Failed to update settings');
    }

    const data = await response.json();
    return data;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error updating settings:', { error: errorMessage, walletAddress, settings });
    throw error;
  }
};



