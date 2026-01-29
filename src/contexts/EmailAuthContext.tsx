import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo, ReactNode } from 'react';
import { 
  signUp, signIn, signOut as signOutService, 
  getAuthToken, getAuthType, verifyToken,
  AuthResponse
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
// Handles in-app browsers (Instagram, Twitter) where localStorage may be blocked
const hasStoredToken = (): boolean => {
  try {
    return !!localStorage.getItem('authToken') && localStorage.getItem('authType') === 'email';
  } catch { 
    // In-app browsers may block localStorage - return false to show UI immediately
    return false; 
  }
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
    // Debounce - prevent fetching more than once per 5 seconds unless forced
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
      // Use simple /api/auth/credits endpoint - direct DB query, no complexity
      logger.debug('[EmailAuthContext] Fetching credits', { endpoint: `${API_URL}/api/auth/credits` });
      const response = await fetch(`${API_URL}/api/auth/credits`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Cache-Control': 'no-store'
        },
        credentials: 'include'
      });

      logger.debug('[EmailAuthContext] Response status', { status: response.status });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        logger.error('[EmailAuthContext] Credits fetch failed', { 
          status: response.status, 
          error: errorData.error 
        });
        
        // Log additional debug info
        const token = getAuthToken();
        if (token) {
          try {
            // Decode JWT payload (base64) to check expiry
            const payload = JSON.parse(atob(token.split('.')[1]));
            logger.error('[EmailAuthContext] Token debug', { 
              userId: payload.userId, 
              exp: new Date(payload.exp * 1000).toISOString(),
              expired: payload.exp * 1000 < Date.now()
            });
          } catch {
            logger.error('[EmailAuthContext] Could not decode token');
          }
        }
        
        if (response.status === 401 || response.status === 403) {
          logger.warn('[EmailAuthContext] Auth failed - signing out user');
          signOutService();
          setIsAuthenticated(false);
        }
        setCredits(0);
        setTotalCreditsEarned(0);
        setTotalCreditsSpent(0);
        setIsLoading(false);
        return;
      }

      const data = await response.json();
      logger.debug('[EmailAuthContext] Credits response', { data });
      
      if (data.success) {
        const newCredits = Math.max(0, Math.floor(Number(data.credits) || 0));
        logger.debug('[EmailAuthContext] Setting credits', { credits: newCredits });
        setCredits(newCredits);
        setTotalCreditsEarned(Math.max(0, Math.floor(Number(data.totalCreditsEarned) || 0)));
        setTotalCreditsSpent(Math.max(0, Math.floor(Number(data.totalCreditsSpent) || 0)));
        setIsAuthenticated(true);
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error';
      logger.error('[EmailAuthContext] Fetch error', { error: errorMessage });
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
          const user = verified.user;
          if (user.email) setEmail(user.email);
          if (user.userId) {
            setUserId(user.userId);
            try {
              localStorage.setItem('seiso_current_user_id', user.userId);
              window.dispatchEvent(new CustomEvent('seiso-user-change'));
            } catch { /* ignore */ }
          }
          setIsAuthenticated(true);
          // Fetch fresh credits from simple endpoint
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
        // Store userId for user-specific gallery
        try {
          localStorage.setItem('seiso_current_user_id', result.user.userId);
          // Notify gallery context of user change
          window.dispatchEvent(new CustomEvent('seiso-user-change'));
        } catch { /* ignore */ }
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
      logger.debug('[EmailAuthContext] Sign in result', { 
        success: result.success, 
        hasUser: !!result.user, 
        credits: result.user?.credits 
      });
      if (result.success && result.user) {
        logger.debug('[EmailAuthContext] Setting user state', { 
          userId: result.user.userId, 
          credits: result.user.credits 
        });
        setEmail(userEmail);
        setUserId(result.user.userId);
        const creditsValue = Math.max(0, Math.floor(Number(result.user.credits) || 0));
        logger.debug('[EmailAuthContext] Credits after signin', { credits: creditsValue });
        setCredits(creditsValue);
        setTotalCreditsEarned(Math.max(0, Math.floor(Number(result.user.totalCreditsEarned) || 0)));
        setTotalCreditsSpent(Math.max(0, Math.floor(Number(result.user.totalCreditsSpent) || 0)));
        setIsAuthenticated(true);
        // Store userId for user-specific gallery
        try {
          localStorage.setItem('seiso_current_user_id', result.user.userId);
          // Notify gallery context of user change
          window.dispatchEvent(new CustomEvent('seiso-user-change'));
        } catch { /* ignore */ }
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
    // Clear user-specific data so next user doesn't see previous user's generations
    try {
      localStorage.removeItem('seiso_current_user_id');
      // Dispatch custom event to notify ImageGeneratorContext to clear in-memory state
      window.dispatchEvent(new CustomEvent('seiso-user-signout'));
    } catch {
      // Ignore storage errors
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

// Default value when no EmailAuthProvider is present (wallet-only mode)
const defaultEmailAuthValue: EmailAuthContextValue = {
  isAuthenticated: false,
  email: null,
  userId: null,
  credits: 0,
  totalCreditsEarned: 0,
  totalCreditsSpent: 0,
  isLoading: false,
  error: null,
  signUp: async () => ({ success: false, error: 'Email auth disabled' }),
  signIn: async () => ({ success: false, error: 'Email auth disabled' }),
  signOut: async () => {},
  refreshCredits: async () => {},
  fetchUserData: async () => {},
  setCreditsManually: () => {}
};

export const useEmailAuth = (): EmailAuthContextValue => {
  const context = useContext(EmailAuthContext);
  // Return default value instead of throwing when no provider (wallet-only mode)
  if (!context) return defaultEmailAuthValue;
  return context;
};

