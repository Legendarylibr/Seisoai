import React, { useState } from 'react';
import { useSimpleWallet } from '../contexts/SimpleWalletContext';
import { useEmailAuth } from '../contexts/EmailAuthContext';
import TokenPaymentModal from './TokenPaymentModal';
import logger from '../utils/logger';
import { API_URL, ensureCSRFToken } from '../utils/apiConfig';

/**
 * SubscriptionCheckout Component
 * Converts the HTML subscription checkout form to a React component
 * 
 * Props:
 * - priceLookupKey: The Stripe price lookup key (required)
 * - planName: Display name for the plan (default: "Starter Plan")
 * - planPrice: Display price for the plan (default: "$20.00 / month")
 * - description: Description of the plan
 * - credits: Credits information (e.g., "137 credits (10% bulk discount)")
 * - highlight: Badge text (e.g., "Popular")
 * - savePercentage: Savings text (e.g., "Save 10%")
 * - onSuccess: Callback when checkout is successful
 * - onError: Callback when checkout fails
 * - compact: If true, renders in compact card format for pricing grid
 */
interface SubscriptionCheckoutProps {
  priceLookupKey: string;
  planName?: string;
  planPrice?: string;
  description?: string;
  credits: string;
  highlight?: boolean;
  savePercentage?: number;
  onSuccess?: (sessionId: string, planName?: string, message?: string) => void;
  onError?: (error: string) => void;
  compact?: boolean;
  onClose?: () => void;
}

const SubscriptionCheckout: React.FC<SubscriptionCheckoutProps> = ({ 
  priceLookupKey, 
  planName = "Starter Plan",
  planPrice = "$20.00 / month",
  description,
  credits,
  highlight,
  savePercentage,
  onSuccess,
  onError,
  compact = false
}) => {
  const { isConnected, address, isNFTHolder: walletIsNFTHolder } = useSimpleWallet();
  const { isAuthenticated, userId } = useEmailAuth();
  
  // Only apply NFT pricing for wallet users (email users don't have NFT discounts)
  const isNFTHolder = walletIsNFTHolder;
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showTokenPayment, setShowTokenPayment] = useState(false);
  const [prefilledAmount, setPrefilledAmount] = useState(null);

  // Check if user is authenticated
  const isUserAuthenticated = isConnected || isAuthenticated;

  // Extract credits number from credits string (e.g., "50 credits/month" -> 50)
  const extractCreditsFromString = (creditsString) => {
    if (!creditsString) return null;
    const match = creditsString.match(/(\d+)\s*credits?/i);
    return match ? parseInt(match[1], 10) : null;
  };

  // Calculate USDC amount based on credits and NFT holder status
  const calculateUSDCAmount = (numCredits) => {
    if (!numCredits) return null;
    // Non-NFT holder: $0.15 per credit
    // NFT holder: $0.06 per credit
    const pricePerCredit = isNFTHolder ? 0.06 : 0.15;
    return (numCredits * pricePerCredit).toFixed(2);
  };

  const handleCheckout = async (e) => {
    e.preventDefault();

    if (!isUserAuthenticated) {
      setError('Please sign in with email or connect your wallet to subscribe.');
      if (onError) onError('Authentication required');
      return;
    }

    // If crypto wallet is connected, use USDC payment instead of Stripe
    if (isConnected && address) {
      const numCredits = extractCreditsFromString(credits);
      if (!numCredits) {
        setError('Could not determine credits for this plan.');
        if (onError) onError('Invalid plan configuration');
        return;
      }

      const usdcAmount = calculateUSDCAmount(numCredits);
      setPrefilledAmount(usdcAmount);
      setShowTokenPayment(true);
      return;
    }

    // For email auth, use Stripe
    if (!priceLookupKey) {
      setError('Price lookup key is required.');
      if (onError) onError('Price lookup key is required');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const body = {
        lookup_key: priceLookupKey,
      };

      // Add userId for email auth
      if (userId) {
        body.userId = userId;
      }

      // Get CSRF token for secure API call
      const csrfToken = await ensureCSRFToken();
      
      const response = await fetch(`${API_URL}/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken && { 'X-CSRF-Token': csrfToken }),
        },
        credentials: 'include',
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create checkout session');
      }

      const data = await response.json();
      
      if (data.success && data.url) {
        // Redirect to Stripe Checkout
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL received');
      }
    } catch (error) {
      logger.error('Error creating checkout session:', { error: error.message });
      const errorMessage = error.message || 'Failed to start checkout';
      setError(errorMessage);
      if (onError) onError(errorMessage);
      setIsLoading(false);
    }
  };

  const handleTokenPaymentSuccess = () => {
    setShowTokenPayment(false);
    setPrefilledAmount(null);
    // Extract credits for success message
    const numCredits = extractCreditsFromString(credits);
    if (onSuccess) {
      onSuccess(null, planName, `Purchased ${numCredits} credits`);
    }
  };

  const handleTokenPaymentClose = () => {
    setShowTokenPayment(false);
    setPrefilledAmount(null);
  };

  // Compact card layout for pricing grid
  if (compact) {
    return (
      <>
        <TokenPaymentModal 
          isOpen={showTokenPayment} 
          onClose={handleTokenPaymentClose}
          prefilledAmount={prefilledAmount}
          onSuccess={handleTokenPaymentSuccess}
        />
        <div className="glass-card rounded-xl p-6 h-full flex flex-col relative">
        {/* Save Percentage Badge - Top Right */}
        {savePercentage && (
          <div className="absolute top-4 right-4">
            <span className="text-green-400 text-sm font-semibold">{savePercentage}</span>
          </div>
        )}

        {/* Header with Plan Name and Highlight Badge */}
        <div className="flex items-center gap-2 mb-4">
          <h3 className="text-xl font-bold text-white">{planName}</h3>
          {highlight && (
            <span className="px-2 py-1 bg-purple-500/20 border border-purple-500/30 rounded-md text-purple-400 text-xs font-semibold">
              {highlight}
            </span>
          )}
        </div>

        {/* Price */}
        <div className="mb-3">
          <h5 className="text-3xl font-bold text-white">{planPrice}</h5>
        </div>

        {/* Description */}
        {description && (
          <p className="text-gray-300 text-sm mb-4">{description}</p>
        )}

        {/* Credits Info */}
        {credits && (
          <div className="flex items-center gap-2 mb-6 text-purple-400">
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              xmlnsXlink="http://www.w3.org/1999/xlink" 
              width="16px" 
              height="18px" 
              viewBox="0 0 14 16" 
              version="1.1"
              className="text-purple-400 flex-shrink-0"
            >
              <defs/>
              <g id="Flow" stroke="none" strokeWidth="1" fill="none" fillRule="evenodd">
                <g id="0-Default" transform="translate(-121.000000, -40.000000)" fill="currentColor">
                  <path d="M127,50 L126,50 C123.238576,50 121,47.7614237 121,45 C121,42.2385763 123.238576,40 126,40 L135,40 L135,56 L133,56 L133,42 L129,42 L129,56 L127,56 L127,50 Z M127,48 L127,42 L126,42 C124.343146,42 123,43.3431458 123,45 C123,46.6568542 124.343146,48 126,48 L127,48 Z" id="Pilcrow"/>
                </g>
              </g>
            </svg>
            <span className="text-sm text-gray-300">{credits}</span>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-2 bg-red-500/10 border border-red-500/30 rounded-lg">
            <p className="text-red-400 text-xs">{error}</p>
          </div>
        )}

        {/* Auth Warning */}
        {!isUserAuthenticated && (
          <div className="mb-4 p-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
            <p className="text-yellow-400 text-xs">
              Sign in to subscribe
            </p>
          </div>
        )}

        {/* Privacy & Security Badge */}
        <div className="mb-4 p-3 bg-white/5 border border-white/10 rounded-lg">
          <div className="flex items-center justify-center gap-2 text-xs text-gray-400 mb-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <span className="font-medium">Privacy-First Payment</span>
          </div>
          <p className="text-xs text-gray-500 text-center">
            Card details go directly to Stripe - never stored on our servers
          </p>
        </div>

        {/* Checkout Form */}
        <form onSubmit={handleCheckout} className="mt-auto">
          <input type="hidden" name="lookup_key" value={priceLookupKey || ''} />
          <button 
            id="checkout-and-portal-button" 
            type="submit"
            disabled={isLoading || !isUserAuthenticated || !priceLookupKey}
            className="w-full btn-primary py-3 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300"
          >
            {isLoading ? (
              <>
                <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Redirecting to secure checkout...</span>
              </>
            ) : (
              <>
                <span>Subscribe Now</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </>
            )}
          </button>
        </form>
      </div>
      </>
    );
  }

  // Full page layout (original)
  return (
    <>
      <TokenPaymentModal 
        isOpen={showTokenPayment} 
        onClose={handleTokenPaymentClose}
        prefilledAmount={prefilledAmount}
        onSuccess={handleTokenPaymentSuccess}
      />
    <section className="flex items-center justify-center min-h-[60vh] px-4">
      <div className="glass-card rounded-xl p-8 max-w-md w-full">
        <div className="product mb-6">
          <div className="flex items-center gap-3 mb-4">
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              xmlnsXlink="http://www.w3.org/1999/xlink" 
              width="14px" 
              height="16px" 
              viewBox="0 0 14 16" 
              version="1.1"
              className="text-purple-400"
            >
              <defs/>
              <g id="Flow" stroke="none" strokeWidth="1" fill="none" fillRule="evenodd">
                <g id="0-Default" transform="translate(-121.000000, -40.000000)" fill="currentColor">
                  <path d="M127,50 L126,50 C123.238576,50 121,47.7614237 121,45 C121,42.2385763 123.238576,40 126,40 L135,40 L135,56 L133,56 L133,42 L129,42 L129,56 L127,56 L127,50 Z M127,48 L127,42 L126,42 C124.343146,42 123,43.3431458 123,45 C123,46.6568542 124.343146,48 126,48 L127,48 Z" id="Pilcrow"/>
                </g>
              </g>
            </svg>
            <div className="description">
              <h3 className="text-2xl font-bold text-white mb-1">{planName}</h3>
              <h5 className="text-lg text-gray-300">{planPrice}</h5>
            </div>
          </div>
          {description && (
            <p className="text-gray-300 text-sm mb-2">{description}</p>
          )}
          {credits && (
            <div className="flex items-center gap-2 text-purple-400">
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                xmlnsXlink="http://www.w3.org/1999/xlink" 
                width="14px" 
                height="16px" 
                viewBox="0 0 14 16" 
                version="1.1"
                className="text-purple-400"
              >
                <defs/>
                <g id="Flow" stroke="none" strokeWidth="1" fill="none" fillRule="evenodd">
                  <g id="0-Default" transform="translate(-121.000000, -40.000000)" fill="currentColor">
                    <path d="M127,50 L126,50 C123.238576,50 121,47.7614237 121,45 C121,42.2385763 123.238576,40 126,40 L135,40 L135,56 L133,56 L133,42 L129,42 L129,56 L127,56 L127,50 Z M127,48 L127,42 L126,42 C124.343146,42 123,43.3431458 123,45 C123,46.6568542 124.343146,48 126,48 L127,48 Z" id="Pilcrow"/>
                  </g>
                </g>
              </svg>
              <span className="text-sm text-gray-300">{credits}</span>
            </div>
          )}
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {!isUserAuthenticated && (
          <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
            <p className="text-yellow-400 text-sm">
              Please sign in with email or connect your wallet to subscribe.
            </p>
          </div>
        )}

        <form onSubmit={handleCheckout}>
          <input type="hidden" name="lookup_key" value={priceLookupKey || ''} />
          <button 
            id="checkout-and-portal-button" 
            type="submit"
            disabled={isLoading || !isUserAuthenticated || !priceLookupKey}
            className="w-full btn-primary py-3 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300"
          >
            {isLoading ? (
              <>
                <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Redirecting to secure checkout...</span>
              </>
            ) : (
              <>
                <span>Subscribe Now</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </>
            )}
          </button>
        </form>
      </div>
    </section>
    </>
  );
};

export default SubscriptionCheckout;

