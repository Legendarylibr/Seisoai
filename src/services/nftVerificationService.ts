// NFT Verification Service
// Checks if a wallet holds qualifying NFTs for discounts/free access
import logger from '../utils/logger';
import { API_URL } from '../utils/apiConfig';

// Types
export interface NFTCollection {
  chainId?: string;
  address?: string;
  name: string;
  balance?: number;
}

export interface NFTHoldingsResult {
  isHolder: boolean;
  collections: NFTCollection[];
  creditsGranted?: number;
}

export interface NFTBenefits {
  freeGenerations: boolean;
  creditBonus: number;
  priorityQueue: boolean;
  exclusiveModels: boolean;
  features: string[];
}

/**
 * Check if wallet holds any qualifying NFTs
 */
export const checkNFTHoldings = async (walletAddress: string): Promise<NFTHoldingsResult> => {
  try {
    if (!walletAddress) {
      logger.warn('No wallet address provided to checkNFTHoldings');
      return { isHolder: false, collections: [] };
    }

    // Normalize wallet address (lowercase for EVM addresses, unchanged for Solana)
    const isSolanaAddress = !walletAddress.startsWith('0x');
    const normalizedAddress = isSolanaAddress ? walletAddress : walletAddress.toLowerCase();
    logger.debug('Checking NFT holdings', { walletAddress: normalizedAddress, isSolana: isSolanaAddress });
    
    // Add timeout to prevent hanging
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    
    try {
      const apiEndpoint = `${API_URL}/api/nft/check-holdings`;
      logger.debug('Calling NFT endpoint');
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          walletAddress: normalizedAddress
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        logger.error('NFT verification endpoint error', { 
          status: response.status, 
          statusText: response.statusText,
          walletAddress: normalizedAddress
        });
        return { isHolder: false, collections: [] };
      }

      const data = await response.json();
      logger.debug('NFT API response received', { 
        isHolder: data.isHolder, 
        success: data.success,
        creditsGranted: data.creditsGranted 
      });
      
      // Handle different response formats
      const isHolder = data.isHolder === true || (data.success && data.isHolder === true);
      const collections: NFTCollection[] = Array.isArray(data.collections) ? data.collections : [];
      const creditsGranted = data.creditsGranted || 0;
      
      logger.info('NFT verification result', { 
        isHolder, 
        collectionCount: collections.length,
        creditsGranted,
        collections: collections.map((c: NFTCollection) => ({ name: c.name, balance: c.balance }))
      });
      
      return {
        isHolder,
        collections,
        creditsGranted
      };
    } catch (fetchError) {
      clearTimeout(timeoutId);
      const err = fetchError as Error;
      if (err.name === 'AbortError') {
        logger.warn('NFT check timed out', { walletAddress: normalizedAddress });
      } else {
        logger.error('NFT check request failed:', { error: err.message, walletAddress: normalizedAddress });
      }
      return { isHolder: false, collections: [] };
    }

  } catch (error) {
    const err = error as Error;
    logger.error('Error checking NFT holdings:', { error: err.message, walletAddress });
    // Fail open - don't block user if verification fails
    return { isHolder: false, collections: [] };
  }
};

/**
 * Get NFT holder benefits
 */
export const getNFTBenefits = (): NFTBenefits => {
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
 */
export const canGenerateForFree = (isNFTHolder: boolean, credits: number): boolean => {
  // NFT holders get discounts but still need credits
  // Non-holders need credits
  return isNFTHolder || credits > 0;
};


