// Email authentication service
import logger from '../utils/logger.js';
import { API_URL } from '../utils/apiConfig.js';

// Constants
const REQUEST_TIMEOUT = 30000; // 30 seconds
const MAX_RETRIES = 2;
const RETRY_DELAY = 1000; // 1 second

/**
 * Helper function to check if localStorage is available
 */
const isLocalStorageAvailable = () => {
  try {
    const testKey = '__storage_test__';
    localStorage.setItem(testKey, testKey);
    localStorage.removeItem(testKey);
    return true;
  } catch (e) {
    return false;
  }
};

/**
 * Helper function to safely get from localStorage
 */
const safeGetItem = (key) => {
  if (!isLocalStorageAvailable()) return null;
  try {
    return localStorage.getItem(key);
  } catch (e) {
    logger.error('Failed to read from localStorage', { key, error: e.message });
    return null;
  }
};

/**
 * Helper function to safely set to localStorage
 */
const safeSetItem = (key, value) => {
  if (!isLocalStorageAvailable()) {
    logger.warn('localStorage not available, auth state will not persist');
    return false;
  }
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e) {
    logger.error('Failed to write to localStorage', { key, error: e.message });
    return false;
  }
};

/**
 * Helper function to safely remove from localStorage
 */
const safeRemoveItem = (key) => {
  if (!isLocalStorageAvailable()) return;
  try {
    localStorage.removeItem(key);
  } catch (e) {
    logger.error('Failed to remove from localStorage', { key, error: e.message });
  }
};

/**
 * Fetch with timeout and retry logic
 */
const fetchWithRetry = async (url, options, retries = MAX_RETRIES) => {
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
    
    // Check if it's an abort error (timeout)
    if (error.name === 'AbortError') {
      throw new Error('Request timed out. Please try again.');
    }
    
    // Retry on network errors
    if (retries > 0 && (error.name === 'TypeError' || error.message.includes('fetch'))) {
      logger.warn(`Request failed, retrying... (${retries} attempts left)`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return fetchWithRetry(url, options, retries - 1);
    }
    
    throw error;
  }
};

/**
 * Sign up with email and password
 * @param {string} email - User's email address
 * @param {string} password - User's password
 * @returns {Promise<Object>} - Sign up response
 */
export const signUp = async (email, password) => {
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

    let data;
    try {
      data = await response.json();
    } catch (parseError) {
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
    logger.error('Sign up error', { error: error.message });
    throw error;
  }
};

/**
 * Sign in with email and password
 * @param {string} email - User's email address
 * @param {string} password - User's password
 * @returns {Promise<Object>} - Sign in response
 */
export const signIn = async (email, password) => {
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

    let data;
    try {
      data = await response.json();
    } catch (parseError) {
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
    if (error.message && !error.message.includes('fetch')) {
      logger.error('Sign in error', { error: error.message });
    }
    throw error;
  }
};

/**
 * Sign out - revokes tokens on server and clears local storage
 * SECURITY: Calls backend logout to blacklist tokens server-side
 */
export const signOut = async () => {
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
      logger.debug('Logout request failed (non-critical)', { error: e.message });
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
 * @returns {string|null} - Auth token or null
 */
export const getAuthToken = () => {
  return safeGetItem('authToken');
};

/**
 * Get current user email
 * @returns {string|null} - User email or null
 */
export const getUserEmail = () => {
  return safeGetItem('userEmail');
};

/**
 * Get current auth type
 * @returns {string|null} - Auth type ('email' or 'wallet') or null
 */
export const getAuthType = () => {
  return safeGetItem('authType');
};

/**
 * Verify token and get user info
 * @returns {Promise<Object>} - User info
 */
export const verifyToken = async () => {
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

    let data;
    try {
      data = await response.json();
    } catch (parseError) {
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
    // Don't sign out on network errors - token might still be valid
    if (error.message && error.message.includes('timed out')) {
      logger.warn('Token verification timed out, will retry later');
      return null;
    }
    logger.error('Token verification error', { error: error.message });
    signOut();
    return null;
  }
};


