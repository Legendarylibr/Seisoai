import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { ethers } from 'ethers';
import { EthereumProvider } from '@walletconnect/ethereum-provider';
import { checkNFTHoldings } from '../services/nftVerificationService';
import logger from '../utils/logger';
import { API_URL } from '../utils/apiConfig';

const SimpleWalletContext = createContext();

// WalletConnect Project ID - you should replace this with your own from https://cloud.walletconnect.com
const WALLETCONNECT_PROJECT_ID = '8e0a0c75ac8c8f6d3ef36a26f2f8f64d';

// Helper to check if we're on mobile
const isMobile = () => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};

// Wallet installation/deep link URLs
const WALLET_LINKS = {
  metamask: {
    install: 'https://metamask.io/download/',
    chrome: 'https://chrome.google.com/webstore/detail/metamask/nkbihfbeogaeaoehlefnkodbefgpgknn',
    deepLink: (url) => `https://metamask.app.link/dapp/${url.replace('https://', '')}`
  },
  rabby: {
    install: 'https://rabby.io/',
    chrome: 'https://chrome.google.com/webstore/detail/rabby-wallet/acmacodkjbdgmoleebolmdjonilkdbch'
  },
  coinbase: {
    install: 'https://www.coinbase.com/wallet/downloads',
    chrome: 'https://chrome.google.com/webstore/detail/coinbase-wallet-extension/hnfanknocfeofbddgcijnmhnfnkdnaad',
    deepLink: (url) => `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(url)}`
  },
  rainbow: {
    install: 'https://rainbow.me/',
    deepLink: (url) => `https://rainbow.me/dapp?url=${encodeURIComponent(url)}`
  },
  trust: {
    install: 'https://trustwallet.com/download',
    deepLink: (url) => `https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(url)}`
  },
  okx: {
    install: 'https://www.okx.com/web3',
    chrome: 'https://chrome.google.com/webstore/detail/okx-wallet/mcohilncbfahbmgdjkbpemcciiolgcge',
    deepLink: (url) => `okx://wallet/dapp/details?dappUrl=${encodeURIComponent(url)}`
  },
  bitget: {
    install: 'https://web3.bitget.com/wallet-download',
    chrome: 'https://chrome.google.com/webstore/detail/bitget-wallet/jiidiaalihmmhddjgbnbgdfflelocpak'
  },
  phantom: {
    install: 'https://phantom.app/download',
    chrome: 'https://chrome.google.com/webstore/detail/phantom/bfnaelmomeimhlpmgjnjophhpkkoljpa',
    deepLink: (url) => `https://phantom.app/ul/browse/${encodeURIComponent(url)}`
  },
  solflare: {
    install: 'https://solflare.com/download',
    chrome: 'https://chrome.google.com/webstore/detail/solflare-wallet/bhhhlbepdkbapadjdnnojkbgioiodbic'
  },
  brave: {
    install: 'https://brave.com/download/'
  },
  frame: {
    install: 'https://frame.sh/'
  }
};

// Helper function to safely access ethereum provider (handles wallet extension conflicts)
const safeGetEthereum = () => {
  try {
    return window.ethereum || null;
  } catch (e) {
    console.warn('Error accessing window.ethereum:', e.message);
    return null;
  }
};

// Helper to create wallet not found error with install/open option
const createWalletNotFoundError = (walletId, walletName) => {
  const links = WALLET_LINKS[walletId];
  const currentUrl = window.location.href;
  
  if (isMobile() && links?.deepLink) {
    // On mobile, try to open the wallet app
    const deepLink = links.deepLink(currentUrl);
    // Return error with instruction and trigger redirect
    setTimeout(() => {
      window.location.href = deepLink;
    }, 100);
    return new Error(`Opening ${walletName}... If the app doesn't open, please install it from your app store.`);
  }
  
  // On desktop, provide install link with a special format: TEXT|||LINK_TEXT|||URL
  const installUrl = links?.chrome || links?.install;
  if (installUrl) {
    return new Error(`${walletName} not detected.|||Install ${walletName}|||${installUrl}`);
  }
  
  return new Error(`${walletName} not detected. Please install the ${walletName} browser extension.`);
};

// Helper function to find specific wallet provider
const findProvider = (predicate) => {
  try {
    const ethereum = safeGetEthereum();
    if (!ethereum) return null;
    
    // Check if there are multiple providers (EIP-5749 compliant)
    if (ethereum.providers?.length) {
      const found = ethereum.providers.find(p => {
        try {
          return predicate(p);
        } catch (e) {
          return false;
        }
      });
      if (found) return found;
    }
    
    // Check the main ethereum object
    try {
      if (predicate(ethereum)) {
        return ethereum;
      }
    } catch (e) {
      // Predicate failed, wallet not available
    }
    
    return null;
  } catch (e) {
    console.warn('Error finding provider:', e.message);
    return null;
  }
};

export const SimpleWalletProvider = ({ children }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [address, setAddress] = useState(null);
  const [credits, setCredits] = useState(0);
  const [totalCreditsEarned, setTotalCreditsEarned] = useState(0);
  const [totalCreditsSpent, setTotalCreditsSpent] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isNFTHolder, setIsNFTHolder] = useState(false);
  const [nftCollections, setNftCollections] = useState([]);
  const [walletType, setWalletType] = useState(null);
  const [connectedWalletId, setConnectedWalletId] = useState(null);
  const walletConnectProviderRef = useRef(null);
  
  // Simple credit fetching - no caching, always fetch fresh from backend
  const fetchCredits = useCallback(async (walletAddress) => {
    if (!walletAddress) {
      setCredits(0);
      setTotalCreditsEarned(0);
      setTotalCreditsSpent(0);
      return 0;
    }

    const normalizedAddress = walletAddress.toLowerCase();
    
    try {
      const url = `${API_URL}/api/users/${normalizedAddress}?skipNFTs=true&t=${Date.now()}`;
      logger.debug('Fetching wallet credits', { url });
      
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store'
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        logger.error('Credits API error', { status: response.status, error: errorText.substring(0, 200) });
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
        
        logger.debug('Credits fetched successfully', { credits: userCredits, totalEarned: userTotalEarned });
        return userCredits;
      }
      
      logger.warn('Unexpected API response format', { data });
      return 0;
    } catch (error) {
      logger.error('Failed to fetch credits', { error: error.message, walletAddress: normalizedAddress });
      return 0;
    }
  }, []);

  // Check NFT holdings
  const checkNFTStatus = useCallback(async (walletAddress) => {
    if (!walletAddress) {
      setIsNFTHolder(false);
      setNftCollections([]);
      return;
    }

    try {
      const normalizedAddress = walletAddress.toLowerCase();
      const result = await checkNFTHoldings(normalizedAddress);
      
      setIsNFTHolder(result.isHolder === true);
      setNftCollections(Array.isArray(result.collections) ? result.collections : []);
      
      // Refresh credits if NFT credits were granted
      if (result.creditsGranted && result.creditsGranted > 0) {
        await fetchCredits(normalizedAddress);
      }
    } catch (error) {
      logger.error('Error checking NFT status', { error: error.message });
      setIsNFTHolder(false);
      setNftCollections([]);
    }
  }, [fetchCredits]);

  // Connect wallet - strict mode, only connects to the exact wallet selected
  const connectWallet = async (selectedWallet = 'metamask') => {
    try {
      setIsLoading(true);
      setError(null);

      let provider = null;
      let walletAddress = null;

      switch (selectedWallet) {
        case 'metamask': {
          // MetaMask detection - check for the unique _metamask property
          const isRealMetaMask = (p) => {
            if (!p || !p.isMetaMask) return false;
            
            // Exclude known wallets that fake isMetaMask
            if (p.isRabby || p.isCoinbaseWallet || p.isBraveWallet || p.isTrust || 
                p.isPhantom || p.isOkxWallet || p.isBitKeep || p.isTokenPocket || 
                p.isTokenary || p.isOpera || p.isMathWallet || p.isRainbow ||
                p.isTally || p.isFrame || p.isEnkrypt || p.isExodus || p.isGamestop ||
                p.isOneInch || p.isZerion || p.isTrustWallet) {
              return false;
            }
            
            // Real MetaMask has _metamask property with isUnlocked method
            if (p._metamask && typeof p._metamask.isUnlocked === 'function') {
              return true;
            }
            
            // If no other wallet flags and has isMetaMask, likely MetaMask
            return true;
          };
          
          // Check if MetaMask is the default ethereum provider
          const ethereum = safeGetEthereum();
          if (isRealMetaMask(ethereum)) {
            provider = ethereum;
          } else {
            // Check providers array for MetaMask
            provider = findProvider(isRealMetaMask);
          }
          
          if (!provider) {
            throw createWalletNotFoundError('metamask', 'MetaMask');
          }
          const accounts = await provider.request({ method: 'eth_requestAccounts' });
          walletAddress = accounts[0];
          setWalletType('evm');
          break;
        }

        case 'walletconnect': {
          try {
            const wcProvider = await EthereumProvider.init({
              projectId: WALLETCONNECT_PROJECT_ID,
              chains: [1], // Ethereum mainnet
              optionalChains: [137, 42161, 10, 8453, 56], // Polygon, Arbitrum, Optimism, Base, BSC
              showQrModal: true,
              metadata: {
                name: 'Seiso AI',
                description: 'AI Image Generation Platform',
                url: window.location.origin,
                icons: [`${window.location.origin}/favicon.ico`]
              }
            });
            
            // Store reference for cleanup
            walletConnectProviderRef.current = wcProvider;
            
            // Enable session (triggers QR modal)
            await wcProvider.enable();
            
            const accounts = await wcProvider.request({ method: 'eth_accounts' });
            if (!accounts || accounts.length === 0) {
              throw new Error('No accounts found from WalletConnect');
            }
            
            walletAddress = accounts[0];
            provider = wcProvider;
            setWalletType('evm');
            
            // Listen for disconnect
            wcProvider.on('disconnect', () => {
              disconnectWallet();
            });
            
          } catch (err) {
            if (err.message?.includes('User rejected') || err.message?.includes('User closed') || err.message?.includes('modal_closed')) {
              throw new Error('Connection cancelled by user.');
            }
            throw new Error(`WalletConnect error: ${err.message || 'Connection failed'}`);
          }
          break;
        }

        case 'rabby': {
          // Rabby injects as window.rabby or in providers array
          // Check window.rabby first (Rabby's dedicated object)
          if (window.rabby) {
            provider = window.rabby;
          } else {
            // Check if Rabby is set as default ethereum provider
            const ethereum = safeGetEthereum();
            if (ethereum?.isRabby) {
              provider = ethereum;
            } else {
              // Check providers array
              provider = findProvider(p => p.isRabby === true);
            }
          }
          
          if (!provider) {
            throw createWalletNotFoundError('rabby', 'Rabby Wallet');
          }
          const rabbyAccounts = await provider.request({ method: 'eth_requestAccounts' });
          walletAddress = rabbyAccounts[0];
          setWalletType('evm');
          break;
        }

        case 'coinbase': {
          // Coinbase Wallet - check window.coinbaseWalletExtension first
          if (window.coinbaseWalletExtension) {
            provider = window.coinbaseWalletExtension;
          } else {
            const ethereum = safeGetEthereum();
            if (ethereum?.isCoinbaseWallet) {
              provider = ethereum;
            } else {
              provider = findProvider(p => p.isCoinbaseWallet === true);
            }
          }
          
          if (!provider) {
            throw createWalletNotFoundError('coinbase', 'Coinbase Wallet');
          }
          const coinbaseAccounts = await provider.request({ method: 'eth_requestAccounts' });
          walletAddress = coinbaseAccounts[0];
          setWalletType('evm');
          break;
        }

        case 'rainbow': {
          // Rainbow - check direct ethereum or providers
          const ethereum = safeGetEthereum();
          if (ethereum?.isRainbow) {
            provider = ethereum;
          } else {
            provider = findProvider(p => p.isRainbow === true);
          }
          
          if (!provider) {
            throw createWalletNotFoundError('rainbow', 'Rainbow Wallet');
          }
          const rainbowAccounts = await provider.request({ method: 'eth_requestAccounts' });
          walletAddress = rainbowAccounts[0];
          setWalletType('evm');
          break;
        }

        case 'trust': {
          // Trust Wallet - check window.trustwallet first
          if (window.trustwallet) {
            provider = window.trustwallet;
          } else {
            const ethereum = safeGetEthereum();
            if (ethereum?.isTrust || ethereum?.isTrustWallet) {
              provider = ethereum;
            } else {
              provider = findProvider(p => p.isTrust === true || p.isTrustWallet === true);
            }
          }
          
          if (!provider) {
            throw createWalletNotFoundError('trust', 'Trust Wallet');
          }
          const trustAccounts = await provider.request({ method: 'eth_requestAccounts' });
          walletAddress = trustAccounts[0];
          setWalletType('evm');
          break;
        }

        case 'okx': {
          // OKX has its own window.okxwallet object
          if (window.okxwallet) {
            provider = window.okxwallet;
          } else {
            const ethereum = safeGetEthereum();
            if (ethereum?.isOkxWallet || ethereum?.isOKExWallet) {
              provider = ethereum;
            } else {
              provider = findProvider(p => p.isOkxWallet === true || p.isOKExWallet === true);
            }
          }
          
          if (!provider) {
            throw createWalletNotFoundError('okx', 'OKX Wallet');
          }
          const okxAccounts = await provider.request({ method: 'eth_requestAccounts' });
          walletAddress = okxAccounts[0];
          setWalletType('evm');
          break;
        }

        case 'bitget': {
          // Bitget (formerly BitKeep) has window.bitkeep object
          if (window.bitkeep?.ethereum) {
            provider = window.bitkeep.ethereum;
          } else if (window.bitget?.ethereum) {
            provider = window.bitget.ethereum;
          } else {
            const ethereum = safeGetEthereum();
            if (ethereum?.isBitKeep || ethereum?.isBitget) {
              provider = ethereum;
            } else {
              provider = findProvider(p => p.isBitKeep === true || p.isBitget === true);
            }
          }
          
          if (!provider) {
            throw createWalletNotFoundError('bitget', 'Bitget Wallet');
          }
          const bitgetAccounts = await provider.request({ method: 'eth_requestAccounts' });
          walletAddress = bitgetAccounts[0];
          setWalletType('evm');
          break;
        }

        case 'brave': {
          // Brave Wallet - only works in Brave browser
          const ethereum = safeGetEthereum();
          if (ethereum?.isBraveWallet) {
            provider = ethereum;
          } else {
            provider = findProvider(p => p.isBraveWallet === true);
          }
          
          if (!provider) {
            throw createWalletNotFoundError('brave', 'Brave Wallet');
          }
          const braveAccounts = await provider.request({ method: 'eth_requestAccounts' });
          walletAddress = braveAccounts[0];
          setWalletType('evm');
          break;
        }

        case 'frame': {
          // Frame - check window.frame or providers
          if (window.frame) {
            provider = window.frame;
          } else {
            const ethereum = safeGetEthereum();
            if (ethereum?.isFrame) {
              provider = ethereum;
            } else {
              provider = findProvider(p => p.isFrame === true);
            }
          }
          
          if (!provider) {
            throw createWalletNotFoundError('frame', 'Frame');
          }
          const frameAccounts = await provider.request({ method: 'eth_requestAccounts' });
          walletAddress = frameAccounts[0];
          setWalletType('evm');
          break;
        }

        case 'phantom-evm': {
          // Phantom for Ethereum/EVM - uses window.phantom.ethereum
          let phantomEthProvider = null;
          if (window.phantom?.ethereum) {
            phantomEthProvider = window.phantom.ethereum;
          }
          
          if (!phantomEthProvider) {
            throw createWalletNotFoundError('phantom', 'Phantom Wallet');
          }
          const phantomEvmAccounts = await phantomEthProvider.request({ method: 'eth_requestAccounts' });
          walletAddress = phantomEvmAccounts[0];
          setWalletType('evm');
          break;
        }

        case 'phantom': {
          // Phantom for Solana - uses window.solana
          // Also check window.phantom.solana for newer versions
          let solanaProvider = null;
          if (window.phantom?.solana?.isPhantom) {
            solanaProvider = window.phantom.solana;
          } else if (window.solana?.isPhantom) {
            solanaProvider = window.solana;
          }
          
          if (!solanaProvider) {
            throw createWalletNotFoundError('phantom', 'Phantom Wallet');
          }
          const phantomResp = await solanaProvider.connect();
          walletAddress = phantomResp.publicKey.toString();
          setWalletType('solana');
          break;
        }

        case 'solflare': {
          // Solflare for Solana
          let solflareProvider = null;
          if (window.solflare?.isSolflare) {
            solflareProvider = window.solflare;
          }
          
          if (!solflareProvider) {
            throw createWalletNotFoundError('solflare', 'Solflare Wallet');
          }
          await solflareProvider.connect();
          walletAddress = solflareProvider.publicKey.toString();
          setWalletType('solana');
          break;
        }

        default:
          throw new Error(`Unsupported wallet: ${selectedWallet}`);
      }

      if (!walletAddress) {
        throw new Error('No accounts found. Please unlock your wallet and try again.');
      }

      setAddress(walletAddress);
      setIsConnected(true);
      setConnectedWalletId(selectedWallet);
      
      logger.info('Wallet connected', { address: walletAddress, wallet: selectedWallet });

      // Fetch credits immediately after connection
      await fetchCredits(walletAddress);
      
      // Check NFT status in background
      checkNFTStatus(walletAddress).catch(err => {
        logger.warn('NFT check failed', { error: err.message });
      });

    } catch (error) {
      logger.error('Wallet connection error', { error: error.message, wallet: selectedWallet });
      setError(error.message);
      throw error; // Re-throw so UI can handle it
    } finally {
      setIsLoading(false);
    }
  };

  // Disconnect wallet
  const disconnectWallet = useCallback(async () => {
    // Cleanup WalletConnect session if active
    if (walletConnectProviderRef.current) {
      try {
        await walletConnectProviderRef.current.disconnect();
      } catch (err) {
        logger.warn('WalletConnect disconnect error', { error: err.message });
      }
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

  // Periodic credit refresh when connected
  useEffect(() => {
    if (!isConnected || !address) return;

    // Initial fetch
    fetchCredits(address);

    // Refresh every 30 seconds
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchCredits(address);
      }
    }, 30000);

    // Refresh when tab becomes visible
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchCredits(address);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isConnected, address, fetchCredits]);

  // Manual refresh function
  const refreshCredits = useCallback(async () => {
    if (address) {
      await fetchCredits(address);
    }
  }, [address, fetchCredits]);

  // Manual credit setter for optimistic UI updates
  const setCreditsManually = useCallback((newCredits) => {
    const validated = Math.max(0, Math.floor(Number(newCredits) || 0));
    setCredits(validated);
  }, []);

  const value = {
    isConnected,
    address,
    credits,
    totalCreditsEarned,
    totalCreditsSpent,
    isLoading,
    error,
    isNFTHolder,
    nftCollections,
    connectWallet,
    disconnectWallet,
    fetchCredits,
    refreshCredits,
    checkNFTStatus,
    walletType,
    connectedWalletId,
    setCreditsManually
  };

  return (
    <SimpleWalletContext.Provider value={value}>
      {children}
    </SimpleWalletContext.Provider>
  );
};

export const useSimpleWallet = () => {
  const context = useContext(SimpleWalletContext);
  if (!context) {
    throw new Error('useSimpleWallet must be used within a SimpleWalletProvider');
  }
  return context;
};
