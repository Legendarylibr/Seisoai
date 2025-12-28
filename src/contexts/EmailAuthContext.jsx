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

// Warn if API_URL is still localhost in production
if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && API_URL.includes('localhost')) {
  logger.error('⚠️ VITE_API_URL is not set correctly for production!', {
    currentAPI_URL: API_URL,
    hostname: window.location.hostname,
    expectedFormat: 'https://your-backend-domain.com',
    envVar: import.meta.env.VITE_API_URL
  });
  // Show user-friendly error in console
  console.error('❌ API URL Configuration Error:', 'VITE_API_URL environment variable is not set. Credits will not load.');
}

// Validate API URL format
if (typeof window !== 'undefined' && API_URL && !API_URL.startsWith('http')) {
  logger.error('⚠️ Invalid API_URL format!', {
    currentAPI_URL: API_URL,
    expectedFormat: 'http://... or https://...'
  });
}

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

      // Validate API_URL before making request
      if (!API_URL || API_URL.includes('localhost') && window.location.hostname !== 'localhost') {
        const errorMsg = 'API URL is not configured. Please set VITE_API_URL environment variable.';
        logger.error(errorMsg, { API_URL, hostname: window.location.hostname });
        throw new Error(errorMsg);
      }

      // Add cache-busting for mobile browsers (they cache aggressively)
      const cacheBuster = `t=${Date.now()}`;
      const url = `${API_URL}/api/auth/me?${cacheBuster}`;
      logger.info('Fetching email user data', { url, API_URL, isMobile: /Mobile|Android|iPhone/i.test(navigator.userAgent) });
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        cache: 'no-store', // Prevent browser caching (critical for mobile)
        credentials: 'include' // Include cookies for CORS
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
        // Token invalid - reset credits to 0 before signing out
        // This ensures credits are always in a known state
        setCredits(0);
        setTotalCreditsEarned(0);
        setTotalCreditsSpent(0);
        signOutService();
        setIsAuthenticated(false);
        setIsLoading(false);
        return;
      }

      const data = await response.json();
      logger.info('Email auth API response received', { 
        hasData: !!data, 
        hasSuccess: !!data?.success, 
        hasUser: !!data?.user,
        userCredits: data?.user?.credits,
        fullResponse: JSON.stringify(data),
        API_URL 
      });
      
      if (data.success && data.user) {
        // Backend returns: { success: true, user: { credits: number, ... } }
        // Extract credits directly from data.user.credits (the standard location)
        const rawCredits = data.user.credits;
        const rawTotalEarned = data.user.totalCreditsEarned;
        const rawTotalSpent = data.user.totalCreditsSpent;
        
        // Validate and convert credit values
        // Ensures credits are non-negative integers within safe range
        const validateCredits = (value) => {
          if (value == null) return 0;
          const num = Number(value);
          if (isNaN(num)) return 0;
          // Ensure non-negative and within safe integer range
          const validated = Math.max(0, Math.min(Math.floor(num), Number.MAX_SAFE_INTEGER));
          return validated;
        };
        
        const credits = validateCredits(rawCredits);
        const totalEarned = validateCredits(rawTotalEarned);
        const totalSpent = validateCredits(rawTotalSpent);
        
        logger.info('Email user data parsed from response', {
          credits,
          totalEarned,
          totalSpent,
          rawCredits,
          rawTotalEarned,
          rawTotalSpent,
          creditsType: typeof rawCredits,
          isNull: rawCredits === null,
          isUndefined: rawCredits === undefined,
          API_URL
        });
        
        // Always update credits - validation ensures valid number (never NaN)
        // No blocking conditions - credits are always updated
        setCredits(credits);
        setTotalCreditsEarned(totalEarned);
        setTotalCreditsSpent(totalSpent);
        logger.debug('Credits updated successfully', { credits, totalEarned, totalSpent });
        
        // Set user info even if credits parsing failed
        if (data.user.email) {
          setEmail(data.user.email);
        }
        if (data.user.userId) {
          setUserId(data.user.userId);
        }
        setIsAuthenticated(true);
      } else {
        logger.warn('Email auth response missing user data', { 
          API_URL, 
          hasSuccess: !!data?.success,
          hasUser: !!data?.user,
          responseKeys: data ? Object.keys(data) : [],
          rawResponse: JSON.stringify(data).substring(0, 200)
        });
        // Don't set authenticated to false if we just have a missing user field
        // The token might still be valid, just the user data might be missing
      }
    } catch (error) {
      const isNetworkError = error.name === 'TypeError' || error.message.includes('fetch') || error.message.includes('Failed to fetch');
      const isCorsError = error.message.includes('CORS') || error.message.includes('cross-origin');
      
      logger.error('Error fetching email user data:', { 
        error: error.message,
        errorName: error.name,
        errorStack: error.stack?.substring(0, 200),
        API_URL,
        isNetworkError,
        isCorsError,
        hostname: typeof window !== 'undefined' ? window.location.hostname : 'unknown',
        url: `${API_URL}/api/auth/me`
      });
      
      // Don't set authenticated to false on network errors - token might still be valid
      // Only set to false if it's an authentication error
      if (!isNetworkError && !isCorsError) {
        setIsAuthenticated(false);
      }
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
        // Use ?? to properly handle 0 as a valid value
        setCredits(Number(result.user.credits ?? 0));
        setTotalCreditsEarned(Number(result.user.totalCreditsEarned ?? 0));
        setTotalCreditsSpent(Number(result.user.totalCreditsSpent ?? 0));
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
    // Validate credits before setting
    const validateCredits = (value) => {
      if (value == null) return 0;
      const num = Number(value);
      if (isNaN(num)) return 0;
      return Math.max(0, Math.min(Math.floor(num), Number.MAX_SAFE_INTEGER));
    };
    
    const creditsValue = validateCredits(newCredits);
    setCredits(creditsValue);
    logger.debug('Credits updated manually', { newCredits, validatedCredits: creditsValue });
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

