import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { checkNFTHoldings } from '../services/nftVerificationService';
import logger from '../utils/logger';

const SimpleWalletContext = createContext();

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';


export const SimpleWalletProvider = ({ children }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [address, setAddress] = useState(null);
  const [credits, setCredits] = useState(0); // Current spendable balance
  const [totalCreditsEarned, setTotalCreditsEarned] = useState(0); // Total rewarded amount
  const [totalCreditsSpent, setTotalCreditsSpent] = useState(0); // Total spent amount
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isNFTHolder, setIsNFTHolder] = useState(false);
  const [nftCollections, setNftCollections] = useState([]);
  const [walletType, setWalletType] = useState(null); // 'evm' or 'solana'
  
  // Fetch credits from backend - simplified
  const fetchCredits = useCallback(async (walletAddress, retries = 3, skipCache = false) => {
    if (!walletAddress) {
      setCredits(0);
      return 0;
    }

    const normalizedAddress = walletAddress.toLowerCase();
    const cacheKey = `credits_${normalizedAddress}`;
    
    // Skip sessionStorage cache to ensure credits are always fresh across devices
    // Device-specific caching can cause credits to be out of sync between devices
    // Always fetch from backend to ensure consistency
    if (!skipCache) {
      // Only use cache for immediate UI feedback, but still fetch fresh data
      try {
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
          try {
            const { data, timestamp } = JSON.parse(cached);
            // Very short cache (5 seconds) - just for instant UI, then refresh
            if (Date.now() - timestamp < 5000) {
              // Set cached value for instant UI, but still fetch fresh data in background
              setCredits(data.credits || 0);
              setTotalCreditsEarned(data.totalCreditsEarned || 0);
              setTotalCreditsSpent(data.totalCreditsSpent || 0);
              // Don't return early - continue to fetch fresh data
            }
          } catch (e) {
            // Ignore cache errors - clear invalid cache
            try {
              sessionStorage.removeItem(cacheKey);
            } catch (clearError) {
              // Ignore
            }
          }
        }
      } catch (e) {
        // sessionStorage might not be available on some mobile browsers in private mode
        // Just continue to fetch from API
        logger.debug('sessionStorage not available, fetching from API', { error: e.message });
      }
    }

    // Fetch from API with cache-busting for mobile browsers
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        // Add cache-busting timestamp for mobile browsers (they cache aggressively)
        const cacheBuster = `t=${Date.now()}&attempt=${attempt}`;
        const url = `${API_URL}/api/users/${normalizedAddress}?skipNFTs=true&${cacheBuster}`;
        logger.debug('Fetching credits', { url, attempt, API_URL });
        
        const response = await fetch(url, {
          method: 'GET',
          headers: { 
            'Content-Type': 'application/json'
          },
          cache: 'no-store', // Prevent browser caching (critical for mobile) - this is sufficient
          signal: AbortSignal.timeout(20000) // Increased timeout for mobile networks
        });
        
        if (response.ok) {
          const data = await response.json();
          const user = data.user || data;
          
          const currentCredits = Number(user.credits || data.credits || 0);
          const rewardedAmount = Number(user.totalCreditsEarned || data.totalCreditsEarned || 0);
          const spentAmount = Number(user.totalCreditsSpent || data.totalCreditsSpent || 0);
          
          logger.debug('Credits fetched successfully', { 
            currentCredits, 
            rewardedAmount, 
            spentAmount,
            API_URL 
          });
          
          setCredits(currentCredits);
          setTotalCreditsEarned(rewardedAmount);
          setTotalCreditsSpent(spentAmount);
          
          // Cache result
          try {
            sessionStorage.setItem(cacheKey, JSON.stringify({
              data: { credits: currentCredits, totalCreditsEarned: rewardedAmount, totalCreditsSpent: spentAmount },
              timestamp: Date.now()
            }));
          } catch (e) {
            // Ignore cache errors
          }
          
          return currentCredits;
        } else {
          // Log non-OK responses for debugging
          const errorText = await response.text().catch(() => 'Unable to read error response');
          logger.error('Credits API returned error', {
            status: response.status,
            statusText: response.statusText,
            error: errorText.substring(0, 200),
            API_URL,
            url,
            attempt
          });
          
          if (attempt === retries) {
            setCredits(0);
            return 0;
          }
        }
      } catch (error) {
        logger.error('Error fetching credits', {
          error: error.message,
          errorName: error.name,
          API_URL,
          attempt,
          isAbortError: error.name === 'AbortError',
          willRetry: attempt < retries && error.name !== 'AbortError'
        });
        
        if (error.name === 'AbortError' || attempt === retries) {
          setCredits(0);
          return 0;
        }
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
    
    logger.warn('Failed to fetch credits after all retries', { API_URL, walletAddress: normalizedAddress });
    setCredits(0);
    return 0;
  }, [API_URL]);

  // Check NFT holdings with caching
  const checkNFTStatus = async (walletAddress) => {
    try {
      if (!walletAddress) {
        logger.warn('No wallet address provided to checkNFTStatus');
        setIsNFTHolder(false);
        setNftCollections([]);
        return;
      }

      // Normalize wallet address (lowercase for EVM addresses)
      const normalizedAddress = walletAddress.toLowerCase();
      logger.debug('Checking NFT status', { walletAddress: normalizedAddress });
      
      // Check cache first (5 minute cache)
      const cacheKey = `nft_${normalizedAddress}`;
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

      logger.debug('Checking NFT holdings', { walletAddress: normalizedAddress });
      const result = await checkNFTHoldings(normalizedAddress);
      
      // Ensure we have valid boolean and array
      const isHolder = result.isHolder === true;
      const collections = Array.isArray(result.collections) ? result.collections : [];
      
      setIsNFTHolder(isHolder);
      setNftCollections(collections);
      
      // If credits were granted (from backend response), refresh credits immediately
      if (result.creditsGranted && result.creditsGranted > 0) {
        logger.info('NFT credits were granted, refreshing credit balance', { 
          creditsGranted: result.creditsGranted,
          walletAddress: normalizedAddress 
        });
        // Refresh credits to show the newly granted credits
        await fetchCredits(normalizedAddress, 3, true).catch(error => {
          logger.error('Failed to refresh credits after NFT grant', { error: error.message });
        });
      }
      
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
        walletAddress: normalizedAddress 
      });
    } catch (error) {
      logger.error('Error checking NFT status', { 
        error: error.message,
        walletAddress: normalizedAddress 
      });
      // Fail gracefully - don't set to false if cache had a value
      setIsNFTHolder(false);
      setNftCollections([]);
    }
  };

  // Connect wallet with wallet type support
  const connectWallet = async (walletType = 'metamask') => {
    let connectionTimeout = null;
    
    try {
      setIsLoading(true);
      setError(null);

      let provider = null;
      let address = null;

      connectionTimeout = setTimeout(() => {
        setIsLoading(false);
        setError('Connection timeout. Please try again.');
      }, 25000);

      // Handle different wallet types
      switch (walletType) {
        case 'metamask':
          if (!window.ethereum) {
            throw new Error('MetaMask not found. Please install MetaMask extension.');
          }
          
          provider = window.ethereum.providers?.find(p => p.isMetaMask && !p.isRabby)
            || (window.ethereum.isMetaMask ? window.ethereum : null);
          
          if (!provider) {
            throw new Error('MetaMask not found. Please make sure MetaMask is installed and enabled.');
          }
          
          const accounts = await provider.request({ method: 'eth_requestAccounts' });
          if (!accounts || accounts.length === 0) {
            throw new Error('No accounts found. Please unlock MetaMask and try again.');
          }
          address = accounts[0];
          setWalletType('evm');
        break;

      case 'rabby':
          if (!window.ethereum) {
            throw new Error('No wallet found. Please install Rabby Wallet extension.');
          }
          
          provider = window.ethereum.providers?.find(p => p.isRabby) 
            || (window.ethereum.isRabby ? window.ethereum : null)
            || window.ethereum;
          
          if (!provider?.request) {
            throw new Error('Rabby wallet provider not ready. Please try again.');
          }
          
          const rabbyAccounts = await Promise.race([
            provider.request({ method: 'eth_requestAccounts' }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout. Please ensure your wallet is unlocked and try again.')), 20000))
          ]);
          
          if (!rabbyAccounts || rabbyAccounts.length === 0) {
            throw new Error('No accounts found. Please unlock your wallet and try again.');
          }
          address = rabbyAccounts[0];
          setWalletType('evm');
        break;

      case 'coinbase':
          if (!window.ethereum) {
            throw new Error('Coinbase Wallet not found. Please install Coinbase Wallet extension.');
          }
          
          provider = window.ethereum.providers?.find(p => p.isCoinbaseWallet)
            || (window.ethereum.isCoinbaseWallet ? window.ethereum : null);
          
          if (!provider) {
            throw new Error('Coinbase Wallet not found. Please make sure Coinbase Wallet is installed and enabled.');
          }
          
          const coinbaseAccounts = await provider.request({ method: 'eth_requestAccounts' });
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
          
          const phantomResp = await Promise.race([
            provider.connect(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Phantom connection timeout. Please try again.')), 15000))
          ]);
          
          if (!phantomResp || !phantomResp.publicKey) {
            throw new Error('Failed to connect. Please unlock Phantom and try again.');
          }
          address = phantomResp.publicKey.toString();
          setWalletType('solana');
        break;

      case 'solflare':
          if (!window.solflare) {
            throw new Error('Solflare Wallet not found. Please install Solflare extension.');
          }
          provider = window.solflare;
          
          await Promise.race([
            provider.connect(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Solflare connection timeout. Please try again.')), 15000))
          ]);
          
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
      if (connectionTimeout) clearTimeout(connectionTimeout);

      // Mark connection complete immediately - don't wait for credits/NFT
      logger.info('Wallet connected successfully', { address, walletType });

      // Start credits and NFT fetch in parallel (non-blocking)
      // But ensure credits are fetched immediately for display (skip cache for fresh data)
      Promise.all([
        fetchCredits(address, 3, true).then(credits => {
          logger.info('Credits fetched successfully', { credits, address });
          return credits;
        }).catch(error => {
          logger.error('Credits fetch failed', { error: error.message, address });
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
    setTotalCreditsEarned(0);
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

    // Periodic credit refresh when connected - frequent refresh for cross-device sync
  useEffect(() => {
    if (!isConnected || !address) return;

    // Initial fetch with cache bypass
    fetchCredits(address, 3, true).catch(() => {});

    // Refresh every 15 seconds to ensure cross-device synchronization
    const refreshInterval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchCredits(address, 3, true).catch(() => {});
      }
    }, 15000); // Reduced from 30s to 15s for better cross-device sync

    // Also refresh when tab becomes visible (user switches back)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchCredits(address, 3, true).catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(refreshInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isConnected, address, fetchCredits]);

  // Function to refresh credits without full reconnection (bypasses cache)
  const refreshCredits = async () => {
    if (address) {
      await fetchCredits(address, 3, true); // Skip cache to force fresh data
    }
  };

  // Function to manually set credits for testing
  const setCreditsManually = (newCredits) => {
    setCredits(newCredits);
  };

  const value = {
    isConnected,
    address,
    credits, // Current spendable balance (includes all credits from all sources)
    totalCreditsEarned, // Total credits earned from all sources
    totalCreditsSpent, // Total credits spent
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
