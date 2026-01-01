// Email authentication service
import logger from '../utils/logger';
import { API_URL } from '../utils/apiConfig';

// Constants
const REQUEST_TIMEOUT = 30000; // 30 seconds
const MAX_RETRIES = 2;
const RETRY_DELAY = 1000; // 1 second

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
 * Helper function to safely get from localStorage
 */
const safeGetItem = (key: string): string | null => {
  if (!isLocalStorageAvailable()) return null;
  try {
    return localStorage.getItem(key);
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error';
    logger.error('Failed to read from localStorage', { key, error: errorMessage });
    return null;
  }
};

/**
 * Helper function to safely set to localStorage
 */
const safeSetItem = (key: string, value: string): boolean => {
  if (!isLocalStorageAvailable()) {
    logger.warn('localStorage not available, auth state will not persist');
    return false;
  }
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error';
    logger.error('Failed to write to localStorage', { key, error: errorMessage });
    return false;
  }
};

/**
 * Helper function to safely remove from localStorage
 */
const safeRemoveItem = (key: string): void => {
  if (!isLocalStorageAvailable()) return;
  try {
    localStorage.removeItem(key);
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error';
    logger.error('Failed to remove from localStorage', { key, error: errorMessage });
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
 * Sign up with email and password
 */
export const signUp = async (email: string, password: string): Promise<AuthResponse> => {
  // Validate inputs
  if (!email || typeof email !== 'string') {
    throw new Error('Email is required');
  }
  if (!password || typeof password !== 'string') {
    throw new Error('Password is required');
  }

  const trimmedEmail = email.trim().toLowerCase();
  
  try {
    const response = await fetchWithRetry(`${API_URL}/api/auth/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email: trimmedEmail, password })
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
    const response = await fetchWithRetry(`${API_URL}/api/auth/signin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
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
      await fetch(`${API_URL}/api/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
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
        'Content-Type': 'application/json'
      }
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

