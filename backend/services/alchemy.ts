/**
 * Alchemy API Service
 * Handles NFT verification using Alchemy's NFT API
 */
import logger from '../utils/logger';
import config from '../config/env';
import { QUALIFYING_NFT_CONTRACTS, type QualifyingNFT } from '../config/constants';

// Types
export interface NFTOwnership {
  contractAddress: string;
  chainId: string;
  name: string;
  balance: number;
}

export interface AlchemyNFT {
  contract: {
    address: string;
    name?: string;
    symbol?: string;
  };
  tokenId: string;
  tokenType: string;
  name?: string;
  description?: string;
}

export interface AlchemyNFTResponse {
  ownedNfts: AlchemyNFT[];
  totalCount: number;
  pageKey?: string;
}

// Alchemy API base URLs by chain
const ALCHEMY_BASE_URLS: Record<string, string> = {
  '1': 'https://eth-mainnet.g.alchemy.com/nft/v3',
  'ethereum': 'https://eth-mainnet.g.alchemy.com/nft/v3',
  '137': 'https://polygon-mainnet.g.alchemy.com/nft/v3',
  'polygon': 'https://polygon-mainnet.g.alchemy.com/nft/v3',
  '42161': 'https://arb-mainnet.g.alchemy.com/nft/v3',
  'arbitrum': 'https://arb-mainnet.g.alchemy.com/nft/v3',
  '10': 'https://opt-mainnet.g.alchemy.com/nft/v3',
  'optimism': 'https://opt-mainnet.g.alchemy.com/nft/v3',
  '8453': 'https://base-mainnet.g.alchemy.com/nft/v3',
  'base': 'https://base-mainnet.g.alchemy.com/nft/v3',
};

/**
 * Check if Alchemy API is configured
 */
export function isAlchemyConfigured(): boolean {
  return !!config.ALCHEMY_API_KEY;
}

/**
 * Get Alchemy API URL for a chain
 */
function getAlchemyUrl(chainId: string): string | null {
  const baseUrl = ALCHEMY_BASE_URLS[chainId];
  if (!baseUrl || !config.ALCHEMY_API_KEY) {
    return null;
  }
  return `${baseUrl}/${config.ALCHEMY_API_KEY}`;
}

/**
 * Check if a wallet owns NFTs from a specific contract using Alchemy API
 */
export async function checkNFTOwnership(
  walletAddress: string,
  contractAddress: string,
  chainId: string
): Promise<number> {
  const baseUrl = getAlchemyUrl(chainId);
  if (!baseUrl) {
    logger.warn('Alchemy not configured for chain', { chainId });
    return 0;
  }

  try {
    const url = `${baseUrl}/isHolderOfContract?wallet=${walletAddress}&contractAddress=${contractAddress}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      logger.error('Alchemy API error', {
        status: response.status,
        statusText: response.statusText
      });
      return 0;
    }

    const data = await response.json() as { isHolderOfContract: boolean };
    
    if (data.isHolderOfContract) {
      // Get the actual count using getNftsForOwner
      const countUrl = `${baseUrl}/getNftsForOwner?owner=${walletAddress}&contractAddresses[]=${contractAddress}&withMetadata=false`;
      const countResponse = await fetch(countUrl, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });
      
      if (countResponse.ok) {
        const countData = await countResponse.json() as AlchemyNFTResponse;
        return countData.totalCount || 1;
      }
      return 1; // At least 1 if isHolderOfContract is true
    }
    
    return 0;
  } catch (error) {
    logger.error('Alchemy NFT check failed', {
      error: (error as Error).message,
      walletAddress: walletAddress.substring(0, 10) + '...',
      contractAddress
    });
    return 0;
  }
}

/**
 * Get all NFTs owned by a wallet that match qualifying contracts
 */
export async function getQualifyingNFTs(walletAddress: string): Promise<NFTOwnership[]> {
  if (!isAlchemyConfigured()) {
    logger.warn('Alchemy API key not configured');
    return [];
  }

  if (QUALIFYING_NFT_CONTRACTS.length === 0) {
    logger.debug('No qualifying NFT contracts configured');
    return [];
  }

  const ownedNFTs: NFTOwnership[] = [];
  const normalizedWallet = walletAddress.toLowerCase();

  // Group contracts by chain for efficient querying
  const contractsByChain = QUALIFYING_NFT_CONTRACTS.reduce((acc, nft) => {
    if (!acc[nft.chainId]) {
      acc[nft.chainId] = [];
    }
    acc[nft.chainId].push(nft);
    return acc;
  }, {} as Record<string, QualifyingNFT[]>);

  // Check each chain
  for (const [chainId, contracts] of Object.entries(contractsByChain)) {
    const baseUrl = getAlchemyUrl(chainId);
    if (!baseUrl) {
      logger.warn('Alchemy not configured for chain', { chainId });
      continue;
    }

    // Build contract addresses query parameter
    const contractAddresses = contracts.map(c => c.contractAddress.toLowerCase());
    const contractParams = contractAddresses.map(addr => `contractAddresses[]=${addr}`).join('&');
    
    try {
      const url = `${baseUrl}/getNftsForOwner?owner=${normalizedWallet}&${contractParams}&withMetadata=false`;
      
      logger.debug('Checking Alchemy NFTs', { 
        chainId, 
        contractCount: contracts.length,
        wallet: normalizedWallet.substring(0, 10) + '...'
      });

      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) {
        logger.error('Alchemy API error', {
          chainId,
          status: response.status,
          statusText: response.statusText
        });
        continue;
      }

      const data = await response.json() as AlchemyNFTResponse;
      
      // Count NFTs per contract
      const countByContract: Record<string, number> = {};
      for (const nft of data.ownedNfts) {
        const addr = nft.contract.address.toLowerCase();
        countByContract[addr] = (countByContract[addr] || 0) + 1;
      }

      // Map to qualifying NFTs
      for (const contract of contracts) {
        const addr = contract.contractAddress.toLowerCase();
        const count = countByContract[addr] || 0;
        
        if (count > 0) {
          ownedNFTs.push({
            contractAddress: contract.contractAddress,
            chainId: contract.chainId,
            name: contract.name,
            balance: count
          });

          logger.info('Qualifying NFT found', {
            wallet: normalizedWallet.substring(0, 10) + '...',
            name: contract.name,
            count
          });
        }
      }
    } catch (error) {
      logger.error('Failed to check Alchemy NFTs for chain', {
        chainId,
        error: (error as Error).message
      });
    }
  }

  return ownedNFTs;
}

export default {
  isAlchemyConfigured,
  checkNFTOwnership,
  getQualifyingNFTs
};
