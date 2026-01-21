// Email authentication service
import logger from '../utils/logger';
import { API_URL, getCSRFToken, ensureCSRFToken } from '../utils/apiConfig';

// Constants
const REQUEST_TIMEOUT = 30000; // 30 seconds
const MAX_RETRIES = 2;
const RETRY_DELAY = 1000; // 1 second
const CSRF_TOKEN_HEADER = 'X-CSRF-Token';

// Types
export interface AuthUser {
  userId: string;
  email: string;
  credits: number;
  totalCreditsEarned: number;
  totalCreditsSpent: number;
}

export interface AuthResponse {
  success: boolean;
  token?: string;
  refreshToken?: string;
  user?: AuthUser;
  error?: string;
}

export interface VerifyResponse {
  success: boolean;
  user?: AuthUser;
}

/**
 * Detect if running in an in-app browser (Twitter, Instagram, Facebook, etc.)
 * These browsers may have restricted storage access
 */
const isInAppBrowser = (): boolean => {
  const ua = navigator.userAgent || navigator.vendor || '';
  return (
    // Instagram in-app browser
    ua.includes('Instagram') ||
    // Twitter/X in-app browser
    ua.includes('Twitter') ||
    // Facebook in-app browser
    ua.includes('FBAN') ||
    ua.includes('FBAV') ||
    ua.includes('FB_IAB') ||
    // LinkedIn in-app browser
    ua.includes('LinkedInApp') ||
    // TikTok in-app browser
    ua.includes('BytedanceWebview') ||
    ua.includes('musical_ly') ||
    // Snapchat in-app browser
    ua.includes('Snapchat') ||
    // Pinterest in-app browser
    ua.includes('Pinterest') ||
    // Generic WebView detection
    (ua.includes('wv') && ua.includes('Android'))
  );
};

// In-memory storage fallback for when localStorage is blocked (Instagram, etc.)
const memoryStorage: Map<string, string> = new Map();

/**
 * Helper function to check if localStorage is available
 */
const isLocalStorageAvailable = (): boolean => {
  try {
    const testKey = '__storage_test__';
    localStorage.setItem(testKey, testKey);
    localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
};

/**
 * Helper function to safely get from localStorage with memory fallback
 * Instagram and other in-app browsers may block localStorage
 */
const safeGetItem = (key: string): string | null => {
  // First try localStorage
  if (isLocalStorageAvailable()) {
    try {
      const value = localStorage.getItem(key);
      if (value !== null) return value;
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error';
      logger.debug('Failed to read from localStorage, using memory fallback', { key, error: errorMessage });
    }
  }
  // Fallback to memory storage (for in-app browsers)
  return memoryStorage.get(key) || null;
};

/**
 * Helper function to safely set to localStorage with memory fallback
 * Stores in both localStorage (when available) and memory (always)
 */
const safeSetItem = (key: string, value: string): boolean => {
  // Always store in memory as fallback (for in-app browsers like Instagram)
  memoryStorage.set(key, value);
  
  if (!isLocalStorageAvailable()) {
    if (isInAppBrowser()) {
      // Silent in in-app browsers - this is expected
      logger.debug('In-app browser detected, using memory storage for auth');
    } else {
      logger.warn('localStorage not available, auth state will not persist across page reloads');
    }
    return true; // Return true since we stored in memory
  }
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error';
    logger.debug('Failed to write to localStorage, using memory fallback', { key, error: errorMessage });
    return true; // Return true since we stored in memory
  }
};

/**
 * Helper function to safely remove from localStorage and memory
 */
const safeRemoveItem = (key: string): void => {
  // Always remove from memory
  memoryStorage.delete(key);
  
  if (!isLocalStorageAvailable()) return;
  try {
    localStorage.removeItem(key);
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error';
    logger.debug('Failed to remove from localStorage', { key, error: errorMessage });
  }
};

/**
 * Fetch with timeout and retry logic
 */
const fetchWithRetry = async (
  url: string, 
  options: RequestInit, 
  retries: number = MAX_RETRIES
): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    
    const err = error as Error;
    
    // Check if it's an abort error (timeout)
    if (err.name === 'AbortError') {
      throw new Error('Request timed out. Please try again.');
    }
    
    // Retry on network errors
    if (retries > 0 && (err.name === 'TypeError' || err.message.includes('fetch'))) {
      logger.warn(`Request failed, retrying... (${retries} attempts left)`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return fetchWithRetry(url, options, retries - 1);
    }
    
    throw error;
  }
};

/**
 * Get stored referral code from URL parameter
 */
export const getStoredReferralCode = (): string | null => {
  return safeGetItem('pendingReferralCode');
};

/**
 * Store referral code from URL parameter
 */
export const storeReferralCode = (code: string): void => {
  safeSetItem('pendingReferralCode', code);
};

/**
 * Clear stored referral code after successful signup
 */
export const clearStoredReferralCode = (): void => {
  safeRemoveItem('pendingReferralCode');
};

/**
 * Sign up with email and password
 */
export const signUp = async (email: string, password: string, referralCode?: string): Promise<AuthResponse> => {
  // Validate inputs
  if (!email || typeof email !== 'string') {
    throw new Error('Email is required');
  }
  if (!password || typeof password !== 'string') {
    throw new Error('Password is required');
  }

  const trimmedEmail = email.trim().toLowerCase();
  
  // Use provided referral code or get stored one
  const effectiveReferralCode = referralCode || getStoredReferralCode();
  
  try {
    // Ensure CSRF token is available
    const csrfToken = await ensureCSRFToken();
    
    const response = await fetchWithRetry(`${API_URL}/api/auth/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(csrfToken && { [CSRF_TOKEN_HEADER]: csrfToken })
      },
      credentials: 'include',
      body: JSON.stringify({ 
        email: trimmedEmail, 
        password,
        ...(effectiveReferralCode && { referralCode: effectiveReferralCode })
      })
    });

    let data: AuthResponse;
    try {
      data = await response.json();
    } catch {
      throw new Error('Server returned an invalid response. Please try again.');
    }
    
    if (!response.ok) {
      throw new Error(data.error || 'Sign up failed');
    }

    // Store tokens in localStorage
    if (data.token) {
      safeSetItem('authToken', data.token);
      safeSetItem('userEmail', trimmedEmail);
      safeSetItem('authType', 'email');
    }
    if (data.refreshToken) {
      safeSetItem('refreshToken', data.refreshToken);
    }
    
    // Clear stored referral code after successful signup
    clearStoredReferralCode();

    return {
      success: true,
      token: data.token,
      user: data.user
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Sign up error', { error: errorMessage });
    throw error;
  }
};

/**
 * Sign in with email and password
 */
export const signIn = async (email: string, password: string): Promise<AuthResponse> => {
  // Validate inputs
  if (!email || typeof email !== 'string') {
    throw new Error('Email is required');
  }
  if (!password || typeof password !== 'string') {
    throw new Error('Password is required');
  }

  const trimmedEmail = email.trim().toLowerCase();

  try {
    // Ensure CSRF token is available
    const csrfToken = await ensureCSRFToken();
    
    const response = await fetchWithRetry(`${API_URL}/api/auth/signin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(csrfToken && { [CSRF_TOKEN_HEADER]: csrfToken })
      },
      credentials: 'include',
      body: JSON.stringify({ email: trimmedEmail, password })
    });

    let data: AuthResponse;
    try {
      data = await response.json();
    } catch {
      throw new Error('Server returned an invalid response. Please try again.');
    }
    
    if (!response.ok) {
      // Provide user-friendly error message
      const errorMsg = data.error || 'Sign in failed. Please check your email and password.';
      throw new Error(errorMsg);
    }

    // Store tokens in localStorage
    if (data.token) {
      safeSetItem('authToken', data.token);
      safeSetItem('userEmail', trimmedEmail);
      safeSetItem('authType', 'email');
    }
    if (data.refreshToken) {
      safeSetItem('refreshToken', data.refreshToken);
    }

    return {
      success: true,
      token: data.token,
      user: data.user
    };
  } catch (error) {
    // Don't log network errors or user errors - just rethrow with clean message
    const err = error as Error;
    if (err.message && !err.message.includes('fetch')) {
      logger.error('Sign in error', { error: err.message });
    }
    throw error;
  }
};

/**
 * Sign out - revokes tokens on server and clears local storage
 * SECURITY: Calls backend logout to blacklist tokens server-side
 */
export const signOut = async (): Promise<void> => {
  const token = safeGetItem('authToken');
  const refreshToken = safeGetItem('refreshToken');
  
  // Try to revoke tokens on server (best effort - don't block on failure)
  if (token || refreshToken) {
    try {
      // Use ensureCSRFToken to guarantee token is available before logout
      const csrfToken = await ensureCSRFToken();
      await fetch(`${API_URL}/api/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` }),
          ...(csrfToken && { [CSRF_TOKEN_HEADER]: csrfToken })
        },
        credentials: 'include',
        body: JSON.stringify({ refreshToken })
      });
    } catch (e) {
      // Ignore errors - we still want to clear local storage
      const errorMessage = e instanceof Error ? e.message : 'Unknown error';
      logger.debug('Logout request failed (non-critical)', { error: errorMessage });
    }
  }
  
  // Always clear local storage regardless of server response
  safeRemoveItem('authToken');
  safeRemoveItem('refreshToken');
  safeRemoveItem('userEmail');
  safeRemoveItem('authType');
  safeRemoveItem('userId');
};

/**
 * Get current auth token
 */
export const getAuthToken = (): string | null => {
  return safeGetItem('authToken');
};

/**
 * Get current user email
 */
export const getUserEmail = (): string | null => {
  return safeGetItem('userEmail');
};

/**
 * Get current auth type
 */
export const getAuthType = (): string | null => {
  return safeGetItem('authType');
};

/**
 * Verify token and get user info
 */
export const verifyToken = async (): Promise<VerifyResponse | null> => {
  try {
    const token = getAuthToken();
    if (!token) {
      return null;
    }

    const response = await fetchWithRetry(`${API_URL}/api/auth/verify`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store',
        'Pragma': 'no-cache'
      },
      credentials: 'include'
    }, 1); // Only 1 retry for verification

    let data: { user?: AuthUser };
    try {
      data = await response.json();
    } catch {
      logger.error('Failed to parse verify response');
      return null;
    }
    
    if (!response.ok) {
      // Token invalid, clear storage
      signOut();
      return null;
    }

    return {
      success: true,
      user: data.user
    };
  } catch (error) {
    const err = error as Error;
    // Don't sign out on network errors - token might still be valid
    if (err.message && err.message.includes('timed out')) {
      logger.warn('Token verification timed out, will retry later');
      return null;
    }
    logger.error('Token verification error', { error: err.message });
    signOut();
    return null;
  }
};

