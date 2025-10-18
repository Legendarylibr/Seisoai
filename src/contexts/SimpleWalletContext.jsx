import React, { createContext, useContext, useState, useEffect } from 'react';
import { ethers } from 'ethers';

const SimpleWalletContext = createContext();

const API_URL = 'http://localhost:3001';

export const SimpleWalletProvider = ({ children }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [address, setAddress] = useState(null);
  const [credits, setCredits] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Fetch credits from backend
  const fetchCredits = async (walletAddress) => {
    try {
      console.log(`🔍 Fetching credits for ${walletAddress}`);
      const response = await fetch(`${API_URL}/api/users/${walletAddress}`);
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.user) {
          setCredits(data.user.credits || 0);
          console.log(`✅ Credits loaded: ${data.user.credits}`);
        }
      } else {
        console.warn('Failed to fetch credits:', response.status);
      }
    } catch (error) {
      console.error('Error fetching credits:', error);
    }
  };

  // Connect wallet
  const connectWallet = async () => {
    try {
      setIsLoading(true);
      setError(null);

      if (!window.ethereum) {
        throw new Error('No wallet found. Please install MetaMask or another wallet.');
      }

      // Request account access
      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts'
      });

      if (accounts.length === 0) {
        throw new Error('No accounts found');
      }

      const address = accounts[0];
      setAddress(address);
      setIsConnected(true);

      // Fetch credits
      await fetchCredits(address);

      console.log(`✅ Wallet connected: ${address}`);
    } catch (error) {
      console.error('Wallet connection error:', error);
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
  };

  // Check for existing connection on load
  useEffect(() => {
    const checkConnection = async () => {
      if (window.ethereum) {
        try {
          const accounts = await window.ethereum.request({ method: 'eth_accounts' });
          if (accounts.length > 0) {
            const address = accounts[0];
            setAddress(address);
            setIsConnected(true);
            await fetchCredits(address);
          }
        } catch (error) {
          console.warn('Error checking existing connection:', error);
        }
      }
    };

    checkConnection();
  }, []);

  const value = {
    isConnected,
    address,
    credits,
    isLoading,
    error,
    connectWallet,
    disconnectWallet,
    fetchCredits
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
