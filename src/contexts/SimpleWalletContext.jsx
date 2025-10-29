import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { checkNFTHoldings } from '../services/nftVerificationService';
import logger from '../utils/logger';

const SimpleWalletContext = createContext();

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export const SimpleWalletProvider = ({ children }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [address, setAddress] = useState(null);
  const [credits, setCredits] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isNFTHolder, setIsNFTHolder] = useState(false);
  const [nftCollections, setNftCollections] = useState([]);
  const [walletType, setWalletType] = useState(null); // 'evm' or 'solana'

  // Fetch credits from backend with retry logic
  const fetchCredits = useCallback(async (walletAddress, retries = 3) => {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        logger.debug('Fetching credits', { walletAddress, attempt, retries });
        const response = await fetch(`${API_URL}/api/users/${walletAddress}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          // Increased timeout to 15 seconds for production
          signal: AbortSignal.timeout(15000)
        });
        
        if (response.ok) {
          const data = await response.json();
          
          // Defensive parsing - handle different response formats
          let credits = 0;
          if (data.success && data.user) {
            credits = data.user.credits || 0;
          } else if (data.success && typeof data.credits !== 'undefined') {
            credits = data.credits || 0;
          } else if (typeof data.credits !== 'undefined') {
            credits = data.credits || 0;
          }
          
          setCredits(credits);
          logger.info('Credits loaded successfully', { credits, walletAddress });
          return credits; // Return for testing/verification
        } else {
          logger.warn('Failed to fetch credits', { 
            status: response.status, 
            attempt, 
            retries, 
            walletAddress 
          });
          if (attempt === retries) {
            setCredits(0);
          }
        }
      } catch (error) {
        logger.error('Error fetching credits', { 
          error: error.message, 
          attempt, 
          retries, 
          walletAddress 
        });
        
        // Don't retry on user abort
        if (error.name === 'AbortError') {
          logger.warn('Request aborted', { walletAddress });
          setCredits(0);
          return;
        }
        
        // On last attempt, set credits to 0
        if (attempt === retries) {
          logger.error('All retry attempts failed', { walletAddress });
          setCredits(0);
        } else {
          // Wait before retrying (exponential backoff)
          const delay = Math.min(1000 * attempt, 5000);
          logger.debug('Retrying credit fetch', { delay, attempt, walletAddress });
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
  }, [API_URL]);

  // Check NFT holdings
  const checkNFTStatus = async (walletAddress) => {
    try {
      logger.debug('Checking NFT holdings', { walletAddress });
      const result = await checkNFTHoldings(walletAddress);
      setIsNFTHolder(result.isHolder);
      setNftCollections(result.collections);
      logger.info('NFT status checked', { 
        isHolder: result.isHolder, 
        collections: result.collections.length,
        walletAddress 
      });
    } catch (error) {
      logger.error('Error checking NFT status', { error: error.message, walletAddress });
      setIsNFTHolder(false);
      setNftCollections([]);
    }
  };

  // Connect wallet with wallet type support
  const connectWallet = async (walletType = 'metamask') => {
    try {
      setIsLoading(true);
      setError(null);

      let provider = null;
      let address = null;

      // Add timeout to prevent infinite loading
      const connectionTimeout = setTimeout(() => {
        setIsLoading(false);
        setError('Connection timeout. Please try again.');
        throw new Error('Connection timeout');
      }, 30000); // 30 second timeout

      try {
        // Handle different wallet types
        switch (walletType) {
        case 'metamask':
          if (!window.ethereum) {
            throw new Error('MetaMask not found. Please install MetaMask extension.');
          }
          // Find MetaMask provider specifically
          if (window.ethereum.providers?.length > 0) {
            // Multiple wallets installed, find MetaMask
            provider = window.ethereum.providers.find(p => p.isMetaMask && !p.isRabby);
            if (!provider) {
              throw new Error('MetaMask not found. Please make sure MetaMask is installed and enabled.');
            }
          } else if (window.ethereum.isMetaMask) {
            // Only MetaMask is installed (or it's the default)
            provider = window.ethereum;
          } else {
            throw new Error('MetaMask not found. Please install MetaMask extension.');
          }
          
          // Request fresh permissions - this will show the wallet popup
          try {
            await provider.request({
              method: 'wallet_requestPermissions',
              params: [{ eth_accounts: {} }]
            });
          } catch (e) {
            console.log('⚠️ wallet_requestPermissions not supported, using eth_requestAccounts');
          }
          
          // This will prompt user to unlock MetaMask if locked
          const accounts = await provider.request({ 
            method: 'eth_requestAccounts' 
          });
          if (!accounts || accounts.length === 0) {
            throw new Error('No accounts found. Please unlock MetaMask and try again.');
          }
        address = accounts[0];
        setWalletType('evm');
        break;

      case 'rabby':
          // Check if Rabby is available
          if (!window.ethereum) {
            throw new Error('No wallet found. Please install Rabby Wallet extension.');
          }
          
          console.log('🔍 Detecting Rabby Wallet...', {
            hasEthereum: !!window.ethereum,
            isRabby: window.ethereum.isRabby,
            hasProviders: !!window.ethereum.providers,
            providersCount: window.ethereum.providers?.length
          });
          
          // Try multiple detection methods for Rabby
          if (window.ethereum.providers && window.ethereum.providers.length > 0) {
            // Multiple wallets installed - find Rabby in providers array
            provider = window.ethereum.providers.find(p => p.isRabby);
            console.log('🔍 Found in providers array:', !!provider);
          }
          
          if (!provider && window.ethereum.isRabby) {
            // Rabby is the primary wallet
            provider = window.ethereum;
            console.log('🔍 Using primary ethereum provider (isRabby=true)');
          }
          
          if (!provider) {
            // Last resort: just use window.ethereum and let it prompt whatever is available
            // This handles cases where Rabby doesn't properly identify itself
            provider = window.ethereum;
            console.log('⚠️ Rabby flag not detected, using default ethereum provider');
          }
          
          // Request fresh permissions - this will show the wallet popup
          try {
            await provider.request({
              method: 'wallet_requestPermissions',
              params: [{ eth_accounts: {} }]
            });
          } catch (e) {
            console.log('⚠️ wallet_requestPermissions not supported, using eth_requestAccounts');
          }
          
          // This will prompt user to unlock and connect
          const rabbyAccounts = await provider.request({ 
            method: 'eth_requestAccounts' 
          });
          if (!rabbyAccounts || rabbyAccounts.length === 0) {
            throw new Error('No accounts found. Please unlock your wallet and try again.');
          }
        address = rabbyAccounts[0];
        setWalletType('evm');
        console.log('✅ Rabby connected:', address);
        break;

      case 'coinbase':
          if (!window.ethereum) {
            throw new Error('Coinbase Wallet not found. Please install Coinbase Wallet extension.');
          }
          // Find Coinbase Wallet provider specifically
          if (window.ethereum.providers?.length > 0) {
            // Multiple wallets installed, find Coinbase Wallet
            provider = window.ethereum.providers.find(p => p.isCoinbaseWallet);
            if (!provider) {
              throw new Error('Coinbase Wallet not found. Please make sure Coinbase Wallet is installed and enabled.');
            }
          } else if (window.ethereum.isCoinbaseWallet) {
            // Only Coinbase Wallet is installed
            provider = window.ethereum;
          } else {
            throw new Error('Coinbase Wallet not found. Please install Coinbase Wallet extension.');
          }
          
          // Request fresh permissions - this will show the wallet popup
          try {
            await provider.request({
              method: 'wallet_requestPermissions',
              params: [{ eth_accounts: {} }]
            });
          } catch (e) {
            console.log('⚠️ wallet_requestPermissions not supported, using eth_requestAccounts');
          }
          
          // This will prompt user to unlock Coinbase Wallet if locked
          const coinbaseAccounts = await provider.request({ 
            method: 'eth_requestAccounts' 
          });
          if (!coinbaseAccounts || coinbaseAccounts.length === 0) {
            throw new Error('No accounts found. Please unlock Coinbase Wallet and try again.');
          }
        address = coinbaseAccounts[0];
        setWalletType('evm');
        break;

      case 'phantom':
          if (!window.solana || !window.solana.isPhantom) {
            throw new Error('Phantom Wallet not found. Please install Phantom extension.');
          }
          provider = window.solana;
          // This will prompt user to unlock Phantom if locked and connect
          const resp = await provider.connect();
          if (!resp || !resp.publicKey) {
            throw new Error('Failed to connect. Please unlock Phantom and try again.');
          }
        address = resp.publicKey.toString();
        setWalletType('solana');
        break;

      case 'solflare':
          if (!window.solflare) {
            throw new Error('Solflare Wallet not found. Please install Solflare extension.');
          }
          provider = window.solflare;
          // This will prompt user to unlock Solflare if locked
          await provider.connect();
          if (!provider.publicKey) {
            throw new Error('Failed to connect. Please unlock Solflare and try again.');
          }
        address = provider.publicKey.toString();
        setWalletType('solana');
        break;

      default:
          throw new Error(`Unsupported wallet type: ${walletType}`);
      }

      if (!address) {
        throw new Error('No accounts found');
      }

      setAddress(address);
      setIsConnected(true);

      // Fetch credits and check NFT status
      await Promise.all([
        fetchCredits(address),
        checkNFTStatus(address)
      ]);

        logger.info('Wallet connected successfully', { address, walletType });
        clearTimeout(connectionTimeout);
      } catch (error) {
        logger.error('Wallet connection error', { error: error.message, walletType });
        setError(error.message);
        clearTimeout(connectionTimeout);
      } finally {
        setIsLoading(false);
      }
    } catch (error) {
      logger.error('Wallet connection error', { error: error.message, walletType });
      setError(error.message);
      setIsLoading(false);
    }
  };

  // Disconnect wallet
  const disconnectWallet = () => {
    setIsConnected(false);
    setAddress(null);
    setCredits(0);
    setError(null);
    setIsNFTHolder(false);
    setNftCollections([]);
    setWalletType(null);
  };

  // Auto-reconnect disabled - user must manually select wallet each time
  // This ensures the correct wallet extension opens when selected
  useEffect(() => {
    // No auto-reconnect - user chooses wallet explicitly
    
    // Cleanup on unmount to prevent stuck loading states
    return () => {
      setIsLoading(false);
    };
  }, []);

  // Periodic credit refresh when connected
  useEffect(() => {
    if (!isConnected || !address) return;

    // Refresh credits every 60 seconds to keep display updated
    const refreshInterval = setInterval(() => {
      logger.debug('Periodic credit refresh');
      fetchCredits(address).catch(error => {
        logger.error('Periodic credit refresh failed', { error: error.message, address });
      });
    }, 60000); // Every 60 seconds

    // Cleanup interval on unmount
    return () => clearInterval(refreshInterval);
  }, [isConnected, address]); // Removed fetchCredits from dependencies

  // Function to refresh credits without full reconnection
  const refreshCredits = async () => {
    if (address) {
      await fetchCredits(address);
    }
  };

  // Function to manually set credits for testing
  const setCreditsManually = (newCredits) => {
    setCredits(newCredits);
  };

  const value = {
    isConnected,
    address,
    credits,
    isLoading,
    error,
    isNFTHolder,
    nftCollections,
    connectWallet,
    disconnectWallet,
    fetchCredits,
    refreshCredits,
    checkNFTStatus,
    walletType,
    setCreditsManually
  };

  return (
    <SimpleWalletContext.Provider value={value}>
      {children}
    </SimpleWalletContext.Provider>
  );
};

export const useSimpleWallet = () => {
  const context = useContext(SimpleWalletContext);
  if (!context) {
    throw new Error('useSimpleWallet must be used within a SimpleWalletProvider');
  }
  return context;
};
