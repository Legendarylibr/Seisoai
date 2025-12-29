// API Configuration Utility
// Handles API URL detection for both development and production

/**
 * Get the API URL for making requests to the backend
 * 
 * Logic:
 * 1. In development (localhost): Use VITE_API_URL or default to http://localhost:3001
 * 2. In production:
 *    - If VITE_API_URL is set and not localhost, use it
 *    - Otherwise, use empty string (same origin - frontend and backend served together)
 */
export const getApiUrl = () => {
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
export const API_URL = getApiUrl();

export default API_URL;


