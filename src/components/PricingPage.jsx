import React from 'react';
import SubscriptionCheckout from './SubscriptionCheckout';

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

  const handleSuccess = (sessionId) => {
    console.log('Checkout successful:', sessionId);
    // You can add redirect logic or success notification here
    // For example: window.location.href = '/success';
  };

  const handleError = (error) => {
    console.error('Checkout error:', error);
    // You can add error notification here
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-violet-900 animated-bg py-12 px-4">
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
            planPrice="$15"
            description="Perfect for trying out Seiso AI"
            credits="75 credits"
            onSuccess={handleSuccess}
            onError={handleError}
            compact={true}
          />

          {/* Creator Pack */}
          <SubscriptionCheckout
            priceLookupKey={creatorPriceLookupKey}
            planName="Creator Pack"
            planPrice="$25"
            description="Great for regular creators"
            credits="137 credits (10% bulk discount)"
            highlight="Popular"
            savePercentage="Save 10%"
            onSuccess={handleSuccess}
            onError={handleError}
            compact={true}
          />

          {/* Pro Pack */}
          <SubscriptionCheckout
            priceLookupKey={proPriceLookupKey}
            planName="Pro Pack"
            planPrice="$50"
            description="Best value for power users"
            credits="300 credits (20% bulk discount)"
            savePercentage="Save 20%"
            onSuccess={handleSuccess}
            onError={handleError}
            compact={true}
          />

          {/* Studio Pack */}
          <SubscriptionCheckout
            priceLookupKey={studioPriceLookupKey}
            planName="Studio Pack"
            planPrice="$100"
            description="For professional studios"
            credits="650 credits (30% bulk discount)"
            savePercentage="Save 30%"
            onSuccess={handleSuccess}
            onError={handleError}
            compact={true}
          />
        </div>

        {/* Additional Info */}
        <div className="mt-12 text-center">
          <p className="text-gray-400 text-sm">
            All plans include access to all features. Cancel anytime.
          </p>
        </div>
      </div>
    </div>
  );
};

export default PricingPage;

