import React from 'react';
import { useSimpleWallet } from '../contexts/SimpleWalletContext';
import { useEmailAuth } from '../contexts/EmailAuthContext';
import { Wallet, CreditCard, AlertCircle } from 'lucide-react';
import AuthPrompt from './AuthPrompt';

const AuthGuard = ({ children, requireCredits = true, fallback = null }) => {
  const walletContext = useSimpleWallet();
  const emailContext = useEmailAuth();
  
  // Check if authenticated via either method
  const isConnected = walletContext.isConnected || emailContext.isAuthenticated;
  const address = walletContext.address;
  const isEmailAuth = emailContext.isAuthenticated;
  // Use credits from the active auth method (email or wallet)
  const credits = isEmailAuth ? (emailContext.credits ?? 0) : (walletContext.credits ?? 0);
  const isLoading = walletContext.isLoading || emailContext.isLoading;
  const error = walletContext.error || emailContext.error;

  // PERFORMANCE: Only show loading spinner if it's been loading for a while
  // This prevents flash of loading state for fast connections
  // For very fast loads (<100ms), skip the spinner entirely
  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center" style={{ animationDelay: '100ms', animation: 'fadeIn 0.15s ease-out 100ms forwards', opacity: 0 }}>
          <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin mx-auto mb-2" style={{ borderColor: '#000080', borderTopColor: 'transparent' }}></div>
          <p className="text-[11px]" style={{ color: '#404040', fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>Loading...</p>
        </div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-red-400 mb-2">Connection Error</h3>
          <p className="text-gray-400 mb-4">{error}</p>
          <button 
            onClick={() => window.location.reload()}
            className="btn-primary"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Check if authenticated - support both email and wallet
  if (!isConnected || (!address && !isEmailAuth)) {
    // Show AuthPrompt with both email and wallet options when not authenticated
    return fallback || <AuthPrompt />;
  }

  // Always show the UI - credits will be checked at the component level

  // User is authenticated and has credits (or free access)
  return <div className="h-full">{children}</div>;
};

export default AuthGuard;
