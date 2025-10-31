// Gallery and generation history service
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

/**
 * Add generation to history and gallery
 * @param {string} walletAddress - User's wallet address
 * @param {Object} generationData - Generation data
 * @returns {Promise<Object>} - Result
 */
export const addGeneration = async (walletAddress, generationData) => {
  try {
    if (!API_URL) {
      throw new Error('API URL not configured');
    }

    // Normalize wallet address (only lowercase EVM addresses, Solana addresses stay as-is)
    const normalizedAddress = walletAddress?.startsWith('0x') 
      ? walletAddress.toLowerCase() 
      : walletAddress;

    console.log('📤 Calling /api/generations/add', {
      walletAddress: normalizedAddress,
      creditsUsed: generationData.creditsUsed,
      hasImageUrl: !!generationData.imageUrl
    });

    const response = await fetch(`${API_URL}/api/generations/add`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        walletAddress: normalizedAddress,
        ...generationData
      })
    });

    const responseText = await response.text();
    console.log('📥 Response from /api/generations/add:', response.status, responseText);

    if (!response.ok) {
      let errorData;
      try {
        errorData = JSON.parse(responseText);
      } catch {
        errorData = { error: responseText || 'Failed to add generation' };
      }
      console.error('❌ Backend error:', errorData);
      throw new Error(errorData.error || `Failed to add generation: ${response.status} ${response.statusText}`);
    }

    const data = JSON.parse(responseText);
    if (!data.success) {
      console.error('❌ Backend returned success=false:', data);
      throw new Error(data.error || 'Failed to add generation');
    }
    
    console.log('✅ Generation added successfully:', data);
    return data;
  } catch (error) {
    console.error('❌ Error adding generation:', error);
    throw error;
  }
};

/**
 * Get user gallery
 * @param {string} walletAddress - User's wallet address
 * @param {number} page - Page number
 * @param {number} limit - Items per page
 * @returns {Promise<Object>} - Gallery data
 */
export const getGallery = async (walletAddress, page = 1, limit = 20) => {
  try {
    if (!API_URL) {
      throw new Error('API URL not configured');
    }

    const response = await fetch(`${API_URL}/api/gallery/${walletAddress}?page=${page}&limit=${limit}`);

    if (!response.ok) {
      throw new Error('Failed to fetch gallery');
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching gallery:', error);
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
    console.error('Error deleting generation:', error);
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
    console.error('Error fetching gallery stats:', error);
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
    console.error('Error updating settings:', error);
    throw error;
  }
};
