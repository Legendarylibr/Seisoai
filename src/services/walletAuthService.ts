/**
 * Wallet Authentication Service
 * Handles SIWE-style wallet authentication to obtain JWT tokens
 */
import { API_URL, ensureCSRFToken, getApiHeaders } from '../utils/apiConfig';
import logger from '../utils/logger';

// Storage keys
const AUTH_TOKEN_KEY = 'authToken';
const REFRESH_TOKEN_KEY = 'refreshToken';

// Window fallback for in-app browsers where localStorage may be blocked
declare global {
  interface Window {
    __seisoAuthToken?: string | null;
    __seisoRefreshToken?: string | null;
  }
}

/**
 * Store auth tokens in localStorage with fallback to window object
 */
export function storeTokens(accessToken: string, refreshToken?: string | null): void {
  try {
    localStorage.setItem(AUTH_TOKEN_KEY, accessToken);
    if (refreshToken) {
      localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    }
  } catch {
    // localStorage may be blocked in in-app browsers
    window.__seisoAuthToken = accessToken;
    window.__seisoRefreshToken = refreshToken || null;
  }
}

/**
 * Clear auth tokens from storage
 */
export function clearTokens(): void {
  try {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  } catch {
    // Ignore localStorage errors
  }
  window.__seisoAuthToken = null;
  window.__seisoRefreshToken = null;
}

/**
 * Get stored access token
 */
export function getStoredToken(): string | null {
  try {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (token) return token;
  } catch {
    // localStorage blocked
  }
  return window.__seisoAuthToken || null;
}

/**
 * Get stored refresh token
 */
export function getStoredRefreshToken(): string | null {
  try {
    const token = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (token) return token;
  } catch {
    // localStorage blocked
  }
  return window.__seisoRefreshToken || null;
}

export interface AuthNonceResponse {
  success: boolean;
  nonce?: string;
  message?: string;
  expiresAt?: number;
  error?: string;
}

export interface AuthWalletResponse {
  success: boolean;
  token?: string;
  refreshToken?: string | null;
  user?: {
    userId: string;
    walletAddress: string;
    credits: number;
    totalCreditsEarned: number;
    totalCreditsSpent: number;
  };
  error?: string;
}

/**
 * Request a nonce for wallet authentication
 */
export async function requestNonce(walletAddress: string): Promise<AuthNonceResponse> {
  try {
    // Ensure CSRF token is available before making POST request
    await ensureCSRFToken();
    
    const response = await fetch(`${API_URL}/api/auth/nonce`, {
      method: 'POST',
      headers: getApiHeaders('POST'),
      credentials: 'include',
      body: JSON.stringify({ walletAddress: walletAddress.toLowerCase() })
    });

    const data = await response.json();
    
    if (!response.ok) {
      return { success: false, error: data.error || 'Failed to get nonce' };
    }
    
    return data;
  } catch (error) {
    logger.error('Failed to request nonce', { error: (error as Error).message });
    return { success: false, error: 'Network error' };
  }
}

/**
 * Authenticate with wallet signature
 */
export async function authenticateWithSignature(
  walletAddress: string,
  signature: string,
  message: string
): Promise<AuthWalletResponse> {
  try {
    // Ensure CSRF token is available before making POST request
    await ensureCSRFToken();
    
    const response = await fetch(`${API_URL}/api/auth/wallet`, {
      method: 'POST',
      headers: getApiHeaders('POST'),
      credentials: 'include',
      body: JSON.stringify({
        walletAddress: walletAddress.toLowerCase(),
        signature,
        message
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      return { success: false, error: data.error || 'Authentication failed' };
    }
    
    // Store tokens on successful auth
    if (data.success && data.token) {
      storeTokens(data.token, data.refreshToken);
    }
    
    return data;
  } catch (error) {
    logger.error('Failed to authenticate with signature', { error: (error as Error).message });
    return { success: false, error: 'Network error' };
  }
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(): Promise<AuthWalletResponse> {
  const refreshToken = getStoredRefreshToken();
  
  if (!refreshToken) {
    return { success: false, error: 'No refresh token available' };
  }
  
  try {
    // Ensure CSRF token is available before making POST request
    await ensureCSRFToken();
    
    const response = await fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: getApiHeaders('POST'),
      credentials: 'include',
      body: JSON.stringify({ refreshToken })
    });

    const data = await response.json();
    
    if (!response.ok) {
      // Refresh token invalid - clear all tokens
      clearTokens();
      return { success: false, error: data.error || 'Token refresh failed' };
    }
    
    // Store new access token
    if (data.success && data.token) {
      storeTokens(data.token, refreshToken);
    }
    
    return data;
  } catch (error) {
    logger.error('Failed to refresh token', { error: (error as Error).message });
    return { success: false, error: 'Network error' };
  }
}

/**
 * Logout and revoke tokens
 */
export async function logout(): Promise<void> {
  const accessToken = getStoredToken();
  const refreshToken = getStoredRefreshToken();
  
  // Clear local storage first
  clearTokens();
  
  // Notify server to blacklist tokens
  try {
    // Ensure CSRF token is available before making POST request
    await ensureCSRFToken();
    
    const headers = getApiHeaders('POST');
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }
    
    await fetch(`${API_URL}/api/auth/logout`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({ refreshToken })
    });
  } catch {
    // Ignore errors - tokens are cleared locally anyway
  }
}

/**
 * Check if user has a valid stored token
 */
export function hasStoredAuth(): boolean {
  return !!getStoredToken();
}

export default {
  requestNonce,
  authenticateWithSignature,
  refreshAccessToken,
  logout,
  storeTokens,
  clearTokens,
  getStoredToken,
  getStoredRefreshToken,
  hasStoredAuth
};
