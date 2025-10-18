import React, { createContext, useContext, useReducer, useEffect, useMemo, useCallback } from 'react';
import { ethers } from 'ethers';
import { Connection, PublicKey, clusterApiUrl } from '@solana/web3.js';
import { checkMultipleNFTs } from '../services/nftService.js';
import { checkMultipleTokens } from '../services/tokenService.js';
import { calculateDiscount, hasFreeAccess, getDiscountInfo } from '../services/discountService.js';
import { walletLogger as logger } from '../utils/logger.js';
import { initializeWalletSupport, getSafeWalletProvider, handleWalletError } from '../utils/walletUtils.js';

const WalletContext = createContext();

const initialState = {
  isConnected: false,
  address: null,
  chainId: null,
  provider: null,
  signer: null,
  balance: null,
  credits: 0,
  nftCollections: [],
  paymentHistory: [],
  isLoading: false,
  error: null,
  walletType: null, // 'evm' or 'solana'
  walletName: null, // 'metamask', 'phantom', 'solflare', etc.
  // New NFT/Token fields
  ownedNFTs: [],
  tokenBalances: [],
  discountInfo: null,
  hasFreeAccess: false,
  isCheckingDiscounts: false
};

const walletReducer = (state, action) => {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    
    case 'SET_ERROR':
      return { ...state, error: action.payload, isLoading: false };
    
    case 'CONNECT_WALLET':
      return {
        ...state,
        isConnected: true,
        address: action.payload.address,
        chainId: action.payload.chainId,
        provider: action.payload.provider,
        signer: action.payload.signer,
        walletType: action.payload.walletType,
        walletName: action.payload.walletName,
        error: null,
        isLoading: false
      };
    
    case 'DISCONNECT_WALLET':
      return {
        ...initialState,
        isLoading: false
      };
    
    case 'UPDATE_BALANCE':
      return { ...state, balance: action.payload };
    
    case 'UPDATE_CREDITS':
      return { ...state, credits: action.payload };
    
    case 'UPDATE_NFT_COLLECTIONS':
      return { ...state, nftCollections: action.payload };
    
    case 'UPDATE_PAYMENT_HISTORY':
      return { ...state, paymentHistory: action.payload };
    
    case 'UPDATE_USER_DATA':
      return {
        ...state,
        credits: action.payload.credits || state.credits,
        nftCollections: action.payload.nftCollections || state.nftCollections,
        paymentHistory: action.payload.paymentHistory || state.paymentHistory
      };
    
    case 'UPDATE_OWNED_NFTS':
      return { ...state, ownedNFTs: action.payload };
    
    case 'UPDATE_TOKEN_BALANCES':
      return { ...state, tokenBalances: action.payload };
    
    case 'UPDATE_DISCOUNT_INFO':
      return { ...state, discountInfo: action.payload };
    
    case 'SET_FREE_ACCESS':
      return { ...state, hasFreeAccess: action.payload };
    
    case 'SET_CHECKING_DISCOUNTS':
      return { ...state, isCheckingDiscounts: action.payload };
    
    default:
      return state;
  }
};

export const WalletProvider = ({ children }) => {
  const [state, dispatch] = useReducer(walletReducer, initialState);

  // Initialize wallet support and resolve conflicts
  useEffect(() => {
    const availableWallets = initializeWalletSupport();
    logger.info('Wallet support initialized', { availableWallets });
  }, []);

  // Enhanced error handler for wallet conflicts and user rejections
  useEffect(() => {
    const originalError = console.error;
    const originalWarn = console.warn;
    
    console.error = (...args) => {
      const errorMessage = args[0]?.toString?.() || '';
      const errorStack = args[1]?.stack || '';
      
      // Ignore wallet injection conflicts
      if (errorMessage.includes('Cannot redefine property: ethereum') || 
          errorMessage.includes('evmAsk.js') ||
          errorMessage.includes('inject') ||
          errorMessage.includes('originalDefineProperty') ||
          errorStack.includes('evmAsk.js')) {
        console.warn('Wallet injection conflict detected, ignoring...');
        return;
      }
      
      // Ignore user rejection errors (these are normal)
      if (errorMessage.includes('User rejected') || 
          errorMessage.includes('code: 4001') ||
          errorStack.includes('User rejected')) {
        console.warn('User rejected wallet connection, ignoring...');
        return;
      }
      
      originalError.apply(console, args);
    };

    // Enhanced error handler for uncaught errors
    const handleError = (event) => {
      const error = event.error;
      const message = error?.message || '';
      const stack = error?.stack || '';
      
      // Prevent ethereum property redefinition errors
      if (message.includes('Cannot redefine property: ethereum') ||
          message.includes('originalDefineProperty') ||
          stack.includes('evmAsk.js')) {
        event.preventDefault();
        console.warn('Prevented ethereum property redefinition error');
        return false;
      }
      
      // Handle user rejection errors gracefully
      if (message.includes('User rejected') || 
          error?.code === 4001) {
        event.preventDefault();
        console.warn('User rejected wallet request, handling gracefully');
        return false;
      }
    };

    // Handle unhandled promise rejections
    const handleUnhandledRejection = (event) => {
      const reason = event.reason;
      const message = reason?.message || '';
      const code = reason?.code;
      
      // Ignore wallet-related promise rejections
      if (message.includes('User rejected') || 
          code === 4001 ||
          message.includes('Cannot redefine property: ethereum')) {
        event.preventDefault();
        console.warn('Handled wallet-related promise rejection');
        return false;
      }
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      console.error = originalError;
      console.warn = originalWarn;
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  // Check if wallet is already connected (but don't auto-connect)
  useEffect(() => {
    const checkConnection = async () => {
      // Add a small delay to let wallet extensions load
      await new Promise(resolve => setTimeout(resolve, 100));
      
      if (window.ethereum) {
        try {
          const accounts = await window.ethereum.request({ method: 'eth_accounts' });
          if (accounts.length > 0) {
            console.log('🔍 Found existing wallet connection, but not auto-connecting');
            // Don't auto-connect - let user choose when to connect
          }
        } catch (error) {
          logger.debug('Error checking wallet connection', { error: error.message });
          // Don't show error to user for initial check
        }
      }
    };

    checkConnection();
  }, []);

  // Listen for account changes
  useEffect(() => {
    if (window.ethereum) {
      const handleAccountsChanged = (accounts) => {
        if (accounts.length === 0) {
          console.log('🔍 Accounts changed: disconnected');
          disconnectWallet();
        } else {
          console.log('🔍 Accounts changed: new account selected, but not auto-connecting');
          // Don't auto-connect on account change - let user choose
        }
      };

      const handleChainChanged = () => {
        console.log('🔍 Chain changed, but not auto-connecting');
        // Don't auto-connect on chain change - let user choose
      };

      try {
        window.ethereum.on('accountsChanged', handleAccountsChanged);
        window.ethereum.on('chainChanged', handleChainChanged);
      } catch (error) {
        logger.warn('Error setting up wallet listeners', { error: error.message });
      }

      return () => {
        try {
          window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
          window.ethereum.removeListener('chainChanged', handleChainChanged);
        } catch (error) {
          logger.warn('Error removing wallet listeners', { error: error.message });
        }
      };
    }
  }, []);

  const fetchUserData = async (address) => {
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      console.log(`🔗 Fetching user data from: ${apiUrl}/api/users/${address}`);
      
      const response = await fetch(`${apiUrl}/api/users/${address}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          dispatch({ type: 'UPDATE_USER_DATA', payload: data.user });
          console.log('✅ User data fetched successfully');
        }
      } else {
        console.warn(`⚠️ User data fetch failed: ${response.status}`);
      }
    } catch (error) {
      console.error('❌ Error fetching user data:', error);
    }
  };

  const connectWallet = async () => {
    console.log('🚀 connectWallet function called');
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      dispatch({ type: 'SET_ERROR', payload: null });

      console.log('🔍 Checking for window.ethereum...');
      if (!window.ethereum) {
        console.log('❌ No window.ethereum found');
        throw new Error('No EVM wallet detected');
      }
      console.log('✅ window.ethereum found:', window.ethereum);

      // Detect which wallet is actually connected
      let walletName = 'unknown';
      let walletType = 'evm';
      
      // Enhanced wallet detection with multiple fallbacks
      if (window.ethereum.isRabby === true) {
        walletName = 'rabby';
      } else if (window.ethereum.isCoinbaseWallet) {
        walletName = 'coinbase';
      } else if (window.ethereum.isWalletConnect) {
        walletName = 'walletconnect';
      } else if (window.ethereum.isMetaMask === true && window.ethereum.isRabby !== true) {
        walletName = 'metamask';
      } else if (window.ethereum._state || window.ethereum.isRabby === false) {
        // Rabby often sets isMetaMask to false but has _state or isRabby is false
        walletName = 'rabby';
      } else if (window.ethereum.isMetaMask === false) {
        // MetaMask is false - could be Rabby masquerading
        walletName = 'rabby';
      } else if (window.ethereum.isMetaMask === true) {
        // Fallback to MetaMask if isMetaMask is true
        walletName = 'metamask';
      } else {
        walletName = 'generic';
      }

      console.log(`🔍 Detected wallet: ${walletName}`);
      console.log(`🔍 Wallet properties:`, {
        isRabby: window.ethereum.isRabby,
        isMetaMask: window.ethereum.isMetaMask,
        isCoinbaseWallet: window.ethereum.isCoinbaseWallet,
        isWalletConnect: window.ethereum.isWalletConnect,
        hasState: !!window.ethereum._state
      });

      // Request account access with better error handling
      let accounts;
      try {
        console.log('🔗 Requesting account access...');
        accounts = await window.ethereum.request({
          method: 'eth_requestAccounts'
        });
        console.log(`✅ Account access granted: ${accounts.length} accounts`);
      } catch (requestError) {
        console.error('❌ Account access failed:', requestError);
        // Handle user rejection gracefully
        if (requestError.code === 4001 || requestError.message?.includes('User rejected')) {
          dispatch({ type: 'SET_ERROR', payload: 'Connection cancelled by user' });
          return;
        }
        throw requestError;
      }

      if (accounts.length === 0) {
        throw new Error('No accounts found');
      }

      console.log('🔗 Creating ethers provider...');
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      const network = await provider.getNetwork();
      const balance = await provider.getBalance(address);

      console.log(`✅ Wallet connected successfully!`, {
        walletName,
        address,
        chainId: network.chainId.toString(),
        balance: ethers.formatEther(balance)
      });

      dispatch({
        type: 'CONNECT_WALLET',
        payload: {
          address,
          chainId: network.chainId.toString(),
          provider,
          signer,
          walletType,
          walletName
        }
      });

      // Update balance
      dispatch({
        type: 'UPDATE_BALANCE',
        payload: ethers.formatEther(balance)
      });

      // Fetch user data from backend
      console.log('🔗 Fetching user data from backend...');
      await fetchUserData(address);
      await refreshAllHoldings();

      logger.info('Wallet connected successfully', { walletName, address });

    } catch (error) {
      console.error('❌ Wallet connection error:', error);
      
      // Don't log user rejection errors as they're normal
      if (error.code === 4001 || error.message?.includes('User rejected')) {
        dispatch({ type: 'SET_ERROR', payload: 'Connection cancelled by user' });
      } else if (error.message?.includes('No EVM wallet detected')) {
        dispatch({ type: 'SET_ERROR', payload: 'No wallet extension found. Please install MetaMask, Rabby, or another EVM wallet.' });
      } else if (error.message?.includes('No accounts found')) {
        dispatch({ type: 'SET_ERROR', payload: 'No accounts found. Please unlock your wallet and try again.' });
      } else {
        dispatch({ type: 'SET_ERROR', payload: `Connection failed: ${error.message}` });
      }
    }
  };

  const disconnectWallet = () => {
    dispatch({ type: 'DISCONNECT_WALLET' });
  };

  // Enhanced wallet connection with multiple wallet support
  const connectEVMWallet = async (walletName = 'metamask') => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      dispatch({ type: 'SET_ERROR', payload: null });

      console.log(`🔍 Attempting to connect ${walletName} wallet...`);
      console.log(`🔍 window.ethereum:`, window.ethereum);
      console.log(`🔍 window.ethereum.isRabby:`, window.ethereum?.isRabby);
      console.log(`🔍 window.ethereum.isMetaMask:`, window.ethereum?.isMetaMask);
      console.log(`🔍 Available wallets:`, {
        ethereum: !!window.ethereum,
        metamask: window.ethereum?.isMetaMask,
        rabby: window.ethereum?.isRabby,
        coinbase: window.ethereum?.isCoinbaseWallet,
        phantom: !!window.solana
      });

      // Get safe wallet provider
      let walletProvider = getSafeWalletProvider(walletName);
      console.log(`🔍 getSafeWalletProvider(${walletName}) returned:`, walletProvider);
      
      if (!walletProvider) {
        console.log(`❌ No provider found for ${walletName}`);
        
        // Fallback: if Rabby is not found, try MetaMask
        if (walletName === 'rabby' && window.ethereum) {
          console.log('🔄 Rabby not found, trying MetaMask fallback...');
          const metamaskProvider = getSafeWalletProvider('metamask');
          if (metamaskProvider) {
            console.log('✅ MetaMask fallback found, using MetaMask instead');
            walletName = 'metamask'; // Update wallet name
            walletProvider = metamaskProvider;
          }
        }
        
        if (!walletProvider) {
          throw new Error(`${walletName} wallet not detected. Please install MetaMask, Rabby, or another EVM wallet extension.`);
        }
      }

      console.log(`✅ Provider found for ${walletName}, attempting connection...`);

      // Request account access with better error handling
      let accounts;
      try {
        accounts = await walletProvider.request({
          method: 'eth_requestAccounts'
        });
      } catch (requestError) {
        const errorInfo = handleWalletError(requestError, walletName);
        dispatch({ type: 'SET_ERROR', payload: errorInfo.message });
        if (errorInfo.shouldLog) {
          logger.error('Wallet connection error', { walletName, error: requestError });
        }
        return;
      }

      if (accounts.length === 0) {
        throw new Error('No accounts found');
      }

      const provider = new ethers.BrowserProvider(walletProvider);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      const network = await provider.getNetwork();
      const balance = await provider.getBalance(address);

      dispatch({
        type: 'CONNECT_WALLET',
        payload: {
          address,
          chainId: network.chainId.toString(),
          provider,
          signer,
          walletType: 'evm',
          walletName
        }
      });

      // Update balance
      dispatch({
        type: 'UPDATE_BALANCE',
        payload: ethers.formatEther(balance)
      });

      // Fetch user data from backend
      await fetchUserData(address);
      await refreshAllHoldings();
      
      logger.info('EVM wallet connected successfully', { walletName, address });

    } catch (error) {
      console.error(`❌ connectEVMWallet error for ${walletName}:`, error);
      console.error(`❌ Error details:`, {
        message: error.message,
        code: error.code,
        stack: error.stack
      });
      const errorInfo = handleWalletError(error, walletName);
      dispatch({ type: 'SET_ERROR', payload: errorInfo.message });
      if (errorInfo.shouldLog) {
        logger.error('EVM wallet connection error', { walletName, error });
      }
    }
  };

  const connectSolanaWallet = async (walletName = 'phantom') => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      dispatch({ type: 'SET_ERROR', payload: null });

      console.log(`🔍 Attempting to connect ${walletName} wallet...`);
      
      // Get safe wallet provider with retry mechanism
      let solanaProvider = getSafeWalletProvider(walletName);
      
      console.log('🔍 Initial Solana provider check:', solanaProvider);
      
      // If no provider found, wait a bit and try again (Solana wallets sometimes load slowly)
      if (!solanaProvider) {
        console.log('⏳ No provider found, waiting 1 second and retrying...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        solanaProvider = getSafeWalletProvider(walletName);
        console.log('🔍 Retry Solana provider check:', solanaProvider);
      }
      
      if (!solanaProvider) {
        console.log(`❌ ${walletName} wallet not detected after retry`);
        throw new Error(`${walletName} wallet not detected. Please install the wallet extension and refresh the page.`);
      }
      
      console.log(`✅ ${walletName} provider found, attempting connection...`);

      // Request connection with better error handling
      let response;
      try {
        console.log('🔍 Calling solanaProvider.connect()...');
        console.log('🔍 Provider methods:', Object.keys(solanaProvider));
        console.log('🔍 Provider connect method:', typeof solanaProvider.connect);
        
        // Check if wallet is already connected
        if (solanaProvider.isConnected) {
          console.log('🔍 Wallet already connected, getting public key...');
          const publicKey = solanaProvider.publicKey;
          if (publicKey) {
            response = { publicKey };
            console.log('✅ Using existing connection:', response);
          } else {
            console.log('🔍 No public key found, requesting new connection...');
            response = await solanaProvider.connect();
            console.log('✅ New connection response:', response);
          }
        } else {
          console.log('🔍 Wallet not connected, requesting connection...');
          response = await solanaProvider.connect();
          console.log('✅ Connection response:', response);
        }
      } catch (requestError) {
        console.log('❌ Connection error:', requestError);
        console.log('❌ Error details:', {
          message: requestError.message,
          code: requestError.code,
          stack: requestError.stack
        });
        const errorInfo = handleWalletError(requestError, walletName);
        dispatch({ type: 'SET_ERROR', payload: errorInfo.message });
        if (errorInfo.shouldLog) {
          logger.error('Solana wallet connection error', { walletName, error: requestError });
        }
        return;
      }

      const address = response.publicKey.toString();
      console.log('🔍 Connected address:', address);

      // Create Solana connection and get balance
      console.log('🔗 Creating Solana connection...');
      const connection = new Connection(clusterApiUrl('mainnet-beta'), 'confirmed');
      const publicKey = new PublicKey(address);
      
      console.log('🔗 Getting Solana balance...');
      let balance = 0;
      try {
        balance = await connection.getBalance(publicKey);
        console.log(`✅ Solana balance: ${balance} lamports (${(balance / 1e9).toFixed(4)} SOL)`);
      } catch (balanceError) {
        console.warn('⚠️ Could not fetch Solana balance:', balanceError);
        balance = 0; // Default to 0 if balance fetch fails
      }

      dispatch({
        type: 'CONNECT_WALLET',
        payload: {
          address,
          chainId: 'solana', // Use 'solana' as chainId for Solana
          provider: connection,
          signer: solanaProvider,
          walletType: 'solana',
          walletName
        }
      });

      // Update balance (convert lamports to SOL)
      dispatch({
        type: 'UPDATE_BALANCE',
        payload: (balance / 1e9).toFixed(4) // Convert lamports to SOL
      });

      // Fetch user data from backend
      await fetchUserData(address);
      await refreshAllHoldings();
      
      logger.info('Solana wallet connected successfully', { walletName, address });

    } catch (error) {
      const errorInfo = handleWalletError(error, walletName);
      dispatch({ type: 'SET_ERROR', payload: errorInfo.message });
      if (errorInfo.shouldLog) {
        logger.error('Solana wallet connection error', { walletName, error });
      }
    }
  };

  // Universal connect function that detects wallet type
  const connectWalletUniversal = async (walletName) => {
    console.log(`🚀 connectWalletUniversal called with: ${walletName}`);
    
    // Input validation
    if (!walletName || typeof walletName !== 'string') {
      dispatch({ type: 'SET_ERROR', payload: 'Invalid wallet name provided' });
      return;
    }

    const validWalletNames = ['metamask', 'rabby', 'phantom', 'solflare', 'coinbase', 'walletconnect'];
    if (!validWalletNames.includes(walletName)) {
      dispatch({ type: 'SET_ERROR', payload: `Unsupported wallet: ${walletName}` });
      return;
    }

    if (walletName === 'phantom' || walletName === 'solflare') {
      await connectSolanaWallet(walletName);
    } else if (walletName === 'metamask' || walletName === 'rabby' || walletName === 'coinbase' || walletName === 'walletconnect') {
      await connectEVMWallet(walletName);
    } else {
      // Default to EVM wallet
      await connectEVMWallet(walletName);
    }
  };


  const checkOwnedNFTs = async () => {
    if (!state.address || !state.provider) return;
    
    logger.debug('Checking owned NFTs for address', { address: state.address });
    
    try {
      dispatch({ type: 'SET_CHECKING_DISCOUNTS', payload: true });
      
      // Get all NFT contracts from discount config
      const { getDiscountConfig } = await import('../services/discountService.js');
      const config = getDiscountConfig();
      
      const allNFTs = [
        ...config.nftDiscounts.map(nft => ({
          address: nft.contractAddress,
          chainId: nft.chainId,
          type: nft.type
        })),
        ...config.solanaDiscounts.map(nft => ({
          address: nft.contractAddress,
          chainId: nft.chainId,
          type: nft.type
        }))
      ];
      
      const providers = {
        [state.chainId]: state.provider,
        'solana': state.provider // For Solana wallets
      };
      
      const nftResults = await checkMultipleNFTs(state.address, allNFTs, providers);
      logger.debug('NFT results received', { resultsCount: nftResults.length });
      dispatch({ type: 'UPDATE_OWNED_NFTS', payload: nftResults });
      
    } catch (error) {
      console.error('Error checking owned NFTs:', error);
    } finally {
      dispatch({ type: 'SET_CHECKING_DISCOUNTS', payload: false });
    }
  };

  const checkTokenBalances = async () => {
    if (!state.address || !state.provider) return;
    
    logger.debug('Checking token balances for address', { address: state.address });
    
    try {
      dispatch({ type: 'SET_CHECKING_DISCOUNTS', payload: true });
      
      // Get all token contracts from discount config
      const { getDiscountConfig } = await import('../services/discountService.js');
      const config = getDiscountConfig();
      
      const allTokens = config.tokenDiscounts.map(token => ({
        address: token.contractAddress,
        chainId: token.chainId,
        type: token.type
      }));
      
      const providers = {
        [state.chainId]: state.provider,
        'solana': state.provider // For Solana wallets
      };
      
      const tokenResults = await checkMultipleTokens(state.address, allTokens, providers);
      logger.debug('Token results received', { resultsCount: tokenResults.length });
      dispatch({ type: 'UPDATE_TOKEN_BALANCES', payload: tokenResults });
      
    } catch (error) {
      console.error('Error checking token balances:', error);
    } finally {
      dispatch({ type: 'SET_CHECKING_DISCOUNTS', payload: false });
    }
  };

  const refreshAllHoldings = async () => {
    if (!state.address) return;
    
    logger.debug('Refreshing all holdings for address', { address: state.address });
    
    try {
      await Promise.all([
        checkOwnedNFTs(),
        checkTokenBalances(),
        checkDiscounts()
      ]);
      logger.info('Holdings refresh completed successfully');
    } catch (error) {
      console.error('❌ Error refreshing holdings:', error);
    }
  };

  const refreshCredits = async () => {
    if (!state.address) return;
    
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const response = await fetch(`${apiUrl}/api/nft/check-credits`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ walletAddress: state.address })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          dispatch({ type: 'UPDATE_CREDITS', payload: data.totalCredits });
        }
      }
    } catch (error) {
      console.error('Error refreshing credits:', error);
    }
  };

  // NFT and Token verification functions


  const checkDiscounts = async (serviceType = 'image_generation') => {
    if (!state.address || !state.provider) return;
    
    try {
      dispatch({ type: 'SET_CHECKING_DISCOUNTS', payload: true });
      
      const providers = {
        [state.chainId]: state.provider,
        'solana': state.provider // For Solana wallets
      };
      
      const discount = await calculateDiscount(state.address, serviceType, providers);
      const discountInfo = await getDiscountInfo(state.address, serviceType, providers);
      const freeAccess = await hasFreeAccess(state.address, serviceType, providers);
      
      dispatch({ type: 'UPDATE_DISCOUNT_INFO', payload: discountInfo });
      dispatch({ type: 'SET_FREE_ACCESS', payload: freeAccess });
      
      return discount;
    } catch (error) {
      console.error('Error checking discounts:', error);
      return null;
    } finally {
      dispatch({ type: 'SET_CHECKING_DISCOUNTS', payload: false });
    }
  };


  // Memoize callback functions to prevent unnecessary re-renders
  const connectWalletCallback = useCallback(connectWallet, []);
  const connectEVMWalletCallback = useCallback(connectEVMWallet, []);
  const connectSolanaWalletCallback = useCallback(connectSolanaWallet, []);
  const connectWalletUniversalCallback = useCallback(connectWalletUniversal, []);
  const disconnectWalletCallback = useCallback(disconnectWallet, []);
  const refreshCreditsCallback = useCallback(refreshCredits, []);
  const checkDiscountsCallback = useCallback(checkDiscounts, []);
  const checkOwnedNFTsCallback = useCallback(checkOwnedNFTs, []);
  const checkTokenBalancesCallback = useCallback(checkTokenBalances, []);
  const refreshAllHoldingsCallback = useCallback(refreshAllHoldings, []);

  // Memoize the context value to prevent unnecessary re-renders
  const value = useMemo(() => ({
    ...state,
    connectWallet: connectWalletCallback,
    connectEVMWallet: connectEVMWalletCallback,
    connectSolanaWallet: connectSolanaWalletCallback,
    connectWalletUniversal: connectWalletUniversalCallback,
    disconnectWallet: disconnectWalletCallback,
    refreshCredits: refreshCreditsCallback,
    checkDiscounts: checkDiscountsCallback,
    checkOwnedNFTs: checkOwnedNFTsCallback,
    checkTokenBalances: checkTokenBalancesCallback,
    refreshAllHoldings: refreshAllHoldingsCallback
  }), [
    state,
    connectWalletCallback,
    connectEVMWalletCallback,
    connectSolanaWalletCallback,
    connectWalletUniversalCallback,
    disconnectWalletCallback,
    refreshCreditsCallback,
    checkDiscountsCallback,
    checkOwnedNFTsCallback,
    checkTokenBalancesCallback,
    refreshAllHoldingsCallback
  ]);

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  );
};

export const useWallet = () => {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
};