// @ts-nocheck
// TODO: This file needs refactoring for Solana library v2 API changes
// and proper TypeScript typing for complex wallet interactions
import React, { useState, useEffect, useCallback } from 'react';
import { useSimpleWallet } from '../contexts/SimpleWalletContext';
import { useAccount, useSwitchChain, useChainId } from 'wagmi';
import { ethers } from 'ethers';
import logger from '../utils/logger';
import { API_URL, apiFetch } from '../utils/apiConfig';
import { getPaymentWalletFromBackend } from '../services/paymentService';
import { getLatestBlockhash as proxyGetBlockhash, getAccountInfo as proxyGetAccountInfo } from '../services/rpcProxyService';
import { X, Coins, RefreshCw, Check } from 'lucide-react';

interface TokenPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  prefilledAmount?: string | null;
  onSuccess?: (() => void) | null;
}

/* eslint-disable @typescript-eslint/no-unused-vars */
// Reserved for future token selector feature
interface TokenConfig {
  symbol: string;
  name: string;
  creditRate: number;
  minAmount: number;
  decimals: number;
  address?: string;
}

interface NetworkBalance {
  balance: number;
  network: string;
  chainId: number;
}

interface NetworkWithUSDC {
  chainId: number;
  name: string;
  usdcAddress: string;
  balance: number;
}
/* eslint-enable @typescript-eslint/no-unused-vars */

// Window interface for Solana wallets (still needed for Solana payments)
declare global {
  interface Window {
    phantom?: {
      solana?: {
        isPhantom?: boolean;
        isConnected?: boolean;
        publicKey?: { toString: () => string };
        connect: () => Promise<{ publicKey: { toString: () => string } }>;
        signAndSendTransaction: (tx: unknown, opts?: unknown) => Promise<unknown>;
      };
    };
    solana?: {
      isPhantom?: boolean;
      isConnected?: boolean;
      publicKey?: { toString: () => string };
      connect: () => Promise<{ publicKey: { toString: () => string } }>;
      signAndSendTransaction: (tx: unknown, opts?: unknown) => Promise<unknown>;
    };
  }
}

const TokenPaymentModal: React.FC<TokenPaymentModalProps> = ({ isOpen, onClose, prefilledAmount = null, onSuccess = null }) => {
  const { 
    address, 
    credits, 
    fetchCredits,
    setCreditsManually,
    walletType
  } = useSimpleWallet();

  // Wagmi hooks for EVM wallet interaction
  const { connector } = useAccount();
  const wagmiChainId = useChainId();
  const { switchChainAsync } = useSwitchChain();

  const [selectedToken, setSelectedToken] = useState(null);
  const [amount, setAmount] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [_availableTokens, setAvailableTokens] = useState([]);
  const [tokenBalances, setTokenBalances] = useState({});
  const [_showTokenSelector, setShowTokenSelector] = useState(false);
  const [error, setError] = useState('');
  const [_checkingPayment, setCheckingPayment] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState(''); // 'pending', 'detected', 'confirmed'
  const [networksWithUSDC, setNetworksWithUSDC] = useState([]);
  const [currentNetworkBalance, setCurrentNetworkBalance] = useState(0);
  const [currentChainId, setCurrentChainId] = useState<number | null>(null);

  // Get EVM provider from wagmi connector
  const getEvmProvider = useCallback(async () => {
    if (walletType !== 'evm' || !connector) {
      throw new Error('EVM wallet not connected');
    }
    const provider = await connector.getProvider();
    if (!provider) {
      throw new Error('Could not get wallet provider');
    }
    return provider as { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };
  }, [connector, walletType]);

  // Network detection and chain ID mapping
  const CHAIN_IDS: Record<number, { name: string; symbol: string; decimals: number }> = {
    1: { name: 'Ethereum', symbol: 'ETH', decimals: 18 },
    137: { name: 'Polygon', symbol: 'MATIC', decimals: 18 },
    42161: { name: 'Arbitrum', symbol: 'ETH', decimals: 18 },
    10: { name: 'Optimism', symbol: 'ETH', decimals: 18 },
    8453: { name: 'Base', symbol: 'ETH', decimals: 18 }
  };

  // Get current network info using wagmi
  const getCurrentNetwork = useCallback(async () => {
    try {
      if (walletType === 'evm') {
        const chainIdNumber = wagmiChainId;
        const network = CHAIN_IDS[chainIdNumber];
        
        logger.debug('Current network detected', { network: network?.name, chainId: chainIdNumber });
        return { chainId: chainIdNumber, network };
      }
      return null;
    } catch (error) {
      logger.error('Error getting current network', { error: error instanceof Error ? error.message : 'Unknown' });
      return null;
    }
  }, [walletType, wagmiChainId]);

  // Build and send Solana USDC transaction
  const buildSolanaUSDCTransaction = async (amount: number, paymentAddress: string) => {
    try {
      if (!window.solana || !window.solana.isPhantom) {
        throw new Error('Phantom wallet not found');
      }

      const { PublicKey, Transaction } = await import('@solana/web3.js');
      const { 
        createTransferInstruction, 
        createAssociatedTokenAccountInstruction,
        getAssociatedTokenAddressSync,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      } = await import('@solana/spl-token');

      // Test backend proxy connection first - all RPC calls go through proxy to avoid CORS/403 issues
      logger.debug('Testing backend Solana RPC proxy...');
      try {
        await proxyGetBlockhash();
        logger.debug('Backend proxy working - using proxy for all Solana RPC calls');
      } catch (proxyError) {
        const errMsg = proxyError instanceof Error ? proxyError.message : 'Unknown error';
        logger.error('Backend Solana RPC proxy failed', { error: errMsg });
        throw new Error(`Solana RPC proxy unavailable: ${errMsg}. Please ensure the backend server is running.`);
      }
      
      // USDC mint address on Solana
      const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
      
      // Get user's public key
      if (!address) throw new Error('Wallet address not available');
      const userPublicKey = new PublicKey(address);
      const paymentPublicKey = new PublicKey(paymentAddress);
      
      // Get user's USDC token account address (associated token account)
      const userTokenAccount = getAssociatedTokenAddressSync(USDC_MINT, userPublicKey);
      
      // Get payment wallet's USDC token account address
      const paymentTokenAccount = getAssociatedTokenAddressSync(USDC_MINT, paymentPublicKey);
      
      logger.debug('Checking token accounts via proxy');
      
      // Check if user has USDC token account - use proxy to avoid CORS/403 issues
      try {
        const userAccountInfo = await proxyGetAccountInfo(userTokenAccount.toBase58());
        if (userAccountInfo) {
          logger.debug('User has USDC token account');
        } else {
          throw new Error('Account not found');
        }
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        logger.error('User USDC token account not found', { error: errMsg });
        throw new Error('USDC token account not found. Please add USDC to your wallet first.');
      }
      
      // Check if payment token account exists, create instruction if needed - use proxy
      let paymentTokenAccountExists = false;
      try {
        const paymentAccountInfo = await proxyGetAccountInfo(paymentTokenAccount.toBase58());
        if (paymentAccountInfo) {
          paymentTokenAccountExists = true;
          logger.debug('Payment token account exists');
        } else {
          logger.debug('Payment token account does not exist, will create it');
          paymentTokenAccountExists = false;
        }
      } catch (error) {
        logger.debug('Payment token account does not exist, will create it');
        paymentTokenAccountExists = false;
      }
      
      // Convert amount to USDC units (6 decimals)
      const amountInUSDC = BigInt(Math.floor(parseFloat(amount) * 1000000));
      logger.debug('Preparing USDC transfer', { amount });
      
      // Create transaction
      const transaction = new Transaction();
      
      // Add instruction to create payment token account if it doesn't exist
      if (!paymentTokenAccountExists) {
        logger.debug('Adding createAssociatedTokenAccount instruction');
        const createATAInstruction = createAssociatedTokenAccountInstruction(
          userPublicKey,           // payer (user pays for account creation)
          paymentTokenAccount,     // associated token account address to create
          paymentPublicKey,        // owner of the token account
          USDC_MINT,               // USDC mint
          TOKEN_PROGRAM_ID,        // token program
          ASSOCIATED_TOKEN_PROGRAM_ID // associated token program
        );
        transaction.add(createATAInstruction);
        logger.debug('Added createATA instruction');
      }
      
      // Create and add transfer instruction
      logger.debug('Adding transfer instruction');
      const transferInstruction = createTransferInstruction(
        userTokenAccount,    // source
        paymentTokenAccount, // destination
        userPublicKey,       // owner (authority)
        amountInUSDC         // amount
      );
      transaction.add(transferInstruction);
      
      // Get recent blockhash via backend proxy (avoids CORS issues)
      logger.debug('Getting recent blockhash via proxy');
      const blockHashResult = await proxyGetBlockhash();
      const blockhash = blockHashResult.blockhash;
      // lastValidBlockHeight available if needed: blockHashResult.lastValidBlockHeight
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = userPublicKey;
      
      logger.debug('Signing transaction', { instructionCount: transaction.instructions.length });
      
      // Check if wallet is connected
      if (!window.solana.isConnected) {
        throw new Error('Wallet is not connected. Please connect your wallet first.');
      }
      
      // Check if public key matches
      const currentPublicKey = window.solana?.publicKey;
      if (!currentPublicKey || currentPublicKey.toString() !== address) {
        logger.warn('Wallet public key mismatch, reconnecting');
        await window.solana?.connect();
        if (window.solana?.publicKey?.toString() !== address) {
          throw new Error('Wallet address mismatch. Please reconnect with the correct wallet.');
        }
      }
      
      // Sign and send transaction - Phantom returns signature as string
      let signature = null;
      try {
        const result = await window.solana.signAndSendTransaction(transaction, {
          skipPreflight: false,
          maxRetries: 3
        });
        
        logger.debug('Solana transaction result received', { resultType: typeof result });
        
        // Phantom wallet typically returns signature as base58 string directly
        // But handle all possible formats
        if (typeof result === 'string') {
          signature = result;
        } else if (result && typeof result === 'object') {
          const txResult = result as Record<string, unknown>;
          // Try signature property first (most common)
          if (txResult.signature) {
            if (typeof txResult.signature === 'string') {
              signature = txResult.signature;
            } else if (txResult.signature && typeof (txResult.signature as { toString?: () => string }).toString === 'function') {
              signature = (txResult.signature as { toString: () => string }).toString();
            }
          }
          // Try pubkey property (some Phantom versions return signature in pubkey)
          if (!signature && txResult.pubkey) {
            if (typeof txResult.pubkey === 'string') {
              signature = txResult.pubkey;
            } else if (txResult.pubkey && typeof (txResult.pubkey as { toString?: () => string }).toString === 'function') {
              signature = (txResult.pubkey as { toString: () => string }).toString();
            }
          }
          // Try value property
          if (!signature && result.value) {
            if (typeof result.value === 'string') {
              signature = result.value;
            } else if (result.value.toString) {
              signature = result.value.toString();
            }
          }
          // Try txid property (some wallets use this)
          if (!signature && result.txid) {
            if (typeof result.txid === 'string') {
              signature = result.txid;
            } else if (result.txid.toString) {
              signature = result.txid.toString();
            }
          }
        }
        
        if (signature) {
          logger.debug('Transaction signature extracted');
          return signature;
        } else {
          logger.error('Could not extract signature from transaction result');
          throw new Error('Invalid transaction result: no signature found. Result: ' + JSON.stringify(result));
        }
      } catch (signError) {
        logger.error('Error signing/sending transaction', { error: signError.message });
        
        // Provide better error messages
        if (signError.code === 4001 || signError.code === -32603) {
          throw new Error('User rejected the transaction');
        } else if (signError.message && signError.message.includes('insufficient')) {
          throw new Error('Insufficient funds for transaction');
        } else if (signError.message && signError.message.includes('token account')) {
          throw new Error('USDC token account not found. Please add USDC to your wallet first.');
        } else {
          throw new Error(`Transaction failed: ${signError.message || signError.toString()}`);
        }
      }
      
    } catch (error) {
      logger.error('Error building Solana transaction', { error: error.message });
      throw error;
    }
  };

  // Load available tokens and payment address when modal opens
  useEffect(() => {
    if (isOpen) {
      // Reset state when modal opens
      setError('');
      setPaymentStatus('');
      setCheckingPayment(false);
      setIsProcessing(false);
      
      // Set prefilled amount if provided, otherwise reset
      if (prefilledAmount) {
        setAmount(prefilledAmount);
      } else {
        setAmount('');
      }
      
      // Lock body scroll when modal is open
      const originalStyle = window.getComputedStyle(document.body).overflow;
      document.body.style.overflow = 'hidden';
      
      // Only show USDC token - no native tokens
      const usdcToken = {
        symbol: 'USDC',
        name: 'USD Coin',
        creditRate: 10, // 1 USDC = 10 credits
        minAmount: 1,
        decimals: 6
      };
      
      setAvailableTokens([usdcToken]);
      setSelectedToken(usdcToken);
      
      // Cleanup: restore body scroll when modal closes
      return () => {
        document.body.style.overflow = originalStyle;
      };
    }
  }, [isOpen, prefilledAmount]);


  // Load token balances when token is selected
  useEffect(() => {
    if (selectedToken && address) {
      loadTokenBalance(selectedToken);
    }
  }, [selectedToken, address]);

  const loadTokenBalance = async (token) => {
    try {
      if (walletType === 'evm' && connector) {
        // Check USDC balance across all supported EVM networks
        await checkUSDCBalanceAcrossNetworks();
      } else if (walletType === 'solana' && address) {
        // Fetch actual Solana USDC balance
        await checkSolanaUSDCBalance();
      } else {
        // Fallback - set placeholder
        setTokenBalances(prev => ({
          ...prev,
          [token.symbol]: '0.0'
        }));
      }
    } catch (error) {
      logger.error('Error loading token balance', { error: error instanceof Error ? error.message : 'Unknown' });
    }
  };

  // Check Solana USDC balance
  const checkSolanaUSDCBalance = async () => {
    try {
      const { PublicKey } = await import('@solana/web3.js');
      const { getAssociatedTokenAddressSync } = await import('@solana/spl-token');
      
      // USDC mint address on Solana
      const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
      const userPublicKey = new PublicKey(address);
      
      // Get user's USDC token account address
      const userTokenAccount = getAssociatedTokenAddressSync(USDC_MINT, userPublicKey);
      
      logger.debug('Checking Solana USDC balance', { tokenAccount: userTokenAccount.toBase58() });
      
      // Use proxy to get token balance
      const balanceResult = await proxyGetTokenAccountBalance(userTokenAccount.toBase58());
      
      if (balanceResult) {
        const balance = balanceResult.uiAmount || 0;
        logger.debug('Solana USDC balance', { balance });
        
        setTokenBalances(prev => ({
          ...prev,
          solana: {
            balance: balance,
            network: 'Solana',
            chainId: 'solana'
          }
        }));
        setCurrentNetworkBalance(balance);
      } else {
        // No token account found - balance is 0
        logger.debug('No Solana USDC token account found');
        setTokenBalances(prev => ({
          ...prev,
          solana: {
            balance: 0,
            network: 'Solana',
            chainId: 'solana'
          }
        }));
        setCurrentNetworkBalance(0);
      }
    } catch (error) {
      logger.error('Error checking Solana USDC balance', { error: error.message });
      // Set balance to 0 on error
      setTokenBalances(prev => ({
        ...prev,
        solana: {
          balance: 0,
          network: 'Solana',
          chainId: 'solana'
        }
      }));
      setCurrentNetworkBalance(0);
    }
  };

  // Check USDC balance across all supported EVM networks
  const checkUSDCBalanceAcrossNetworks = async () => {
    try {
      const networks = [
        { chainId: 1, name: 'Ethereum', usdcAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
        { chainId: 137, name: 'Polygon', usdcAddress: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174' },
        { chainId: 42161, name: 'Arbitrum', usdcAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' }, // Native USDC
        { chainId: 10, name: 'Optimism', usdcAddress: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85' }, // Native USDC
        { chainId: 8453, name: 'Base', usdcAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' } // Native USDC
      ];

      const usdcABI = [
        "function balanceOf(address owner) view returns (uint256)",
        "function decimals() view returns (uint8)"
      ];

      const balances = {};
      let currentNetworkBalance = 0;
      let networksWithUSDC = [];

      // Check current network first
      const currentNetworkInfo = await getCurrentNetwork();
      const currentChainId = currentNetworkInfo?.chainId || null;
      
      for (const network of networks) {
        try {
          let formattedBalance;
          
          // Try backend proxy first (avoids CORS issues in production)
          try {
            const proxyBalance = await proxyGetUsdcBalance(network.chainId, address, network.usdcAddress);
            formattedBalance = parseFloat(proxyBalance);
          } catch (proxyError) {
            // Fall back to direct RPC call
            logger.debug('Proxy balance check failed, trying direct', { network: network.name, error: proxyError.message });
            const provider = new ethers.JsonRpcProvider(getRPCUrl(network.chainId));
            const contract = new ethers.Contract(network.usdcAddress, usdcABI, provider);
            
            const [balance, decimals] = await Promise.all([
              contract.balanceOf(address),
              contract.decimals()
            ]);
            
            formattedBalance = parseFloat(ethers.formatUnits(balance, decimals));
          }
          
          balances[network.chainId] = {
            balance: formattedBalance,
            network: network.name,
            chainId: network.chainId
          };

          if (formattedBalance > 0) {
            networksWithUSDC.push({
              ...network,
              balance: formattedBalance
            });
          }

          if (network.chainId === currentChainId) {
            currentNetworkBalance = formattedBalance;
          }
        } catch (error) {
          logger.warn('Could not check balance on network', { network: network.name, error: error.message });
        }
      }

      setTokenBalances(balances);
      setCurrentNetworkBalance(currentNetworkBalance);
      setNetworksWithUSDC(networksWithUSDC);
      setCurrentChainId(currentChainId);

      // No auto-switching - let user choose their preferred network
      // Network selector is shown when user has USDC on multiple chains
    } catch (error) {
      logger.error('Error checking USDC balance across networks', { error: error.message });
    }
  };

  // Get RPC URL for different networks - requires environment variables (no hardcoded fallbacks)
  const getRPCUrl = (chainId) => {
    if (!chainId) {
      const defaultRpc = import.meta.env.VITE_ETH_RPC_URL;
      if (!defaultRpc) {
        throw new Error('VITE_ETH_RPC_URL environment variable is required. Please configure it in your .env file.');
      }
      return defaultRpc;
    }
    
    const rpcUrls = {
      1: import.meta.env.VITE_ETH_RPC_URL,
      137: import.meta.env.VITE_POLYGON_RPC_URL,
      42161: import.meta.env.VITE_ARBITRUM_RPC_URL,
      10: import.meta.env.VITE_OPTIMISM_RPC_URL,
      8453: import.meta.env.VITE_BASE_RPC_URL
    };
    
    const rpcUrl = rpcUrls[chainId] || import.meta.env.VITE_ETH_RPC_URL;
    if (!rpcUrl) {
      throw new Error(`RPC URL not configured for chain ${chainId}. Please set the corresponding VITE_*_RPC_URL environment variable.`);
    }
    return rpcUrl;
  };

  // Switch to a specific network using wagmi
  const switchToNetwork = useCallback(async (chainId: number) => {
    try {
      logger.info('Requesting network switch via wagmi', { chainId });
      
      await switchChainAsync({ chainId });

      logger.info('Network switch successful', { chainId });
      
      // Refresh balances after switching
      setTimeout(() => {
        checkUSDCBalanceAcrossNetworks();
      }, 1000);

    } catch (switchError: unknown) {
      const error = switchError as { code?: number; message?: string };
      if (error.code === 4001) {
        // User rejected the switch
        logger.warn('User rejected network switch');
        setError(`Network switch cancelled. Please switch to a network with USDC to continue.`);
      } else {
        logger.error('Failed to switch network', { error: error.message, code: error.code });
        setError(`Failed to switch network: ${error.message}`);
      }
    }
  }, [switchChainAsync]);

  // Add network if it doesn't exist - wagmi handles this via switchChainAsync
  // Keeping for backwards compatibility but wagmi's switchChain should handle adding
  const addNetwork = useCallback(async (chainId: number) => {
    const networkConfigs: Record<number, { chainId: string; chainName: string; nativeCurrency: { name: string; symbol: string; decimals: number }; rpcUrls: string[]; blockExplorerUrls: string[] }> = {
      1: {
        chainId: '0x1',
        chainName: 'Ethereum Mainnet',
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        rpcUrls: ['https://eth.llamarpc.com'],
        blockExplorerUrls: ['https://etherscan.io']
      },
      137: {
        chainId: '0x89',
        chainName: 'Polygon',
        nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
        rpcUrls: ['https://polygon.llamarpc.com'],
        blockExplorerUrls: ['https://polygonscan.com']
      },
      42161: {
        chainId: '0xa4b1',
        chainName: 'Arbitrum One',
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        rpcUrls: ['https://arbitrum.llamarpc.com'],
        blockExplorerUrls: ['https://arbiscan.io']
      },
      10: {
        chainId: '0xa',
        chainName: 'Optimism',
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        rpcUrls: ['https://optimism.llamarpc.com'],
        blockExplorerUrls: ['https://optimistic.etherscan.io']
      },
      8453: {
        chainId: '0x2105',
        chainName: 'Base',
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        rpcUrls: ['https://base.llamarpc.com'],
        blockExplorerUrls: ['https://basescan.org']
      }
    };
    
    const config = networkConfigs[chainId];
    if (!config) {
      throw new Error(`Network configuration not found for chain ID ${chainId}`);
    }

    const provider = await getEvmProvider();
    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [config],
    });
  }, [getEvmProvider]);

  const handleTokenSelect = (token) => {
    setSelectedToken(token);
    setShowTokenSelector(false);
    setAmount('');
    setError('');
  };

  const handleAmountChange = (value) => {
    setAmount(value);
    setError('');
  };

  const validateAmount = () => {
    if (!selectedToken || !amount) {
      setError('Please select a token and enter an amount');
      return false;
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('Please enter a valid amount');
      return false;
    }

    // Simplified validation
    if (numAmount <= 0) {
      setError('Amount must be greater than 0');
      return false;
    }

    return true;
  };


  const handleSendTransaction = async () => {
    logger.debug('handleSendTransaction called', { 
      amount, 
      walletType, 
      address,
      isConnected: !!address 
    });
    
    if (!amount) {
      logger.debug('Missing amount');
      setError('Please enter an amount');
      return;
    }
    
    if (!address) {
      logger.debug('No wallet connected');
      setError('Please connect your wallet first');
      return;
    }
    
    if (!walletType) {
      logger.debug('No wallet type detected');
      setError('Wallet type not detected. Please reconnect your wallet');
      return;
    }
    
    try {
      setIsProcessing(true);
      setError('');
      
      logger.debug('Processing transaction', { walletType });
      
      // Ensure wallet is still connected and working
      if (walletType === 'solana') {
        if (!window.solana || !window.solana.isPhantom) {
          throw new Error('Phantom wallet not found. Please install Phantom wallet and refresh the page.');
        }
        
        // Check if wallet is connected
        if (!window.solana.isConnected) {
          logger.debug('Reconnecting to Phantom');
          try {
            const response = await window.solana.connect();
            if (!response || !response.publicKey) {
              throw new Error('Failed to connect to Phantom wallet. Please unlock your wallet and try again.');
            }
          } catch (connectError) {
            throw new Error(`Failed to connect to Phantom wallet: ${connectError.message}`);
          }
        }
        
        // Verify the connected account matches the expected address
        if (window.solana.publicKey && window.solana.publicKey.toString() !== address) {
          logger.warn('Wallet address mismatch, updating');
          // This shouldn't happen in normal flow, but handle gracefully
        }
      } else {
        // Verify EVM wallet is connected via wagmi
        if (!connector) {
          throw new Error('EVM wallet not found. Please refresh and reconnect.');
        }
        
        // Test if we can get accounts
        try {
          const provider = await getEvmProvider();
          const accounts = await provider.request({ method: 'eth_accounts' }) as string[];
          if (!accounts || accounts.length === 0) {
            throw new Error('No accounts found. Please reconnect your wallet.');
          }
        } catch (e) {
          throw new Error('Wallet connection lost. Please reconnect your wallet.');
        }
        
        // IMPORTANT: Check if user has USDC on current network BEFORE attempting transaction
        // This prevents confusing errors when user has USDC on different network
        const amountNeeded = parseFloat(amount);
        if (currentNetworkBalance < amountNeeded && networksWithUSDC.length > 0) {
          // User has USDC on other networks but not enough on current network
          const currentNetworkInfo = await getCurrentNetwork();
          const currentChainName = currentNetworkInfo?.network?.name || 'current network';
          const otherNetworksWithBalance = networksWithUSDC.filter(n => n.balance >= amountNeeded);
          
          if (otherNetworksWithBalance.length > 0) {
            const networkSuggestions = otherNetworksWithBalance
              .map(n => `${n.name} (${n.balance.toFixed(2)} USDC)`)
              .join(', ');
            
            setError(`⚠️ You have ${currentNetworkBalance.toFixed(2)} USDC on ${currentChainName}, but need ${amountNeeded.toFixed(2)} USDC.\n\n✨ Switch to a network with enough USDC:\n${networkSuggestions}\n\nUse the network buttons above to switch.`);
            setIsProcessing(false);
            return;
          }
        }
      }
      
      if (walletType === 'solana') {
        logger.debug('Processing Solana USDC payment');
        
        try {
          // Test backend proxy connection - all RPC calls go through proxy to avoid CORS/403 issues
          logger.debug('Testing backend Solana RPC proxy for payment...');
          try {
            await proxyGetBlockhash();
            logger.debug('Backend proxy working - using proxy for Solana RPC calls');
          } catch (proxyError) {
            logger.error('Backend Solana RPC proxy failed', { error: proxyError.message });
            throw new Error(`Solana RPC proxy unavailable: ${proxyError.message}. Please ensure the backend server is running.`);
          }
          
          // Build and send Solana USDC transaction
          // Fetch payment address from backend (authoritative source)
          const solanaPaymentAddress = await getPaymentWalletFromBackend('solana', 'solana');
          
          if (!solanaPaymentAddress) {
            throw new Error('Payment wallet not configured. Please contact support.');
          }
          
          const txSignature = await buildSolanaUSDCTransaction(amount, solanaPaymentAddress);
          
          logger.info('Solana transaction signed', { txSignature });
          setError(`⏳ Transaction submitted! Signature: ${txSignature}\n\nWaiting for confirmation...`);
          
          // Wait for confirmation
          logger.debug('Waiting for Solana transaction confirmation');
          let confirmed = false;
          let attempts = 0;
          const maxAttempts = 20; // Wait up to 20 seconds
          
          while (!confirmed && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
            attempts++;
            
            // Get signature status via proxy
            const statusValue = await proxyGetSignatureStatus(txSignature);
            
            if (statusValue?.confirmationStatus === 'confirmed' || statusValue?.confirmationStatus === 'finalized') {
              if (statusValue.err) {
                throw new Error('Transaction failed on blockchain');
              }
              confirmed = true;
              break;
            }
          }
          
          if (!confirmed) {
            throw new Error('Transaction confirmation timeout');
          }
          
          // Verify payment and add credits (uses /verify endpoint which doesn't require JWT)
          try {
            const verifyResponse = await apiFetch(`${API_URL}/api/payments/verify`, {
              method: 'POST',
              body: JSON.stringify({
                txHash: txSignature,
                walletAddress: address,
                tokenSymbol: 'USDC',
                amount: parseFloat(amount),
                chainId: 'solana',
                walletType: 'solana'
              })
            });
            
            const verifyData = await verifyResponse.json();
            
            if (verifyData.success) {
              logger.info('Credits added successfully', { credits: verifyData.credits, totalCredits: verifyData.totalCredits });
              setError(`✅ Payment confirmed! ${verifyData.credits} credits added. New balance: ${verifyData.totalCredits} credits.`);
              setPaymentStatus('confirmed');
              
              // Optimistically update credits immediately
              const newTotal = (typeof verifyData.totalCredits !== 'undefined')
                ? Number(verifyData.totalCredits)
                : Number(credits || 0) + Number(verifyData.credits || 0);
              if (!Number.isNaN(newTotal)) {
                setCreditsManually(newTotal);
              }

              // Refresh user credits immediately (skip cache to get fresh data)
              fetchCredits(address, 3, true).catch(() => {});
              
              // Call onSuccess callback if provided
              if (onSuccess) {
                onSuccess();
              }
              
              setTimeout(() => {
                onClose();
              }, 2000);
            } else {
              throw new Error(verifyData.error || 'Failed to verify and credit');
            }
          } catch (verifyError) {
            logger.error('Error verifying payment:', { error: verifyError.message, txSignature });
            setError(`Transaction confirmed but verification failed: ${verifyError.message}`);
          }
          
        } catch (solanaError) {
          logger.error('Solana transaction failed:', { error: solanaError.message });
          
          // Show specific error message
          let errorMessage = 'Solana transaction failed. ';
          if (solanaError.message.includes('User rejected')) {
            errorMessage += 'Transaction was cancelled by user.';
          } else if (solanaError.message.includes('Insufficient funds')) {
            errorMessage += 'Insufficient USDC balance. Please add USDC to your wallet.';
          } else if (solanaError.message.includes('token account not found')) {
            errorMessage += 'USDC token account not found. Please add USDC to your wallet first.';
          } else if (solanaError.message.includes('Phantom wallet not found')) {
            errorMessage += 'Phantom wallet not found. Please install and connect Phantom wallet.';
          } else if (solanaError.message.includes('RPC') || solanaError.message.includes('endpoints')) {
            errorMessage += `RPC connection issue: ${solanaError.message}`;
          } else {
            errorMessage += `Error: ${solanaError.message}`;
          }
          
          setError(errorMessage);
        }
      } else {
        
        try {
          // Get provider from wagmi connector - handles all wallet types automatically
          const provider = await getEvmProvider();
          
          // Get current network info using wagmi's chain ID
          const chainId = wagmiChainId;
          const network = CHAIN_IDS[chainId];
          
          logger.debug('Network detection', { chainId, network: network?.name });
          
          if (!chainId || !network) {
            throw new Error(`Unsupported network (Chain ID: ${chainId}). Please switch to Base, Ethereum, Polygon, Arbitrum, or Optimism.`);
          }
          
          const ethersProvider = new ethers.BrowserProvider(provider);
          const signer = await ethersProvider.getSigner();
          
          // IMPORTANT: Get the actual signer address (in case user switched accounts)
          const signerAddress = await signer.getAddress();
          if (signerAddress.toLowerCase() !== address.toLowerCase()) {
            logger.warn('Wallet address mismatch detected', { context: address, signer: signerAddress });
            // Use the actual signer address for the transaction
            setError(`⚠️ Wallet account changed! Please reconnect your wallet or refresh the page.\n\nExpected: ${address.slice(0,8)}...\nCurrent: ${signerAddress.slice(0,8)}...`);
            return;
          }
          
          // USDC contract addresses for different networks (MUST match backend TOKEN_ADDRESSES)
          const USDC_CONTRACTS = {
            1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // Ethereum USDC
            137: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', // Polygon
            42161: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // Arbitrum - Native USDC
            10: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', // Optimism - Native USDC
            8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' // Base
          };
          
          const usdcAddress = USDC_CONTRACTS[chainId];
          if (!usdcAddress) {
            throw new Error(`USDC not supported on ${network.name}. Please switch to Ethereum, Polygon, Arbitrum, Optimism, or Base.`);
          }
          
          // USDC ABI (minimal for transfer)
          const usdcABI = [
            "function transfer(address to, uint256 amount) returns (bool)",
            "function balanceOf(address owner) view returns (uint256)",
            "function decimals() view returns (uint8)",
            "function symbol() view returns (string)"
          ];
          
          const usdcContract = new ethers.Contract(usdcAddress, usdcABI, signer);
          
          // Check USDC balance - use backend proxy first for reliability, fallback to direct RPC
          const balanceCheckAddress = signerAddress || address;
          logger.debug('Checking USDC balance', { address: balanceCheckAddress, usdcContract: usdcAddress, chainId, network: network?.name });
          
          let balanceFloat;
          try {
            // Try backend proxy first (more reliable in production)
            const proxyBalance = await proxyGetUsdcBalance(chainId, balanceCheckAddress, usdcAddress);
            balanceFloat = parseFloat(proxyBalance);
            logger.debug('USDC balance from proxy', { balance: balanceFloat, chainId, network: network?.name });
          } catch (proxyError) {
            logger.warn('Proxy balance check failed, trying direct RPC', { error: proxyError.message });
            
            // Fall back to direct contract call via wallet
            try {
              const balance = await usdcContract.balanceOf(balanceCheckAddress);
              const decimals = await usdcContract.decimals();
              const balanceFormatted = ethers.formatUnits(balance, decimals);
              balanceFloat = parseFloat(balanceFormatted);
              logger.debug('USDC balance from direct RPC', { balance: balanceFloat, chainId, network: network?.name });
            } catch (balanceError) {
              logger.error('Failed to check USDC balance', { error: balanceError.message, chainId, usdcAddress });
              
              // Check if the wallet is on the wrong network
              if (balanceError.message.includes('BAD_DATA') || balanceError.message.includes('0x')) {
                throw new Error(`Cannot read USDC balance on ${network?.name || 'this network'}.\n\nThis usually means:\n1. Your wallet is on a different network than expected\n2. The USDC contract doesn't exist on this network\n\nPlease switch your wallet to ${network?.name || 'a supported network'}, then try again.`);
              }
              throw balanceError;
            }
          }
          
          const amountFloat = parseFloat(amount);
          
          logger.debug('USDC balance check complete', { 
            balance: balanceFloat, 
            requesting: amountFloat,
            sufficient: balanceFloat >= amountFloat,
            chainId,
            network: network?.name
          });
          
          if (balanceFloat < amountFloat) {
            throw new Error(`Insufficient USDC balance on ${network?.name || 'this network'}.\n\nYour balance: ${balanceFloat.toFixed(6)} USDC\nRequested: ${amountFloat.toFixed(2)} USDC\n\nPlease add more USDC or switch to a network where you have sufficient USDC.`);
          }
          
          // Convert amount to USDC units (6 decimals)
          // Ensure amount is a valid number string
          const amountStr = String(amount).trim();
          if (!amountStr || isNaN(parseFloat(amountStr)) || parseFloat(amountStr) <= 0) {
            throw new Error(`Invalid amount: "${amount}". Please enter a valid amount.`);
          }
          
          const amountWei = ethers.parseUnits(amountStr, 6);
          
          // Verify the amount is not zero
          if (amountWei === 0n) {
            throw new Error('Amount cannot be zero. Please enter a valid amount.');
          }
          
          logger.info('USDC amount conversion', { 
            inputAmount: amount, 
            amountStr,
            amountWei: amountWei.toString(),
            amountFloat: parseFloat(amountStr)
          });
          
          // Fetch payment address from backend (authoritative source)
          const paymentAddress = await getPaymentWalletFromBackend(String(chainId), 'evm');
          
          if (!paymentAddress || paymentAddress === '0x0000000000000000000000000000000000000000') {
            throw new Error('Payment wallet not configured. Please contact support.');
          }
          
          logger.info('Building USDC transaction', { 
            amount: amountStr, 
            amountWei: amountWei.toString(),
            paymentAddress,
            chainId,
            network: network?.name
          });
          
          // Build the transaction data manually (this approach worked in previous versions)
          const txData = usdcContract.interface.encodeFunctionData('transfer', [paymentAddress, amountWei]);
          
          // Get gas estimate
          const gasEstimate = await usdcContract.transfer.estimateGas(paymentAddress, amountWei);
          const feeData = await ethersProvider.getFeeData();
          
          logger.debug('Gas estimation', { 
            gasEstimate: gasEstimate.toString(),
            gasPrice: feeData.gasPrice?.toString()
          });
          
          // Build transaction object (matching old working version exactly)
          const transaction = {
            to: usdcAddress,
            from: address,
            data: txData,
            gasLimit: gasEstimate,
            gasPrice: feeData.gasPrice,
            value: 0n // ethers v6 requires bigint
          };
          
          logger.info('Sending transaction', {
            to: transaction.to,
            gasLimit: transaction.gasLimit.toString(),
            gasPrice: transaction.gasPrice?.toString()
          });
          
          // Send transaction to wallet
          const tx = await signer.sendTransaction(transaction);
          
          setError(`⏳ Transaction submitted! Hash: ${tx.hash}\n\nWaiting for confirmation...`);
          
          // Wait for transaction confirmation
          const receipt = await tx.wait();
          
          if (receipt.status === 1) {
            
            // Verify payment and add credits (uses /verify endpoint which doesn't require JWT)
            try {
              const verifyResponse = await apiFetch(`${API_URL}/api/payments/verify`, {
                method: 'POST',
                body: JSON.stringify({
                  txHash: tx.hash,
                  walletAddress: address,
                  tokenSymbol: 'USDC',
                  amount: parseFloat(amount),
                  chainId: chainId,
                  walletType: 'evm'
                })
              });
              
              const verifyData = await verifyResponse.json();
              
              if (verifyData.success) {
                setError(`✅ Payment confirmed! ${verifyData.credits} credits added. New balance: ${verifyData.totalCredits} credits.`);
                setPaymentStatus('confirmed');
                
                // Optimistically update credits immediately
                const newTotal = (typeof verifyData.totalCredits !== 'undefined')
                  ? Number(verifyData.totalCredits)
                  : Number(credits || 0) + Number(verifyData.credits || 0);
                if (!Number.isNaN(newTotal)) {
                  setCreditsManually(newTotal);
                }

                // Refresh user credits in background to reconcile
                fetchCredits(address, 3, true).catch(() => {});
                
                // Call onSuccess callback if provided
                if (onSuccess) {
                  onSuccess();
                }
                
                setTimeout(() => {
                  onClose();
                }, 2000);
              } else {
                throw new Error(verifyData.error || 'Failed to verify and credit');
              }
            } catch (verifyError) {
              logger.error('Error verifying payment:', { error: verifyError.message, txHash: tx.hash });
              setError(`Transaction confirmed but verification failed: ${verifyError.message}`);
            }
          } else {
            throw new Error('Transaction failed on blockchain');
          }
          
        } catch (usdcError) {
          logger.error('USDC transaction failed:', { error: usdcError.message });
          
          if (usdcError.code === 4001 || usdcError.message.includes('User rejected') || usdcError.message.includes('user rejected')) {
            setError('Transaction cancelled by user.');
          } else if (usdcError.message.includes('insufficient') || usdcError.message.includes('exceeds balance') || usdcError.message.includes('transfer amount exceeds')) {
            // User-friendly message for insufficient balance
            setError(`❌ Insufficient USDC balance on this network.\n\nPlease add USDC to your wallet or switch to a network where you have USDC.`);
          } else if (usdcError.message.includes('balance')) {
            setError(`❌ Insufficient USDC balance. Please add more USDC to your wallet.`);
          } else {
            setError(`USDC transaction failed: ${usdcError.message}`);
          }
        }
      }
    } catch (error) {
      logger.error('Error sending transaction:', { error: error.message, walletType, amount });
      
      // Show specific error message based on error type
      let errorMessage = 'Transaction failed. ';
      if (error.message.includes('wallet not found')) {
        errorMessage += 'Wallet not found. Please install and connect your wallet.';
      } else if (error.message.includes('No accounts found')) {
        errorMessage += 'No wallet accounts found. Please unlock your wallet and try again.';
      } else if (error.message.includes('User rejected')) {
        errorMessage += 'Transaction was cancelled by user.';
      } else if (error.message.includes('Insufficient funds')) {
        errorMessage += 'Insufficient balance. Please add funds to your wallet.';
      } else {
        errorMessage += `Error: ${error.message}`;
      }
      
      setError(errorMessage + '\n\nAs a fallback, payment address copied to clipboard for manual sending.');
    } finally {
      setIsProcessing(false);
    }
  };

  const checkForPayment = async () => {
    if (!address || !amount) {
      setError('Please enter an amount');
      return;
    }
    
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount < 1) {
      setError('Minimum amount is 1 USDC');
      return;
    }
    
    setCheckingPayment(true);
    setPaymentStatus('pending');
    setError('');
    
    // Get current network to pass to backend
    const networkInfo3 = await getCurrentNetwork();
    const chainId = networkInfo3?.chainId || null;
    
    // Check once for any USDC transfer to payment wallet
    try {
      
      // Use instant-check endpoint to detect ANY USDC transfer
      const response = await fetch(`${API_URL}/api/payment/instant-check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          walletAddress: address,
          expectedAmount: numAmount,
          token: 'USDC',
          chainId: chainId
        })
      });
      
      const data = await response.json();
      
      if (data.success && data.paymentDetected) {
        setPaymentStatus('confirmed');
        setCheckingPayment(false);
        
        // Optimistically update credits immediately
        const optimisticTotal = (typeof data.newBalance !== 'undefined')
          ? Number(data.newBalance)
          : Number(credits || 0) + Number(data.credits || 0);
        if (!Number.isNaN(optimisticTotal)) {
          setCreditsManually(optimisticTotal);
        }

        // Refresh credits immediately (skip cache to get fresh data)
        fetchCredits(address, 3, true).catch(() => {});
        
        const senderInfo = data.senderAddress ? `Sender: ${data.senderAddress}` : '';
        setError(`✅ Payment confirmed! ${data.credits} credits added. New balance: ${data.newBalance} credits. ${senderInfo}`);
        
        // Call onSuccess callback if provided
        if (onSuccess) {
          onSuccess();
        }
        
        setTimeout(() => {
          onClose();
        }, 2000);
      } else {
        setCheckingPayment(false);
        setPaymentStatus('');
        setError('No USDC transfer detected to the payment wallet. Please send the transaction first.');
      }
    } catch (error) {
      logger.error('Error checking payment:', { error: error.message, address, amount });
      setCheckingPayment(false);
      setError('Error checking payment: ' + error.message);
    }
  };

  const handlePayment = async () => {
    // This now sends USDC and automatically checks for it
    await handleSendTransaction();
  };
  
  const stopMonitoring = () => {
    setPaymentStatus('');
    setCheckingPayment(false);
    setError('');
  };

  const getCreditsPreview = () => {
    if (!selectedToken || !amount) return 0;
    
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount)) return 0;
    
    // Everyone gets 16.67 credits per USDC ($0.06 per credit)
    const creditsPerUSDC = 16.67;
    return Math.floor(numAmount * creditsPerUSDC);
  };

  const getTokenBalance = (tokenSymbol) => {
    return tokenBalances[tokenSymbol]?.formattedBalance || '0';
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-[999999] p-4"
      onClick={(e) => {
        // Close on backdrop click
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div 
        className="w-full max-w-md mx-2 sm:mx-0 max-h-[90vh] overflow-hidden flex flex-col rounded"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)',
          border: '2px outset #f0f0f0',
          boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 4px 8px rgba(0, 0, 0, 0.3)'
        }}
      >
        {/* Compact Header */}
        <div 
          className="flex items-center justify-between p-3"
          style={{
            borderBottom: '2px inset #c0c0c0',
            background: 'linear-gradient(to bottom, #d0d0d0, #c0c0c0)'
          }}
        >
          <div className="flex items-center gap-2">
            <div 
              className="w-8 h-8 rounded flex items-center justify-center"
              style={{
                background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)',
                border: '2px outset #f0f0f0',
                boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4)'
              }}
            >
              <Coins className="w-4 h-4" style={{ color: '#000000' }} />
            </div>
            <h2 className="text-base font-semibold" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>Buy Credits</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded transition-all duration-200"
            style={{
              background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)',
              border: '2px outset #f0f0f0',
              boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4)'
            }}
            onMouseDown={(e) => {
              e.currentTarget.style.border = '2px inset #c0c0c0';
              e.currentTarget.style.boxShadow = 'inset 3px 3px 0 rgba(0, 0, 0, 0.25)';
            }}
            onMouseUp={(e) => {
              e.currentTarget.style.border = '2px outset #f0f0f0';
              e.currentTarget.style.boxShadow = 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4)';
            }}
          >
            <X className="w-4 h-4" style={{ color: '#000000' }} />
          </button>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto flex-1" style={{ background: 'linear-gradient(to bottom, #f0f0f0, #e8e8e8)' }}>
          {/* Current Credits - Compact */}
          <div 
            className="p-2.5 rounded"
            style={{
              background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)',
              border: '2px outset #f0f0f0',
              boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)'
            }}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>Current Credits:</span>
              <span className="text-base font-semibold" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>
                {credits}
              </span>
            </div>
          </div>

          {/* Payment Method - Compact */}
          <div 
            className="w-full flex items-center justify-between p-2.5 rounded"
            style={{
              background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)',
              border: '2px outset #f0f0f0',
              boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)'
            }}
          >
            <div className="flex items-center gap-2">
              <div 
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                style={{
                  background: 'linear-gradient(to bottom, #d0d0d0, #c0c0c0)',
                  border: '2px outset #e0e0e0',
                  color: '#000000',
                  textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)'
                }}
              >
                $
              </div>
              <div className="text-left">
                <div className="text-xs font-semibold" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>Pay with USDC</div>
                <div className="text-[10px]" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>{walletType === 'solana' ? 'Solana' : 'EVM Chains'}</div>
              </div>
            </div>
            <div 
              className="px-2 py-0.5 text-[10px] font-semibold rounded"
              style={{
                background: 'linear-gradient(to bottom, #d0f0d0, #c0e0c0)',
                border: '2px outset #e0e0e0',
                color: '#000000',
                textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)'
              }}
            >
              Active
            </div>
          </div>

          {/* Amount Input - Compact */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>
              Amount (USDC)
            </label>
            <div className="relative">
              <input
                type="number"
                value={amount}
                onChange={(e) => handleAmountChange(e.target.value)}
                placeholder="Enter amount"
                className="w-full p-2.5 pr-14 rounded text-sm"
                style={{
                  background: 'linear-gradient(to bottom, #ffffff, #f8f8f8)',
                  border: '2px inset #c0c0c0',
                  boxShadow: 'inset 3px 3px 0 rgba(0, 0, 0, 0.25), inset -1px -1px 0 rgba(255, 255, 255, 0.5)',
                  color: '#000000',
                  textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)'
                }}
                step="0.1"
                min="1"
                id="token-amount-input"
                name="token-amount"
              />
              <div className="absolute right-2.5 top-1/2 transform -translate-y-1/2 text-xs font-semibold" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>
                USDC
              </div>
            </div>
            <div className="text-[10px] mt-1" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>
              Minimum: 1 USDC
            </div>
          </div>

          {/* Credits Preview - Compact */}
          <div 
            className="p-3 rounded"
            style={{
              background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)',
              border: '2px outset #f0f0f0',
              boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)'
            }}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>You'll receive:</span>
              <span className="text-xl font-bold" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>
                {getCreditsPreview()} Credits
              </span>
            </div>
            <div className="flex items-center justify-between text-[10px]">
              <span style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>Rate:</span>
              <span className="font-semibold" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>
                1 USDC = 16.67 Credits
              </span>
            </div>
          </div>
          
          {/* Payment Status - Compact */}
          {paymentStatus && (
            <div 
              className="p-1.5 rounded text-[10px]"
              style={{
                background: paymentStatus === 'confirmed' 
                  ? 'linear-gradient(to bottom, #d0f0d0, #c0e0c0)'
                  : 'linear-gradient(to bottom, #fff8d0, #ffe0c0)',
                border: '2px outset #e0e0e0',
                boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4)',
                color: '#000000',
                textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)'
              }}
            >
              {paymentStatus === 'pending' && '⏳ Monitoring...'}
              {paymentStatus === 'detected' && '👀 Detected! Confirming...'}
              {paymentStatus === 'confirmed' && '✅ Confirmed! Credits added.'}
            </div>
          )}

          {/* Network Selection - Always show for EVM wallets */}
          {walletType === 'evm' && (
            <div 
              className="p-2.5 rounded"
              style={{
                background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)',
                border: '2px outset #f0f0f0',
                boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)'
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs">🔗</span>
                  <h3 className="font-semibold text-xs" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>
                    Select Network
                  </h3>
                </div>
                <button
                  onClick={() => checkUSDCBalanceAcrossNetworks()}
                  className="p-0.5 rounded transition-all duration-200"
                  title="Refresh balances"
                  style={{
                    background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)',
                    border: '2px outset #f0f0f0',
                    boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4)'
                  }}
                  onMouseDown={(e) => {
                    e.currentTarget.style.border = '2px inset #c0c0c0';
                    e.currentTarget.style.boxShadow = 'inset 3px 3px 0 rgba(0, 0, 0, 0.25)';
                  }}
                  onMouseUp={(e) => {
                    e.currentTarget.style.border = '2px outset #f0f0f0';
                    e.currentTarget.style.boxShadow = 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4)';
                  }}
                >
                  <RefreshCw className="w-3 h-3" style={{ color: '#000000' }} />
                </button>
              </div>
              <div className="space-y-1.5">
                {/* Show all supported networks */}
                {[
                  { chainId: 1, name: 'Ethereum', usdcAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
                  { chainId: 137, name: 'Polygon', usdcAddress: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174' },
                  { chainId: 42161, name: 'Arbitrum', usdcAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' },
                  { chainId: 10, name: 'Optimism', usdcAddress: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85' },
                  { chainId: 8453, name: 'Base', usdcAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' }
                ].map((network) => {
                  const isCurrentNetwork = network.chainId === currentChainId;
                  const networkBalance = tokenBalances[network.chainId]?.balance || 0;
                  const hasBalance = networkBalance > 0;
                  return (
                    <button
                      key={network.chainId}
                      onClick={() => !isCurrentNetwork && switchToNetwork(network.chainId)}
                      className="w-full flex items-center justify-between p-2 rounded transition-all duration-200 text-left"
                      style={{
                        background: isCurrentNetwork 
                          ? 'linear-gradient(to bottom, #d0e8d0, #c0d8c0, #b0c8b0)'
                          : 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)',
                        border: isCurrentNetwork ? '2px inset #a0c0a0' : '2px outset #f0f0f0',
                        boxShadow: isCurrentNetwork 
                          ? 'inset 2px 2px 0 rgba(0, 0, 0, 0.1)'
                          : 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)',
                        color: '#000000',
                        textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)',
                        cursor: isCurrentNetwork ? 'default' : 'pointer',
                        opacity: hasBalance || isCurrentNetwork ? 1 : 0.7
                      }}
                      onMouseEnter={(e) => {
                        if (!isCurrentNetwork) {
                          e.currentTarget.style.background = 'linear-gradient(to bottom, #f8f8f8, #e8e8e8, #e0e0e0)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isCurrentNetwork) {
                          e.currentTarget.style.background = 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)';
                        }
                      }}
                      onMouseDown={(e) => {
                        if (!isCurrentNetwork) {
                          e.currentTarget.style.border = '2px inset #c0c0c0';
                          e.currentTarget.style.boxShadow = 'inset 3px 3px 0 rgba(0, 0, 0, 0.25)';
                        }
                      }}
                      onMouseUp={(e) => {
                        if (!isCurrentNetwork) {
                          e.currentTarget.style.border = '2px outset #f0f0f0';
                          e.currentTarget.style.boxShadow = 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)';
                        }
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs">
                          {network.chainId === 1 ? '⟠' : 
                           network.chainId === 137 ? '⬟' :
                           network.chainId === 42161 ? '🔷' :
                           network.chainId === 10 ? '🔴' : '🔵'}
                        </span>
                        <div>
                          <div className="text-xs font-semibold" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>
                            {network.name}
                            {isCurrentNetwork && <span className="ml-1 text-[9px]" style={{ color: '#006600' }}>✓ Active</span>}
                          </div>
                          <div className="text-[10px]" style={{ 
                            color: hasBalance ? '#000000' : '#666666', 
                            textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' 
                          }}>
                            {networkBalance.toFixed(2)} USDC
                          </div>
                        </div>
                      </div>
                      {!isCurrentNetwork && (
                        <span className="text-[10px]" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>Switch →</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Solana Network Info - Show for Solana wallets */}
          {walletType === 'solana' && (
            <div 
              className="p-2.5 rounded"
              style={{
                background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)',
                border: '2px outset #f0f0f0',
                boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)'
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs">◎</span>
                  <h3 className="font-semibold text-xs" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>
                    Solana Network
                  </h3>
                </div>
                <button
                  onClick={() => checkSolanaUSDCBalance()}
                  className="p-0.5 rounded transition-all duration-200"
                  title="Refresh balance"
                  style={{
                    background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)',
                    border: '2px outset #f0f0f0',
                    boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4)'
                  }}
                  onMouseDown={(e) => {
                    e.currentTarget.style.border = '2px inset #c0c0c0';
                    e.currentTarget.style.boxShadow = 'inset 3px 3px 0 rgba(0, 0, 0, 0.25)';
                  }}
                  onMouseUp={(e) => {
                    e.currentTarget.style.border = '2px outset #f0f0f0';
                    e.currentTarget.style.boxShadow = 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4)';
                  }}
                >
                  <RefreshCw className="w-3 h-3" style={{ color: '#000000' }} />
                </button>
              </div>
              <div 
                className="w-full flex items-center justify-between p-2 rounded"
                style={{
                  background: 'linear-gradient(to bottom, #d0e8d0, #c0d8c0, #b0c8b0)',
                  border: '2px inset #a0c0a0',
                  boxShadow: 'inset 2px 2px 0 rgba(0, 0, 0, 0.1)'
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs">◎</span>
                  <div>
                    <div className="text-xs font-semibold" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>
                      Solana
                      <span className="ml-1 text-[9px]" style={{ color: '#006600' }}>✓ Active</span>
                    </div>
                    <div className="text-[10px]" style={{ 
                      color: (tokenBalances.solana?.balance || 0) > 0 ? '#000000' : '#666666', 
                      textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' 
                    }}>
                      {(tokenBalances.solana?.balance || currentNetworkBalance || 0).toFixed(2)} USDC
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Error Message - Compact */}
          {error && (
            <div 
              className="p-2 rounded text-xs"
              style={{
                background: 'linear-gradient(to bottom, #ffe0e0, #ffd0d0)',
                border: '2px outset #ffc0c0',
                boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)',
                color: '#000000',
                textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)'
              }}
            >
              {error}
            </div>
          )}

          {/* Action Buttons - Compact */}
          <div className="flex gap-2 pt-2">
            {paymentStatus === 'pending' ? (
              <>
                <button
                  onClick={stopMonitoring}
                  className="flex-1 btn-secondary py-2 text-sm"
                >
                  Stop
                </button>
                <button
                  disabled
                  className="flex-1 btn-primary py-2 flex items-center justify-center gap-1.5 text-sm opacity-90"
                >
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Checking...</span>
                </button>
              </>
            ) : paymentStatus === 'confirmed' ? (
              <>
                <button
                  onClick={onClose}
                  className="flex-1 btn-primary py-2 flex items-center justify-center gap-1.5 text-sm"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Done</span>
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={onClose}
                  className="flex-1 btn-secondary py-2 text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePayment}
                  disabled={!amount || parseFloat(amount) < 1 || isProcessing}
                  className="flex-1 btn-primary py-2 flex items-center justify-center gap-1.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Coins className="w-3.5 h-3.5" />
                  <span>{isProcessing ? 'Sending...' : 'Send USDC'}</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TokenPaymentModal;
