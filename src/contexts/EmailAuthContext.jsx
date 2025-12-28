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

      // Add cache-busting for mobile browsers (they cache aggressively)
      const cacheBuster = `t=${Date.now()}`;
      const url = `${API_URL}/api/auth/me?${cacheBuster}`;
      logger.debug('Fetching email user data', { url, API_URL });
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        cache: 'no-store' // Prevent browser caching (critical for mobile) - this is sufficient
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unable to read error response');
        logger.error('Email auth API returned error', {
          status: response.status,
          statusText: response.statusText,
          error: errorText.substring(0, 200),
          API_URL,
          url
        });
        // Token invalid
        signOutService();
        setIsAuthenticated(false);
        setIsLoading(false);
        return;
      }

      const data = await response.json();
      if (data.success && data.user) {
        logger.debug('Email user data fetched successfully', {
          credits: data.user.credits || 0,
          API_URL
        });
        setEmail(data.user.email);
        setUserId(data.user.userId);
        setCredits(data.user.credits || 0);
        setTotalCreditsEarned(data.user.totalCreditsEarned || 0);
        setTotalCreditsSpent(data.user.totalCreditsSpent || 0);
        setIsAuthenticated(true);
      } else {
        logger.warn('Email auth response missing user data', { API_URL, hasSuccess: !!data.success });
      }
    } catch (error) {
      logger.error('Error fetching email user data:', { 
        error: error.message,
        errorName: error.name,
        API_URL,
        isNetworkError: error.name === 'TypeError' || error.message.includes('fetch')
      });
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
    // Refresh every 15 seconds to ensure cross-device synchronization
    const refreshInterval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        safeFetchUserData();
      }
    }, 15000); // Reduced to 15s for better cross-device sync

    // Also refresh when tab becomes visible (user switches back)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        safeFetchUserData();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(refreshInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
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

