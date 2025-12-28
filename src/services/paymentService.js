// Payment service for USDC and ERC-20 tokens on EVM chains and Solana
import { ethers } from 'ethers';
import logger from '../utils/logger.js';
import { API_URL } from '../utils/apiConfig.js';

// Standard ERC-20 ABI for token transfers
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)"
];

// Validate required environment variables (lazy validation)
const validatePaymentConfig = () => {
  const requiredVars = [
    'VITE_ETH_PAYMENT_WALLET',
    'VITE_POLYGON_PAYMENT_WALLET', 
    'VITE_ARBITRUM_PAYMENT_WALLET',
    'VITE_OPTIMISM_PAYMENT_WALLET',
    'VITE_BASE_PAYMENT_WALLET',
    'VITE_SOLANA_PAYMENT_WALLET'
  ];
  
  const missingVars = requiredVars.filter(varName => !import.meta.env[varName]);
  if (missingVars.length > 0) {
    logger.warn('Missing payment wallet environment variables', { count: missingVars.length });
    return false; // Don't throw error, just warn
  }
  return true;
};

// Payment configuration - configurable tokens
const PAYMENT_CONFIG = {
  // Payment wallet addresses for each chain - MUST be set via environment variables
  paymentWallets: {
    '1': import.meta.env.VITE_ETH_PAYMENT_WALLET || '0x0000000000000000000000000000000000000000',
    '137': import.meta.env.VITE_POLYGON_PAYMENT_WALLET || '0x0000000000000000000000000000000000000000',
    '42161': import.meta.env.VITE_ARBITRUM_PAYMENT_WALLET || '0x0000000000000000000000000000000000000000',
    '10': import.meta.env.VITE_OPTIMISM_PAYMENT_WALLET || '0x0000000000000000000000000000000000000000',
    '8453': import.meta.env.VITE_BASE_PAYMENT_WALLET || '0x0000000000000000000000000000000000000000',
    // Default Solana payment wallet mirrors backend default to avoid mismatch
    'solana': import.meta.env.VITE_SOLANA_PAYMENT_WALLET || 'CkhFmeUNxdr86SZEPg6bLgagFkRyaDMTmFzSVL69oadA'
  },
  // EVM chains payment tokens
  evmTokens: {
    '1': { // Ethereum Mainnet
      'USDC': {
        address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        decimals: 6,
        name: 'USD Coin',
        symbol: 'USDC',
        enabled: true,
        creditRate: 1, // 1 USDC = 1 credit
        minAmount: 1
      },
      'USDT': {
        address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        decimals: 6,
        name: 'Tether USD',
        symbol: 'USDT',
        enabled: true,
        creditRate: 1,
        minAmount: 1
      },
      'DAI': {
        address: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
        decimals: 18,
        name: 'Dai Stablecoin',
        symbol: 'DAI',
        enabled: true,
        creditRate: 1,
        minAmount: 1
      },
      'WETH': {
        address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        decimals: 18,
        name: 'Wrapped Ether',
        symbol: 'WETH',
        enabled: true,
        creditRate: 2000, // 1 WETH = 2000 credits (example rate)
        minAmount: 0.001
      }
    },
    '137': { // Polygon
      'USDC': {
        address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
        decimals: 6,
        name: 'USD Coin',
        symbol: 'USDC',
        enabled: true,
        creditRate: 1,
        minAmount: 1
      },
      'USDT': {
        address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
        decimals: 6,
        name: 'Tether USD',
        symbol: 'USDT',
        enabled: true,
        creditRate: 1,
        minAmount: 1
      },
      'WMATIC': {
        address: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
        decimals: 18,
        name: 'Wrapped Matic',
        symbol: 'WMATIC',
        enabled: true,
        creditRate: 1.5, // 1 WMATIC = 1.5 credits
        minAmount: 1
      }
    },
    '42161': { // Arbitrum
      'USDC': {
        address: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
        decimals: 6,
        name: 'USD Coin',
        symbol: 'USDC',
        enabled: true,
        creditRate: 1,
        minAmount: 1
      },
      'USDT': {
        address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
        decimals: 6,
        name: 'Tether USD',
        symbol: 'USDT',
        enabled: true,
        creditRate: 1,
        minAmount: 1
      }
    },
    '10': { // Optimism
      'USDC': {
        address: '0x7F5c764cBc14f9669B88837ca1490cCa17c31607',
        decimals: 6,
        name: 'USD Coin',
        symbol: 'USDC',
        enabled: true,
        creditRate: 1,
        minAmount: 1
      }
    },
    '8453': { // Base
      'USDC': {
        address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        decimals: 6,
        name: 'USD Coin',
        symbol: 'USDC',
        enabled: true,
        creditRate: 1,
        minAmount: 1
      }
    }
  },
  
  // Solana payment tokens
  solanaTokens: {
    'USDC': {
      mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      decimals: 6,
      name: 'USD Coin',
      symbol: 'USDC',
      enabled: true,
      creditRate: 1,
      minAmount: 1
    },
    'USDT': {
      mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
      decimals: 6,
      name: 'Tether USD',
      symbol: 'USDT',
      enabled: true,
      creditRate: 1,
      minAmount: 1
    },
    'SOL': {
      mint: 'So11111111111111111111111111111111111111112',
      decimals: 9,
      name: 'Solana',
      symbol: 'SOL',
      enabled: true,
      creditRate: 100, // 1 SOL = 100 credits (example rate)
      minAmount: 0.01
    }
  }
};

/**
 * Get available payment tokens for a specific chain
 * @param {string} chainId - The blockchain chain ID
 * @param {string} walletType - 'evm' or 'solana'
 * @returns {Array} - Array of available payment tokens
 */
export const getAvailableTokens = (chainId, walletType = 'evm') => {
  // Validate configuration when accessed
  validatePaymentConfig();
  
  if (walletType === 'solana') {
    return Object.entries(PAYMENT_CONFIG.solanaTokens)
      .filter(([_, token]) => token.enabled)
      .map(([symbol, token]) => ({
        symbol,
        ...token,
        chainId: 'solana'
      }));
  }
  
  const chainTokens = PAYMENT_CONFIG.evmTokens[chainId] || {};
  return Object.entries(chainTokens)
    .filter(([_, token]) => token.enabled)
    .map(([symbol, token]) => ({
      symbol,
      ...token,
      chainId
    }));
};

/**
 * Get token balance for EVM chains
 * @param {string} walletAddress - The wallet address
 * @param {string} tokenAddress - The token contract address
 * @param {string} chainId - The blockchain chain ID
 * @param {Object} provider - The ethers provider
 * @returns {Promise<Object>} - Token balance information
 */
export const getTokenBalance = async (walletAddress, tokenAddress, chainId, provider) => {
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
      chainId
    };
  } catch (error) {
    logger.error('Error getting token balance', { error: error.message });
    throw new Error(`Failed to get token balance: ${error.message}`);
  }
};

/**
 * Get token balance for Solana
 * @param {string} walletAddress - The Solana wallet address
 * @param {string} mintAddress - The token mint address
 * @param {Object} solanaProvider - The Solana provider
 * @returns {Promise<Object>} - Token balance information
 */
export const getSolanaTokenBalance = async (walletAddress, mintAddress, solanaProvider) => {
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
          chainId: 'solana'
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
      chainId: 'solana'
    };
  } catch (error) {
    logger.error('Error getting Solana token balance', { error: error.message });
    throw new Error(`Failed to get Solana token balance: ${error.message}`);
  }
};

/**
 * Transfer tokens on EVM chains
 * @param {string} tokenAddress - The token contract address
 * @param {string} toAddress - The recipient address
 * @param {string} amount - The amount to transfer (in token units)
 * @param {Object} signer - The ethers signer
 * @returns {Promise<Object>} - Transaction information
 */
export const transferTokens = async (tokenAddress, toAddress, amount, signer) => {
  try {
    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
    
    const tx = await contract.transfer(toAddress, amount);
    const receipt = await tx.wait();
    
    return {
      success: true,
      txHash: tx.hash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString()
    };
  } catch (error) {
    logger.error('Error transferring tokens', { error: error.message });
    throw new Error(`Failed to transfer tokens: ${error.message}`);
  }
};

/**
 * Calculate credits for token amount with dynamic pricing
 * @param {string} tokenSymbol - The token symbol
 * @param {number} amount - The token amount
 * @param {string} chainId - The blockchain chain ID
 * @param {string} walletType - 'evm' or 'solana'
 * @param {boolean} isNFTHolder - Whether user owns NFT collections
 * @returns {number} - Number of credits
 */
export const calculateCredits = (tokenSymbol, amount, chainId, walletType = 'evm', isNFTHolder = false) => {
  let tokenConfig;
  
  if (walletType === 'solana') {
    tokenConfig = PAYMENT_CONFIG.solanaTokens[tokenSymbol];
  } else {
    tokenConfig = PAYMENT_CONFIG.evmTokens[chainId]?.[tokenSymbol];
  }
  
  if (!tokenConfig) {
    throw new Error(`Token ${tokenSymbol} not supported on chain ${chainId}`);
  }
  
  // Standard pricing for all users
  // $0.15 per credit (6.67 credits per USDC)
  // 1 USDC = 6.67 credits
  const baseCreditRate = tokenConfig.creditRate;
  const pricingMultiplier = 6.67; // Standard rate: 6.67 credits per USDC
  const adjustedCreditRate = baseCreditRate * pricingMultiplier;
  
  return Math.floor(amount * adjustedCreditRate);
};

/**
 * Validate payment amount
 * @param {string} tokenSymbol - The token symbol
 * @param {number} amount - The token amount
 * @param {string} chainId - The blockchain chain ID
 * @param {string} walletType - 'evm' or 'solana'
 * @returns {Object} - Validation result
 */
export const validatePayment = (tokenSymbol, amount, chainId, walletType = 'evm') => {
  let tokenConfig;
  
  if (walletType === 'solana') {
    tokenConfig = PAYMENT_CONFIG.solanaTokens[tokenSymbol];
  } else {
    tokenConfig = PAYMENT_CONFIG.evmTokens[chainId]?.[tokenSymbol];
  }
  
  if (!tokenConfig) {
    return {
      valid: false,
      error: `Token ${tokenSymbol} not supported on chain ${chainId}`
    };
  }
  
  if (amount < tokenConfig.minAmount) {
    return {
      valid: false,
      error: `Minimum amount is ${tokenConfig.minAmount} ${tokenSymbol}`
    };
  }
  
  return {
    valid: true,
    credits: calculateCredits(tokenSymbol, amount, chainId, walletType),
    tokenConfig
  };
};

/**
 * Add a new payment token
 * @param {string} chainId - The blockchain chain ID
 * @param {string} symbol - The token symbol
 * @param {Object} tokenConfig - The token configuration
 * @param {string} walletType - 'evm' or 'solana'
 */
export const addPaymentToken = (chainId, symbol, tokenConfig, walletType = 'evm') => {
  if (walletType === 'solana') {
    PAYMENT_CONFIG.solanaTokens[symbol] = {
      ...tokenConfig,
      chainId: 'solana'
    };
  } else {
    if (!PAYMENT_CONFIG.evmTokens[chainId]) {
      PAYMENT_CONFIG.evmTokens[chainId] = {};
    }
    PAYMENT_CONFIG.evmTokens[chainId][symbol] = {
      ...tokenConfig,
      chainId
    };
  }
};

/**
 * Remove a payment token
 * @param {string} chainId - The blockchain chain ID
 * @param {string} symbol - The token symbol
 * @param {string} walletType - 'evm' or 'solana'
 */
export const removePaymentToken = (chainId, symbol, walletType = 'evm') => {
  if (walletType === 'solana') {
    delete PAYMENT_CONFIG.solanaTokens[symbol];
  } else {
    if (PAYMENT_CONFIG.evmTokens[chainId]) {
      delete PAYMENT_CONFIG.evmTokens[chainId][symbol];
    }
  }
};

/**
 * Get payment wallet address for a specific chain
 * @param {string} chainId - The blockchain chain ID
 * @param {string} walletType - 'evm' or 'solana'
 * @returns {string} - The payment wallet address
 */
export const getPaymentWallet = (chainId, walletType = 'evm') => {
  // Validate configuration when accessed
  validatePaymentConfig();
  
  if (walletType === 'solana') {
    return PAYMENT_CONFIG.paymentWallets['solana'];
  }
  return PAYMENT_CONFIG.paymentWallets[chainId] || PAYMENT_CONFIG.paymentWallets['1'];
};

/**
 * Transfer tokens directly to payment wallet
 * @param {string} tokenAddress - The token contract address
 * @param {string} amount - The amount to transfer (in token units)
 * @param {string} chainId - The blockchain chain ID
 * @param {Object} signer - The ethers signer
 * @returns {Promise<Object>} - Transaction information
 */
export const transferToPaymentWallet = async (tokenAddress, amount, chainId, signer) => {
  try {
    const paymentWallet = getPaymentWallet(chainId, 'evm');
    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
    
    const tx = await contract.transfer(paymentWallet, amount);
    const receipt = await tx.wait();
    
    return {
      success: true,
      txHash: tx.hash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
      paymentWallet,
      amount: amount.toString()
    };
  } catch (error) {
    logger.error('Error transferring to payment wallet', { error: error.message });
    throw new Error(`Failed to transfer tokens: ${error.message}`);
  }
};

/**
 * Verify payment on backend
 * @param {string} txHash - The transaction hash
 * @param {string} walletAddress - The user's wallet address
 * @param {string} tokenSymbol - The token symbol
 * @param {string} amount - The amount transferred
 * @param {string} chainId - The blockchain chain ID
 * @param {string} walletType - 'evm' or 'solana'
 * @returns {Promise<Object>} - Verification result
 */
export const verifyPayment = async (txHash, walletAddress, tokenSymbol, amount, chainId, walletType = 'evm') => {
  try {
    const response = await fetch(`${API_URL}/api/payments/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        txHash,
        walletAddress,
        tokenSymbol,
        amount: parseFloat(amount),
        chainId,
        walletType,
        paymentWallet: getPaymentWallet(chainId, walletType)
      })
    });

    if (!response.ok) {
      throw new Error('Payment verification failed');
    }

    const data = await response.json();
    return {
      success: true,
      credits: data.credits,
      message: data.message
    };
  } catch (error) {
    logger.error('Error verifying payment', { error: error.message });
    throw new Error(`Payment verification failed: ${error.message}`);
  }
};

/**
 * Get payment configuration
 * @returns {Object} - The payment configuration
 */
export const getPaymentConfig = () => {
  // Validate configuration when accessed
  validatePaymentConfig();
  return PAYMENT_CONFIG;
};
