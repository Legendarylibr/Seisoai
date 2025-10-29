// Early wallet conflict prevention - must run before any wallet extensions
(function() {
  'use strict';
  
  // Prevent ethereum property redefinition conflicts
  const originalDefineProperty = Object.defineProperty;
  const originalDefineProperties = Object.defineProperties;
  
  // Track if we've already set up protection
  if (window.__walletConflictResolutionSetup) {
    return;
  }
  window.__walletConflictResolutionSetup = true;
  
  // ULTRA-AGGRESSIVE: Override Object.defineProperty to prevent ethereum conflicts
  Object.defineProperty = function(obj, prop, descriptor) {
    // COMPLETELY BLOCK ethereum property redefinition
    if (prop === 'ethereum' && obj === window) {
      console.warn('🛡️ BLOCKED: ethereum property redefinition attempt');
      console.warn('🛡️ Stack trace:', new Error().stack);
      
      // Always return the existing ethereum object or create a safe one
      if (window.ethereum) {
        return window.ethereum;
      }
      
      // Create a safe ethereum object that won't conflict
      const safeEthereum = {
        isMetaMask: false,
        isRabby: false,
        isCoinbaseWallet: false,
        isWalletConnect: false,
        request: function() {
          console.warn('🛡️ Safe ethereum object used - no wallet connected');
          return Promise.reject(new Error('No wallet connected'));
        },
        on: function() {},
        removeListener: function() {},
        addListener: function() {}
      };
      
      try {
        return originalDefineProperty.call(this, obj, prop, {
          value: safeEthereum,
          configurable: true,
          enumerable: true,
          writable: true
        });
      } catch (error) {
        console.warn('🛡️ Safe ethereum fallback applied');
        window.ethereum = safeEthereum;
        return safeEthereum;
      }
    }
    
    // Prevent originalDefineProperty conflicts
    if (prop === 'originalDefineProperty' && obj === window) {
      if (window.originalDefineProperty) {
        console.warn('🛡️ Wallet conflict prevented: originalDefineProperty already exists');
        return window.originalDefineProperty;
      }
    }
    
    try {
      return originalDefineProperty.call(this, obj, prop, descriptor);
    } catch (error) {
      // If it's a redefinition error, just return the existing property
      if (error.message.includes('Cannot redefine property')) {
        console.warn('🛡️ Property redefinition prevented:', prop);
        return obj[prop];
      }
      throw error;
    }
  };
  
  // Override Object.defineProperties for additional protection
  Object.defineProperties = function(obj, props) {
    if (obj === window && props.ethereum) {
      if (window.ethereum) {
        console.warn('🛡️ Wallet conflict prevented: ethereum property already exists (defineProperties)');
        return window;
      }
    }
    return originalDefineProperties.call(this, obj, props);
  };
  
  // Store original functions
  window.originalDefineProperty = originalDefineProperty;
  window.originalDefineProperties = originalDefineProperties;
  
  // Prevent multiple script injections
  const originalCreateElement = document.createElement;
  document.createElement = function(tagName) {
    const element = originalCreateElement.call(this, tagName);
    
    // Intercept script elements to prevent duplicate wallet injections
    if (tagName.toLowerCase() === 'script') {
      const originalSetAttribute = element.setAttribute;
      element.setAttribute = function(name, value) {
        if (name === 'src' && typeof value === 'string') {
          // Check for wallet-related scripts
          if (value.includes('evmAsk') || value.includes('wallet') || value.includes('ethereum')) {
            console.warn('🛡️ Wallet script injection detected:', value);
          }
        }
        return originalSetAttribute.call(this, name, value);
      };
    }
    
    return element;
  };
  
  // Global error handler for wallet conflicts
  const originalError = console.error;
  console.error = function(...args) {
    const message = args[0]?.toString?.() || '';
    
    // Filter out wallet conflict errors
    if (message.includes('Cannot redefine property: ethereum') ||
        message.includes('originalDefineProperty') ||
        message.includes('evmAsk.js') ||
        message.includes('inject')) {
      console.warn('🛡️ Wallet conflict error filtered:', message);
      return;
    }
    
    originalError.apply(console, args);
  };
  
  // Handle uncaught errors - MUST USE CAPTURE PHASE
  window.addEventListener('error', function(event) {
    const error = event.error;
    const message = error?.message || '';
    const stack = error?.stack || '';
    const filename = event.filename || '';
    
    // Prevent ethereum property redefinition errors - catch all variations
    if (message.includes('Cannot redefine property: ethereum') ||
        message.includes('Cannot redefine property') ||
        message.includes('originalDefineProperty') ||
        message.includes('evmAsk') ||
        message.includes('evmAsk.js') ||
        stack.includes('evmAsk.js') ||
        stack.includes('evmAsk') ||
        filename.includes('evmAsk.js') ||
        filename.includes('evmAsk') ||
        (message.includes('defineProperty') && message.includes('ethereum'))) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      console.warn('🛡️ Wallet conflict error prevented');
      return false;
    }
  }, true); // Use capture phase to catch earlier
  
  // Handle unhandled promise rejections
  window.addEventListener('unhandledrejection', function(event) {
    const reason = event.reason;
    const message = reason?.message || '';
    const code = reason?.code;
    
    // Prevent wallet-related promise rejections
    if (message.includes('Cannot redefine property: ethereum') ||
        message.includes('originalDefineProperty') ||
        message.includes('evmAsk.js')) {
      event.preventDefault();
      console.warn('🛡️ Wallet conflict promise rejection prevented:', message);
      return false;
    }
  });
  
  console.log('🛡️ Wallet conflict resolution initialized');
})();
