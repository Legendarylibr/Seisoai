// Gallery and generation history service
import logger from '../utils/logger.js';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

/**
 * Add generation to history and gallery
 * @param {string} identifier - User's wallet address or userId (for email users)
 * @param {Object} generationData - Generation data
 * @returns {Promise<Object>} - Result
 */
export const addGeneration = async (identifier, generationData) => {
  try {
    if (!API_URL) {
      throw new Error('API URL not configured');
    }

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
      hasUserId: !!generationData.userId,
      hasEmail: !!generationData.email
    });

    const response = await fetch(`${API_URL}/api/generations/add`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        walletAddress: isWalletAddress ? normalizedIdentifier : undefined,
        userId: !isWalletAddress ? normalizedIdentifier : undefined,
        email: generationData.email,
        ...generationData
      })
    });

    const responseText = await response.text();
    logger.debug('Response from /api/generations/add', { status: response.status });

    if (!response.ok) {
      let errorData;
      try {
        errorData = JSON.parse(responseText);
      } catch {
        errorData = { error: responseText || 'Failed to add generation' };
      }
      logger.error('Backend error adding generation', { error: errorData.error, status: response.status });
      throw new Error(errorData.error || `Failed to add generation: ${response.status} ${response.statusText}`);
    }

    const data = JSON.parse(responseText);
    if (!data.success) {
      logger.error('Backend returned success=false', { error: data.error });
      throw new Error(data.error || 'Failed to add generation');
    }
    
    logger.info('Generation added successfully', { remainingCredits: data.remainingCredits });
    return data;
  } catch (error) {
    logger.error('Error adding generation', { error: error.message });
    throw error;
  }
};

/**
 * Get user gallery
 * @param {string} identifier - User's wallet address, userId, or email
 * @param {number} page - Page number
 * @param {number} limit - Items per page
 * @param {string} userId - Optional userId (for email users)
 * @param {string} email - Optional email
 * @returns {Promise<Object>} - Gallery data
 */
export const getGallery = async (identifier, page = 1, limit = 20, userId = null, email = null) => {
  try {
    if (!API_URL) {
      throw new Error('API URL not configured');
    }

    let url = `${API_URL}/api/gallery/${identifier}?page=${page}&limit=${limit}`;
    if (userId) url += `&userId=${encodeURIComponent(userId)}`;
    if (email) url += `&email=${encodeURIComponent(email)}`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error('Failed to fetch gallery');
    }

    const data = await response.json();
    return data;
  } catch (error) {
    logger.error('Error fetching gallery:', { error: error.message, identifier, page, limit });
    throw error;
  }
};

/**
 * Delete generation from gallery
 * @param {string} walletAddress - User's wallet address
 * @param {string} generationId - Generation ID
 * @returns {Promise<Object>} - Result
 */
export const deleteGeneration = async (walletAddress, generationId) => {
  try {
    if (!API_URL) {
      throw new Error('API URL not configured');
    }

    const response = await fetch(`${API_URL}/api/gallery/${walletAddress}/${generationId}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      throw new Error('Failed to delete generation');
    }

    const data = await response.json();
    return data;
  } catch (error) {
    logger.error('Error deleting generation:', { error: error.message, walletAddress, generationId });
    throw error;
  }
};

/**
 * Get gallery statistics
 * @param {string} walletAddress - User's wallet address
 * @returns {Promise<Object>} - Gallery statistics
 */
export const getGalleryStats = async (walletAddress) => {
  try {
    if (!API_URL) {
      throw new Error('API URL not configured');
    }

    const response = await fetch(`${API_URL}/api/gallery/${walletAddress}/stats`);

    if (!response.ok) {
      throw new Error('Failed to fetch gallery stats');
    }

    const data = await response.json();
    return data;
  } catch (error) {
    logger.error('Error fetching gallery stats:', { error: error.message, walletAddress });
    throw error;
  }
};

/**
 * Update user settings
 * @param {string} walletAddress - User's wallet address
 * @param {Object} settings - Settings to update
 * @returns {Promise<Object>} - Result
 */
export const updateSettings = async (walletAddress, settings) => {
  try {
    if (!API_URL) {
      throw new Error('API URL not configured');
    }

    const response = await fetch(`${API_URL}/api/users/${walletAddress}/settings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ settings })
    });

    if (!response.ok) {
      throw new Error('Failed to update settings');
    }

    const data = await response.json();
    return data;
  } catch (error) {
    logger.error('Error updating settings:', { error: error.message, walletAddress, settings });
    throw error;
  }
};
