// NFT verification service for contract address checking
import { ethers } from 'ethers';

// Standard ERC-721 ABI for NFT ownership checking
const ERC721_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function name() view returns (string)",
  "function symbol() view returns (string)"
];

// Standard ERC-1155 ABI for multi-token NFTs
const ERC1155_ABI = [
  "function balanceOf(address account, uint256 id) view returns (uint256)",
  "function balanceOfBatch(address[] accounts, uint256[] ids) view returns (uint256[])",
  "function uri(uint256 id) view returns (string)"
];

// Solana NFT verification (simplified)
const SOLANA_NFT_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';

/**
 * Check if a wallet owns any NFTs from a specific contract address
 * @param {string} walletAddress - The wallet address to check
 * @param {string} contractAddress - The NFT contract address
 * @param {string} chainId - The blockchain chain ID
 * @param {Object} provider - The ethers provider
 * @returns {Promise<Object>} - NFT ownership information
 */
export const checkNFTOwnership = async (walletAddress, contractAddress, chainId, provider) => {
  try {
    const contract = new ethers.Contract(contractAddress, ERC721_ABI, provider);
    
    // Check if contract is ERC-721
    try {
      const balance = await contract.balanceOf(walletAddress);
      const name = await contract.name();
      const symbol = await contract.symbol();
      
      if (balance > 0) {
        // Get token IDs owned by the wallet
        const tokenIds = [];
        for (let i = 0; i < balance; i++) {
          try {
            const tokenId = await contract.tokenOfOwnerByIndex(walletAddress, i);
            tokenIds.push(tokenId.toString());
          } catch (error) {
            console.warn(`Error getting token ${i}:`, error);
          }
        }
        
        return {
          owns: true,
          balance: balance.toString(),
          tokenIds,
          contractAddress,
          name,
          symbol,
          type: 'ERC721'
        };
      }
      
      return {
        owns: false,
        balance: '0',
        tokenIds: [],
        contractAddress,
        name,
        symbol,
        type: 'ERC721'
      };
    } catch (error) {
      // Try ERC-1155 if ERC-721 fails
      try {
        const erc1155Contract = new ethers.Contract(contractAddress, ERC1155_ABI, provider);
        // For ERC-1155, we need to check specific token IDs
        // This is a simplified check - in practice you'd need to know the token IDs
        return {
          owns: false,
          balance: '0',
          tokenIds: [],
          contractAddress,
          name: 'Unknown',
          symbol: 'Unknown',
          type: 'ERC1155',
          note: 'ERC1155 detected - specific token ID checking required'
        };
      } catch (erc1155Error) {
        throw new Error(`Contract not recognized as ERC-721 or ERC-1155: ${error.message}`);
      }
    }
  } catch (error) {
    console.error('Error checking NFT ownership:', error);
    throw new Error(`Failed to check NFT ownership: ${error.message}`);
  }
};

/**
 * Check Solana NFT ownership
 * @param {string} walletAddress - The Solana wallet address
 * @param {string} mintAddress - The NFT mint address
 * @param {Object} solanaProvider - The Solana provider
 * @returns {Promise<Object>} - NFT ownership information
 */
export const checkSolanaNFTOwnership = async (walletAddress, mintAddress, solanaProvider) => {
  try {
    // This is a simplified implementation
    // In practice, you'd use the Solana Web3.js library
    const response = await fetch(`https://api.mainnet-beta.solana.com`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getTokenAccountsByOwner',
        params: [
          walletAddress,
          {
            programId: SOLANA_NFT_PROGRAM_ID
          },
          {
            encoding: 'jsonParsed'
          }
        ]
      })
    });
    
    const data = await response.json();
    
    if (data.result && data.result.value) {
      const nftAccounts = data.result.value.filter(account => 
        account.account.data.parsed.info.mint === mintAddress
      );
      
      return {
        owns: nftAccounts.length > 0,
        balance: nftAccounts.length.toString(),
        tokenIds: nftAccounts.map(account => account.account.data.parsed.info.mint),
        contractAddress: mintAddress,
        name: 'Solana NFT',
        symbol: 'SOL',
        type: 'Solana'
      };
    }
    
    return {
      owns: false,
      balance: '0',
      tokenIds: [],
      contractAddress: mintAddress,
      name: 'Solana NFT',
      symbol: 'SOL',
      type: 'Solana'
    };
  } catch (error) {
    console.error('Error checking Solana NFT ownership:', error);
    throw new Error(`Failed to check Solana NFT ownership: ${error.message}`);
  }
};

/**
 * Check multiple NFT contracts at once
 * @param {string} walletAddress - The wallet address to check
 * @param {Array} contracts - Array of contract objects {address, chainId, type}
 * @param {Object} providers - Object with chainId as key and provider as value
 * @returns {Promise<Array>} - Array of ownership results
 */
export const checkMultipleNFTs = async (walletAddress, contracts, providers) => {
  const results = [];
  
  for (const contract of contracts) {
    try {
      const provider = providers[contract.chainId];
      if (!provider) {
        results.push({
          contractAddress: contract.address,
          chainId: contract.chainId,
          error: 'Provider not available for this chain'
        });
        continue;
      }
      
      if (contract.type === 'solana') {
        const result = await checkSolanaNFTOwnership(walletAddress, contract.address, provider);
        results.push({ ...result, chainId: contract.chainId });
      } else {
        const result = await checkNFTOwnership(walletAddress, contract.address, contract.chainId, provider);
        results.push({ ...result, chainId: contract.chainId });
      }
    } catch (error) {
      results.push({
        contractAddress: contract.address,
        chainId: contract.chainId,
        error: error.message
      });
    }
  }
  
  return results;
};

/**
 * Get NFT metadata
 * @param {string} contractAddress - The NFT contract address
 * @param {string} tokenId - The token ID
 * @param {string} chainId - The blockchain chain ID
 * @param {Object} provider - The ethers provider
 * @returns {Promise<Object>} - NFT metadata
 */
export const getNFTMetadata = async (contractAddress, tokenId, chainId, provider) => {
  try {
    const contract = new ethers.Contract(contractAddress, ERC721_ABI, provider);
    const tokenURI = await contract.tokenURI(tokenId);
    
    // Fetch metadata from IPFS or HTTP
    const response = await fetch(tokenURI);
    const metadata = await response.json();
    
    return {
      contractAddress,
      tokenId,
      chainId,
      metadata
    };
  } catch (error) {
    console.error('Error fetching NFT metadata:', error);
    throw new Error(`Failed to fetch NFT metadata: ${error.message}`);
  }
};
