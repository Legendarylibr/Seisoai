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
  
  // Override Object.defineProperty to prevent ethereum conflicts
  Object.defineProperty = function(obj, prop, descriptor) {
    // Prevent ethereum property redefinition
    if (prop === 'ethereum' && obj === window) {
      if (window.ethereum && descriptor.value) {
        console.warn('🛡️ Wallet conflict prevented: ethereum property already exists');
        return window.ethereum;
      }
    }
    
    // Prevent originalDefineProperty conflicts
    if (prop === 'originalDefineProperty' && obj === window) {
      if (window.originalDefineProperty) {
        console.warn('🛡️ Wallet conflict prevented: originalDefineProperty already exists');
        return window.originalDefineProperty;
      }
    }
    
    return originalDefineProperty.call(this, obj, prop, descriptor);
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
  
  // Handle uncaught errors
  window.addEventListener('error', function(event) {
    const error = event.error;
    const message = error?.message || '';
    const stack = error?.stack || '';
    
    // Prevent ethereum property redefinition errors
    if (message.includes('Cannot redefine property: ethereum') ||
        message.includes('originalDefineProperty') ||
        stack.includes('evmAsk.js')) {
      event.preventDefault();
      console.warn('🛡️ Wallet conflict error prevented:', message);
      return false;
    }
  });
  
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
