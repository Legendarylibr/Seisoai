// NFT & Token Verification Service
// Checks if a wallet holds qualifying NFTs or tokens for free access
import logger from '../utils/logger';
import { API_URL, ensureCSRFToken } from '../utils/apiConfig';
import { getAuthToken } from './emailAuthService';

// Types
export interface NFTCollection {
  chainId?: string;
  address?: string;
  name: string;
  balance?: number;
}

export interface TokenHolding {
  chainId: string;
  address: string;
  symbol: string;
  name: string;
  balance: number;
  decimals: number;
}

export interface NFTHoldingsResult {
  isHolder: boolean;
  collections: NFTCollection[];
  creditsGranted?: number;
}

export interface TokenHoldingsResult {
  isHolder: boolean;
  tokens: TokenHolding[];
  hasFreeAccess: boolean;
}

export interface HolderStatus {
  isNFTHolder: boolean;
  isTokenHolder: boolean;
  hasFreeAccess: boolean;
  nftCollections: NFTCollection[];
  tokens: TokenHolding[];
}

export interface NFTBenefits {
  freeGenerations: boolean;
  creditBonus: number;
  priorityQueue: boolean;
  exclusiveModels: boolean;
  features: string[];
}

// ERC-20 Token Configuration
// TODO: Update with actual token contract address when deployed
export const SEISO_TOKEN_CONFIG = {
  // Placeholder - will be updated when token is created
  contractAddress: '', // e.g., '0x...' for EVM or 'TokenMint...' for Solana
  symbol: 'SEISO',
  name: 'Seiso Token',
  minimumBalance: 1, // Minimum tokens required for free access
  chains: {
    ethereum: { chainId: '1', address: '' },
    polygon: { chainId: '137', address: '' },
    base: { chainId: '8453', address: '' },
    solana: { address: '' }
  }
};

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
      
      // Ensure CSRF token is available
      const csrfToken = await ensureCSRFToken();
      const authToken = getAuthToken();
      
      // Auth token is required for this endpoint
      if (!authToken) {
        logger.debug('No auth token available for NFT check - user not logged in');
        return { isHolder: false, collections: [] };
      }
      
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
          ...(csrfToken && { 'X-CSRF-Token': csrfToken })
        },
        credentials: 'include',
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
 * Check if wallet holds SEISO tokens (ERC-20)
 * TODO: Implement when token is deployed
 */
export const checkTokenHoldings = async (walletAddress: string): Promise<TokenHoldingsResult> => {
  try {
    if (!walletAddress) {
      logger.warn('No wallet address provided to checkTokenHoldings');
      return { isHolder: false, tokens: [], hasFreeAccess: false };
    }

    // Token contract not yet deployed
    if (!SEISO_TOKEN_CONFIG.contractAddress) {
      logger.debug('Token contract not yet configured');
      return { isHolder: false, tokens: [], hasFreeAccess: false };
    }

    // Normalize wallet address
    const isSolanaAddress = !walletAddress.startsWith('0x');
    const normalizedAddress = isSolanaAddress ? walletAddress : walletAddress.toLowerCase();
    
    logger.debug('Token check not yet implemented', { walletAddress: normalizedAddress });
    return { isHolder: false, tokens: [], hasFreeAccess: false };
    
  } catch (error) {
    const err = error as Error;
    logger.error('Error checking token holdings:', { error: err.message, walletAddress });
    return { isHolder: false, tokens: [], hasFreeAccess: false };
  }
};

/**
 * Get combined holder status (NFT + Token)
 */
export const getHolderStatus = async (walletAddress: string): Promise<HolderStatus> => {
  try {
    // Check both NFT and token holdings in parallel
    const [nftResult, tokenResult] = await Promise.all([
      checkNFTHoldings(walletAddress),
      checkTokenHoldings(walletAddress)
    ]);
    
    const hasFreeAccess = nftResult.isHolder || tokenResult.hasFreeAccess;
    
    return {
      isNFTHolder: nftResult.isHolder,
      isTokenHolder: tokenResult.isHolder,
      hasFreeAccess,
      nftCollections: nftResult.collections,
      tokens: tokenResult.tokens
    };
  } catch (error) {
    const err = error as Error;
    logger.error('Error getting holder status:', { error: err.message, walletAddress });
    return {
      isNFTHolder: false,
      isTokenHolder: false,
      hasFreeAccess: false,
      nftCollections: [],
      tokens: []
    };
  }
};

/**
 * Get NFT/Token holder benefits
 * Used internally by getHolderStatus
 */
const getNFTBenefits = (): NFTBenefits => {
  return {
    freeGenerations: true,
    creditBonus: 0.2, // 20% bonus on credit purchases
    priorityQueue: true,
    exclusiveModels: true,
    features: [
      'FREE image, video, and music generation',
      'Priority generation queue',
      'Access to exclusive AI models',
      '20% bonus credits on purchases'
    ]
  };
};

// Export for potential future use
export { getNFTBenefits };
