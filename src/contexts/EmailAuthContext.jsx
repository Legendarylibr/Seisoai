import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { 
  signUp, 
  signIn, 
  signOut as signOutService, 
  getAuthToken, 
  getUserEmail, 
  getAuthType,
  verifyToken,
  linkWallet as linkWalletService
} from '../services/emailAuthService';
import { useSimpleWallet } from './SimpleWalletContext';
import logger from '../utils/logger';

const EmailAuthContext = createContext();

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export const EmailAuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [email, setEmail] = useState(null);
  const [userId, setUserId] = useState(null);
  const [credits, setCredits] = useState(0);
  const [totalCreditsEarned, setTotalCreditsEarned] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isNFTHolder, setIsNFTHolder] = useState(false);
  const [linkedWalletAddress, setLinkedWalletAddress] = useState(null);
  
  // Get wallet context (EmailAuthProvider is inside SimpleWalletProvider in App.jsx)
  const { 
    connectWallet: connectWalletFromContext, 
    disconnectWallet: disconnectWalletFromContext,
    address: walletAddress,
    isConnected: isWalletConnected,
    checkNFTStatus
  } = useSimpleWallet();

  // Fetch user data from backend
  const fetchUserData = useCallback(async () => {
    try {
      const token = getAuthToken();
      if (!token) {
        setIsAuthenticated(false);
        setIsLoading(false);
        return;
      }

      const response = await fetch(`${API_URL}/api/auth/me`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        // Token invalid
        signOutService();
        setIsAuthenticated(false);
        setIsLoading(false);
        return;
      }

      const data = await response.json();
      if (data.success && data.user) {
        setEmail(data.user.email);
        setUserId(data.user.userId);
        setCredits(data.user.credits || 0);
        setTotalCreditsEarned(data.user.totalCreditsEarned || 0);
        setIsNFTHolder(data.user.isNFTHolder || false);
        setLinkedWalletAddress(data.user.walletAddress || null);
        setIsAuthenticated(true);
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
      logger.error('Error fetching user data', { error: error.message });
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Check authentication on mount
  useEffect(() => {
    const checkAuth = async () => {
      const token = getAuthToken();
      const authType = getAuthType();
      
      if (token && authType === 'email') {
        const verified = await verifyToken();
        if (verified) {
          await fetchUserData();
        } else {
          setIsLoading(false);
        }
      } else {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, [fetchUserData]);

  // Refresh credits periodically (reduced frequency to prevent API spam)
  useEffect(() => {
    if (!isAuthenticated) return;

    const refreshInterval = setInterval(() => {
      fetchUserData();
    }, 120000); // Every 2 minutes (reduced from 60s to reduce API calls)

    return () => clearInterval(refreshInterval);
  }, [isAuthenticated, fetchUserData]);

  // Handle wallet connection for email users (optional NFT verification)
  const connectWallet = useCallback(async (walletType = 'metamask') => {
    try {
      // Connect wallet using the wallet context
      await connectWalletFromContext(walletType);
      
      // Wait a bit for wallet to connect
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Get the wallet address from context (it should be set by now)
      const currentWalletAddress = walletAddress;
      
      if (currentWalletAddress) {
        await linkWalletService(currentWalletAddress);
        setLinkedWalletAddress(currentWalletAddress);
        
        // Check NFT status for discount
        await checkNFTStatus(currentWalletAddress);
        
        // Refresh user data to get updated info
        await fetchUserData();
      }
    } catch (error) {
      console.error('Error connecting wallet:', error);
      logger.error('Error connecting wallet', { error: error.message });
      throw error;
    }
  }, [walletAddress, connectWalletFromContext, checkNFTStatus, fetchUserData]);

  // Disconnect wallet (but keep email auth)
  const disconnectWallet = useCallback(async () => {
    try {
      disconnectWalletFromContext();
      setLinkedWalletAddress(null);
      setIsNFTHolder(false);
      
      // Update backend to remove wallet link
      const token = getAuthToken();
      if (token) {
        await fetch(`${API_URL}/api/auth/unlink-wallet`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
      }
      
      await fetchUserData();
    } catch (error) {
      console.error('Error disconnecting wallet:', error);
      logger.error('Error disconnecting wallet', { error: error.message });
    }
  }, [disconnectWalletFromContext, fetchUserData]);

  // Sign up
  const handleSignUp = async (email, password) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const result = await signUp(email, password);
      if (result.success) {
        setEmail(email);
        setUserId(result.user.userId);
        setIsAuthenticated(true);
        await fetchUserData();
      }
      return result;
    } catch (error) {
      setError(error.message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Sign in
  const handleSignIn = async (email, password) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const result = await signIn(email, password);
      if (result.success) {
        setEmail(email);
        setUserId(result.user.userId);
        setIsAuthenticated(true);
        await fetchUserData();
      }
      return result;
    } catch (error) {
      setError(error.message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Sign out
  const handleSignOut = () => {
    signOutService();
    setIsAuthenticated(false);
    setEmail(null);
    setUserId(null);
    setCredits(0);
    setTotalCreditsEarned(0);
    setError(null);
    setIsNFTHolder(false);
    setLinkedWalletAddress(null);
    
    // Also disconnect wallet if connected
    if (isWalletConnected) {
      disconnectWalletFromContext();
    }
  };

  // Refresh credits
  const refreshCredits = useCallback(async () => {
    if (isAuthenticated) {
      await fetchUserData();
    }
  }, [isAuthenticated, fetchUserData]);

  const value = {
    isAuthenticated,
    email,
    userId,
    credits,
    totalCreditsEarned,
    isLoading,
    error,
    isNFTHolder,
    linkedWalletAddress,
    isWalletConnected,
    walletAddress,
    signUp: handleSignUp,
    signIn: handleSignIn,
    signOut: handleSignOut,
    connectWallet,
    disconnectWallet,
    refreshCredits,
    fetchUserData
  };

  return (
    <EmailAuthContext.Provider value={value}>
      {children}
    </EmailAuthContext.Provider>
  );
};

export const useEmailAuth = () => {
  const context = useContext(EmailAuthContext);
  if (!context) {
    throw new Error('useEmailAuth must be used within an EmailAuthProvider');
  }
  return context;
};

