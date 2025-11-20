import React, { useState, useEffect } from 'react';
import SubscriptionCheckout from './SubscriptionCheckout';
import PaymentSuccessModal from './PaymentSuccessModal';
import { useEmailAuth } from '../contexts/EmailAuthContext';
import { CheckCircle, AlertCircle, X } from 'lucide-react';

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

  const { refreshCredits } = useEmailAuth();
  const [successState, setSuccessState] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  // Check for success in URL params when component mounts
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('session_id');
    const canceled = urlParams.get('canceled');

    if (sessionId) {
      // Determine which plan was purchased based on session
      // For now, we'll show a generic success
      setSuccessState({
        sessionId,
        planName: 'Subscription',
        planPrice: 'Activated'
      });
      
      // Refresh credits after subscription purchase
      // Webhook should have added credits, but refresh to ensure UI is updated
      if (refreshCredits) {
        // Wait a moment for webhook to process, then refresh
        setTimeout(() => {
          refreshCredits();
        }, 2000);
        
        // Also poll for credits update (webhook might take a few seconds)
        const pollInterval = setInterval(() => {
          refreshCredits();
        }, 3000);
        
        // Stop polling after 30 seconds
        setTimeout(() => {
          clearInterval(pollInterval);
        }, 30000);
      }
      
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (canceled) {
      setErrorMessage('Checkout was canceled. You can try again anytime.');
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [refreshCredits]);

  const handleSuccess = (sessionId, planName, planPrice) => {
    setSuccessState({
      sessionId,
      planName: planName || 'Subscription',
      planPrice: planPrice || 'Activated'
    });
    
    // Refresh credits after subscription purchase
    // Webhook should have added credits, but refresh to ensure UI is updated
    if (refreshCredits) {
      // Wait a moment for webhook to process, then refresh
      setTimeout(() => {
        refreshCredits();
      }, 2000);
      
      // Also poll for credits update (webhook might take a few seconds)
      const pollInterval = setInterval(() => {
        refreshCredits();
      }, 3000);
      
      // Stop polling after 30 seconds
      setTimeout(() => {
        clearInterval(pollInterval);
      }, 30000);
    }
  };

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

