/**
 * Alchemy API Service
 * Handles NFT verification using Alchemy's NFT API
 * 
 * Users with ANY NFTs on supported chains get daily credits
 */
import logger from '../utils/logger';
import config from '../config/env';

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

// Chains to check for NFTs (prioritized by popularity)
const CHAINS_TO_CHECK = ['1', '137', '8453', '42161', '10'];

// Alchemy API base URLs by chain
const ALCHEMY_BASE_URLS: Record<string, string> = {
  '1': 'https://eth-mainnet.g.alchemy.com/nft/v3',
  '137': 'https://polygon-mainnet.g.alchemy.com/nft/v3',
  '42161': 'https://arb-mainnet.g.alchemy.com/nft/v3',
  '10': 'https://opt-mainnet.g.alchemy.com/nft/v3',
  '8453': 'https://base-mainnet.g.alchemy.com/nft/v3',
};

const CHAIN_NAMES: Record<string, string> = {
  '1': 'Ethereum',
  '137': 'Polygon',
  '42161': 'Arbitrum',
  '10': 'Optimism',
  '8453': 'Base',
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
 * Get ALL NFTs owned by a wallet across all supported chains
 * Returns up to 10 unique collections for the user record
 */
export async function getAllNFTs(walletAddress: string): Promise<NFTOwnership[]> {
  if (!isAlchemyConfigured()) {
    logger.error('Alchemy API key not configured - cannot check NFT holdings');
    return [];
  }

  const normalizedWallet = walletAddress.toLowerCase();
  const ownedNFTs: NFTOwnership[] = [];
  const seenContracts = new Set<string>();

  logger.info('Checking NFT holdings via Alchemy', {
    wallet: normalizedWallet.substring(0, 10) + '...',
    chains: CHAINS_TO_CHECK
  });

  // Check each chain for NFTs
  for (const chainId of CHAINS_TO_CHECK) {
    const baseUrl = getAlchemyUrl(chainId);
    if (!baseUrl) {
      continue;
    }

    try {
      // Use getNftsForOwner to get all NFTs the wallet owns
      const url = `${baseUrl}/getNftsForOwner?owner=${normalizedWallet}&withMetadata=true&pageSize=100`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) {
        logger.warn('Alchemy API error for chain', {
          chainId,
          chainName: CHAIN_NAMES[chainId],
          status: response.status
        });
        continue;
      }

      const data = await response.json() as AlchemyNFTResponse;
      
      if (data.totalCount > 0) {
        logger.info('NFTs found on chain', {
          chainId,
          chainName: CHAIN_NAMES[chainId],
          count: data.totalCount,
          wallet: normalizedWallet.substring(0, 10) + '...'
        });

        // Group by contract and count
        const countByContract: Record<string, { name: string; count: number }> = {};
        
        for (const nft of data.ownedNfts) {
          const addr = nft.contract.address.toLowerCase();
          if (!countByContract[addr]) {
            countByContract[addr] = {
              name: nft.contract.name || nft.name || 'Unknown Collection',
              count: 0
            };
          }
          countByContract[addr].count++;
        }

        // Add unique contracts to results (limit to prevent bloat)
        for (const [contractAddr, info] of Object.entries(countByContract)) {
          const key = `${chainId}:${contractAddr}`;
          if (!seenContracts.has(key) && ownedNFTs.length < 10) {
            seenContracts.add(key);
            ownedNFTs.push({
              contractAddress: contractAddr,
              chainId,
              name: info.name,
              balance: info.count
            });
          }
        }
      }
    } catch (error) {
      logger.error('Failed to check Alchemy NFTs for chain', {
        chainId,
        chainName: CHAIN_NAMES[chainId],
        error: (error as Error).message
      });
    }

    // Stop if we have enough collections
    if (ownedNFTs.length >= 10) {
      break;
    }
  }

  logger.info('Alchemy NFT check complete', {
    wallet: normalizedWallet.substring(0, 10) + '...',
    totalCollections: ownedNFTs.length,
    totalNFTs: ownedNFTs.reduce((sum, c) => sum + c.balance, 0)
  });

  return ownedNFTs;
}

export default {
  isAlchemyConfigured,
  getAllNFTs
};
