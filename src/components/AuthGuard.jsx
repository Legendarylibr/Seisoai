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
  const address = walletContext.address || emailContext.linkedWalletAddress;
  const credits = walletContext.credits || emailContext.credits;
  const isLoading = walletContext.isLoading || emailContext.isLoading;
  const error = walletContext.error || emailContext.error;

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-purple-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">Loading...</p>
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
  const isEmailAuth = emailContext.isAuthenticated;
  
  if (!isConnected || (!address && !isEmailAuth)) {
    // Show AuthPrompt with both email and wallet options when not authenticated
    return fallback || <AuthPrompt />;
  }

  // Always show the UI - credits will be checked at the component level

  // User is authenticated and has credits (or free access)
  return children;
};

export default AuthGuard;
