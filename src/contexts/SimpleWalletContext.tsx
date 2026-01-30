import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo, ReactNode } from 'react';
import { useAccount, useDisconnect } from 'wagmi';
import { checkNFTHoldings, checkTokenHoldings, NFTCollection, TokenHolding } from '../services/nftVerificationService';
import logger from '../utils/logger';
import { API_URL } from '../utils/apiConfig';

// Types
type WalletType = 'evm' | 'solana' | null;

interface SimpleWalletContextValue {
  isConnected: boolean;
  address: string | null;
  /** @deprecated Use `address` instead */
  walletAddress: string | null;
  credits: number;
  totalCreditsEarned: number;
  totalCreditsSpent: number;
  isLoading: boolean;
  error: string | null;
  isNFTHolder: boolean;
  isTokenHolder: boolean;
  hasFreeAccess: boolean;
  nftCollections: NFTCollection[];
  tokenHoldings: TokenHolding[];
  walletType: WalletType;
  connectedWalletId: string | null;
  connectWallet: (selectedWallet?: string) => Promise<void>;
  disconnectWallet: () => Promise<void>;
  /** @deprecated Use `disconnectWallet` instead */
  disconnect: () => Promise<void>;
  fetchCredits: (walletAddress: string, retries?: number, force?: boolean) => Promise<number>;
  refreshCredits: () => Promise<void>;
  checkHolderStatus: (walletAddress: string) => Promise<void>;
  setCreditsManually: (credits: number) => void;
}

const SimpleWalletContext = createContext<SimpleWalletContextValue | null>(null);

// PERFORMANCE: Increased from 30s to 60s
const REFRESH_INTERVAL = 60000;
const MIN_FETCH_INTERVAL = 5000;

interface SimpleWalletProviderProps {
  children: ReactNode;
}

export const SimpleWalletProvider: React.FC<SimpleWalletProviderProps> = ({ children }) => {
  // Use wagmi hooks for wallet state
  const { address: wagmiAddress, isConnected: wagmiIsConnected, connector } = useAccount();
  const { disconnect: wagmiDisconnect } = useDisconnect();

  // Local state for credits and holder status
  const [credits, setCredits] = useState(0);
  const [totalCreditsEarned, setTotalCreditsEarned] = useState(0);
  const [totalCreditsSpent, setTotalCreditsSpent] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isNFTHolder, setIsNFTHolder] = useState(false);
  const [isTokenHolder, setIsTokenHolder] = useState(false);
  const [nftCollections, setNftCollections] = useState<NFTCollection[]>([]);
  const [tokenHoldings, setTokenHoldings] = useState<TokenHolding[]>([]);
  const lastFetchRef = useRef(0);

  // Derive values from wagmi
  const isConnected = wagmiIsConnected;
  const address = wagmiAddress ?? null;
  const walletType: WalletType = wagmiIsConnected ? 'evm' : null;
  const connectedWalletId = connector?.id ?? null;
  
  // Computed: has free access if NFT or token holder on EVM chains only
  const hasFreeAccess = (isNFTHolder || isTokenHolder) && walletType === 'evm';

  const fetchCredits = useCallback(async (walletAddress: string, _retries?: number, force: boolean = false): Promise<number> => {
    if (!walletAddress) { setCredits(0); setTotalCreditsEarned(0); setTotalCreditsSpent(0); return 0; }
    
    // PERFORMANCE: Debounce
    const now = Date.now();
    if (!force && now - lastFetchRef.current < MIN_FETCH_INTERVAL) return credits;
    lastFetchRef.current = now;

    const normalized = walletAddress.toLowerCase();
    try {
      const response = await fetch(`${API_URL}/api/users/${normalized}?skipNFTs=true`, {
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store'
      });
      if (!response.ok) return 0;
      const data = await response.json();
      if (data.success) {
        // Handle both response formats:
        // - Old format: data.user.credits
        // - New format: data.credits directly
        const creditsValue = data.user?.credits ?? data.credits ?? 0;
        const earned = data.user?.totalCreditsEarned ?? data.totalCreditsEarned ?? 0;
        const spent = data.user?.totalCreditsSpent ?? data.totalCreditsSpent ?? 0;
        
        const c = Math.max(0, Math.floor(Number(creditsValue) || 0));
        setCredits(c);
        setTotalCreditsEarned(Math.max(0, Math.floor(Number(earned) || 0)));
        setTotalCreditsSpent(Math.max(0, Math.floor(Number(spent) || 0)));
        return c;
      }
      return 0;
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error';
      logger.error('Failed to fetch credits', { error: errorMessage });
      return 0;
    }
  }, [credits]);

  // Check both NFT and token holder status
  const checkHolderStatus = useCallback(async (walletAddress: string): Promise<void> => {
    if (!walletAddress) { 
      setIsNFTHolder(false); 
      setIsTokenHolder(false);
      setNftCollections([]); 
      setTokenHoldings([]);
      return; 
    }
    try {
      // Check NFT and token holdings in parallel
      const [nftResult, tokenResult] = await Promise.all([
        checkNFTHoldings(walletAddress.toLowerCase()),
        checkTokenHoldings(walletAddress.toLowerCase())
      ]);
      
      setIsNFTHolder(nftResult.isHolder === true);
      setNftCollections(Array.isArray(nftResult.collections) ? nftResult.collections : []);
      
      setIsTokenHolder(tokenResult.isHolder === true);
      setTokenHoldings(Array.isArray(tokenResult.tokens) ? tokenResult.tokens : []);
      
      if (nftResult.creditsGranted && nftResult.creditsGranted > 0) {
        await fetchCredits(walletAddress, 0, true);
      }
      
      logger.info('Holder status checked', {
        isNFTHolder: nftResult.isHolder,
        isTokenHolder: tokenResult.isHolder,
        hasFreeAccess: nftResult.isHolder || tokenResult.hasFreeAccess
      });
    } catch {
      setIsNFTHolder(false);
      setIsTokenHolder(false);
      setNftCollections([]);
      setTokenHoldings([]);
    }
  }, [fetchCredits]);

  // Disconnect wallet using wagmi
  const disconnectWallet = useCallback(async (): Promise<void> => {
    wagmiDisconnect();
    setCredits(0);
    setTotalCreditsEarned(0);
    setTotalCreditsSpent(0);
    setError(null);
    setIsNFTHolder(false);
    setIsTokenHolder(false);
    setNftCollections([]);
    setTokenHoldings([]);
  }, [wagmiDisconnect]);

  // Connect wallet - RainbowKit handles this via its modal, but we keep this for API compatibility
  const connectWallet = useCallback(async (_selectedWallet: string = 'metamask'): Promise<void> => {
    // RainbowKit handles connection via its modal
    // This function is kept for backward compatibility
    // The actual connection happens through RainbowKit's ConnectButton
    setIsLoading(true);
    setError(null);
    // RainbowKit will trigger wagmi's useAccount hook when connected
    setIsLoading(false);
  }, []);

  // Fetch credits and holder status when wallet connects
  useEffect(() => {
    if (isConnected && address) {
      fetchCredits(address, 0, true);
      checkHolderStatus(address).catch(() => { /* ignore */ });
    } else {
      // Reset state when disconnected
      setCredits(0);
      setTotalCreditsEarned(0);
      setTotalCreditsSpent(0);
      setIsNFTHolder(false);
      setIsTokenHolder(false);
      setNftCollections([]);
      setTokenHoldings([]);
    }
  }, [isConnected, address, fetchCredits, checkHolderStatus]);

  // PERFORMANCE: Smarter polling
  useEffect(() => {
    if (!isConnected || !address) return;
    
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') fetchCredits(address);
    }, REFRESH_INTERVAL);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') fetchCredits(address);
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', handleVisibility); };
  }, [isConnected, address, fetchCredits]);

  const refreshCredits = useCallback(async (): Promise<void> => { 
    if (address) await fetchCredits(address, 0, true); 
  }, [address, fetchCredits]);
  
  const setCreditsManually = useCallback((n: number): void => {
    setCredits(Math.max(0, Math.floor(Number(n) || 0)));
  }, []);

  // PERFORMANCE: Memoize context value
  const value = useMemo<SimpleWalletContextValue>(() => ({
    isConnected, address, walletAddress: address, credits, totalCreditsEarned, totalCreditsSpent, isLoading, error,
    isNFTHolder, isTokenHolder, hasFreeAccess, nftCollections, tokenHoldings,
    connectWallet, disconnectWallet, disconnect: disconnectWallet, fetchCredits, refreshCredits,
    checkHolderStatus, walletType, connectedWalletId, setCreditsManually
  }), [isConnected, address, credits, totalCreditsEarned, totalCreditsSpent, isLoading, error,
      isNFTHolder, isTokenHolder, hasFreeAccess, nftCollections, tokenHoldings,
      connectWallet, disconnectWallet, fetchCredits, refreshCredits,
      checkHolderStatus, walletType, connectedWalletId, setCreditsManually]);

  return <SimpleWalletContext.Provider value={value}>{children}</SimpleWalletContext.Provider>;
};

export const useSimpleWallet = (): SimpleWalletContextValue => {
  const context = useContext(SimpleWalletContext);
  if (!context) throw new Error('useSimpleWallet must be used within a SimpleWalletProvider');
  return context;
};
