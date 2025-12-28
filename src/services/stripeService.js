// Stripe service for payment processing
import { loadStripe } from '@stripe/stripe-js';
import logger from '../utils/logger.js';
import { API_URL } from '../utils/apiConfig.js';

// Initialize Stripe with error handling - only accepts live keys
const getStripePublishableKey = () => {
  const key = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
  if (!key || key.includes('your_stripe_publishable_key_here')) {
    logger.warn('Stripe publishable key not configured');
    return null;
  }
  
  // Validate that live key is being used
  if (!key.startsWith('pk_live_')) {
    logger.error('VITE_STRIPE_PUBLISHABLE_KEY must be a live key');
    return null;
  }
  
  return key;
};

/**
 * Get a helpful error message for payment errors
 * @param {string} originalError - The original error message
 * @returns {string} - Enhanced error message with instructions
 */
export const getEnhancedStripeError = (originalError) => {
  if (!originalError) return originalError;
  
  const errorLower = originalError.toLowerCase();
  
  // Check for common errors
  if (errorLower.includes('card was declined')) {
    return `Card Declined: ${originalError}. Please check your card details or try a different payment method.`;
  }
  
  return originalError;
};

// Initialize Stripe
const stripePromise = (() => {
  const publishableKey = getStripePublishableKey();
  if (!publishableKey) {
    return Promise.resolve(null);
  }
  return loadStripe(publishableKey);
})();

/**
 * Create a payment intent for credit purchase
 * @param {string} walletAddress - The user's wallet address (optional for email users)
 * @param {string} userId - The user's ID (for email users)
 * @param {number} amount - The amount in USD
 * @param {number} credits - The number of credits to purchase
 * @param {string} currency - The currency (default: 'usd')
 * @returns {Promise<Object>} - Payment intent response
 */
export const createPaymentIntent = async (walletAddress, amount, credits, currency = 'usd', userId = null) => {
  try {

    // Check if Stripe is configured
    if (!getStripePublishableKey()) {
      throw new Error('Stripe payment is not configured');
    }

    const body = {
      amount,
      credits,
      currency
    };

    // Add walletAddress or userId based on auth type
    if (userId) {
      body.userId = userId;
    } else if (walletAddress) {
      body.walletAddress = walletAddress;
    }

    const response = await fetch(`${API_URL}/api/stripe/create-payment-intent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to create payment intent');
    }

    const data = await response.json();
    return {
      success: true,
      clientSecret: data.clientSecret,
      paymentIntentId: data.paymentIntentId
    };
  } catch (error) {
    logger.error('Error creating payment intent', { error: error.message });
    throw new Error(`Payment intent creation failed: ${error.message}`);
  }
};

/**
 * Verify a completed Stripe payment
 * @param {string} paymentIntentId - The payment intent ID
 * @param {string} walletAddress - The user's wallet address (optional for email users)
 * @param {string} userId - The user's ID (for email users)
 * @returns {Promise<Object>} - Verification result
 */
export const verifyStripePayment = async (paymentIntentId, walletAddress = null, userId = null) => {
  try {

    const body = { paymentIntentId };
    if (userId) {
      body.userId = userId;
    } else if (walletAddress) {
      body.walletAddress = walletAddress;
    }

    const response = await fetch(`${API_URL}/api/stripe/verify-payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Payment verification failed');
    }

    const data = await response.json();
    return {
      success: true,
      credits: data.credits,
      totalCredits: data.totalCredits,
      message: data.message,
      isNFTHolder: data.isNFTHolder
    };
  } catch (error) {
    logger.error('Error verifying Stripe payment', { error: error.message });
    throw new Error(`Payment verification failed: ${error.message}`);
  }
};

/**
 * Process Stripe payment using Elements
 * @param {string} clientSecret - The payment intent client secret
 * @param {Object} elements - Stripe Elements instance
 * @param {Object} confirmParams - Additional confirmation parameters
 * @returns {Promise<Object>} - Payment result
 */
export const processStripePayment = async (clientSecret, elements, confirmParams = {}) => {
  try {
    const stripe = await stripePromise;
    if (!stripe) {
      throw new Error('Stripe failed to load');
    }

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      clientSecret,
      confirmParams: {
        return_url: window.location.origin,
        ...confirmParams
      }
    });

    if (error) {
      throw new Error(error.message);
    }

    return {
      success: true,
      paymentIntent
    };
  } catch (error) {
    logger.error('Error processing Stripe payment', { error: error.message });
    throw new Error(`Payment processing failed: ${error.message}`);
  }
};

/**
 * Get Stripe instance
 * @returns {Promise<Object>} - Stripe instance
 */
export const getStripe = async () => {
  return await stripePromise;
};

/**
 * Calculate credits for USD amount with subscription scaling
 * @param {number} amount - The amount in USD
 * @param {boolean} isNFTHolder - Whether user owns NFT collections (only applies if user has linked wallet)
 * @returns {number} - Number of credits
 */
export const calculateCreditsFromUSD = (amount, isNFTHolder = false) => {
  // Base rate: 50 credits for $10 = 5 credits per dollar
  const baseRate = 50 / 10; // 5 credits per dollar
  
  // Subscription scaling based on amount (monthly recurring)
  let scalingMultiplier = 1.0;
  if (amount >= 80) {
    scalingMultiplier = 1.3; // 30% bonus for $80+ (6.5 credits/dollar)
  } else if (amount >= 40) {
    scalingMultiplier = 1.2; // 20% bonus for $40-79 (6 credits/dollar)
  } else if (amount >= 20) {
    scalingMultiplier = 1.1; // 10% bonus for $20-39 (5.5 credits/dollar)
  }
  // $10: 5 credits/dollar (no bonus) = 50 credits
  
  // NFT holder bonus (additional 20% on top of subscription scaling)
  // Note: Only applies to users with linked wallets, not email-only users
  const nftMultiplier = isNFTHolder ? 1.2 : 1;
  
  const credits = amount * baseRate * scalingMultiplier * nftMultiplier;
  return Math.floor(credits);
};

/**
 * Get credit packages for display
 * @returns {Array} - Array of credit packages
 */
export const getCreditPackages = () => {
  // Base rate: 50 credits for $10 = 5 credits per dollar, with scaling for larger purchases (monthly recurring)
  const packages = [
    {
      id: 'small',
      name: 'Starter Pack',
      price: 10,
      description: 'Perfect for trying out Seiso AI',
      popular: false
    },
    {
      id: 'medium',
      name: 'Creator Pack',
      price: 20,
      description: 'Great for regular creators',
      popular: true
    },
    {
      id: 'large',
      name: 'Pro Pack',
      price: 40,
      description: 'Best value for power users',
      popular: false
    },
    {
      id: 'xlarge',
      name: 'Studio Pack',
      price: 80,
      description: 'For professional studios',
      popular: false
    }
  ];
  
  // Calculate credits for each package (without NFT bonus for display)
  return packages.map(pkg => {
    const baseCredits = calculateCreditsFromUSD(pkg.price, false);
    const maxCredits = calculateCreditsFromUSD(pkg.price, true); // With NFT bonus
    const savings = pkg.price >= 80 ? 30 : pkg.price >= 40 ? 20 : pkg.price >= 20 ? 10 : 0;
    
    return {
      ...pkg,
      credits: baseCredits,
      maxCredits: maxCredits,
      savings: savings > 0 ? savings : undefined
    };
  });
};
