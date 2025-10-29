// NFT Verification Service
// Checks if a wallet holds qualifying NFTs for discounts/free access

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Qualifying NFT collections (add your contract addresses here)
const QUALIFYING_COLLECTIONS = [
  // Ethereum Mainnet
  { chainId: '1', address: '0x...', name: 'Your NFT Collection' },
  // Polygon
  { chainId: '137', address: '0x...', name: 'Your Polygon Collection' },
  // Add more collections as needed
];

/**
 * Check if wallet holds any qualifying NFTs
 * @param {string} walletAddress - The wallet address to check
 * @returns {Promise<{isHolder: boolean, collections: Array}>}
 */
export const checkNFTHoldings = async (walletAddress) => {
  try {
    if (!walletAddress) {
      return { isHolder: false, collections: [] };
    }

    // For now, return mock data
    // In production, this should call your backend which checks blockchain
    console.log('🔍 Checking NFT holdings for:', walletAddress);
    
    // TODO: Implement actual NFT verification via backend
    // This should call /api/nft/verify endpoint that checks blockchain
    
    const response = await fetch(`${API_URL}/api/nft/check-holdings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        walletAddress
        // Backend uses its own hardcoded collections, no need to send empty ones
      })
    });

    if (!response.ok) {
      console.warn('NFT verification endpoint not available, assuming non-holder');
      return { isHolder: false, collections: [] };
    }

    const data = await response.json();
    
    console.log('✅ NFT verification result:', data);
    return {
      isHolder: data.isHolder || false,
      collections: data.collections || []
    };

  } catch (error) {
    console.error('Error checking NFT holdings:', error);
    // Fail open - don't block user if verification fails
    return { isHolder: false, collections: [] };
  }
};

/**
 * Get NFT holder benefits
 * @returns {Object} Benefits information
 */
export const getNFTBenefits = () => {
  return {
    freeGenerations: true,
    creditBonus: 0.2, // 20% bonus on credit purchases
    priorityQueue: true,
    exclusiveModels: true,
    features: [
      'Free image generation via local ComfyUI',
      '20% bonus credits on purchases',
      'Priority generation queue',
      'Access to exclusive AI models'
    ]
  };
};

/**
 * Check if user qualifies for free generation
 * @param {boolean} isNFTHolder - Whether user holds qualifying NFTs
 * @param {number} credits - User's current credits
 * @returns {boolean}
 */
export const canGenerateForFree = (isNFTHolder, credits) => {
  // NFT holders can generate for free if FastAPI is available
  // Non-holders need credits
  return isNFTHolder || credits > 0;
};

