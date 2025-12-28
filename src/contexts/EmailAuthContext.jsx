import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { 
  signUp, 
  signIn, 
  signOut as signOutService, 
  getAuthToken, 
  getUserEmail, 
  getAuthType,
  verifyToken
} from '../services/emailAuthService';
import logger from '../utils/logger';

const EmailAuthContext = createContext();

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export const EmailAuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [email, setEmail] = useState(null);
  const [userId, setUserId] = useState(null);
  const [credits, setCredits] = useState(0);
  const [totalCreditsEarned, setTotalCreditsEarned] = useState(0);
  const [totalCreditsSpent, setTotalCreditsSpent] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

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
        setTotalCreditsSpent(data.user.totalCreditsSpent || 0);
        setIsAuthenticated(true);
      }
    } catch (error) {
      logger.error('Error fetching user data:', { error: error.message });
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Check authentication on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = getAuthToken();
        const authType = getAuthType();
        
        if (token && authType === 'email') {
          const verified = await verifyToken();
          if (verified) {
            try {
              await fetchUserData();
            } catch (fetchError) {
              logger.warn('Error fetching user data on mount (non-critical)', { error: fetchError.message });
              setIsLoading(false);
            }
          } else {
            setIsLoading(false);
          }
        } else {
          setIsLoading(false);
        }
      } catch (error) {
        logger.error('Error checking auth on mount', { error: error.message });
        setIsLoading(false);
      }
    };

    checkAuth();
  }, [fetchUserData]);

  // Refresh credits periodically
  useEffect(() => {
    if (!isAuthenticated) return;

    // Fetch user data with error handling
    const safeFetchUserData = async () => {
      try {
        await fetchUserData();
      } catch (error) {
        logger.warn('Error in periodic user data fetch (non-critical)', { error: error.message });
      }
    };

    safeFetchUserData();
    const refreshInterval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        safeFetchUserData();
      }
    }, 30000);

    return () => clearInterval(refreshInterval);
  }, [isAuthenticated, fetchUserData]);


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
        setCredits(result.user.credits || 0);
        setTotalCreditsEarned(result.user.totalCreditsEarned || 0);
        setTotalCreditsSpent(result.user.totalCreditsSpent || 0);
        setIsAuthenticated(true);
        // Fetch fresh data - wrap in try/catch to prevent errors from breaking signin
        try {
          await fetchUserData();
        } catch (fetchError) {
          logger.warn('Error fetching user data after signin (non-critical)', { error: fetchError.message });
          // Don't fail signin if fetchUserData fails
        }
      }
      return result;
    } catch (error) {
      logger.error('Sign in failed', { 
        error: error.message,
        errorType: error.constructor.name,
        hasStack: !!error.stack
      });
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
  };

  // Refresh credits
  const refreshCredits = useCallback(async () => {
    if (isAuthenticated) {
      await fetchUserData();
    }
  }, [isAuthenticated, fetchUserData]);

  // Function to manually set credits for instant UI updates (before backend confirmation)
  const setCreditsManually = useCallback((newCredits) => {
    setCredits(newCredits);
  }, []);

  const value = {
    isAuthenticated,
    email,
    userId,
    credits,
    totalCreditsEarned,
    totalCreditsSpent,
    isLoading,
    error,
    signUp: handleSignUp,
    signIn: handleSignIn,
    signOut: handleSignOut,
    refreshCredits,
    fetchUserData,
    setCreditsManually
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

