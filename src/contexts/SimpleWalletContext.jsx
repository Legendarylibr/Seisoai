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

  // Fetch credits from backend with retry logic and caching
  const fetchCredits = useCallback(async (walletAddress, retries = 3) => {
    // Check cache first (1 minute cache for credits)
    const cacheKey = `credits_${walletAddress}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      const { data, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < 60000) { // 1 minute
        logger.debug('Using cached credits', { walletAddress, credits: data.credits });
        setCredits(data.credits);
        return data.credits;
      }
    }

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        logger.debug('Fetching credits', { walletAddress, attempt, retries });
        const response = await fetch(`${API_URL}/api/users/${walletAddress}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          // Reduced timeout for faster failure
          signal: AbortSignal.timeout(5000) // Reduced from 15s to 5s
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
          
          // Cache the result
          sessionStorage.setItem(cacheKey, JSON.stringify({
            data: { credits },
            timestamp: Date.now()
          }));
          
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
          const delay = Math.min(1000 * attempt, 3000); // Max 3 second delay
          logger.debug('Retrying credit fetch', { delay, attempt, walletAddress });
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
  }, [API_URL]);

  // Check NFT holdings with caching
  const checkNFTStatus = async (walletAddress) => {
    try {
      // Check cache first (5 minute cache)
      const cacheKey = `nft_${walletAddress}`;
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < 300000) { // 5 minutes
          logger.debug('Using cached NFT status', { walletAddress });
          setIsNFTHolder(data.isHolder);
          setNftCollections(data.collections);
          return;
        }
      }

      logger.debug('Checking NFT holdings', { walletAddress });
      const result = await checkNFTHoldings(walletAddress);
      setIsNFTHolder(result.isHolder);
      setNftCollections(result.collections);
      
      // Cache the result
      sessionStorage.setItem(cacheKey, JSON.stringify({
        data: result,
        timestamp: Date.now()
      }));
      
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

      // Add timeout to prevent infinite loading - increased for wallet popups
      let timeoutTriggered = false;
      const connectionTimeout = setTimeout(() => {
        if (!timeoutTriggered) {
          timeoutTriggered = true;
          setIsLoading(false);
          setError('Connection timeout. Please try again.');
        }
      }, 35000); // Increased to 35 seconds to allow wallet popups and multiple wallet attempts

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
        console.log('✅ MetaMask connected successfully:', address);
        break;

      case 'rabby':
          // Check if Rabby is available - wait a bit for extensions to inject
          let retries = 0;
          while (!window.ethereum && retries < 10) {
            await new Promise(resolve => setTimeout(resolve, 100));
            retries++;
          }
          
          if (!window.ethereum) {
            throw new Error('No wallet found. Please install Rabby Wallet extension.');
          }
          
          console.log('🔍 Detecting Rabby Wallet...', {
            hasEthereum: !!window.ethereum,
            isRabby: window.ethereum.isRabby,
            hasProviders: !!window.ethereum.providers,
            providersCount: window.ethereum.providers?.length
          });
          
          // Wait a bit more for providers array to be populated if needed
          if (!window.ethereum.providers && retries < 5) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }
          
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
          
          if (!provider || !provider.request) {
            throw new Error('Rabby wallet provider not ready. Please try again.');
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
          // Add explicit timeout to catch connection issues
          const rabbyAccounts = await Promise.race([
            provider.request({ 
              method: 'eth_requestAccounts' 
            }),
            new Promise((_, reject) => setTimeout(() => {
              reject(new Error('Connection timeout. Please ensure your wallet is unlocked and try again.'));
            }, 30000)) // 30 second timeout for wallet popup
          ]);
          
          if (!rabbyAccounts || rabbyAccounts.length === 0) {
            throw new Error('No accounts found. Please unlock your wallet and try again.');
          }
        address = rabbyAccounts[0];
        setWalletType('evm');
        console.log('✅ Rabby connected successfully:', address);
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
        console.log('✅ Coinbase Wallet connected successfully:', address);
        break;

      case 'phantom':
          if (!window.solana || !window.solana.isPhantom) {
            throw new Error('Phantom Wallet not found. Please install Phantom extension.');
          }
          provider = window.solana;
          
          // Add connection timeout for Solana
          let phantomTimeoutTriggered = false;
          const phantomTimeout = setTimeout(() => {
            if (!phantomTimeoutTriggered) {
              phantomTimeoutTriggered = true;
              throw new Error('Phantom connection timeout. Please try again.');
            }
          }, 15000); // 15 second timeout for Phantom
          
          try {
            // This will prompt user to unlock Phantom if locked and connect
            const resp = await Promise.race([
              provider.connect(),
              new Promise((_, reject) => setTimeout(() => {
                if (!phantomTimeoutTriggered) {
                  phantomTimeoutTriggered = true;
                  reject(new Error('Phantom connection timeout. Please try again.'));
                }
              }, 15000))
            ]);
            clearTimeout(phantomTimeout);
            
            if (!resp || !resp.publicKey) {
              throw new Error('Failed to connect. Please unlock Phantom and try again.');
            }
            address = resp.publicKey.toString();
            setWalletType('solana');
            console.log('✅ Phantom connected successfully:', address);
          } catch (phantomError) {
            clearTimeout(phantomTimeout);
            console.error('❌ Phantom connection failed:', phantomError);
            throw new Error(`Phantom connection failed: ${phantomError.message}`);
          }
        break;

      case 'solflare':
          if (!window.solflare) {
            throw new Error('Solflare Wallet not found. Please install Solflare extension.');
          }
          provider = window.solflare;
          
          // Add connection timeout for Solflare
          let solflareTimeoutTriggered = false;
          const solflareTimeout = setTimeout(() => {
            if (!solflareTimeoutTriggered) {
              solflareTimeoutTriggered = true;
            }
          }, 15000); // 15 second timeout for Solflare
          
          try {
            // This will prompt user to unlock Solflare if locked
            await Promise.race([
              provider.connect(),
              new Promise((_, reject) => setTimeout(() => {
                if (!solflareTimeoutTriggered) {
                  solflareTimeoutTriggered = true;
                  reject(new Error('Solflare connection timeout. Please try again.'));
                }
              }, 15000))
            ]);
            clearTimeout(solflareTimeout);
            
            if (!provider.publicKey) {
              throw new Error('Failed to connect. Please unlock Solflare and try again.');
            }
            address = provider.publicKey.toString();
            setWalletType('solana');
            console.log('✅ Solflare connected successfully:', address);
          } catch (solflareError) {
            clearTimeout(solflareTimeout);
            console.error('❌ Solflare connection failed:', solflareError);
            throw new Error(`Solflare connection failed: ${solflareError.message}`);
          }
        break;

      default:
          throw new Error(`Unsupported wallet type: ${walletType}`);
      }

      if (!address) {
        throw new Error('No accounts found');
      }

      setAddress(address);
      setIsConnected(true);

      // Fetch credits immediately, NFT check can happen in background
      await fetchCredits(address);
      
      // Start NFT check in background (non-blocking)
      checkNFTStatus(address).catch(error => {
        logger.error('Background NFT check failed', { error: error.message, address });
      });

      logger.info('Wallet connected successfully', { address, walletType });
      if (connectionTimeout) clearTimeout(connectionTimeout);
    } catch (error) {
      if (connectionTimeout) clearTimeout(connectionTimeout);
      logger.error('Wallet connection error', { error: error.message, walletType });
      setError(error.message);
    } finally {
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
