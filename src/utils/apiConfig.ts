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

/**
 * Fetch CSRF token from server if not already set
 */
export const ensureCSRFToken = async (): Promise<string | null> => {
  let token = getCSRFToken();
  if (token) return token;
  
  try {
    // Make a GET request to get the CSRF token cookie set
    const response = await fetch(`${API_URL}/api/csrf-token`, {
      method: 'GET',
      credentials: 'include'
    });
    
    if (response.ok) {
      const data = await response.json();
      return data.token || getCSRFToken();
    }
  } catch {
    // Silent fail - token might be set by another request
  }
  
  return getCSRFToken();
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
 */
export const apiFetch = async (
  url: string,
  options: RequestInit = {}
): Promise<Response> => {
  const method = (options.method || 'GET').toUpperCase();
  
  // Ensure CSRF token is available for state-changing requests
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    await ensureCSRFToken();
  }
  
  const headers = getApiHeaders(method, options.headers as Record<string, string> || {});
  
  return fetch(url, {
    ...options,
    headers,
    credentials: 'include'
  });
};

export default API_URL;





