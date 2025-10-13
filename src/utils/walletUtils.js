// Wallet conflict resolution utility
export const resolveWalletConflicts = () => {
  // Check if conflict resolution is already set up
  if (window.__walletConflictResolutionSetup) {
    console.log('🛡️ Wallet conflict resolution already initialized');
    return;
  }
  
  // Prevent multiple wallet extensions from conflicting
  const originalDefineProperty = Object.defineProperty;
  
  Object.defineProperty = function(obj, prop, descriptor) {
    // Prevent ethereum property redefinition conflicts
    if (prop === 'ethereum' && obj === window) {
      if (window.ethereum && descriptor.value) {
        console.warn('🛡️ Wallet conflict detected, preserving existing ethereum provider');
        return window.ethereum;
      }
    }
    
    // Prevent originalDefineProperty conflicts
    if (prop === 'originalDefineProperty' && obj === window) {
      if (window.originalDefineProperty) {
        console.warn('🛡️ originalDefineProperty already exists, skipping redefinition');
        return window.originalDefineProperty;
      }
    }
    
    return originalDefineProperty.call(this, obj, prop, descriptor);
  };
  
  // Store the original function
  if (!window.originalDefineProperty) {
    window.originalDefineProperty = originalDefineProperty;
  }
  
  console.log('🛡️ Wallet conflict resolution utility initialized');
};

// Enhanced wallet detection with conflict resolution
export const detectWalletExtensions = () => {
  const wallets = {
    metamask: false,
    rabby: false,
    coinbase: false,
    phantom: false,
    solflare: false,
    walletconnect: false
  };
  
  try {
    // EVM wallets
    if (window.ethereum) {
      // Enhanced Rabby detection - try multiple methods
      let rabbyDetected = false;
      let metamaskDetected = false;
      
      // Method 1: Direct isRabby check
      if (window.ethereum.isRabby === true) {
        rabbyDetected = true;
      }
      
      // Method 2: Check providers array
      if (window.ethereum.providers && Array.isArray(window.ethereum.providers)) {
        const rabbyProvider = window.ethereum.providers.find(provider => provider.isRabby === true);
        if (rabbyProvider) {
          rabbyDetected = true;
        }
      }
      
      // Method 3: Check for Rabby-specific properties
      if (window.ethereum._state) {
        rabbyDetected = true;
      }
      
      // Method 4: Check user agent
      if (navigator.userAgent.includes('Rabby')) {
        rabbyDetected = true;
      }
      
      // Method 5: Check for Rabby-specific methods
      const rabbyMethods = ['switchChain', 'addChain', 'watchAsset'];
      const hasRabbyMethods = rabbyMethods.some(method => typeof window.ethereum[method] === 'function');
      if (hasRabbyMethods) {
        rabbyDetected = true;
      }
      
      // Method 6: Check if MetaMask is false but ethereum exists (Rabby often does this)
      if (window.ethereum.isMetaMask === false && window.ethereum.request) {
        rabbyDetected = true;
      }
      
      // Method 7: Check if isRabby is explicitly false (Rabby sometimes does this)
      if (window.ethereum.isRabby === false && window.ethereum.isMetaMask === false) {
        rabbyDetected = true;
      }
      
      // Determine MetaMask detection
      if (window.ethereum.isMetaMask === true && !rabbyDetected) {
        metamaskDetected = true;
      }
      
      wallets.rabby = rabbyDetected;
      wallets.metamask = metamaskDetected;
      
      if (window.ethereum.isCoinbaseWallet) {
        wallets.coinbase = true;
      }
      if (window.ethereum.isWalletConnect) {
        wallets.walletconnect = true;
      }
    }
    
    // Coinbase Wallet (separate detection)
    if (window.coinbaseWalletExtension) {
      wallets.coinbase = true;
    }
    
    // Solana wallets - simplified detection
    // Check Phantom
    if (window.solana?.isPhantom) {
      wallets.phantom = true;
    } else if (window.solana && typeof window.solana.connect === 'function') {
      // Generic Solana wallet detected
      wallets.phantom = true;
    }
    
    // Check Solflare
    if (window.solflare && typeof window.solflare.connect === 'function') {
      wallets.solflare = true;
    }
    
  } catch (error) {
    console.warn('Error detecting wallet extensions:', error);
  }
  
  return wallets;
};

// Safe wallet provider getter
export const getSafeWalletProvider = (walletName) => {
  try {
    switch (walletName) {
      case 'metamask':
        // Only return MetaMask if it's definitely MetaMask and not Rabby
        if (window.ethereum?.isMetaMask && window.ethereum?.isRabby !== true) {
          return window.ethereum;
        }
        return null;
      case 'rabby':
        console.log('🔍 Detecting Rabby wallet...');
        console.log('🔍 window.ethereum:', window.ethereum);
        console.log('🔍 window.ethereum.isRabby:', window.ethereum?.isRabby);
        console.log('🔍 window.ethereum.isMetaMask:', window.ethereum?.isMetaMask);
        console.log('🔍 window.ethereum._state:', window.ethereum?._state);
        console.log('🔍 window.ethereum.providers:', window.ethereum?.providers);
        
        // Enhanced Rabby detection with multiple fallbacks
        if (window.ethereum?.isRabby === true) {
          console.log('✅ Rabby detected via isRabby === true');
          return window.ethereum;
        }
        
        // Check providers array
        if (window.ethereum?.providers) {
          const rabbyProvider = window.ethereum.providers.find(provider => provider.isRabby === true);
          if (rabbyProvider) {
            console.log('✅ Rabby detected via providers array');
            return rabbyProvider;
          }
        }
        
        // Fallback: if MetaMask is false but ethereum exists, it might be Rabby
        if (window.ethereum?.isMetaMask === false && window.ethereum?.request) {
          console.log('✅ Rabby detected via MetaMask false fallback');
          return window.ethereum;
        }
        
        // Another fallback: check for Rabby-specific properties
        if (window.ethereum?._state || window.ethereum?.isRabby === false) {
          console.log('✅ Rabby detected via _state or isRabby false fallback');
          return window.ethereum;
        }
        
        console.log('❌ Rabby not detected');
        // Final fallback: if we have ethereum but it's not MetaMask, assume it's Rabby
        if (window.ethereum && !window.ethereum.isMetaMask) {
          console.log('✅ Rabby detected via final fallback (not MetaMask)');
          return window.ethereum;
        }
        return null;
      case 'coinbase':
        return window.coinbaseWalletExtension || (window.ethereum?.isCoinbaseWallet ? window.ethereum : null);
      case 'phantom':
        // Check if Phantom is available and ready
        if (window.solana?.isPhantom) {
          return window.solana;
        }
        // Fallback: check if solana exists but might not be Phantom
        if (window.solana && typeof window.solana.connect === 'function') {
          return window.solana;
        }
        return null;
      case 'solflare':
        // Check if Solflare is available
        if (window.solflare && typeof window.solflare.connect === 'function') {
          return window.solflare;
        }
        return null;
      case 'walletconnect':
        return window.ethereum?.isWalletConnect ? window.ethereum : null;
      default:
        return window.ethereum || null;
    }
  } catch (error) {
    console.warn(`Error getting wallet provider for ${walletName}:`, error);
    return null;
  }
};

// Wallet connection error handler
export const handleWalletError = (error, walletName) => {
  const errorMessage = error?.message || '';
  const errorCode = error?.code;
  
  // User rejection errors (normal behavior)
  if (errorCode === 4001 || errorMessage.includes('User rejected')) {
    return {
      type: 'user_rejection',
      message: 'Connection cancelled by user',
      shouldLog: false
    };
  }
  
  // Wallet not found errors
  if (errorMessage.includes('not detected') || errorMessage.includes('not installed')) {
    return {
      type: 'wallet_not_found',
      message: `${walletName} wallet not detected. Please install the wallet extension.`,
      shouldLog: true
    };
  }
  
  // Network errors
  if (errorMessage.includes('network') || errorMessage.includes('chain')) {
    return {
      type: 'network_error',
      message: 'Network connection error. Please check your internet connection.',
      shouldLog: true
    };
  }
  
  // Generic errors
  return {
    type: 'unknown_error',
    message: errorMessage || 'An unexpected error occurred',
    shouldLog: true
  };
};

// Initialize wallet conflict resolution
export const initializeWalletSupport = () => {
  // Resolve conflicts immediately
  resolveWalletConflicts();
  
  // Detect available wallets
  const availableWallets = detectWalletExtensions();
  
  return availableWallets;
};
