import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { checkNFTHoldings } from '../services/nftVerificationService';
import logger from '../utils/logger';

const SimpleWalletContext = createContext();

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Request deduplication - prevent multiple simultaneous requests for same wallet
// Shared across all instances to prevent duplicate requests from multiple tabs/components
const pendingRequests = new Map();

export const SimpleWalletProvider = ({ children }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [address, setAddress] = useState(null);
  const [credits, setCredits] = useState(0); // Current spendable balance
  const [totalCreditsEarned, setTotalCreditsEarned] = useState(0); // Total rewarded amount
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isNFTHolder, setIsNFTHolder] = useState(false);
  const [nftCollections, setNftCollections] = useState([]);
  const [walletType, setWalletType] = useState(null); // 'evm' or 'solana'
  
  // Fetch credits from backend with retry logic and caching
  const fetchCredits = useCallback(async (walletAddress, retries = 3, skipCache = false) => {
      if (!walletAddress) {
        logger.warn('No wallet address provided to fetchCredits');
        setCredits(0);
        return 0;
      }

    // Normalize wallet address (lowercase for EVM addresses)
    const normalizedAddress = walletAddress.toLowerCase();
    
    // Check if there's already a pending request for this wallet
    const requestKey = `${normalizedAddress}_${skipCache ? 'fresh' : 'cached'}`;
    if (pendingRequests.has(requestKey)) {
      logger.debug('Deduplicating credit fetch request', { walletAddress: normalizedAddress });
      return pendingRequests.get(requestKey);
    }
    
    logger.debug('Fetching credits', { walletAddress: normalizedAddress });
    
    // Check cache first (1 minute cache for credits) - skip if skipCache is true
    const cacheKey = `credits_${normalizedAddress}`;
    if (!skipCache) {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        try {
            const { data, timestamp } = JSON.parse(cached);
            if (Date.now() - timestamp < 60000) { // 1 minute
              logger.debug('Using cached credits', { walletAddress: normalizedAddress, credits: data.credits, totalCreditsEarned: data.totalCreditsEarned, rawCredits: data.rawCredits });
              setCredits(data.credits || 0);
              setTotalCreditsEarned(data.totalCreditsEarned || 0);
              return data.credits || 0;
            }
        } catch (cacheError) {
          logger.warn('Failed to parse cached credits', { error: cacheError.message });
        }
      }
    } else {
      // Clear cache when forcing refresh
      sessionStorage.removeItem(cacheKey);
      // Also clear all credit caches for this wallet to be thorough
      try {
        Object.keys(sessionStorage).forEach(key => {
          if (key.startsWith(`credits_${normalizedAddress}`) || key.includes(normalizedAddress)) {
            sessionStorage.removeItem(key);
          }
        });
      } catch (e) {
        // Ignore errors during cache clearing
      }
      logger.debug('Cache cleared, fetching fresh credits');
    }

    // Create promise and store it for deduplication
    const fetchPromise = (async () => {
      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          // Skip NFT checks for faster credits fetching - NFT checks happen separately
          const apiEndpoint = `${API_URL}/api/users/${normalizedAddress}?skipNFTs=true`;
          logger.debug('Fetching credits from backend', { walletAddress: normalizedAddress, attempt, retries });
          const response = await fetch(apiEndpoint, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          // Increased timeout since backend might be slow
          signal: AbortSignal.timeout(15000) // 15 seconds - backend NFT checks can be slow
        });
        
        if (response.ok) {
          const data = await response.json();
          logger.debug('Credits API response received', { data, walletAddress });
          
          // Extract both credits (current balance) and totalCreditsEarned (rewarded amount)
          let currentCredits = 0;
          let rewardedAmount = 0;
          
          // Get current balance (for spending)
          if (data.success && data.user && typeof data.user.credits !== 'undefined') {
            currentCredits = Number(data.user.credits) || 0;
          } else if (data.success && typeof data.credits !== 'undefined') {
            currentCredits = Number(data.credits) || 0;
          } else if (data.user && typeof data.user.credits !== 'undefined') {
            currentCredits = Number(data.user.credits) || 0;
          }
          
          // Get rewarded amount (totalCreditsEarned)
          // Try multiple paths to ensure we get the value
          if (data.success && data.user && typeof data.user.totalCreditsEarned !== 'undefined') {
            rewardedAmount = Number(data.user.totalCreditsEarned) || 0;
            logger.info('Rewarded amount found in data.user.totalCreditsEarned', { rewardedAmount, walletAddress: normalizedAddress });
          } else if (data.success && typeof data.totalCreditsEarned !== 'undefined') {
            rewardedAmount = Number(data.totalCreditsEarned) || 0;
            logger.info('Rewarded amount found in data.totalCreditsEarned', { rewardedAmount, walletAddress: normalizedAddress });
          } else if (data.user && typeof data.user.totalCreditsEarned !== 'undefined') {
            rewardedAmount = Number(data.user.totalCreditsEarned) || 0;
            logger.info('Rewarded amount found in data.user.totalCreditsEarned (no success flag)', { rewardedAmount, walletAddress: normalizedAddress });
          } else {
            // Log warning if we expected it but didn't find it
            logger.warn('totalCreditsEarned not found in response', { 
              hasUser: !!data.user, 
              hasSuccess: data.success,
              dataKeys: Object.keys(data),
              userKeys: data.user ? Object.keys(data.user) : [],
              walletAddress: normalizedAddress 
            });
            logger.warn('totalCreditsEarned not found in API response', { hasUser: !!data.user, hasSuccess: data.success });
          }
          
          // Store both values separately - credits (current spendable balance) and totalCreditsEarned (lifetime total)
          // Use actual credits for spending - totalCreditsEarned is for tracking only
          // Credits and totalCreditsEarned are always kept in sync when credits are added
          setCredits(currentCredits);
          setTotalCreditsEarned(rewardedAmount);
          
          logger.info('Credits loaded successfully', { credits: currentCredits, totalCreditsEarned: rewardedAmount, walletAddress: normalizedAddress });
          if (skipCache) {
            logger.debug('Fresh credits fetched (cache bypassed)');
          }
          
          // Cache the result (cache actual credits for faster access)
          try {
            sessionStorage.setItem(cacheKey, JSON.stringify({
              data: { credits: currentCredits, totalCreditsEarned: rewardedAmount, rawCredits: currentCredits },
              timestamp: Date.now()
            }));
          } catch (storageError) {
            logger.warn('Failed to cache credits', { error: storageError.message });
          }
          
          logger.info('Credits loaded successfully', { 
            credits: currentCredits, 
            totalCreditsEarned: rewardedAmount, 
            walletAddress: normalizedAddress 
          });
          return currentCredits; // Return actual credits for spending validation
        } else {
          const errorText = await response.text();
          logger.error('Credits fetch failed', { status: response.status, errorText: errorText.substring(0, 100) });
          logger.warn('Failed to fetch credits', { 
            status: response.status, 
            statusText: response.statusText,
            errorText,
            attempt, 
            retries, 
            walletAddress: normalizedAddress 
          });
          if (attempt === retries) {
            setCredits(0);
            logger.warn('All attempts failed - credits set to 0');
            return 0;
          }
        }
      } catch (error) {
        logger.error('Error fetching credits', { attempt, retries, error: error.message });
        logger.error('Error fetching credits', { 
          error: error.message,
          errorStack: error.stack,
          attempt, 
          retries, 
          walletAddress: normalizedAddress,
          apiUrl: API_URL
        });
        
        // Don't retry on user abort
        if (error.name === 'AbortError') {
          logger.warn('Request aborted', { walletAddress: normalizedAddress });
          setCredits(0);
          return 0;
        }
        
        // On last attempt, set credits to 0
        if (attempt === retries) {
          logger.error('All retry attempts failed', { walletAddress: normalizedAddress });
          setCredits(0);
          return 0;
        } else {
          // Wait before retrying (exponential backoff)
          const delay = Math.min(1000 * attempt, 3000); // Max 3 second delay
          logger.debug('Retrying credit fetch', { delay, attempt, walletAddress: normalizedAddress });
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    return 0; // Fallback
    })();
    
    // Store promise for deduplication
    pendingRequests.set(requestKey, fetchPromise);
    
    // Clean up after request completes
    fetchPromise.finally(() => {
      // Small delay before removing to allow concurrent requests to share the promise
      setTimeout(() => {
        pendingRequests.delete(requestKey);
      }, 100);
    });
    
    return fetchPromise;
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
    // Declare timeout outside try block so it's accessible in catch
    let connectionTimeout = null;
    
    try {
      setIsLoading(true);
      setError(null);

      let provider = null;
      let address = null;

      // Add timeout to prevent infinite loading
      let timeoutTriggered = false;
      connectionTimeout = setTimeout(() => {
        if (!timeoutTriggered) {
          timeoutTriggered = true;
          setIsLoading(false);
          setError('Connection timeout. Please try again.');
        }
      }, 25000); // 25 seconds - reduced since we removed unnecessary waits

      // Handle different wallet types
      switch (walletType) {
        case 'metamask':
          try {
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
            logger.info('MetaMask connected successfully', { address });
          } catch (metamaskError) {
            // Ensure timeout is cleared before rethrowing
            if (connectionTimeout) clearTimeout(connectionTimeout);
            throw metamaskError;
          }
        break;

      case 'rabby':
          try {
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
            logger.info('Rabby connected successfully', { address });
          } catch (rabbyError) {
            // Ensure timeout is cleared before rethrowing
            if (connectionTimeout) clearTimeout(connectionTimeout);
            throw rabbyError;
          }
        break;

      case 'coinbase':
          try {
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
            logger.info('Coinbase Wallet connected successfully', { address });
          } catch (coinbaseError) {
            // Ensure timeout is cleared before rethrowing
            if (connectionTimeout) clearTimeout(connectionTimeout);
            throw coinbaseError;
          }
        break;

      case 'phantom':
          try {
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
              logger.info('Phantom connected successfully', { address });
            } catch (phantomError) {
              clearTimeout(phantomTimeout);
              if (connectionTimeout) clearTimeout(connectionTimeout);
              logger.error('Phantom connection failed', { error: phantomError.message });
              throw new Error(`Phantom connection failed: ${phantomError.message}`);
            }
          } catch (phantomOuterError) {
            // Ensure timeout is cleared before rethrowing
            if (connectionTimeout) clearTimeout(connectionTimeout);
            throw phantomOuterError;
          }
        break;

      case 'solflare':
          try {
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
              logger.info('Solflare connected successfully', { address });
            } catch (solflareError) {
              clearTimeout(solflareTimeout);
              if (connectionTimeout) clearTimeout(connectionTimeout);
              logger.error('Solflare connection failed', { error: solflareError.message });
              throw new Error(`Solflare connection failed: ${solflareError.message}`);
            }
          } catch (solflareOuterError) {
            // Ensure timeout is cleared before rethrowing
            if (connectionTimeout) clearTimeout(connectionTimeout);
            throw solflareOuterError;
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

  // Periodic credit refresh when connected
  useEffect(() => {
    if (!isConnected || !address) return;

    // Refresh credits immediately when address changes or connection is established (skip cache for fresh data)
    fetchCredits(address, 3, true).catch(error => {
      logger.error('Initial credit refresh failed', { error: error.message, address });
    });

    // Refresh credits every 2 minutes to keep display updated (reduced from 60s to reduce API spam)
    const refreshInterval = setInterval(() => {
      logger.debug('Periodic credit refresh');
      fetchCredits(address).catch(error => {
        logger.error('Periodic credit refresh failed', { error: error.message, address });
      });
    }, 120000); // Every 2 minutes (reduced API calls)

    // Cleanup interval on unmount
    return () => clearInterval(refreshInterval);
  }, [isConnected, address]); // Removed fetchCredits from dependencies

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
    credits, // Current spendable balance (actual credits field from backend)
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
