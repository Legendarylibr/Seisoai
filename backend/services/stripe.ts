/**
 * Stripe service
 * Handles Stripe initialization and helpers
 */
import logger from '../utils/logger';
import config from '../config/env';
import type Stripe from 'stripe';
// Import calculateCredits from centralized location
import { calculateCredits } from '../utils/credits';

// Re-export for backwards compatibility
export { calculateCredits };

let stripe: Stripe | null = null;

/**
 * Check if a Stripe key is a placeholder value
 */
function isPlaceholderKey(key: string): boolean {
  const placeholderPatterns = [
    'your_stripe',
    'your_key',
    'placeholder',
    'example',
    'xxx',
    '_here',
    'replace_me',
    'sk_test_your',
    'sk_live_your',
  ];
  const keyLower = key.toLowerCase();
  return placeholderPatterns.some(pattern => keyLower.includes(pattern));
}

/**
 * Initialize Stripe
 */
export async function initializeStripe(): Promise<Stripe | null> {
  if (!config.STRIPE_SECRET_KEY) {
    logger.warn('STRIPE_SECRET_KEY not set - Stripe features disabled');
    return null;
  }

  const secretKey = config.STRIPE_SECRET_KEY;
  
  // Check for placeholder values BEFORE format validation
  if (isPlaceholderKey(secretKey)) {
    logger.warn('STRIPE_SECRET_KEY contains placeholder text - Stripe features disabled');
    logger.warn('Please set a real Stripe API key from https://dashboard.stripe.com/apikeys');
    return null;
  }
  
  const isLiveKey = secretKey.startsWith('sk_live_');
  const isTestKey = secretKey.startsWith('sk_test_');

  if (!isLiveKey && !isTestKey) {
    logger.error('STRIPE_SECRET_KEY has invalid format - must start with sk_live_ or sk_test_');
    return null;
  }

  // Validate minimum key length (real Stripe keys are typically 100+ chars)
  if (secretKey.length < 50) {
    logger.error('STRIPE_SECRET_KEY appears to be truncated or invalid (too short)');
    return null;
  }

  if (config.isProduction && isTestKey) {
    logger.warn('Using Stripe test key in production - disabled');
    return null;
  }

  try {
    const StripeModule = (await import('stripe')).default;
    stripe = new StripeModule(secretKey, {
      apiVersion: '2024-12-18.acacia',
      maxNetworkRetries: 3,
      timeout: 30000, // 30 seconds
    });
    
    // Verify the key is valid by making a lightweight API call
    try {
      await stripe.balance.retrieve();
      logger.info(`Stripe configured and verified with ${isTestKey ? 'TEST' : 'LIVE'} key`);
    } catch (verifyError) {
      const verifyErr = verifyError as Error;
      if (verifyErr.message.includes('Invalid API Key') || verifyErr.message.includes('authentication')) {
        logger.error('STRIPE_SECRET_KEY is invalid or expired - please check your key at https://dashboard.stripe.com/apikeys');
        stripe = null;
        return null;
      }
      // Other errors (like network issues) - still proceed but warn
      logger.warn('Could not verify Stripe key (network issue?), but proceeding:', { error: verifyErr.message });
    }
    
    return stripe;
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to initialize Stripe:', { error: err.message });
    return null;
  }
}

/**
 * Get Stripe instance
 */
export function getStripe(): Stripe | null {
  return stripe;
}

export default { initializeStripe, getStripe, calculateCredits };





