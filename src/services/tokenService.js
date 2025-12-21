// Token balance checking service for ERC-20 and SPL tokens
import { ethers } from 'ethers';
import logger from '../utils/logger.js';

// Standard ERC-20 ABI for token balance checking
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function totalSupply() view returns (uint256)"
];

// Common token addresses on different chains
const COMMON_TOKENS = {
  '1': { // Ethereum Mainnet
    'USDC': '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    'USDT': '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    'DAI': '0x6B175474E89094C44Da98b954EedeAC495271d0F',
    'WETH': '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
  },
  '137': { // Polygon
    'USDC': '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
    'USDT': '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    'DAI': '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
    'WMATIC': '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270'
  },
  '42161': { // Arbitrum
    'USDC': '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
    'USDT': '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
    'DAI': '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
    'WETH': '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1'
  },
  '10': { // Optimism
    'USDC': '0x7F5c764cBc14f9669B88837ca1490cCa17c31607',
    'USDT': '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
    'DAI': '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
    'WETH': '0x4200000000000000000000000000000000000006'
  },
  '8453': { // Base
    'USDC': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    'WETH': '0x4200000000000000000000000000000000000006'
  }
};

/**
 * Check ERC-20 token balance
 * @param {string} walletAddress - The wallet address to check
 * @param {string} tokenAddress - The token contract address
 * @param {string} chainId - The blockchain chain ID
 * @param {Object} provider - The ethers provider
 * @returns {Promise<Object>} - Token balance information
 */
export const checkTokenBalance = async (walletAddress, tokenAddress, chainId, provider) => {
  try {
    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    
    const [balance, decimals, name, symbol] = await Promise.all([
      contract.balanceOf(walletAddress),
      contract.decimals(),
      contract.name(),
      contract.symbol()
    ]);
    
    const formattedBalance = ethers.formatUnits(balance, decimals);
    
    return {
      balance: balance.toString(),
      formattedBalance,
      decimals: decimals.toString(),
      name,
      symbol,
      contractAddress: tokenAddress,
      chainId,
      type: 'ERC20'
    };
  } catch (error) {
    logger.error('Error checking token balance', { error: error.message });
    throw new Error(`Failed to check token balance: ${error.message}`);
  }
};

/**
 * Check Solana SPL token balance
 * @param {string} walletAddress - The Solana wallet address
 * @param {string} mintAddress - The token mint address
 * @param {Object} solanaProvider - The Solana provider
 * @returns {Promise<Object>} - Token balance information
 */
export const checkSolanaTokenBalance = async (walletAddress, mintAddress, solanaProvider) => {
  try {
    const response = await fetch(import.meta.env.VITE_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com', {
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
            programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
          },
          {
            encoding: 'jsonParsed'
          }
        ]
      })
    });
    
    const data = await response.json();
    
    if (data.result && data.result.value) {
      const tokenAccount = data.result.value.find(account => 
        account.account.data.parsed.info.mint === mintAddress
      );
      
      if (tokenAccount) {
        const balance = tokenAccount.account.data.parsed.info.tokenAmount.uiAmount;
        const decimals = tokenAccount.account.data.parsed.info.tokenAmount.decimals;
        
        return {
          balance: tokenAccount.account.data.parsed.info.tokenAmount.amount,
          formattedBalance: balance.toString(),
          decimals: decimals.toString(),
          name: 'Solana Token',
          symbol: 'SOL',
          contractAddress: mintAddress,
          chainId: 'solana',
          type: 'SPL'
        };
      }
    }
    
    return {
      balance: '0',
      formattedBalance: '0',
      decimals: '9',
      name: 'Solana Token',
      symbol: 'SOL',
      contractAddress: mintAddress,
      chainId: 'solana',
      type: 'SPL'
    };
  } catch (error) {
    logger.error('Error checking Solana token balance', { error: error.message });
    throw new Error(`Failed to check Solana token balance: ${error.message}`);
  }
};

/**
 * Check multiple token balances at once
 * @param {string} walletAddress - The wallet address to check
 * @param {Array} tokens - Array of token objects {address, chainId, type}
 * @param {Object} providers - Object with chainId as key and provider as value
 * @returns {Promise<Array>} - Array of balance results
 */
export const checkMultipleTokens = async (walletAddress, tokens, providers) => {
  const results = [];
  
  for (const token of tokens) {
    try {
      const provider = providers[token.chainId];
      if (!provider) {
        results.push({
          contractAddress: token.address,
          chainId: token.chainId,
          error: 'Provider not available for this chain'
        });
        continue;
      }
      
      if (token.type === 'solana') {
        const result = await checkSolanaTokenBalance(walletAddress, token.address, provider);
        results.push(result);
      } else {
        const result = await checkTokenBalance(walletAddress, token.address, token.chainId, provider);
        results.push(result);
      }
    } catch (error) {
      results.push({
        contractAddress: token.address,
        chainId: token.chainId,
        error: error.message
      });
    }
  }
  
  return results;
};

/**
 * Get common tokens for a specific chain
 * @param {string} chainId - The blockchain chain ID
 * @returns {Array} - Array of common token objects
 */
export const getCommonTokens = (chainId) => {
  const tokens = COMMON_TOKENS[chainId] || {};
  return Object.entries(tokens).map(([symbol, address]) => ({
    symbol,
    address,
    chainId,
    type: 'ERC20'
  }));
};

/**
 * Check if wallet has minimum token balance
 * @param {string} walletAddress - The wallet address to check
 * @param {string} tokenAddress - The token contract address
 * @param {string} chainId - The blockchain chain ID
 * @param {Object} provider - The ethers provider
 * @param {string} minimumBalance - The minimum balance required
 * @returns {Promise<boolean>} - Whether wallet has minimum balance
 */
export const hasMinimumBalance = async (walletAddress, tokenAddress, chainId, provider, minimumBalance) => {
  try {
    const tokenInfo = await checkTokenBalance(walletAddress, tokenAddress, chainId, provider);
    const balance = parseFloat(tokenInfo.formattedBalance);
    const minimum = parseFloat(minimumBalance);
    
    return balance >= minimum;
  } catch (error) {
    logger.error('Error checking minimum balance:', { error: error.message, walletAddress, tokenAddress, chainId });
    return false;
  }
};
