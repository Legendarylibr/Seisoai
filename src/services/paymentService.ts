// Payment service for USDC and ERC-20 tokens on EVM chains and Solana
import { ethers } from 'ethers';
import logger from '../utils/logger';
import { API_URL } from '../utils/apiConfig';

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

interface TokenConfig {
  address?: string;
  mint?: string;
  decimals: number;
  name: string;
  symbol: string;
  enabled: boolean;
  creditRate: number;
  minAmount: number;
  chainId?: string;
}

interface PaymentConfigType {
  paymentWallets: Record<string, string>;
  evmTokens: Record<string, Record<string, TokenConfig>>;
  solanaTokens: Record<string, TokenConfig>;
}

// Validate required environment variables (lazy validation)
const validatePaymentConfig = (): boolean => {
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
    return false;
  }
  return true;
};

// Payment configuration - configurable tokens
// Note: paymentWallets are fetched from backend at runtime via getPaymentWalletFromBackend()
const PAYMENT_CONFIG: PaymentConfigType = {
  paymentWallets: {
    '1': '', // Fetched from backend
    '137': '', // Fetched from backend
    '42161': '', // Fetched from backend
    '10': '', // Fetched from backend
    '8453': '', // Fetched from backend
    'solana': '' // Fetched from backend
  },
  evmTokens: {
    '1': {
      'USDC': {
        address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        decimals: 6,
        name: 'USD Coin',
        symbol: 'USDC',
        enabled: true,
        creditRate: 1,
        minAmount: 1
      }
    },
    '137': {
      'USDC': {
        address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
        decimals: 6,
        name: 'USD Coin',
        symbol: 'USDC',
        enabled: true,
        creditRate: 1,
        minAmount: 1
      }
    },
    '42161': {
      'USDC': {
        address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
        decimals: 6,
        name: 'USD Coin',
        symbol: 'USDC',
        enabled: true,
        creditRate: 1,
        minAmount: 1
      }
    },
    '10': {
      'USDC': {
        address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
        decimals: 6,
        name: 'USD Coin',
        symbol: 'USDC',
        enabled: true,
        creditRate: 1,
        minAmount: 1
      }
    },
    '8453': {
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
  solanaTokens: {
    'USDC': {
      mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      decimals: 6,
      name: 'USD Coin',
      symbol: 'USDC',
      enabled: true,
      creditRate: 1,
      minAmount: 1
    }
  }
};

export const getAvailableTokens = (chainId: string, walletType: string = 'evm'): TokenConfig[] => {
  validatePaymentConfig();
  
  if (walletType === 'solana') {
    return Object.entries(PAYMENT_CONFIG.solanaTokens)
      .filter(([, token]) => token.enabled)
      .map(([symbol, token]) => ({
        ...token,
        symbol,
        chainId: 'solana'
      }));
  }
  
  const chainTokens = PAYMENT_CONFIG.evmTokens[chainId] || {};
  return Object.entries(chainTokens)
    .filter(([, token]) => token.enabled)
    .map(([symbol, token]) => ({
      ...token,
      symbol,
      chainId
    }));
};

export const getTokenBalance = async (
  walletAddress: string, 
  tokenAddress: string, 
  _chainId: string, 
  provider: ethers.Provider
): Promise<{
  balance: string;
  formattedBalance: string;
  decimals: string;
  name: string;
  symbol: string;
}> => {
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
      symbol
    };
  } catch (error) {
    const err = error as Error;
    logger.error('Error getting token balance', { error: err.message });
    throw new Error(`Failed to get token balance: ${err.message}`);
  }
};

export const getSolanaTokenBalance = async (
  walletAddress: string, 
  mintAddress: string
): Promise<{
  balance: string;
  formattedBalance: string;
  decimals: string;
}> => {
  try {
    const response = await fetch(import.meta.env.VITE_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getTokenAccountsByOwner',
        params: [
          walletAddress,
          { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' },
          { encoding: 'jsonParsed' }
        ]
      })
    });
    
    const data = await response.json();
    
    if (data.result?.value) {
      const tokenAccount = data.result.value.find((account: { account: { data: { parsed: { info: { mint: string } } } } }) => 
        account.account.data.parsed.info.mint === mintAddress
      );
      
      if (tokenAccount) {
        const balance = tokenAccount.account.data.parsed.info.tokenAmount.uiAmount;
        const decimals = tokenAccount.account.data.parsed.info.tokenAmount.decimals;
        
        return {
          balance: tokenAccount.account.data.parsed.info.tokenAmount.amount,
          formattedBalance: balance.toString(),
          decimals: decimals.toString()
        };
      }
    }
    
    return { balance: '0', formattedBalance: '0', decimals: '6' };
  } catch (error) {
    const err = error as Error;
    logger.error('Error getting Solana token balance', { error: err.message });
    throw new Error(`Failed to get Solana token balance: ${err.message}`);
  }
};

export const calculateCredits = (
  tokenSymbol: string, 
  amount: number, 
  chainId: string, 
  walletType: string = 'evm',
  _isNFTHolder: boolean = false
): number => {
  let tokenConfig: TokenConfig | undefined;
  
  if (walletType === 'solana') {
    tokenConfig = PAYMENT_CONFIG.solanaTokens[tokenSymbol];
  } else {
    tokenConfig = PAYMENT_CONFIG.evmTokens[chainId]?.[tokenSymbol];
  }
  
  if (!tokenConfig) {
    throw new Error(`Token ${tokenSymbol} not supported on chain ${chainId}`);
  }
  
  // Everyone gets 16.67 credits per USDC ($0.06 per credit)
  const baseCreditRate = tokenConfig.creditRate;
  const pricingMultiplier = 16.67;
  const adjustedCreditRate = baseCreditRate * pricingMultiplier;
  
  return Math.floor(amount * adjustedCreditRate);
};

export const validatePayment = (
  tokenSymbol: string, 
  amount: number, 
  chainId: string, 
  walletType: string = 'evm'
): { valid: boolean; error?: string; credits?: number; tokenConfig?: TokenConfig } => {
  let tokenConfig: TokenConfig | undefined;
  
  if (walletType === 'solana') {
    tokenConfig = PAYMENT_CONFIG.solanaTokens[tokenSymbol];
  } else {
    tokenConfig = PAYMENT_CONFIG.evmTokens[chainId]?.[tokenSymbol];
  }
  
  if (!tokenConfig) {
    return { valid: false, error: `Token ${tokenSymbol} not supported on chain ${chainId}` };
  }
  
  if (amount < tokenConfig.minAmount) {
    return { valid: false, error: `Minimum amount is ${tokenConfig.minAmount} ${tokenSymbol}` };
  }
  
  return {
    valid: true,
    credits: calculateCredits(tokenSymbol, amount, chainId, walletType),
    tokenConfig
  };
};

// Cache for payment wallet addresses fetched from backend
const paymentWalletCache: Record<string, { address: string; timestamp: number }> = {};
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch payment wallet address from backend
 * This is the preferred method - gets the authoritative address from the server
 */
export const getPaymentWalletFromBackend = async (chainId: string, walletType: string = 'evm'): Promise<string> => {
  const cacheKey = `${walletType}-${chainId}`;
  const cached = paymentWalletCache[cacheKey];
  
  // Return cached value if still valid
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.address;
  }
  
  try {
    const response = await fetch(`${API_URL}/api/payment/get-address`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chainId, walletType })
    });
    
    if (!response.ok) {
      throw new Error(`Failed to get payment address: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.success || !data.paymentAddress) {
      throw new Error(data.error || 'Payment wallet not configured on server');
    }
    
    // Validate address format
    if (walletType !== 'solana' && !data.paymentAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      throw new Error('Invalid EVM payment address format from server');
    }
    
    // Cache the result
    paymentWalletCache[cacheKey] = {
      address: data.paymentAddress,
      timestamp: Date.now()
    };
    
    return data.paymentAddress;
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to fetch payment wallet from backend', { error: err.message, chainId, walletType });
    throw new Error(`Payment configuration error: ${err.message}`);
  }
};

/**
 * @deprecated Use getPaymentWalletFromBackend() instead for runtime fetching
 * This synchronous version is kept for backwards compatibility but will throw if wallet not cached
 */
export const getPaymentWallet = (chainId: string, walletType: string = 'evm'): string => {
  const cacheKey = `${walletType}-${chainId}`;
  const cached = paymentWalletCache[cacheKey];
  
  if (cached) {
    return cached.address;
  }
  
  // Throw error instead of returning zero address
  throw new Error('Payment wallet not loaded. Call getPaymentWalletFromBackend() first.');
};

export const transferToPaymentWallet = async (
  tokenAddress: string, 
  amount: bigint, 
  chainId: string, 
  signer: ethers.Signer
): Promise<{ success: boolean; txHash: string; paymentWallet: string }> => {
  try {
    // Fetch payment wallet from backend (authoritative source)
    const paymentWallet = await getPaymentWalletFromBackend(chainId, 'evm');
    
    // Validate we got a real address, not zero address
    if (!paymentWallet || paymentWallet === '0x0000000000000000000000000000000000000000') {
      throw new Error('Payment wallet not configured. Please contact support.');
    }
    
    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
    
    const tx = await contract.transfer(paymentWallet, amount);
    await tx.wait();
    
    return {
      success: true,
      txHash: tx.hash,
      paymentWallet
    };
  } catch (error) {
    const err = error as Error;
    logger.error('Error transferring to payment wallet', { error: err.message });
    throw new Error(`Failed to transfer tokens: ${err.message}`);
  }
};

export const verifyPayment = async (
  txHash: string, 
  walletAddress: string, 
  tokenSymbol: string, 
  amount: string, 
  chainId: string, 
  walletType: string = 'evm'
): Promise<{ success: boolean; credits?: number; message?: string }> => {
  try {
    // Fetch payment wallet from backend
    const paymentWallet = await getPaymentWalletFromBackend(chainId, walletType);
    
    const response = await fetch(`${API_URL}/api/payments/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        txHash,
        walletAddress,
        tokenSymbol,
        amount: parseFloat(amount),
        chainId,
        walletType,
        paymentWallet
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
    const err = error as Error;
    logger.error('Error verifying payment', { error: err.message });
    throw new Error(`Payment verification failed: ${err.message}`);
  }
};

export const getPaymentConfig = (): PaymentConfigType => {
  validatePaymentConfig();
  return PAYMENT_CONFIG;
};
