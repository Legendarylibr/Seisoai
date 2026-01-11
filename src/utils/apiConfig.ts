// API Configuration Utility
// Handles API URL detection for both development and production

// CSRF Token constants
const CSRF_TOKEN_COOKIE = 'XSRF-TOKEN';
const CSRF_TOKEN_HEADER = 'X-CSRF-Token';

/**
 * Get the API URL for making requests to the backend
 * 
 * Logic:
 * 1. In development (localhost): Use VITE_API_URL or default to http://localhost:3001
 * 2. In production:
 *    - If VITE_API_URL is set and not localhost, use it
 *    - Otherwise, use empty string (same origin - frontend and backend served together)
 */
export const getApiUrl = (): string => {
  const envApiUrl = import.meta.env.VITE_API_URL;
  const isLocalhost = typeof window !== 'undefined' && 
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  
  // In development (localhost), use env var or default to localhost:3001
  if (isLocalhost) {
    return envApiUrl || 'http://localhost:3001';
  }
  
  // In production:
  // If VITE_API_URL is set and doesn't contain localhost, use it
  if (envApiUrl && !envApiUrl.includes('localhost') && !envApiUrl.includes('127.0.0.1')) {
    return envApiUrl;
  }
  
  // Otherwise, use same origin (empty string = relative URLs)
  // This works because the backend serves the frontend from the same domain
  return '';
};

// Export a singleton instance for convenience
export const API_URL: string = getApiUrl();

/**
 * Get CSRF token from cookie
 */
export const getCSRFToken = (): string | null => {
  if (typeof document === 'undefined') return null;
  const cookies = document.cookie.split(';');
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    if (name === CSRF_TOKEN_COOKIE) {
      return value;
    }
  }
  return null;
};

// Cache the token from the last successful fetch to avoid cookie timing issues
let cachedCSRFToken: string | null = null;

/**
 * Fetch a fresh CSRF token from server (always fetches, ignores cache)
 */
export const refreshCSRFToken = async (): Promise<string | null> => {
  try {
    const response = await fetch(`${API_URL}/api/csrf-token`, {
      method: 'GET',
      credentials: 'include'
    });
    
    if (response.ok) {
      const data = await response.json();
      // Cache the token from the response body (more reliable than reading cookie immediately)
      cachedCSRFToken = data.token || null;
      return cachedCSRFToken;
    }
  } catch {
    // Silent fail - will try to use existing token
  }
  
  return getCSRFToken();
};

/**
 * Fetch CSRF token from server if not already set
 */
export const ensureCSRFToken = async (): Promise<string | null> => {
  // First check cached token (most reliable)
  if (cachedCSRFToken) return cachedCSRFToken;
  
  // Then check cookie
  let token = getCSRFToken();
  if (token) {
    cachedCSRFToken = token;
    return token;
  }
  
  // Finally, fetch from server
  return refreshCSRFToken();
};

/**
 * Get headers for API requests including CSRF token for state-changing methods
 */
export const getApiHeaders = (
  method: string,
  additionalHeaders: Record<string, string> = {}
): Record<string, string> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...additionalHeaders
  };
  
  // Add CSRF token for state-changing methods
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase())) {
    const csrfToken = getCSRFToken();
    if (csrfToken) {
      headers[CSRF_TOKEN_HEADER] = csrfToken;
    }
  }
  
  return headers;
};

/**
 * Enhanced fetch wrapper that automatically handles CSRF tokens
 * Automatically retries once with a fresh token on CSRF validation errors
 */
export const apiFetch = async (
  url: string,
  options: RequestInit = {},
  retryOnCSRFError: boolean = true
): Promise<Response> => {
  const method = (options.method || 'GET').toUpperCase();
  
  // Ensure CSRF token is available for state-changing requests
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    await ensureCSRFToken();
  }
  
  const headers = getApiHeaders(method, options.headers as Record<string, string> || {});
  
  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include'
  });
  
  // If we get a 403 with CSRF error, try refreshing the token and retrying once
  if (response.status === 403 && retryOnCSRFError && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    try {
      const clonedResponse = response.clone();
      const errorData = await clonedResponse.json();
      
      if (errorData.error && errorData.error.toLowerCase().includes('csrf')) {
        // Clear cached token and fetch a fresh one
        cachedCSRFToken = null;
        await refreshCSRFToken();
        
        // Retry the request with the new token (don't retry again to avoid infinite loop)
        return apiFetch(url, options, false);
      }
    } catch {
      // If we can't parse the response, just return the original response
    }
  }
  
  return response;
};

export default API_URL;





