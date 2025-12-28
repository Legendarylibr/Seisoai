import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { checkNFTHoldings } from '../services/nftVerificationService';
import logger from '../utils/logger';
import { API_URL } from '../utils/apiConfig';

const SimpleWalletContext = createContext();

export const SimpleWalletProvider = ({ children }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [address, setAddress] = useState(null);
  const [credits, setCredits] = useState(0);
  const [totalCreditsEarned, setTotalCreditsEarned] = useState(0);
  const [totalCreditsSpent, setTotalCreditsSpent] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isNFTHolder, setIsNFTHolder] = useState(false);
  const [nftCollections, setNftCollections] = useState([]);
  const [walletType, setWalletType] = useState(null);
  
  // Simple credit fetching - no caching, always fetch fresh from backend
  const fetchCredits = useCallback(async (walletAddress) => {
    if (!walletAddress) {
      setCredits(0);
      setTotalCreditsEarned(0);
      setTotalCreditsSpent(0);
      return 0;
    }

    const normalizedAddress = walletAddress.toLowerCase();
    
    try {
      const url = `${API_URL}/api/users/${normalizedAddress}?skipNFTs=true&t=${Date.now()}`;
      logger.debug('Fetching wallet credits', { url });
      
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store'
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        logger.error('Credits API error', { status: response.status, error: errorText.substring(0, 200) });
        return 0;
      }
      
      const data = await response.json();
      
      if (data.success && data.user) {
        const userCredits = Math.max(0, Math.floor(Number(data.user.credits) || 0));
        const userTotalEarned = Math.max(0, Math.floor(Number(data.user.totalCreditsEarned) || 0));
        const userTotalSpent = Math.max(0, Math.floor(Number(data.user.totalCreditsSpent) || 0));
        
        setCredits(userCredits);
        setTotalCreditsEarned(userTotalEarned);
        setTotalCreditsSpent(userTotalSpent);
        
        logger.debug('Credits fetched successfully', { credits: userCredits, totalEarned: userTotalEarned });
        return userCredits;
      }
      
      logger.warn('Unexpected API response format', { data });
      return 0;
    } catch (error) {
      logger.error('Failed to fetch credits', { error: error.message, walletAddress: normalizedAddress });
      return 0;
    }
  }, []);

  // Check NFT holdings
  const checkNFTStatus = useCallback(async (walletAddress) => {
    if (!walletAddress) {
      setIsNFTHolder(false);
      setNftCollections([]);
      return;
    }

    try {
      const normalizedAddress = walletAddress.toLowerCase();
      const result = await checkNFTHoldings(normalizedAddress);
      
      setIsNFTHolder(result.isHolder === true);
      setNftCollections(Array.isArray(result.collections) ? result.collections : []);
      
      // Refresh credits if NFT credits were granted
      if (result.creditsGranted && result.creditsGranted > 0) {
        await fetchCredits(normalizedAddress);
      }
    } catch (error) {
      logger.error('Error checking NFT status', { error: error.message });
      setIsNFTHolder(false);
      setNftCollections([]);
    }
  }, [fetchCredits]);

  // Connect wallet
  const connectWallet = async (walletType = 'metamask') => {
    try {
      setIsLoading(true);
      setError(null);

      let provider = null;
      let walletAddress = null;

      switch (walletType) {
        case 'metamask':
          if (!window.ethereum) {
            throw new Error('MetaMask not found. Please install MetaMask extension.');
          }
          provider = window.ethereum.providers?.find(p => p.isMetaMask && !p.isRabby)
            || (window.ethereum.isMetaMask ? window.ethereum : null)
            || window.ethereum;
          
          if (!provider) {
            throw new Error('MetaMask not found.');
          }
          const accounts = await provider.request({ method: 'eth_requestAccounts' });
          walletAddress = accounts[0];
          setWalletType('evm');
          break;

        case 'rabby':
          if (!window.ethereum) {
            throw new Error('Rabby Wallet not found.');
          }
          provider = window.ethereum.providers?.find(p => p.isRabby) 
            || (window.ethereum.isRabby ? window.ethereum : null)
            || window.ethereum;
          
          const rabbyAccounts = await provider.request({ method: 'eth_requestAccounts' });
          walletAddress = rabbyAccounts[0];
          setWalletType('evm');
          break;

        case 'coinbase':
          if (!window.ethereum) {
            throw new Error('Coinbase Wallet not found.');
          }
          provider = window.ethereum.providers?.find(p => p.isCoinbaseWallet)
            || (window.ethereum.isCoinbaseWallet ? window.ethereum : null);
          
          if (!provider) {
            throw new Error('Coinbase Wallet not found.');
          }
          const coinbaseAccounts = await provider.request({ method: 'eth_requestAccounts' });
          walletAddress = coinbaseAccounts[0];
          setWalletType('evm');
          break;

        case 'phantom':
          if (!window.solana || !window.solana.isPhantom) {
            throw new Error('Phantom Wallet not found.');
          }
          const phantomResp = await window.solana.connect();
          walletAddress = phantomResp.publicKey.toString();
          setWalletType('solana');
          break;

        case 'solflare':
          if (!window.solflare) {
            throw new Error('Solflare Wallet not found.');
          }
          await window.solflare.connect();
          walletAddress = window.solflare.publicKey.toString();
          setWalletType('solana');
          break;

        default:
          throw new Error(`Unsupported wallet type: ${walletType}`);
      }

      if (!walletAddress) {
        throw new Error('No accounts found');
      }

      setAddress(walletAddress);
      setIsConnected(true);
      
      logger.info('Wallet connected', { address: walletAddress, walletType });

      // Fetch credits immediately after connection
      await fetchCredits(walletAddress);
      
      // Check NFT status in background
      checkNFTStatus(walletAddress).catch(err => {
        logger.warn('NFT check failed', { error: err.message });
      });

    } catch (error) {
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
    setTotalCreditsSpent(0);
    setError(null);
    setIsNFTHolder(false);
    setNftCollections([]);
    setWalletType(null);
  };

  // Periodic credit refresh when connected
  useEffect(() => {
    if (!isConnected || !address) return;

    // Initial fetch
    fetchCredits(address);

    // Refresh every 30 seconds
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchCredits(address);
      }
    }, 30000);

    // Refresh when tab becomes visible
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchCredits(address);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isConnected, address, fetchCredits]);

  // Manual refresh function
  const refreshCredits = useCallback(async () => {
    if (address) {
      await fetchCredits(address);
    }
  }, [address, fetchCredits]);

  // Manual credit setter for optimistic UI updates
  const setCreditsManually = useCallback((newCredits) => {
    const validated = Math.max(0, Math.floor(Number(newCredits) || 0));
    setCredits(validated);
  }, []);

  const value = {
    isConnected,
    address,
    credits,
    totalCreditsEarned,
    totalCreditsSpent,
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
