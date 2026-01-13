/**
 * Hook to refresh credits across different auth contexts
 * Abstracts away the complexity of wallet vs email auth
 */
import { useCallback } from 'react';
import { useEmailAuth } from '../contexts/EmailAuthContext';
import { useSimpleWallet } from '../contexts/SimpleWalletContext';

/**
 * Returns a function that refreshes credits for the currently authenticated user
 * Works with both email auth and wallet auth
 */
export function useRefreshCredits(): () => void {
  const { isAuthenticated: isEmailAuth, refreshCredits: emailRefresh } = useEmailAuth();
  const { address, fetchCredits, isConnected: isWalletConnected } = useSimpleWallet();

  return useCallback(() => {
    if (isEmailAuth && emailRefresh) {
      emailRefresh();
    } else if (isWalletConnected && fetchCredits && address) {
      fetchCredits(address, 3, true);
    }
  }, [isEmailAuth, emailRefresh, isWalletConnected, fetchCredits, address]);
}

/**
 * Returns both the refresh function and connection status
 */
export function useCredits() {
  const emailAuth = useEmailAuth();
  const wallet = useSimpleWallet();
  
  const isConnected = emailAuth.isAuthenticated || wallet.isConnected;
  const credits = emailAuth.credits ?? wallet.credits ?? 0;
  
  const refreshCredits = useCallback(() => {
    if (emailAuth.isAuthenticated && emailAuth.refreshCredits) {
      emailAuth.refreshCredits();
    } else if (wallet.isConnected && wallet.fetchCredits && wallet.address) {
      wallet.fetchCredits(wallet.address, 3, true);
    }
  }, [emailAuth, wallet]);

  return {
    isConnected,
    credits,
    refreshCredits,
    isEmailAuth: emailAuth.isAuthenticated,
    isWalletAuth: wallet.isConnected,
  };
}
