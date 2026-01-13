// Stripe service for payment processing
import { loadStripe, Stripe, StripeElements } from '@stripe/stripe-js';
import logger from '../utils/logger';
import { API_URL, ensureCSRFToken } from '../utils/apiConfig';

// Types
export interface PaymentIntentResponse {
  success: boolean;
  clientSecret?: string;
  paymentIntentId?: string;
  error?: string;
}

export interface PaymentVerificationResult {
  success: boolean;
  credits?: number;
  totalCredits?: number;
  message?: string;
  isNFTHolder?: boolean;
}

export interface PaymentResult {
  success: boolean;
  paymentIntent?: unknown;
  error?: string;
}

export interface CreditPackage {
  id: string;
  name: string;
  price: number;
  description: string;
  popular: boolean;
  credits: number;
  maxCredits: number;
  savings?: number;
}

// Cache for runtime config
let cachedPublishableKey: string | null = null;
let configFetched = false;

/**
 * Validate a Stripe publishable key
 */
const validatePublishableKey = (key: string | null | undefined): string | null => {
  if (!key) return null;
  
  if (key.includes('your_stripe') || key.includes('_here') || key.includes('placeholder')) {
    logger.warn('Stripe publishable key contains placeholder text');
    return null;
  }
  
  const isProduction = import.meta.env.PROD || import.meta.env.MODE === 'production';
  const isLiveKey = key.startsWith('pk_live_');
  const isTestKey = key.startsWith('pk_test_');
  
  if (!isLiveKey && !isTestKey) {
    logger.error('Stripe publishable key has invalid format');
    return null;
  }
  
  if (isProduction && !isLiveKey) {
    logger.error('Stripe publishable key must be a live key (pk_live_...) in production');
    return null;
  }
  
  return key;
};

/**
 * Get Stripe publishable key - tries build-time env var first, then fetches from backend
 */
const getStripePublishableKey = async (): Promise<string | null> => {
  // 1. Try build-time VITE_ env var first
  const buildTimeKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;
  const validBuildKey = validatePublishableKey(buildTimeKey);
  if (validBuildKey) {
    return validBuildKey;
  }
  
  // 2. Return cached runtime key if already fetched
  if (configFetched) {
    return cachedPublishableKey;
  }
  
  // 3. Fetch from backend /api/config endpoint (runtime config)
  try {
    const response = await fetch(`${API_URL}/api/config`);
    if (response.ok) {
      const config = await response.json();
      cachedPublishableKey = validatePublishableKey(config.stripePublishableKey);
      configFetched = true;
      
      if (cachedPublishableKey) {
        logger.info('Stripe publishable key loaded from backend config');
      } else {
        logger.warn('Stripe publishable key not available from backend');
      }
      return cachedPublishableKey;
    }
  } catch (error) {
    logger.warn('Failed to fetch config from backend:', { error: (error as Error).message });
  }
  
  configFetched = true;
  logger.warn('Stripe publishable key not configured - payments will be disabled');
  return null;
};

/**
 * Get a helpful error message for payment errors
 */
export const getEnhancedStripeError = (originalError: string | null): string | null => {
  if (!originalError) return originalError;
  
  const errorLower = originalError.toLowerCase();
  
  if (errorLower.includes('card was declined')) {
    return `Card Declined: ${originalError}. Please check your card details or try a different payment method.`;
  }
  
  return originalError;
};

// Initialize Stripe lazily (async)
let stripeInstance: Stripe | null = null;
let stripeInitialized = false;

const stripePromise: Promise<Stripe | null> = (async () => {
  const publishableKey = await getStripePublishableKey();
  if (!publishableKey) {
    return null;
  }
  stripeInstance = await loadStripe(publishableKey);
  stripeInitialized = true;
  return stripeInstance;
})();

/**
 * Create a payment intent for credit purchase
 */
export const createPaymentIntent = async (
  walletAddress: string | null, 
  amount: number, 
  credits: number, 
  currency: string = 'usd', 
  userId: string | null = null,
  preferCrypto: boolean = false
): Promise<PaymentIntentResponse> => {
  try {
    // Check if Stripe is configured (wait for async init)
    const key = await getStripePublishableKey();
    if (!key) {
      throw new Error('Stripe payment is not configured');
    }

    const body: Record<string, unknown> = {
      amount,
      credits,
      currency
    };

    // Add walletAddress and/or userId
    // Both can be present if user has email+wallet linked
    if (walletAddress) {
      body.walletAddress = walletAddress;
      body.preferCrypto = true; // Wallet users prefer crypto payments
    }
    if (userId) {
      body.userId = userId;
    }
    // Explicit preferCrypto flag overrides
    if (preferCrypto) {
      body.preferCrypto = true;
    }

    // Ensure CSRF token is available
    const csrfToken = await ensureCSRFToken();
    
    const response = await fetch(`${API_URL}/api/stripe/create-payment-intent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(csrfToken && { 'X-CSRF-Token': csrfToken })
      },
      credentials: 'include',
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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error creating payment intent', { error: errorMessage });
    throw new Error(`Payment intent creation failed: ${errorMessage}`);
  }
};

/**
 * Verify a completed Stripe payment
 */
export const verifyStripePayment = async (
  paymentIntentId: string, 
  walletAddress: string | null = null, 
  userId: string | null = null
): Promise<PaymentVerificationResult> => {
  try {
    const body: Record<string, string> = { paymentIntentId };
    if (userId) {
      body.userId = userId;
    } else if (walletAddress) {
      body.walletAddress = walletAddress;
    }

    // Ensure CSRF token is available
    const csrfToken = await ensureCSRFToken();
    
    const response = await fetch(`${API_URL}/api/stripe/verify-payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(csrfToken && { 'X-CSRF-Token': csrfToken })
      },
      credentials: 'include',
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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error verifying Stripe payment', { error: errorMessage });
    throw new Error(`Payment verification failed: ${errorMessage}`);
  }
};

/**
 * Process Stripe payment using Elements
 */
export const processStripePayment = async (
  clientSecret: string, 
  elements: StripeElements, 
  confirmParams: Record<string, unknown> = {}
): Promise<PaymentResult> => {
  try {
    const stripe = await stripePromise;
    if (!stripe) {
      throw new Error('Stripe failed to load');
    }

    const result = await stripe.confirmPayment({
      elements,
      clientSecret,
      confirmParams: {
        return_url: window.location.origin,
        ...confirmParams
      }
    });

    if (result.error) {
      throw new Error(result.error.message);
    }

    return {
      success: true,
      paymentIntent: 'paymentIntent' in result ? result.paymentIntent : undefined
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error processing Stripe payment', { error: errorMessage });
    throw new Error(`Payment processing failed: ${errorMessage}`);
  }
};

/**
 * Get Stripe instance
 */
export const getStripe = async (): Promise<Stripe | null> => {
  return await stripePromise;
};

/**
 * Calculate credits for USD amount with subscription scaling
 */
export const calculateCreditsFromUSD = (amount: number, isNFTHolder: boolean = false): number => {
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
 */
export const getCreditPackages = (): CreditPackage[] => {
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





