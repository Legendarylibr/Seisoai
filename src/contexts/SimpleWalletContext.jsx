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
        logger.debug('Fetching credits from backend', { walletAddress, attempt, retries, apiUrl: API_URL });
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
          logger.debug('Credits API response received', { data, walletAddress });
          
          // Defensive parsing - handle different response formats
          let credits = 0;
          if (data.success && data.user && typeof data.user.credits !== 'undefined') {
            credits = Number(data.user.credits) || 0;
            logger.info('Credits found in data.user.credits', { credits, walletAddress });
          } else if (data.success && typeof data.credits !== 'undefined') {
            credits = Number(data.credits) || 0;
            logger.info('Credits found in data.credits', { credits, walletAddress });
          } else if (data.user && typeof data.user.credits !== 'undefined') {
            credits = Number(data.user.credits) || 0;
            logger.info('Credits found in data.user.credits (no success flag)', { credits, walletAddress });
          } else {
            logger.warn('Credits not found in expected format', { data, walletAddress });
            credits = 0;
          }
          
          setCredits(credits);
          console.log('✅ Credits loaded from backend:', credits, 'for wallet:', walletAddress);
          
          // Cache the result
          try {
            sessionStorage.setItem(cacheKey, JSON.stringify({
              data: { credits },
              timestamp: Date.now()
            }));
          } catch (storageError) {
            logger.warn('Failed to cache credits', { error: storageError.message });
          }
          
          logger.info('Credits loaded successfully', { credits, walletAddress });
          return credits; // Return for testing/verification
        } else {
          const errorText = await response.text();
          logger.warn('Failed to fetch credits', { 
            status: response.status, 
            statusText: response.statusText,
            errorText,
            attempt, 
            retries, 
            walletAddress 
          });
          if (attempt === retries) {
            setCredits(0);
            console.warn('⚠️ Failed to fetch credits, set to 0');
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
        try {
          const { data, timestamp } = JSON.parse(cached);
          if (Date.now() - timestamp < 300000) { // 5 minutes
            logger.debug('Using cached NFT status', { walletAddress });
            setIsNFTHolder(data.isHolder || false);
            setNftCollections(Array.isArray(data.collections) ? data.collections : []);
            return;
          }
        } catch (parseError) {
          logger.warn('Failed to parse cached NFT status', { error: parseError.message });
        }
      }

      logger.debug('Checking NFT holdings', { walletAddress });
      const result = await checkNFTHoldings(walletAddress);
      
      // Ensure we have valid boolean and array
      const isHolder = result.isHolder === true;
      const collections = Array.isArray(result.collections) ? result.collections : [];
      
      setIsNFTHolder(isHolder);
      setNftCollections(collections);
      
      // Cache the result
      try {
        sessionStorage.setItem(cacheKey, JSON.stringify({
          data: { isHolder, collections },
          timestamp: Date.now()
        }));
      } catch (storageError) {
        logger.warn('Failed to cache NFT status', { error: storageError.message });
      }
      
      logger.info('NFT status checked', { 
        isHolder, 
        collectionCount: collections.length,
        walletAddress 
      });
    } catch (error) {
      logger.error('Error checking NFT status', { error: error.message, walletAddress });
      // Fail gracefully - don't set to false if cache had a value
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
      let timeoutTriggered = false;
      const connectionTimeout = setTimeout(() => {
        if (!timeoutTriggered) {
          timeoutTriggered = true;
          setIsLoading(false);
          setError('Connection timeout. Please try again.');
        }
      }, 25000); // 25 seconds - reduced since we removed unnecessary waits

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
          
          // Skip wallet_requestPermissions for speed - go straight to eth_requestAccounts
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
          // Fast check - no waiting for injection
          if (!window.ethereum) {
            throw new Error('No wallet found. Please install Rabby Wallet extension.');
          }
          
          // Fast detection - try providers first, then primary
          if (window.ethereum.providers?.length > 0) {
            provider = window.ethereum.providers.find(p => p.isRabby);
          }
          
          if (!provider && window.ethereum.isRabby) {
            provider = window.ethereum;
          }
          
          if (!provider) {
            provider = window.ethereum;
          }
          
          if (!provider?.request) {
            throw new Error('Rabby wallet provider not ready. Please try again.');
          }
          
          // Skip wallet_requestPermissions for speed - go straight to eth_requestAccounts
          const rabbyAccounts = await Promise.race([
            provider.request({ 
              method: 'eth_requestAccounts' 
            }),
            new Promise((_, reject) => setTimeout(() => {
              reject(new Error('Connection timeout. Please ensure your wallet is unlocked and try again.'));
            }, 20000)) // Reduced to 20 seconds
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
          
          // Skip wallet_requestPermissions for speed - go straight to eth_requestAccounts
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
      if (connectionTimeout) clearTimeout(connectionTimeout);

      // Mark connection complete immediately - don't wait for credits/NFT
      logger.info('Wallet connected successfully', { address, walletType });

      // Start credits and NFT fetch in parallel (non-blocking)
      // But ensure credits are fetched immediately for display
      Promise.all([
        fetchCredits(address).then(credits => {
          console.log('✅ Credits fetched successfully:', credits);
          logger.info('Credits fetch completed', { credits, address });
          return credits;
        }).catch(error => {
          logger.error('Credits fetch failed', { error: error.message, error, address });
          console.error('❌ Credits fetch failed:', error);
          // Still show 0 credits so user knows it failed
          setCredits(0);
        }),
        checkNFTStatus(address).catch(error => {
          logger.error('NFT check failed', { error: error.message, address });
        })
      ]).catch(error => {
        logger.error('Background operations failed', { error: error.message, address });
      });
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

    // Refresh credits immediately when address changes or connection is established
    fetchCredits(address).catch(error => {
      logger.error('Initial credit refresh failed', { error: error.message, address });
    });

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
