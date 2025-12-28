// Email authentication service
import logger from '../utils/logger.js';
import { API_URL } from '../utils/apiConfig.js';

/**
 * Sign up with email and password
 * @param {string} email - User's email address
 * @param {string} password - User's password
 * @returns {Promise<Object>} - Sign up response
 */
export const signUp = async (email, password) => {
  try {
    const response = await fetch(`${API_URL}/api/auth/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Sign up failed');
    }

    // Store token in localStorage
    if (data.token) {
      localStorage.setItem('authToken', data.token);
      localStorage.setItem('userEmail', email);
      localStorage.setItem('authType', 'email');
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
  try {
    const response = await fetch(`${API_URL}/api/auth/signin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();
    
    if (!response.ok) {
      // Provide user-friendly error message
      const errorMsg = data.error || 'Sign in failed. Please check your email and password.';
      throw new Error(errorMsg);
    }

    // Store token in localStorage
    if (data.token) {
      localStorage.setItem('authToken', data.token);
      localStorage.setItem('userEmail', email);
      localStorage.setItem('authType', 'email');
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
 * Sign out
 */
export const signOut = () => {
  localStorage.removeItem('authToken');
  localStorage.removeItem('userEmail');
  localStorage.removeItem('authType');
  localStorage.removeItem('userId');
};

/**
 * Get current auth token
 * @returns {string|null} - Auth token or null
 */
export const getAuthToken = () => {
  return localStorage.getItem('authToken');
};

/**
 * Get current user email
 * @returns {string|null} - User email or null
 */
export const getUserEmail = () => {
  return localStorage.getItem('userEmail');
};

/**
 * Get current auth type
 * @returns {string|null} - Auth type ('email' or 'wallet') or null
 */
export const getAuthType = () => {
  return localStorage.getItem('authType');
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

    const response = await fetch(`${API_URL}/api/auth/verify`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    
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
    logger.error('Token verification error', { error: error.message });
    signOut();
    return null;
  }
};


