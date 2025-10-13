import React, { createContext, useContext, useState, useEffect } from 'react';
import { ethers } from 'ethers';

const MultiWalletContext = createContext();

// Supported chains
export const SUPPORTED_CHAINS = {
  1: { name: 'Ethereum', symbol: 'ETH', icon: '🔷', rpcUrl: 'https://eth.llamarpc.com' },
  137: { name: 'Polygon', symbol: 'MATIC', icon: '🟣', rpcUrl: 'https://polygon.llamarpc.com' },
  42161: { name: 'Arbitrum', symbol: 'ETH', icon: '🔵', rpcUrl: 'https://arbitrum.llamarpc.com' },
  10: { name: 'Optimism', symbol: 'ETH', icon: '🔴', rpcUrl: 'https://optimism.llamarpc.com' },
  8453: { name: 'Base', symbol: 'ETH', icon: '🔵', rpcUrl: 'https://base.llamarpc.com' },
  11155111: { name: 'Sepolia', symbol: 'ETH', icon: '🧪', rpcUrl: 'https://sepolia.llamarpc.com' }
};

// Payment wallet addresses
export const PAYMENT_WALLETS = {
  1: import.meta.env.VITE_ETH_PAYMENT_WALLET || '0x1234567890123456789012345678901234567890',
  137: import.meta.env.VITE_POLYGON_PAYMENT_WALLET || '0x1234567890123456789012345678901234567890',
  42161: import.meta.env.VITE_ARBITRUM_PAYMENT_WALLET || '0x1234567890123456789012345678901234567890',
  10: import.meta.env.VITE_OPTIMISM_PAYMENT_WALLET || '0x1234567890123456789012345678901234567890',
  8453: import.meta.env.VITE_BASE_PAYMENT_WALLET || '0x1234567890123456789012345678901234567890',
  11155111: import.meta.env.VITE_ETH_PAYMENT_WALLET || '0x1234567890123456789012345678901234567890'
};

export const MultiWalletProvider = ({ children }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [address, setAddress] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [balance, setBalance] = useState(null);
  const [walletName, setWalletName] = useState(null);
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [credits, setCredits] = useState(0);
  const [hasFreeAccess, setHasFreeAccess] = useState(false);

  // Detect available wallets
  const detectWallets = () => {
    const wallets = [];
    
    if (window.ethereum) {
      console.log('🔍 Detecting EVM wallets:', {
        isMetaMask: window.ethereum.isMetaMask,
        isRabby: window.ethereum.isRabby,
        isCoinbaseWallet: window.ethereum.isCoinbaseWallet,
        hasRequest: !!window.ethereum.request
      });
      
      // Check for specific wallets with more flexible detection
      if (window.ethereum.isMetaMask === true || (window.ethereum.isMetaMask === false && !window.ethereum.isRabby)) {
        wallets.push({ id: 'metamask', name: 'MetaMask', icon: '🦊' });
      }
      if (window.ethereum.isRabby === true || (window.ethereum.isMetaMask === false && window.ethereum.isRabby === false)) {
        wallets.push({ id: 'rabby', name: 'Rabby', icon: '🐰' });
      }
      if (window.ethereum.isCoinbaseWallet) {
        wallets.push({ id: 'coinbase', name: 'Coinbase Wallet', icon: '🔵' });
      }
      
      // Generic EVM wallet if none specific detected
      if (wallets.length === 0) {
        wallets.push({ id: 'generic', name: 'EVM Wallet', icon: '💳' });
      }
    }
    
    if (window.solana) {
      wallets.push({ id: 'phantom', name: 'Phantom', icon: '👻' });
    }
    
    console.log('🔍 Detected wallets:', wallets);
    return wallets;
  };

  // Connect to wallet
  const connectWallet = async (walletId) => {
    try {
      setIsLoading(true);
      setError(null);

      console.log(`🔗 Connecting to ${walletId} wallet...`);

      if (walletId === 'phantom') {
        return await connectSolanaWallet();
      } else {
        return await connectEVMWallet(walletId);
      }
    } catch (error) {
      console.error('❌ Wallet connection error:', error);
      setError(error.message);
      setIsLoading(false);
    }
  };

  // Universal connect function that detects wallet type
  const connectWalletUniversal = async (walletName) => {
    console.log(`🚀 connectWalletUniversal called with: ${walletName}`);
    console.log(`🔍 Wallet routing decision:`, {
      walletName,
      isPhantom: walletName === 'phantom',
      isSolflare: walletName === 'solflare',
      isEVM: ['metamask', 'rabby', 'coinbase', 'walletconnect'].includes(walletName)
    });
    
    // Input validation
    if (!walletName || typeof walletName !== 'string') {
      setError('Invalid wallet name provided');
      return;
    }

    const validWalletNames = ['metamask', 'rabby', 'phantom', 'solflare', 'coinbase', 'walletconnect'];
    if (!validWalletNames.includes(walletName)) {
      setError(`Unsupported wallet: ${walletName}`);
      return;
    }

    if (walletName === 'phantom' || walletName === 'solflare') {
      console.log(`🔗 Routing to Solana wallet: ${walletName}`);
      await connectSolanaWallet();
    } else if (walletName === 'metamask' || walletName === 'rabby' || walletName === 'coinbase' || walletName === 'walletconnect') {
      console.log(`🔗 Routing to EVM wallet: ${walletName}`);
      await connectEVMWallet(walletName);
    } else {
      console.log(`🔗 Default routing to EVM wallet: ${walletName}`);
      // Default to EVM wallet
      await connectEVMWallet(walletName);
    }
  };

  // Connect EVM wallet
  const connectEVMWallet = async (walletId) => {
    if (!window.ethereum) {
      throw new Error('No EVM wallet detected. Please install MetaMask, Rabby, or another EVM wallet.');
    }

    // Check if wallet is locked or needs to be unlocked
    try {
      const accounts = await window.ethereum.request({ method: 'eth_accounts' });
      if (accounts.length === 0) {
        console.log('🔍 Wallet is locked, will request access');
      }
    } catch (error) {
      console.log('🔍 Wallet access check failed:', error.message);
    }

    console.log(`🔍 Attempting to connect ${walletId} wallet...`);
    console.log(`🔍 window.ethereum:`, window.ethereum);
    console.log(`🔍 window.ethereum.isRabby:`, window.ethereum?.isRabby);
    console.log(`🔍 window.ethereum.isMetaMask:`, window.ethereum?.isMetaMask);

    // Get the correct wallet provider based on walletId
    let walletProvider = window.ethereum;
    let detectedWalletName = walletId;

    // Enhanced wallet detection
    if (walletId === 'metamask') {
      console.log('🔍 MetaMask detection details:', {
        isMetaMask: window.ethereum.isMetaMask,
        isRabby: window.ethereum.isRabby,
        hasRequest: !!window.ethereum.request,
        hasEthereum: !!window.ethereum
      });
      
      // More flexible MetaMask detection
      if (window.ethereum.isMetaMask === true && window.ethereum.isRabby !== true) {
        console.log('✅ MetaMask detected via isMetaMask === true');
        walletProvider = window.ethereum;
        detectedWalletName = 'metamask';
      } else if (window.ethereum.isMetaMask === true && window.ethereum.isRabby === undefined) {
        // Fallback: if isMetaMask is true but isRabby is undefined, assume MetaMask
        console.log('✅ MetaMask detected via isMetaMask true fallback');
        walletProvider = window.ethereum;
        detectedWalletName = 'metamask';
      } else if (window.ethereum.isMetaMask === false && window.ethereum.isRabby !== true) {
        // Another fallback: if isMetaMask is false but it's not Rabby, it might be MetaMask
        console.log('✅ MetaMask detected via isMetaMask false fallback');
        walletProvider = window.ethereum;
        detectedWalletName = 'metamask';
      } else if (window.ethereum && !window.ethereum.isRabby) {
        // Final fallback: if we have ethereum but it's not Rabby, assume it's MetaMask
        console.log('✅ Using generic EVM provider as MetaMask fallback');
        walletProvider = window.ethereum;
        detectedWalletName = 'metamask';
      } else {
        console.log('❌ No suitable provider found for MetaMask');
        console.log('🔍 Available window.ethereum properties:', Object.keys(window.ethereum || {}));
        throw new Error('MetaMask wallet not detected. Please make sure MetaMask is installed and enabled, or try refreshing the page.');
      }
    } else if (walletId === 'rabby') {
      // Simplified Rabby detection
      console.log('🔍 Rabby detection details:', {
        isRabby: window.ethereum.isRabby,
        isMetaMask: window.ethereum.isMetaMask,
        hasState: !!window.ethereum._state,
        hasRequest: !!window.ethereum.request,
        userAgent: navigator.userAgent.includes('Rabby'),
        allKeys: Object.keys(window.ethereum || {})
      });
      
      // Primary detection: isRabby property
      if (window.ethereum.isRabby === true) {
        console.log('✅ Rabby detected via isRabby === true');
        walletProvider = window.ethereum;
        detectedWalletName = 'rabby';
      }
      // Secondary detection: check providers array
      else if (window.ethereum.providers) {
        const rabbyProvider = window.ethereum.providers.find(provider => provider.isRabby === true);
        if (rabbyProvider) {
          console.log('✅ Rabby detected via providers array');
          walletProvider = rabbyProvider;
          detectedWalletName = 'rabby';
        }
      }
      // Fallback: if MetaMask is explicitly false, it's likely Rabby
      else if (window.ethereum.isMetaMask === false) {
        console.log('✅ Rabby detected via MetaMask false fallback');
        walletProvider = window.ethereum;
        detectedWalletName = 'rabby';
      }
      // Last resort: if we have ethereum and it's not MetaMask, assume Rabby
      else if (window.ethereum && window.ethereum.isMetaMask !== true) {
        console.log('✅ Rabby detected via generic EVM fallback');
        walletProvider = window.ethereum;
        detectedWalletName = 'rabby';
      }
      else {
        console.log('❌ No suitable provider found for Rabby');
        console.log('🔍 Available properties:', Object.keys(window.ethereum || {}));
        throw new Error('Rabby wallet not detected. Please make sure Rabby is installed and enabled, or try refreshing the page.');
      }
    } else if (walletId === 'coinbase') {
      if (window.ethereum.isCoinbaseWallet) {
        walletProvider = window.ethereum;
        detectedWalletName = 'coinbase';
      } else {
        throw new Error('Coinbase Wallet not detected. Please make sure Coinbase Wallet is installed and enabled.');
      }
    } else {
      // Generic EVM wallet - try to detect what we have
      console.log('🔍 Generic EVM wallet detection:', {
        isMetaMask: window.ethereum.isMetaMask,
        isRabby: window.ethereum.isRabby,
        isCoinbaseWallet: window.ethereum.isCoinbaseWallet,
        hasRequest: !!window.ethereum.request
      });
      
      if (window.ethereum.isMetaMask) {
        detectedWalletName = 'metamask';
      } else if (window.ethereum.isRabby) {
        detectedWalletName = 'rabby';
      } else if (window.ethereum.isCoinbaseWallet) {
        detectedWalletName = 'coinbase';
      } else {
        detectedWalletName = 'generic';
      }
      
      walletProvider = window.ethereum;
      console.log(`✅ Using ${detectedWalletName} as generic EVM wallet`);
    }

    console.log(`✅ Using ${detectedWalletName} provider for connection`);
    console.log(`🔍 Provider details:`, {
      isConnected: walletProvider.isConnected,
      selectedAddress: walletProvider.selectedAddress,
      chainId: walletProvider.chainId,
      networkVersion: walletProvider.networkVersion,
      hasRequest: typeof walletProvider.request === 'function'
    });

    // Check for existing accounts first
    let accounts = [];
    try {
      console.log(`🔍 Checking for existing accounts...`);
      const existingAccounts = await walletProvider.request({
        method: 'eth_accounts'
      });
      console.log(`🔍 Existing accounts:`, existingAccounts);
      
      if (existingAccounts && existingAccounts.length > 0) {
        console.log(`✅ Found ${existingAccounts.length} existing accounts, using them`);
        accounts = existingAccounts;
      } else {
        console.log(`🔗 No existing accounts, requesting account access from ${detectedWalletName}...`);
        console.log(`🔍 Wallet state before request:`, {
          isConnected: walletProvider.isConnected,
          selectedAddress: walletProvider.selectedAddress,
          chainId: walletProvider.chainId
        });
        
        // Add timeout to prevent hanging
        const requestPromise = walletProvider.request({
          method: 'eth_requestAccounts'
        });
        
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Request timeout - please try again')), 30000); // 30 second timeout
        });
        
        console.log(`⏳ Waiting for user response...`);
        accounts = await Promise.race([requestPromise, timeoutPromise]);
        console.log(`✅ Account access granted: ${accounts.length} accounts`);
      }
    } catch (requestError) {
      console.error('❌ Account access failed:', requestError);
      
      // Handle user rejection gracefully
      if (requestError.code === 4001 || requestError.message?.includes('User rejected')) {
        throw new Error('Connection cancelled by user');
      }
      
      // Handle wallet-specific errors
      if (requestError.message?.includes('not detected') || requestError.message?.includes('not installed')) {
        throw new Error(`${detectedWalletName} wallet not detected. Please install and enable the wallet extension.`);
      }
      
      // Handle case where wallet is locked
      if (requestError.message?.includes('locked') || requestError.message?.includes('unlock')) {
        throw new Error('Wallet is locked. Please unlock your wallet and try again.');
      }
      
      // Handle timeout errors
      if (requestError.message?.includes('timeout')) {
        throw new Error('Connection request timed out. Please try again.');
      }
      
      // Handle case where user needs to approve the connection
      if (requestError.message?.includes('approve') || requestError.message?.includes('permission')) {
        throw new Error('Please approve the connection request in your wallet.');
      }
      
      // Generic error
      throw new Error(`Failed to connect to ${detectedWalletName}: ${requestError.message || 'Unknown error'}`);
    }

    if (accounts.length === 0) {
      throw new Error('No accounts found. Please unlock your wallet.');
    }

    // Create provider and get network info
    const provider = new ethers.BrowserProvider(walletProvider);
    const signer = await provider.getSigner();
    const address = await signer.getAddress();
    const network = await provider.getNetwork();
    const balance = await provider.getBalance(address);

    // Update state
    setIsConnected(true);
    setAddress(address);
    setChainId(network.chainId.toString());
    setBalance(ethers.formatEther(balance));
    setWalletName(detectedWalletName);
    setProvider(provider);
    setSigner(signer);
    setIsLoading(false);

    // Fetch user credits
    await fetchCredits(address);

    console.log(`✅ Connected to ${detectedWalletName} on ${SUPPORTED_CHAINS[network.chainId]?.name || 'Unknown Chain'}`);

    return { address, chainId: network.chainId.toString(), walletName: detectedWalletName };
  };

  // Connect Solana wallet
  const connectSolanaWallet = async () => {
    if (!window.solana) {
      throw new Error('No Solana wallet detected. Please install Phantom wallet.');
    }

    const response = await window.solana.connect();
    const address = response.publicKey.toString();

    setIsConnected(true);
    setAddress(address);
    setChainId('solana');
    setWalletName('phantom');
    setIsLoading(false);

    // Fetch user credits
    await fetchCredits(address);

    console.log(`✅ Connected to Phantom wallet: ${address}`);
    return { address, chainId: 'solana', walletName: 'phantom' };
  };

  // Switch chain
  const switchChain = async (targetChainId) => {
    if (!window.ethereum) return;

    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${targetChainId.toString(16)}` }],
      });
    } catch (error) {
      // Chain not added, try to add it
      if (error.code === 4902) {
        const chainInfo = SUPPORTED_CHAINS[targetChainId];
        if (chainInfo) {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: `0x${targetChainId.toString(16)}`,
              chainName: chainInfo.name,
              rpcUrls: [chainInfo.rpcUrl],
              nativeCurrency: {
                name: chainInfo.symbol,
                symbol: chainInfo.symbol,
                decimals: 18,
              },
            }],
          });
        }
      }
    }
  };

  // Fetch user credits with dynamic API URL detection
  const fetchCredits = async (walletAddress) => {
    try {
      // Try to detect the API URL dynamically
      let apiUrl = import.meta.env.VITE_API_URL;
      
      if (!apiUrl) {
      // Try common backend ports
      const commonPorts = [30011, 3001, 3002, 3003, 3004, 3005];
        for (const port of commonPorts) {
          try {
            const testUrl = `http://localhost:${port}`;
            const response = await fetch(`${testUrl}/api/health`, { 
              method: 'GET',
              signal: AbortSignal.timeout(1000) // 1 second timeout
            });
            if (response.ok) {
              apiUrl = testUrl;
              console.log(`✅ Found backend API at ${testUrl}`);
              break;
            }
          } catch (e) {
            // Continue to next port
            continue;
          }
        }
      }
      
      if (!apiUrl) {
        console.warn('No API URL found, skipping credits fetch');
        return;
      }
      
      const response = await fetch(`${apiUrl}/api/users/${walletAddress}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setCredits(data.user.credits || 0);
          // For now, set hasFreeAccess to false - this would need proper NFT checking
          setHasFreeAccess(false);
        }
      }
    } catch (error) {
      console.error('Error fetching credits:', error);
    }
  };

  // Disconnect wallet
  const disconnectWallet = () => {
    setIsConnected(false);
    setAddress(null);
    setChainId(null);
    setBalance(null);
    setWalletName(null);
    setProvider(null);
    setSigner(null);
    setError(null);
    setCredits(0);
    setHasFreeAccess(false);
  };

  // Get chain info
  const getChainInfo = (chainId) => {
    if (chainId === 'solana') {
      return { name: 'Solana', symbol: 'SOL', icon: '◎' };
    }
    return SUPPORTED_CHAINS[chainId] || { name: `Chain ${chainId}`, symbol: 'ETH', icon: '🔗' };
  };

  // Format address
  const formatAddress = (addr) => {
    if (!addr) return '';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return (
    <MultiWalletContext.Provider value={{
      // State
      isConnected,
      address,
      chainId,
      balance,
      walletName,
      provider,
      signer,
      isLoading,
      error,
      credits,
      hasFreeAccess,
      
      // Actions
      connectWallet,
      connectWalletUniversal,
      disconnectWallet,
      switchChain,
      
      // Utils
      detectWallets,
      getChainInfo,
      formatAddress,
      
      // Constants
      SUPPORTED_CHAINS,
      PAYMENT_WALLETS
    }}>
      {children}
    </MultiWalletContext.Provider>
  );
};

export const useMultiWallet = () => {
  const context = useContext(MultiWalletContext);
  if (!context) {
    throw new Error('useMultiWallet must be used within a MultiWalletProvider');
  }
  return context;
};