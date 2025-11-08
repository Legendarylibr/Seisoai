import React, { useState, useEffect } from 'react';
import { useSimpleWallet } from '../contexts/SimpleWalletContext';
import { useEmailAuth } from '../contexts/EmailAuthContext';

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
const SubscriptionCheckout = ({ 
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
  const { isConnected, address } = useSimpleWallet();
  const { isAuthenticated, userId } = useEmailAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Check if user is authenticated
  const isUserAuthenticated = isConnected || isAuthenticated;

  useEffect(() => {
    // Check for success or cancel in URL params
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('session_id');
    const canceled = urlParams.get('canceled');

    if (sessionId && onSuccess) {
      onSuccess(sessionId);
    } else if (canceled && onError) {
      onError('Checkout was canceled');
    }
  }, [onSuccess, onError]);

  const handleCheckout = async (e) => {
    e.preventDefault();

    if (!isUserAuthenticated) {
      setError('Please sign in with email or connect your wallet to subscribe.');
      if (onError) onError('Authentication required');
      return;
    }

    if (!priceLookupKey) {
      setError('Price lookup key is required.');
      if (onError) onError('Price lookup key is required');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      
      const body = {
        lookup_key: priceLookupKey,
      };

      // Add walletAddress or userId based on auth type
      if (userId) {
        body.userId = userId;
      } else if (address) {
        body.walletAddress = address;
      }

      const response = await fetch(`${apiUrl}/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
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
      console.error('Error creating checkout session:', error);
      const errorMessage = error.message || 'Failed to start checkout';
      setError(errorMessage);
      if (onError) onError(errorMessage);
      setIsLoading(false);
    }
  };

  // Compact card layout for pricing grid
  if (compact) {
    return (
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

        {/* Checkout Form */}
        <form onSubmit={handleCheckout} className="mt-auto">
          <input type="hidden" name="lookup_key" value={priceLookupKey || ''} />
          <button 
            id="checkout-and-portal-button" 
            type="submit"
            disabled={isLoading || !isUserAuthenticated || !priceLookupKey}
            className="w-full btn-primary py-3 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Processing...</span>
              </>
            ) : (
              <span>Checkout</span>
            )}
          </button>
        </form>
      </div>
    );
  }

  // Full page layout (original)
  return (
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
            className="w-full btn-primary py-3 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Processing...</span>
              </>
            ) : (
              <span>Checkout</span>
            )}
          </button>
        </form>
      </div>
    </section>
  );
};

export default SubscriptionCheckout;

