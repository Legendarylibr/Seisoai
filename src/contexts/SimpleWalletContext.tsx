import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo, ReactNode } from 'react';
import { checkNFTHoldings, NFTCollection } from '../services/nftVerificationService';
import logger from '../utils/logger';
import { API_URL } from '../utils/apiConfig';

// Types
type WalletType = 'evm' | 'solana' | null;

interface WalletLinks {
  install: string;
  chrome?: string;
  deepLink?: (url: string) => string;
}

interface SimpleWalletContextValue {
  isConnected: boolean;
  address: string | null;
  credits: number;
  totalCreditsEarned: number;
  totalCreditsSpent: number;
  isLoading: boolean;
  error: string | null;
  isNFTHolder: boolean;
  nftCollections: NFTCollection[];
  walletType: WalletType;
  connectedWalletId: string | null;
  connectWallet: (selectedWallet?: string) => Promise<void>;
  disconnectWallet: () => Promise<void>;
  fetchCredits: (walletAddress: string, retries?: number, force?: boolean) => Promise<number>;
  refreshCredits: () => Promise<void>;
  checkNFTStatus: (walletAddress: string) => Promise<void>;
  setCreditsManually: (credits: number) => void;
}

// Extend Window interface for wallet providers
declare global {
  interface Window {
    ethereum?: {
      isMetaMask?: boolean;
      isRabby?: boolean;
      isCoinbaseWallet?: boolean;
      isBraveWallet?: boolean;
      isTrust?: boolean;
      isTrustWallet?: boolean;
      isPhantom?: boolean;
      isRainbow?: boolean;
      isOkxWallet?: boolean;
      isBitKeep?: boolean;
      isFrame?: boolean;
      providers?: Array<{
        isMetaMask?: boolean;
        isRabby?: boolean;
        isCoinbaseWallet?: boolean;
        isBraveWallet?: boolean;
        isTrust?: boolean;
        isTrustWallet?: boolean;
        isPhantom?: boolean;
        isRainbow?: boolean;
        isOkxWallet?: boolean;
        isBitKeep?: boolean;
        isFrame?: boolean;
        request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      }>;
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on: (event: string, handler: (...args: unknown[]) => void) => void;
      removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
    };
    rabby?: { request: (args: { method: string }) => Promise<string[]> };
    coinbaseWalletExtension?: { request: (args: { method: string }) => Promise<string[]> };
    trustwallet?: { request: (args: { method: string }) => Promise<string[]> };
    okxwallet?: { request: (args: { method: string }) => Promise<string[]> };
    bitkeep?: { ethereum?: { request: (args: { method: string }) => Promise<string[]> } };
    bitget?: { ethereum?: { request: (args: { method: string }) => Promise<string[]> } };
    frame?: { request: (args: { method: string }) => Promise<string[]> };
    phantom?: {
      ethereum?: { request: (args: { method: string }) => Promise<string[]> };
      solana?: { isPhantom?: boolean; connect: () => Promise<{ publicKey: { toString: () => string } }> };
    };
    solana?: { isPhantom?: boolean; connect: () => Promise<{ publicKey: { toString: () => string } }> };
    solflare?: { isSolflare?: boolean; connect: () => Promise<void>; publicKey: { toString: () => string } };
  }
}

// PERFORMANCE: Dynamic import for WalletConnect - only loads when user clicks WalletConnect
const getWalletConnectProvider = () => import('@walletconnect/ethereum-provider').then(m => m.EthereumProvider);

const SimpleWalletContext = createContext<SimpleWalletContextValue | null>(null);
const WALLETCONNECT_PROJECT_ID = '8e0a0c75ac8c8f6d3ef36a26f2f8f64d';

// PERFORMANCE: Increased from 30s to 60s
const REFRESH_INTERVAL = 60000;
const MIN_FETCH_INTERVAL = 5000;

const isMobile = (): boolean => /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

const WALLET_LINKS: Record<string, WalletLinks> = {
  metamask: { install: 'https://metamask.io/download/', chrome: 'https://chrome.google.com/webstore/detail/metamask/nkbihfbeogaeaoehlefnkodbefgpgknn', deepLink: url => `https://metamask.app.link/dapp/${url.replace('https://', '')}` },
  rabby: { install: 'https://rabby.io/', chrome: 'https://chrome.google.com/webstore/detail/rabby-wallet/acmacodkjbdgmoleebolmdjonilkdbch' },
  coinbase: { install: 'https://www.coinbase.com/wallet/downloads', chrome: 'https://chrome.google.com/webstore/detail/coinbase-wallet-extension/hnfanknocfeofbddgcijnmhnfnkdnaad', deepLink: url => `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(url)}` },
  rainbow: { install: 'https://rainbow.me/', deepLink: url => `https://rainbow.me/dapp?url=${encodeURIComponent(url)}` },
  trust: { install: 'https://trustwallet.com/download', deepLink: url => `https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(url)}` },
  okx: { install: 'https://www.okx.com/web3', chrome: 'https://chrome.google.com/webstore/detail/okx-wallet/mcohilncbfahbmgdjkbpemcciiolgcge', deepLink: url => `okx://wallet/dapp/details?dappUrl=${encodeURIComponent(url)}` },
  bitget: { install: 'https://web3.bitget.com/wallet-download', chrome: 'https://chrome.google.com/webstore/detail/bitget-wallet/jiidiaalihmmhddjgbnbgdfflelocpak' },
  phantom: { install: 'https://phantom.app/download', chrome: 'https://chrome.google.com/webstore/detail/phantom/bfnaelmomeimhlpmgjnjophhpkkoljpa', deepLink: url => `https://phantom.app/ul/browse/${encodeURIComponent(url)}` },
  solflare: { install: 'https://solflare.com/download', chrome: 'https://chrome.google.com/webstore/detail/solflare-wallet/bhhhlbepdkbapadjdnnojkbgioiodbic' },
  brave: { install: 'https://brave.com/download/' },
  frame: { install: 'https://frame.sh/' }
};

const safeGetEthereum = () => { try { return window.ethereum || null; } catch { return null; } };

const createWalletNotFoundError = (walletId: string, walletName: string): Error => {
  const links = WALLET_LINKS[walletId];
  const currentUrl = window.location.href;
  if (isMobile() && links?.deepLink) {
    setTimeout(() => { window.location.href = links.deepLink!(currentUrl); }, 100);
    return new Error(`Opening ${walletName}...`);
  }
  const installUrl = links?.chrome || links?.install;
  return installUrl 
    ? new Error(`${walletName} not detected.|||Install ${walletName}|||${installUrl}`)
    : new Error(`${walletName} not detected. Please install the extension.`);
};

type ProviderPredicate = (p: NonNullable<typeof window.ethereum>) => boolean;

const findProvider = (predicate: ProviderPredicate) => {
  try {
    const eth = safeGetEthereum();
    if (!eth) return null;
    if (eth.providers?.length) {
      const found = eth.providers.find(p => { try { return predicate(p as typeof eth); } catch { return false; } });
      if (found) return found;
    }
    try { if (predicate(eth)) return eth; } catch { /* ignore */ }
    return null;
  } catch { return null; }
};

interface SimpleWalletProviderProps {
  children: ReactNode;
}

export const SimpleWalletProvider: React.FC<SimpleWalletProviderProps> = ({ children }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [credits, setCredits] = useState(0);
  const [totalCreditsEarned, setTotalCreditsEarned] = useState(0);
  const [totalCreditsSpent, setTotalCreditsSpent] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isNFTHolder, setIsNFTHolder] = useState(false);
  const [nftCollections, setNftCollections] = useState<NFTCollection[]>([]);
  const [walletType, setWalletType] = useState<WalletType>(null);
  const [connectedWalletId, setConnectedWalletId] = useState<string | null>(null);
  const walletConnectProviderRef = useRef<Awaited<ReturnType<typeof getWalletConnectProvider>> | null>(null);
  const lastFetchRef = useRef(0);

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
        const credits = data.user?.credits ?? data.credits ?? 0;
        const earned = data.user?.totalCreditsEarned ?? data.totalCreditsEarned ?? 0;
        const spent = data.user?.totalCreditsSpent ?? data.totalCreditsSpent ?? 0;
        
        const c = Math.max(0, Math.floor(Number(credits) || 0));
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

  const checkNFTStatus = useCallback(async (walletAddress: string): Promise<void> => {
    if (!walletAddress) { setIsNFTHolder(false); setNftCollections([]); return; }
    try {
      const result = await checkNFTHoldings(walletAddress.toLowerCase());
      setIsNFTHolder(result.isHolder === true);
      setNftCollections(Array.isArray(result.collections) ? result.collections : []);
      if (result.creditsGranted && result.creditsGranted > 0) await fetchCredits(walletAddress, 0, true);
    } catch {
      setIsNFTHolder(false);
      setNftCollections([]);
    }
  }, [fetchCredits]);

  const disconnectWallet = useCallback(async (): Promise<void> => {
    if (walletConnectProviderRef.current) {
      try { await (walletConnectProviderRef.current as { disconnect?: () => Promise<void> }).disconnect?.(); } catch { /* ignore */ }
      walletConnectProviderRef.current = null;
    }
    setIsConnected(false);
    setAddress(null);
    setCredits(0);
    setTotalCreditsEarned(0);
    setTotalCreditsSpent(0);
    setError(null);
    setIsNFTHolder(false);
    setNftCollections([]);
    setWalletType(null);
    setConnectedWalletId(null);
  }, []);

  const connectWallet = useCallback(async (selectedWallet: string = 'metamask'): Promise<void> => {
    try {
      setIsLoading(true);
      setError(null);
      let provider: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } | null = null;
      let walletAddress: string | null = null;

      const getEvmAddress = async (p: typeof provider): Promise<string> => {
        const accounts = await p!.request({ method: 'eth_requestAccounts' }) as string[];
        return accounts[0];
      };

      switch (selectedWallet) {
        case 'metamask': {
          const isReal = (p: NonNullable<typeof window.ethereum>): boolean => Boolean(p?.isMetaMask && !p.isRabby && !p.isCoinbaseWallet && !p.isBraveWallet && !p.isTrust && !p.isPhantom);
          const eth = safeGetEthereum();
          provider = (eth && isReal(eth)) ? eth : findProvider(isReal);
          if (!provider) throw createWalletNotFoundError('metamask', 'MetaMask');
          walletAddress = await getEvmAddress(provider);
          setWalletType('evm');
          break;
        }
        case 'walletconnect': {
          const EthereumProvider = await getWalletConnectProvider();
          const wc = await EthereumProvider.init({
            projectId: WALLETCONNECT_PROJECT_ID, 
            chains: [1], 
            optionalChains: [137, 42161, 10, 8453, 56], 
            showQrModal: true,
            metadata: { 
              name: 'Seiso AI', 
              description: 'AI Image Generation', 
              url: window.location.origin, 
              icons: [`${window.location.origin}/favicon.ico`] 
            }
          });
          walletConnectProviderRef.current = wc as unknown as typeof walletConnectProviderRef.current;
          await wc.enable();
          const accounts = await wc.request({ method: 'eth_accounts' }) as string[];
          if (!accounts?.length) throw new Error('No accounts from WalletConnect');
          walletAddress = accounts[0];
          setWalletType('evm');
          wc.on('disconnect', () => disconnectWallet());
          break;
        }
        case 'rabby': {
          provider = window.rabby || (safeGetEthereum()?.isRabby ? safeGetEthereum() : findProvider(p => !!p.isRabby));
          if (!provider) throw createWalletNotFoundError('rabby', 'Rabby');
          walletAddress = await getEvmAddress(provider);
          setWalletType('evm');
          break;
        }
        case 'coinbase': {
          provider = window.coinbaseWalletExtension || (safeGetEthereum()?.isCoinbaseWallet ? safeGetEthereum() : findProvider(p => !!p.isCoinbaseWallet));
          if (!provider) throw createWalletNotFoundError('coinbase', 'Coinbase');
          walletAddress = await getEvmAddress(provider);
          setWalletType('evm');
          break;
        }
        case 'rainbow': {
          const eth = safeGetEthereum();
          provider = eth?.isRainbow ? eth : findProvider(p => !!p.isRainbow);
          if (!provider) throw createWalletNotFoundError('rainbow', 'Rainbow');
          walletAddress = await getEvmAddress(provider);
          setWalletType('evm');
          break;
        }
        case 'trust': {
          provider = window.trustwallet || (safeGetEthereum()?.isTrust ? safeGetEthereum() : findProvider(p => !!(p.isTrust || p.isTrustWallet)));
          if (!provider) throw createWalletNotFoundError('trust', 'Trust');
          walletAddress = await getEvmAddress(provider);
          setWalletType('evm');
          break;
        }
        case 'okx': {
          provider = window.okxwallet || (safeGetEthereum()?.isOkxWallet ? safeGetEthereum() : findProvider(p => !!p.isOkxWallet));
          if (!provider) throw createWalletNotFoundError('okx', 'OKX');
          walletAddress = await getEvmAddress(provider);
          setWalletType('evm');
          break;
        }
        case 'bitget': {
          provider = window.bitkeep?.ethereum || window.bitget?.ethereum || (safeGetEthereum()?.isBitKeep ? safeGetEthereum() : findProvider(p => !!p.isBitKeep));
          if (!provider) throw createWalletNotFoundError('bitget', 'Bitget');
          walletAddress = await getEvmAddress(provider);
          setWalletType('evm');
          break;
        }
        case 'brave': {
          const eth = safeGetEthereum();
          provider = eth?.isBraveWallet ? eth : findProvider(p => !!p.isBraveWallet);
          if (!provider) throw createWalletNotFoundError('brave', 'Brave');
          walletAddress = await getEvmAddress(provider);
          setWalletType('evm');
          break;
        }
        case 'frame': {
          provider = window.frame || (safeGetEthereum()?.isFrame ? safeGetEthereum() : findProvider(p => !!p.isFrame));
          if (!provider) throw createWalletNotFoundError('frame', 'Frame');
          walletAddress = await getEvmAddress(provider);
          setWalletType('evm');
          break;
        }
        case 'phantom-evm': {
          if (!window.phantom?.ethereum) throw createWalletNotFoundError('phantom', 'Phantom');
          const accounts = await window.phantom.ethereum.request({ method: 'eth_requestAccounts' });
          walletAddress = accounts[0];
          setWalletType('evm');
          break;
        }
        case 'phantom': {
          const sol = window.phantom?.solana?.isPhantom ? window.phantom.solana : window.solana?.isPhantom ? window.solana : null;
          if (!sol) throw createWalletNotFoundError('phantom', 'Phantom');
          walletAddress = (await sol.connect()).publicKey.toString();
          setWalletType('solana');
          break;
        }
        case 'solflare': {
          if (!window.solflare?.isSolflare) throw createWalletNotFoundError('solflare', 'Solflare');
          await window.solflare.connect();
          walletAddress = window.solflare.publicKey.toString();
          setWalletType('solana');
          break;
        }
        default: throw new Error(`Unsupported wallet: ${selectedWallet}`);
      }

      if (!walletAddress) throw new Error('No accounts found');
      setAddress(walletAddress);
      setIsConnected(true);
      setConnectedWalletId(selectedWallet);
      await fetchCredits(walletAddress, 0, true);
      checkNFTStatus(walletAddress).catch(() => { /* ignore */ });
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error';
      setError(errorMessage);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, [fetchCredits, checkNFTStatus, disconnectWallet]);

  // PERFORMANCE: Smarter polling
  useEffect(() => {
    if (!isConnected || !address) return;
    fetchCredits(address, 0, true);
    
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') fetchCredits(address);
    }, REFRESH_INTERVAL);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') fetchCredits(address);
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', handleVisibility); };
  }, [isConnected, address, fetchCredits]);

  // Listen for account changes in the wallet
  useEffect(() => {
    const eth = safeGetEthereum();
    if (!eth || !isConnected || walletType !== 'evm') return;

    const handleAccountsChanged = (accounts: unknown) => {
      const accs = accounts as string[];
      if (accs.length === 0) {
        disconnectWallet();
      } else if (accs[0].toLowerCase() !== address?.toLowerCase()) {
        const newAddress = accs[0];
        logger.debug('Account changed', { from: address, to: newAddress });
        setAddress(newAddress);
        fetchCredits(newAddress, 0, true);
        checkNFTStatus(newAddress).catch(() => { /* ignore */ });
      }
    };

    const handleChainChanged = () => {
      logger.debug('Chain changed, refreshing...');
    };

    eth.on('accountsChanged', handleAccountsChanged);
    eth.on('chainChanged', handleChainChanged);

    return () => {
      eth.removeListener('accountsChanged', handleAccountsChanged);
      eth.removeListener('chainChanged', handleChainChanged);
    };
  }, [isConnected, address, walletType, disconnectWallet, fetchCredits, checkNFTStatus]);

  const refreshCredits = useCallback(async (): Promise<void> => { 
    if (address) await fetchCredits(address, 0, true); 
  }, [address, fetchCredits]);
  
  const setCreditsManually = useCallback((n: number): void => {
    setCredits(Math.max(0, Math.floor(Number(n) || 0)));
  }, []);

  // PERFORMANCE: Memoize context value
  const value = useMemo<SimpleWalletContextValue>(() => ({
    isConnected, address, credits, totalCreditsEarned, totalCreditsSpent, isLoading, error,
    isNFTHolder, nftCollections, connectWallet, disconnectWallet, fetchCredits, refreshCredits,
    checkNFTStatus, walletType, connectedWalletId, setCreditsManually
  }), [isConnected, address, credits, totalCreditsEarned, totalCreditsSpent, isLoading, error,
      isNFTHolder, nftCollections, connectWallet, disconnectWallet, fetchCredits, refreshCredits,
      checkNFTStatus, walletType, connectedWalletId, setCreditsManually]);

  return <SimpleWalletContext.Provider value={value}>{children}</SimpleWalletContext.Provider>;
};

export const useSimpleWallet = (): SimpleWalletContextValue => {
  const context = useContext(SimpleWalletContext);
  if (!context) throw new Error('useSimpleWallet must be used within a SimpleWalletProvider');
  return context;
};





