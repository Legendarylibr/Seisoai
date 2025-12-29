import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { 
  signUp, signIn, signOut as signOutService, 
  getAuthToken, getAuthType, verifyToken
} from '../services/emailAuthService';
import logger from '../utils/logger';
import { API_URL } from '../utils/apiConfig';

const EmailAuthContext = createContext();

// PERFORMANCE: Increased polling interval from 30s to 60s - credits don't change that often
const REFRESH_INTERVAL = 60000;

export const EmailAuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [email, setEmail] = useState(null);
  const [userId, setUserId] = useState(null);
  const [credits, setCredits] = useState(0);
  const [totalCreditsEarned, setTotalCreditsEarned] = useState(0);
  const [totalCreditsSpent, setTotalCreditsSpent] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // PERFORMANCE: Track last fetch time to prevent rapid refetches
  const lastFetchRef = useRef(0);
  const MIN_FETCH_INTERVAL = 5000; // Minimum 5s between fetches

  const fetchUserData = useCallback(async (force = false) => {
    // PERFORMANCE: Debounce - prevent fetching more than once per 5 seconds unless forced
    const now = Date.now();
    if (!force && now - lastFetchRef.current < MIN_FETCH_INTERVAL) {
      return;
    }
    lastFetchRef.current = now;

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
      const response = await fetch(`${API_URL}/api/auth/me`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        }
      });

      if (!response.ok) {
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
        setCredits(Math.max(0, Math.floor(Number(data.user.credits) || 0)));
        setTotalCreditsEarned(Math.max(0, Math.floor(Number(data.user.totalCreditsEarned) || 0)));
        setTotalCreditsSpent(Math.max(0, Math.floor(Number(data.user.totalCreditsSpent) || 0)));
        if (data.user.email) setEmail(data.user.email);
        if (data.user.userId) setUserId(data.user.userId);
        setIsAuthenticated(true);
      }
    } catch (e) {
      logger.error('Failed to fetch user data', { error: e.message });
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
          await fetchUserData(true);
        } else {
          setIsLoading(false);
        }
      } else {
        setIsLoading(false);
      }
    };
    checkAuth();
  }, [fetchUserData]);

  // PERFORMANCE: Smarter periodic refresh - only when visible and at longer intervals
  useEffect(() => {
    if (!isAuthenticated) return;

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchUserData();
      }
    }, REFRESH_INTERVAL);

    // PERFORMANCE: Only refresh on visibility change if enough time has passed
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchUserData(); // Debounce inside fetchUserData handles rapid calls
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isAuthenticated, fetchUserData]);

  const handleSignUp = useCallback(async (userEmail, password) => {
    try {
      setIsLoading(true);
      setError(null);
      const result = await signUp(userEmail, password);
      if (result.success) {
        setEmail(userEmail);
        setUserId(result.user.userId);
        setIsAuthenticated(true);
        await fetchUserData(true);
      }
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [fetchUserData]);

  const handleSignIn = useCallback(async (userEmail, password) => {
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
        await fetchUserData(true);
      }
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [fetchUserData]);

  const handleSignOut = useCallback(async () => {
    // SECURITY: Call async signOut to revoke tokens on server
    try {
      await signOutService();
    } catch (e) {
      // Ignore errors - still clear local state
    }
    setIsAuthenticated(false);
    setEmail(null);
    setUserId(null);
    setCredits(0);
    setTotalCreditsEarned(0);
    setTotalCreditsSpent(0);
    setError(null);
  }, []);

  const refreshCredits = useCallback(async () => {
    if (isAuthenticated) await fetchUserData(true);
  }, [isAuthenticated, fetchUserData]);

  const setCreditsManually = useCallback((newCredits) => {
    setCredits(Math.max(0, Math.floor(Number(newCredits) || 0)));
  }, []);

  // PERFORMANCE: Memoize context value to prevent unnecessary re-renders
  const value = useMemo(() => ({
    isAuthenticated, email, userId, credits, totalCreditsEarned, totalCreditsSpent,
    isLoading, error, signUp: handleSignUp, signIn: handleSignIn, signOut: handleSignOut,
    refreshCredits, fetchUserData, setCreditsManually
  }), [isAuthenticated, email, userId, credits, totalCreditsEarned, totalCreditsSpent, 
      isLoading, error, handleSignUp, handleSignIn, handleSignOut, refreshCredits, fetchUserData, setCreditsManually]);

  return <EmailAuthContext.Provider value={value}>{children}</EmailAuthContext.Provider>;
};

export const useEmailAuth = () => {
  const context = useContext(EmailAuthContext);
  if (!context) throw new Error('useEmailAuth must be used within an EmailAuthProvider');
  return context;
};
