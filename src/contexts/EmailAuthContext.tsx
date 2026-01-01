import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo, ReactNode } from 'react';
import { 
  signUp, signIn, signOut as signOutService, 
  getAuthToken, getAuthType, verifyToken,
  AuthUser, AuthResponse
} from '../services/emailAuthService';
import logger from '../utils/logger';
import { API_URL } from '../utils/apiConfig';

interface EmailAuthContextValue {
  isAuthenticated: boolean;
  email: string | null;
  userId: string | null;
  credits: number;
  totalCreditsEarned: number;
  totalCreditsSpent: number;
  isLoading: boolean;
  error: string | null;
  signUp: (email: string, password: string) => Promise<AuthResponse>;
  signIn: (email: string, password: string) => Promise<AuthResponse>;
  signOut: () => Promise<void>;
  refreshCredits: () => Promise<void>;
  fetchUserData: (force?: boolean) => Promise<void>;
  setCreditsManually: (credits: number) => void;
}

const EmailAuthContext = createContext<EmailAuthContextValue | null>(null);

// PERFORMANCE: Increased polling interval from 30s to 60s - credits don't change that often
const REFRESH_INTERVAL = 60000;

// PERFORMANCE: Check if we have a token synchronously to avoid blocking UI
const hasStoredToken = (): boolean => {
  try {
    return !!localStorage.getItem('authToken') && localStorage.getItem('authType') === 'email';
  } catch { return false; }
};

interface EmailAuthProviderProps {
  children: ReactNode;
}

export const EmailAuthProvider: React.FC<EmailAuthProviderProps> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [credits, setCredits] = useState(0);
  const [totalCreditsEarned, setTotalCreditsEarned] = useState(0);
  const [totalCreditsSpent, setTotalCreditsSpent] = useState(0);
  // PERFORMANCE: Only show loading if there's actually a token to verify
  // This makes first-time visitors (no token) see UI immediately
  const [isLoading, setIsLoading] = useState(hasStoredToken());
  const [error, setError] = useState<string | null>(null);
  
  // PERFORMANCE: Track last fetch time to prevent rapid refetches
  const lastFetchRef = useRef(0);
  const MIN_FETCH_INTERVAL = 5000; // Minimum 5s between fetches

  const fetchUserData = useCallback(async (force: boolean = false): Promise<void> => {
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
      const errorMessage = e instanceof Error ? e.message : 'Unknown error';
      logger.error('Failed to fetch user data', { error: errorMessage });
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
        if (verified && verified.user) {
          // PERFORMANCE: Use data from verify response instead of making a second fetchUserData call
          const user = verified.user;
          setCredits(Math.max(0, Math.floor(Number(user.credits) || 0)));
          setTotalCreditsEarned(Math.max(0, Math.floor(Number(user.totalCreditsEarned) || 0)));
          setTotalCreditsSpent(Math.max(0, Math.floor(Number(user.totalCreditsSpent) || 0)));
          if (user.email) setEmail(user.email);
          if (user.userId) setUserId(user.userId);
          setIsAuthenticated(true);
          setIsLoading(false);
        } else {
          setIsLoading(false);
        }
      } else {
        setIsLoading(false);
      }
    };
    checkAuth();
  }, []);

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

  const handleSignUp = useCallback(async (userEmail: string, password: string): Promise<AuthResponse> => {
    try {
      setIsLoading(true);
      setError(null);
      const result = await signUp(userEmail, password);
      if (result.success && result.user) {
        setEmail(userEmail);
        setUserId(result.user.userId);
        setCredits(Math.max(0, Math.floor(Number(result.user.credits) || 0)));
        setTotalCreditsEarned(Math.max(0, Math.floor(Number(result.user.totalCreditsEarned) || 0)));
        setTotalCreditsSpent(Math.max(0, Math.floor(Number(result.user.totalCreditsSpent) || 0)));
        setIsAuthenticated(true);
        // PERFORMANCE: Don't call fetchUserData - signUp already returns all user data
      }
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleSignIn = useCallback(async (userEmail: string, password: string): Promise<AuthResponse> => {
    try {
      setIsLoading(true);
      setError(null);
      const result = await signIn(userEmail, password);
      if (result.success && result.user) {
        setEmail(userEmail);
        setUserId(result.user.userId);
        setCredits(Math.max(0, Math.floor(Number(result.user.credits) || 0)));
        setTotalCreditsEarned(Math.max(0, Math.floor(Number(result.user.totalCreditsEarned) || 0)));
        setTotalCreditsSpent(Math.max(0, Math.floor(Number(result.user.totalCreditsSpent) || 0)));
        setIsAuthenticated(true);
        // PERFORMANCE: Don't call fetchUserData - signIn already returns all user data
        // This eliminates a redundant /api/auth/me call after login
      }
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleSignOut = useCallback(async (): Promise<void> => {
    // SECURITY: Call async signOut to revoke tokens on server
    try {
      await signOutService();
    } catch {
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

  const refreshCredits = useCallback(async (): Promise<void> => {
    if (isAuthenticated) await fetchUserData(true);
  }, [isAuthenticated, fetchUserData]);

  const setCreditsManually = useCallback((newCredits: number): void => {
    setCredits(Math.max(0, Math.floor(Number(newCredits) || 0)));
  }, []);

  // PERFORMANCE: Memoize context value to prevent unnecessary re-renders
  const value = useMemo<EmailAuthContextValue>(() => ({
    isAuthenticated, email, userId, credits, totalCreditsEarned, totalCreditsSpent,
    isLoading, error, signUp: handleSignUp, signIn: handleSignIn, signOut: handleSignOut,
    refreshCredits, fetchUserData, setCreditsManually
  }), [isAuthenticated, email, userId, credits, totalCreditsEarned, totalCreditsSpent, 
      isLoading, error, handleSignUp, handleSignIn, handleSignOut, refreshCredits, fetchUserData, setCreditsManually]);

  return <EmailAuthContext.Provider value={value}>{children}</EmailAuthContext.Provider>;
};

export const useEmailAuth = (): EmailAuthContextValue => {
  const context = useContext(EmailAuthContext);
  if (!context) throw new Error('useEmailAuth must be used within an EmailAuthProvider');
  return context;
};

