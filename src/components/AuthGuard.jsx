import React from 'react';
import { useSimpleWallet } from '../contexts/SimpleWalletContext';
import { useEmailAuth } from '../contexts/EmailAuthContext';
import { Wallet, CreditCard, AlertCircle } from 'lucide-react';

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

  // Check if wallet is connected
  if (!isConnected || !address) {
    return fallback || (
      <div className="flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <Wallet className="w-16 h-16 text-purple-400 mx-auto mb-6" />
          <h3 className="text-2xl font-bold text-white mb-4">Wallet Required</h3>
          <p className="text-gray-400 mb-6">
            Please connect your wallet to access the image generation service.
          </p>
          <div className="space-y-3">
            <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <h4 className="font-semibold text-blue-400 mb-2">Why connect a wallet?</h4>
              <ul className="text-sm text-gray-300 space-y-1">
                <li>• Secure authentication</li>
                <li>• Credit management</li>
                <li>• Payment processing</li>
                <li>• NFT/token discount verification</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Always show the UI - credits will be checked at the component level

  // User is authenticated and has credits (or free access)
  return children;
};

export default AuthGuard;
