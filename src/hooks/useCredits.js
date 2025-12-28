// Shared credits hook - consolidates credit fetching logic used by both auth contexts
import { useState, useCallback, useEffect, useRef } from 'react';
import logger from '../utils/logger';
import { API_URL } from '../utils/apiConfig';

const REFRESH_INTERVAL = 30000; // 30 seconds

/**
 * Shared hook for credits management
 * Used by both SimpleWalletContext and EmailAuthContext to avoid code duplication
 */
export function useCredits(options = {}) {
  const { 
    fetchUrl,
    getAuthHeader = () => null,
    isActive = false,
    identifier = null
  } = options;

  const [credits, setCredits] = useState(0);
  const [totalCreditsEarned, setTotalCreditsEarned] = useState(0);
  const [totalCreditsSpent, setTotalCreditsSpent] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const refreshIntervalRef = useRef(null);

  // Core fetch function
  const fetchCredits = useCallback(async () => {
    if (!isActive || !fetchUrl) {
      setCredits(0);
      setTotalCreditsEarned(0);
      setTotalCreditsSpent(0);
      return 0;
    }

    try {
      setIsLoading(true);
      const url = `${fetchUrl}?t=${Date.now()}`;
      
      const headers = { 'Content-Type': 'application/json' };
      const authHeader = getAuthHeader();
      if (authHeader) {
        headers['Authorization'] = authHeader;
      }

      const response = await fetch(url, {
        method: 'GET',
        headers,
        cache: 'no-store'
      });

      if (!response.ok) {
        logger.error('Credits fetch error', { status: response.status });
        return 0;
      }

      const data = await response.json();
      
      if (data.success && data.user) {
        const userCredits = Math.max(0, Math.floor(Number(data.user.credits) || 0));
        const userTotalEarned = Math.max(0, Math.floor(Number(data.user.totalCreditsEarned) || 0));
        const userTotalSpent = Math.max(0, Math.floor(Number(data.user.totalCreditsSpent) || 0));
        
        setCredits(userCredits);
        setTotalCreditsEarned(userTotalEarned);
        setTotalCreditsSpent(userTotalSpent);
        
        return userCredits;
      }
      
      return 0;
    } catch (error) {
      logger.error('Failed to fetch credits', { error: error.message });
      return 0;
    } finally {
      setIsLoading(false);
    }
  }, [isActive, fetchUrl, getAuthHeader]);

  // Manual credit setter for optimistic UI updates
  const setCreditsManually = useCallback((newCredits) => {
    const validated = Math.max(0, Math.floor(Number(newCredits) || 0));
    setCredits(validated);
  }, []);

  // Reset credits state
  const resetCredits = useCallback(() => {
    setCredits(0);
    setTotalCreditsEarned(0);
    setTotalCreditsSpent(0);
  }, []);

  // Setup periodic refresh and visibility change handler
  useEffect(() => {
    if (!isActive) {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
      return;
    }

    // Initial fetch
    fetchCredits();

    // Periodic refresh
    refreshIntervalRef.current = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchCredits();
      }
    }, REFRESH_INTERVAL);

    // Visibility change handler
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchCredits();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isActive, fetchCredits]);

  return {
    credits,
    totalCreditsEarned,
    totalCreditsSpent,
    isLoading,
    fetchCredits,
    setCreditsManually,
    resetCredits
  };
}

export default useCredits;
