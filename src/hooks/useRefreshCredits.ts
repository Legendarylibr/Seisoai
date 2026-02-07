/**
 * Hook to refresh credits across different auth contexts
 * Abstracts away the complexity of wallet auth
 */
import { useCallback } from 'react';
import { useSimpleWallet } from '../contexts/SimpleWalletContext';

/**
 * Returns a function that refreshes credits for the currently authenticated user
 * Works with wallet auth
 */
export function useRefreshCredits(): () => void {
  const { address, fetchCredits, isConnected: isWalletConnected } = useSimpleWallet();

  return useCallback(() => {
    if (isWalletConnected && fetchCredits && address) {
      fetchCredits(address, 3, true);
    }
  }, [isWalletConnected, fetchCredits, address]);
}

/**
 * Returns both the refresh function and connection status
 */
export function useCredits() {
  const wallet = useSimpleWallet();
  
  const isConnected = wallet.isConnected;
  const credits = wallet.credits ?? 0;
  
  const refreshCredits = useCallback(() => {
    if (wallet.isConnected && wallet.fetchCredits && wallet.address) {
      wallet.fetchCredits(wallet.address, 3, true);
    }
  }, [wallet]);

  return {
    isConnected,
    credits,
    refreshCredits,
    isWalletAuth: wallet.isConnected,
  };
}
