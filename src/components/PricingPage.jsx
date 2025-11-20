import React, { useState, useEffect, useCallback } from 'react';
import SubscriptionCheckout from './SubscriptionCheckout';
import PaymentSuccessModal from './PaymentSuccessModal';
import SubscriptionManagement from './SubscriptionManagement';
import { useEmailAuth } from '../contexts/EmailAuthContext';
import { CheckCircle, AlertCircle, X, CreditCard } from 'lucide-react';

/**
 * PricingPage Component
 * Displays the four pricing packs: Starter Pack, Creator Pack, Pro Pack, and Studio Pack
 * 
 * Note: Replace the priceLookupKey values with your actual Stripe Price Lookup Keys
 * You can find/create these in your Stripe Dashboard under Products > Prices
 */
const PricingPage = () => {
  // TODO: Replace these with your actual Stripe Price Lookup Keys
  // You can also use price IDs (starting with 'price_') if you prefer
  const starterPriceLookupKey = 'starter_pack_monthly'; // Replace with your actual lookup key
  const creatorPriceLookupKey = 'creator_pack_monthly'; // Replace with your actual lookup key
  const proPriceLookupKey = 'pro_pack_monthly'; // Replace with your actual lookup key
  const studioPriceLookupKey = 'studio_pack_monthly'; // Replace with your actual lookup key

  const { refreshCredits, userId, isAuthenticated } = useEmailAuth();
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
  const [successState, setSuccessState] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [showSubscriptionManagement, setShowSubscriptionManagement] = useState(false);

  // Check for success in URL params when component mounts
  const handleSuccess = useCallback((sessionId, planName, planPrice) => {
    setSuccessState({
      sessionId,
      planName: planName || 'Subscription',
      planPrice: planPrice || 'Activated'
    });
    
    if (refreshCredits) {
      setTimeout(() => {
        refreshCredits();
      }, 2000);
      
      const pollInterval = setInterval(() => {
        refreshCredits();
      }, 3000);
      
      setTimeout(() => {
        clearInterval(pollInterval);
      }, 30000);
    }
  }, [refreshCredits]);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('session_id');
    const canceled = urlParams.get('canceled');

    const cleanupUrl = () => {
      window.history.replaceState({}, document.title, window.location.pathname);
    };

    if (sessionId) {
      const verifySubscription = async () => {
        try {
          const body = { sessionId };
          if (userId) {
            body.userId = userId;
          }

          const response = await fetch(`${apiUrl}/api/subscription/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          });

          const data = await response.json();
          if (!response.ok) {
            throw new Error(data.error || 'Failed to verify subscription payment. Please contact support.');
          }

          handleSuccess(
            sessionId,
            data.planName || 'Subscription',
            data.planPrice || (data.amount ? `$${data.amount}/month` : 'Activated')
          );
        } catch (error) {
          console.error('Subscription verification failed:', error);
          const message = error.message || 'Failed to verify subscription payment. Please contact support.';
          setErrorMessage(message);
          setTimeout(() => setErrorMessage(null), 6000);
        } finally {
          cleanupUrl();
        }
      };

      verifySubscription();
    } else if (canceled) {
      setErrorMessage('Checkout was canceled. You can try again anytime.');
      setTimeout(() => setErrorMessage(null), 6000);
      cleanupUrl();
    }
  }, [apiUrl, userId, handleSuccess]);

  const handleError = (error) => {
    setErrorMessage(error);
    setTimeout(() => setErrorMessage(null), 5000);
  };

  const closeSuccessModal = () => {
    setSuccessState(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-violet-900 animated-bg py-12 px-4">
      {/* Success Modal */}
      {successState && (
        <PaymentSuccessModal
          isOpen={!!successState}
          onClose={closeSuccessModal}
          planName={successState.planName}
          planPrice={successState.planPrice}
          sessionId={successState.sessionId}
        />
      )}

      <SubscriptionManagement
        isOpen={showSubscriptionManagement}
        onClose={() => setShowSubscriptionManagement(false)}
      />

      {/* Error Message Banner */}
      {errorMessage && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-40 max-w-md w-full mx-4">
          <div className="glass-card bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center gap-3 animate-slide-down">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <p className="text-red-400 text-sm flex-1">{errorMessage}</p>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-red-400 hover:text-red-300 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <div className="container mx-auto max-w-6xl">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold gradient-text mb-4">
            Choose Your Plan
          </h1>
          <p className="text-xl text-gray-300">
            Select the perfect pack for your needs
          </p>
          {isAuthenticated && (
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-center">
              <button
                onClick={() => setShowSubscriptionManagement(true)}
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-white/10 border border-white/20 text-white text-sm font-semibold hover:bg-white/15 transition-all w-full sm:w-auto"
              >
                <CreditCard className="w-4 h-4" />
                Manage Subscription
              </button>
              <p className="text-xs sm:text-sm text-gray-400">
                View plan details, billing dates, or cancel anytime.
              </p>
            </div>
          )}
        </div>

        {/* Pricing Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Starter Pack */}
          <SubscriptionCheckout
            priceLookupKey={starterPriceLookupKey}
            planName="Starter Pack"
            planPrice="$10/month"
            description="Perfect for trying out Seiso AI"
            credits="50 credits/month"
            onSuccess={(sessionId) => handleSuccess(sessionId, 'Starter Pack', '$10/month')}
            onError={handleError}
            compact={true}
          />

          {/* Creator Pack */}
          <SubscriptionCheckout
            priceLookupKey={creatorPriceLookupKey}
            planName="Creator Pack"
            planPrice="$20/month"
            description="Great for regular creators"
            credits="110 credits/month (10% savings)"
            highlight="Popular"
            savePercentage="Save 10%"
            onSuccess={(sessionId) => handleSuccess(sessionId, 'Creator Pack', '$20/month')}
            onError={handleError}
            compact={true}
          />

          {/* Pro Pack */}
          <SubscriptionCheckout
            priceLookupKey={proPriceLookupKey}
            planName="Pro Pack"
            planPrice="$40/month"
            description="Best value for power users"
            credits="240 credits/month (20% savings)"
            savePercentage="Save 20%"
            onSuccess={(sessionId) => handleSuccess(sessionId, 'Pro Pack', '$40/month')}
            onError={handleError}
            compact={true}
          />

          {/* Studio Pack */}
          <SubscriptionCheckout
            priceLookupKey={studioPriceLookupKey}
            planName="Studio Pack"
            planPrice="$80/month"
            description="For professional studios"
            credits="520 credits/month (30% savings)"
            savePercentage="Save 30%"
            onSuccess={(sessionId) => handleSuccess(sessionId, 'Studio Pack', '$80/month')}
            onError={handleError}
            compact={true}
          />
        </div>

        {/* Additional Info */}
        <div className="mt-12 text-center space-y-4">
          <div className="glass-card rounded-xl p-6 max-w-2xl mx-auto">
            <h3 className="text-lg font-semibold text-white mb-3">What's Included</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="flex items-center gap-2 text-gray-300">
                <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
                <span>All AI features</span>
              </div>
              <div className="flex items-center gap-2 text-gray-300">
                <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
                <span>Cancel anytime</span>
              </div>
              <div className="flex items-center gap-2 text-gray-300">
                <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
                <span>Secure payments</span>
              </div>
            </div>
          </div>
          <p className="text-gray-400 text-sm">
            All plans include access to all features. Cancel anytime. No hidden fees.
          </p>
        </div>
      </div>
    </div>
  );
};

export default PricingPage;

