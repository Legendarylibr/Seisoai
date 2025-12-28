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
import { API_URL } from '../utils/apiConfig';

const EmailAuthContext = createContext();

export const EmailAuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [email, setEmail] = useState(null);
  const [userId, setUserId] = useState(null);
  const [credits, setCredits] = useState(0);
  const [totalCreditsEarned, setTotalCreditsEarned] = useState(0);
  const [totalCreditsSpent, setTotalCreditsSpent] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Simple credit fetching - always fetch fresh from backend
  const fetchUserData = useCallback(async () => {
    const token = getAuthToken();
    if (!token) {
      setIsAuthenticated(false);
      setCredits(0);
      setTotalCreditsEarned(0);
      setTotalCreditsSpent(0);
      setIsLoading(false);
      return;
    }

    try {
      // OPTIMIZATION: Remove redundant timestamp query param, rely on cache headers
      const response = await fetch(`${API_URL}/api/auth/me`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache' // Request fresh data but allow conditional caching
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('Auth API error', { status: response.status, error: errorText.substring(0, 200) });
        
        // Token invalid - sign out
        signOutService();
        setIsAuthenticated(false);
        setCredits(0);
        setTotalCreditsEarned(0);
        setTotalCreditsSpent(0);
        setIsLoading(false);
        return;
      }

      const data = await response.json();
      
      if (data.success && data.user) {
        const userCredits = Math.max(0, Math.floor(Number(data.user.credits) || 0));
        const userTotalEarned = Math.max(0, Math.floor(Number(data.user.totalCreditsEarned) || 0));
        const userTotalSpent = Math.max(0, Math.floor(Number(data.user.totalCreditsSpent) || 0));
        
        setCredits(userCredits);
        setTotalCreditsEarned(userTotalEarned);
        setTotalCreditsSpent(userTotalSpent);
        
        if (data.user.email) setEmail(data.user.email);
        if (data.user.userId) setUserId(data.user.userId);
        
        setIsAuthenticated(true);
        logger.debug('Email user data fetched', { credits: userCredits, email: data.user.email });
      } else {
        logger.warn('Unexpected API response', { data });
        setCredits(0);
        setTotalCreditsEarned(0);
        setTotalCreditsSpent(0);
      }
    } catch (error) {
      logger.error('Failed to fetch user data', { error: error.message });
      // Don't sign out on network errors - token might still be valid
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

  // Periodic refresh when authenticated
  useEffect(() => {
    if (!isAuthenticated) return;

    // Refresh every 30 seconds
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchUserData();
      }
    }, 30000);

    // Refresh when tab becomes visible
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchUserData();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isAuthenticated, fetchUserData]);

  // Sign up
  const handleSignUp = async (userEmail, password) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const result = await signUp(userEmail, password);
      if (result.success) {
        setEmail(userEmail);
        setUserId(result.user.userId);
        setIsAuthenticated(true);
        await fetchUserData();
      }
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // Sign in
  const handleSignIn = async (userEmail, password) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const result = await signIn(userEmail, password);
      if (result.success) {
        setEmail(userEmail);
        setUserId(result.user.userId);
        setCredits(Number(result.user.credits) || 0);
        setTotalCreditsEarned(Number(result.user.totalCreditsEarned) || 0);
        setTotalCreditsSpent(Number(result.user.totalCreditsSpent) || 0);
        setIsAuthenticated(true);
        
        // Fetch fresh data
        await fetchUserData();
      }
      return result;
    } catch (err) {
      logger.error('Sign in failed', { error: err.message });
      setError(err.message);
      throw err;
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
    setTotalCreditsSpent(0);
    setError(null);
  };

  // Manual refresh
  const refreshCredits = useCallback(async () => {
    if (isAuthenticated) {
      await fetchUserData();
    }
  }, [isAuthenticated, fetchUserData]);

  // Manual credit setter for optimistic UI updates
  const setCreditsManually = useCallback((newCredits) => {
    const validated = Math.max(0, Math.floor(Number(newCredits) || 0));
    setCredits(validated);
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
