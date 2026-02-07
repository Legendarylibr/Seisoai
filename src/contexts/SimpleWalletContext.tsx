import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo, ReactNode } from 'react';
import { useAccount, useDisconnect, useConnect, useSignMessage } from 'wagmi';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { checkNFTHoldings, checkTokenHoldings, NFTCollection, TokenHolding } from '../services/nftVerificationService';
import { 
  requestNonce, 
  authenticateWithSignature, 
  clearTokens, 
  hasStoredAuth,
  logout as logoutService 
} from '../services/walletAuthService';
import logger from '../utils/logger';
import { API_URL, ensureCSRFToken, getApiHeaders } from '../utils/apiConfig';
import { isInWalletBrowser } from '../config/wagmi';

// Token Gate Types
export interface TokenGateConfig {
  enabled: boolean;
  contractAddress: string;
  chainId: string;
  chainName: string;
  minimumBalance: number;
  tokenName: string;
  symbol?: string;
  isERC20: boolean;
}

export interface TokenGateStatus {
  hasAccess: boolean;
  balance: number;
  requiredBalance: number;
  contractAddress: string;
  chainId: string;
  chainName: string;
  tokenName: string;
  isERC20: boolean;
  isLoading: boolean;
}

// Types
type WalletType = 'evm' | 'solana' | null;

interface SimpleWalletContextValue {
  isConnected: boolean;
  address: string | null;
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
  // Token Gate
  tokenGateStatus: TokenGateStatus;
  tokenGateConfig: TokenGateConfig | null;
  refreshTokenGate: () => Promise<void>;
  // Actions
  connectWallet: (selectedWallet?: string) => Promise<void>;
  disconnectWallet: () => Promise<void>;
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

// Default token gate status
const DEFAULT_TOKEN_GATE_STATUS: TokenGateStatus = {
  hasAccess: false,
  balance: 0,
  requiredBalance: 1,
  contractAddress: '',
  chainId: '',
  chainName: '',
  tokenName: '',
  isERC20: true,
  isLoading: true
};

export const SimpleWalletProvider: React.FC<SimpleWalletProviderProps> = ({ children }) => {
  // Wagmi hooks for wallet state
  const { address: wagmiAddress, isConnected: wagmiConnected, connector } = useAccount();
  const { disconnect } = useDisconnect();
  const { openConnectModal } = useConnectModal();
  const { isPending: isConnecting } = useConnect();
  const { signMessageAsync } = useSignMessage();

  // Local state for app-specific data
  const [credits, setCredits] = useState(0);
  const [isAuthenticated, setIsAuthenticated] = useState(hasStoredAuth());
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const authAttemptedRef = useRef<string | null>(null);
  const [totalCreditsEarned, setTotalCreditsEarned] = useState(0);
  const [totalCreditsSpent, setTotalCreditsSpent] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isNFTHolder, setIsNFTHolder] = useState(false);
  const [isTokenHolder, setIsTokenHolder] = useState(false);
  const [nftCollections, setNftCollections] = useState<NFTCollection[]>([]);
  const [tokenHoldings, setTokenHoldings] = useState<TokenHolding[]>([]);
  const [tokenGateStatus, setTokenGateStatus] = useState<TokenGateStatus>(DEFAULT_TOKEN_GATE_STATUS);
  const [tokenGateConfig, setTokenGateConfig] = useState<TokenGateConfig | null>(null);
  const lastFetchRef = useRef(0);

  // Track if we've done initial disconnect to clear stale connections
  const hasDisconnectedOnMount = useRef(false);

  // Disconnect any persisted wallet on mount to require fresh connection each visit
  // EXCEPT when in a wallet's in-app browser (like Base app) where the wallet is injected
  useEffect(() => {
    // Skip disconnect logic if we're in a wallet's in-app browser
    if (isInWalletBrowser) {
      hasDisconnectedOnMount.current = true;
      if (wagmiConnected) {
        logger.info('In-app browser detected - keeping wallet connection', { 
          connectorId: connector?.id 
        });
      }
      return;
    }
    
    if (!hasDisconnectedOnMount.current && wagmiConnected) {
      hasDisconnectedOnMount.current = true;
      disconnect();
      logger.info('Cleared persisted wallet connection - fresh auth required');
    } else {
      hasDisconnectedOnMount.current = true;
    }
  }, [wagmiConnected, disconnect, connector?.id]);

  // Derived state from wagmi
  const isConnected = wagmiConnected;
  const address = wagmiAddress?.toLowerCase() || null;
  const walletType: WalletType = isConnected ? 'evm' : null;
  const connectedWalletId = connector?.id || null;
  
  // Computed: has free access if NFT or token holder on EVM chains only
  const hasFreeAccess = (isNFTHolder || isTokenHolder) && walletType === 'evm';

  // Fetch token gate config on mount
  useEffect(() => {
    const fetchTokenGateConfig = async () => {
      try {
        const response = await fetch(`${API_URL}/api/user/token-gate/config`);
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.tokenGate) {
            setTokenGateConfig(data.tokenGate);
            if (!data.tokenGate.enabled) {
              setTokenGateStatus(prev => ({ ...prev, hasAccess: true, isLoading: false }));
            }
          }
        }
      } catch (err) {
        logger.error('Failed to fetch token gate config', { error: err instanceof Error ? err.message : 'Unknown' });
      }
    };
    fetchTokenGateConfig();
  }, []);

  // Check token gate access
  const checkTokenGateAccess = useCallback(async (walletAddress: string): Promise<void> => {
    if (!walletAddress) {
      setTokenGateStatus({ ...DEFAULT_TOKEN_GATE_STATUS, isLoading: false });
      return;
    }

    setTokenGateStatus(prev => ({ ...prev, isLoading: true }));

    try {
      // Ensure CSRF token is available before making POST request
      await ensureCSRFToken();
      
      const response = await fetch(`${API_URL}/api/user/token-gate/check`, {
        method: 'POST',
        headers: getApiHeaders('POST'),
        credentials: 'include',
        body: JSON.stringify({ walletAddress: walletAddress.toLowerCase() })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setTokenGateStatus({
            hasAccess: data.hasAccess,
            balance: data.balance,
            requiredBalance: data.requiredBalance,
            contractAddress: data.contractAddress,
            chainId: data.chainId,
            chainName: data.chainName,
            tokenName: data.tokenName,
            isERC20: data.isERC20,
            isLoading: false
          });
          logger.info('Token gate check completed', {
            hasAccess: data.hasAccess,
            balance: data.balance
          });
        }
      } else {
        setTokenGateStatus(prev => ({ ...prev, hasAccess: false, isLoading: false }));
      }
    } catch (err) {
      logger.error('Token gate check failed', { error: err instanceof Error ? err.message : 'Unknown' });
      setTokenGateStatus(prev => ({ ...prev, hasAccess: false, isLoading: false }));
    }
  }, []);

  // Refresh token gate (clears cache)
  const refreshTokenGate = useCallback(async (): Promise<void> => {
    if (!address) return;

    setTokenGateStatus(prev => ({ ...prev, isLoading: true }));

    try {
      // Ensure CSRF token is available before making POST request
      await ensureCSRFToken();
      
      const response = await fetch(`${API_URL}/api/user/token-gate/refresh`, {
        method: 'POST',
        headers: getApiHeaders('POST'),
        credentials: 'include',
        body: JSON.stringify({ walletAddress: address.toLowerCase() })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setTokenGateStatus({
            hasAccess: data.hasAccess,
            balance: data.balance,
            requiredBalance: data.requiredBalance,
            contractAddress: data.contractAddress,
            chainId: data.chainId,
            chainName: data.chainName,
            tokenName: data.tokenName,
            isERC20: data.isERC20,
            isLoading: false
          });
        }
      }
    } catch (err) {
      logger.error('Token gate refresh failed', { error: err instanceof Error ? err.message : 'Unknown' });
      setTokenGateStatus(prev => ({ ...prev, isLoading: false }));
    }
  }, [address]);

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
        const creditsVal = data.user?.credits ?? data.credits ?? 0;
        const earned = data.user?.totalCreditsEarned ?? data.totalCreditsEarned ?? 0;
        const spent = data.user?.totalCreditsSpent ?? data.totalCreditsSpent ?? 0;
        
        const c = Math.max(0, Math.floor(Number(creditsVal) || 0));
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

  // Authenticate wallet with signature (SIWE-style)
  const authenticateWallet = useCallback(async (walletAddress: string): Promise<boolean> => {
    // Prevent duplicate auth attempts for the same wallet
    if (authAttemptedRef.current === walletAddress.toLowerCase()) {
      logger.debug('Auth already attempted for this wallet');
      return isAuthenticated;
    }
    
    // Check if we already have a valid token
    if (hasStoredAuth()) {
      logger.debug('Already have stored auth token');
      setIsAuthenticated(true);
      return true;
    }
    
    setIsAuthenticating(true);
    authAttemptedRef.current = walletAddress.toLowerCase();
    
    try {
      // Step 1: Request nonce from server
      const nonceResponse = await requestNonce(walletAddress);
      if (!nonceResponse.success || !nonceResponse.message) {
        logger.error('Failed to get nonce', { error: nonceResponse.error });
        setError('Failed to start authentication');
        return false;
      }
      
      // Step 2: Sign the message with wallet
      let signature: string;
      try {
        signature = await signMessageAsync({ message: nonceResponse.message });
      } catch (signError) {
        // User rejected signature or wallet error
        const errorMsg = signError instanceof Error ? signError.message : 'Unknown error';
        if (errorMsg.includes('rejected') || errorMsg.includes('denied')) {
          logger.info('User rejected signature request');
          setError('Please sign the message to continue');
        } else {
          logger.error('Failed to sign message', { error: errorMsg });
          setError('Failed to sign message');
        }
        return false;
      }
      
      // Step 3: Send signature to server for verification
      const authResponse = await authenticateWithSignature(
        walletAddress,
        signature,
        nonceResponse.message
      );
      
      if (!authResponse.success) {
        logger.error('Authentication failed', { error: authResponse.error });
        setError(authResponse.error || 'Authentication failed');
        return false;
      }
      
      // Success!
      setIsAuthenticated(true);
      setError(null);
      
      // Update credits from auth response
      if (authResponse.user) {
        setCredits(authResponse.user.credits || 0);
        setTotalCreditsEarned(authResponse.user.totalCreditsEarned || 0);
        setTotalCreditsSpent(authResponse.user.totalCreditsSpent || 0);
      }
      
      logger.info('Wallet authenticated successfully');
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Wallet authentication error', { error: errorMessage });
      setError('Authentication failed');
      return false;
    } finally {
      setIsAuthenticating(false);
    }
  }, [signMessageAsync, isAuthenticated]);

  // Connect wallet - opens RainbowKit modal
  const connectWallet = useCallback(async (_selectedWallet?: string): Promise<void> => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Open RainbowKit modal - it handles all wallet selection
      if (openConnectModal) {
        openConnectModal();
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error';
      setError(errorMessage);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, [openConnectModal]);

  // Disconnect wallet
  const disconnectWallet = useCallback(async (): Promise<void> => {
    // Clear auth tokens
    await logoutService();
    setIsAuthenticated(false);
    authAttemptedRef.current = null;
    
    // Disconnect wagmi
    disconnect();
    
    // Reset all state
    setCredits(0);
    setTotalCreditsEarned(0);
    setTotalCreditsSpent(0);
    setError(null);
    setIsNFTHolder(false);
    setIsTokenHolder(false);
    setNftCollections([]);
    setTokenHoldings([]);
    setTokenGateStatus(DEFAULT_TOKEN_GATE_STATUS);
  }, [disconnect]);

  // Authenticate and fetch data when wallet connects
  useEffect(() => {
    if (isConnected && address) {
      // Authenticate wallet if not already authenticated
      authenticateWallet(address).then((authenticated) => {
        if (authenticated) {
          // Fetch additional data after authentication
          fetchCredits(address, 0, true);
          checkHolderStatus(address).catch(() => { /* ignore */ });
          checkTokenGateAccess(address).catch(() => { /* ignore */ });
        }
      }).catch(() => {
        // Still try to fetch some data even if auth fails
        fetchCredits(address, 0, true);
        checkTokenGateAccess(address).catch(() => { /* ignore */ });
      });
    } else {
      // Reset state when disconnected
      setIsAuthenticated(false);
      authAttemptedRef.current = null;
      clearTokens();
      setCredits(0);
      setTotalCreditsEarned(0);
      setTotalCreditsSpent(0);
      setIsNFTHolder(false);
      setIsTokenHolder(false);
      setNftCollections([]);
      setTokenHoldings([]);
      setTokenGateStatus(DEFAULT_TOKEN_GATE_STATUS);
    }
  }, [isConnected, address, authenticateWallet, fetchCredits, checkHolderStatus, checkTokenGateAccess]);

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
    isConnected: isConnected && isAuthenticated, // Only truly connected when authenticated 
    address, 
    credits, 
    totalCreditsEarned, 
    totalCreditsSpent, 
    isLoading: isLoading || isConnecting || isAuthenticating, 
    error,
    isNFTHolder, 
    isTokenHolder, 
    hasFreeAccess, 
    nftCollections, 
    tokenHoldings,
    tokenGateStatus, 
    tokenGateConfig, 
    refreshTokenGate,
    connectWallet, 
    disconnectWallet, 
    fetchCredits, 
    refreshCredits,
    checkHolderStatus, 
    walletType, 
    connectedWalletId, 
    setCreditsManually
  }), [isConnected, isAuthenticated, address, credits, totalCreditsEarned, totalCreditsSpent, isLoading, isConnecting, isAuthenticating, error,
      isNFTHolder, isTokenHolder, hasFreeAccess, nftCollections, tokenHoldings,
      tokenGateStatus, tokenGateConfig, refreshTokenGate,
      connectWallet, disconnectWallet, fetchCredits, refreshCredits,
      checkHolderStatus, walletType, connectedWalletId, setCreditsManually]);

  return <SimpleWalletContext.Provider value={value}>{children}</SimpleWalletContext.Provider>;
};

export const useSimpleWallet = (): SimpleWalletContextValue => {
  const context = useContext(SimpleWalletContext);
  if (!context) throw new Error('useSimpleWallet must be used within a SimpleWalletProvider');
  return context;
};
