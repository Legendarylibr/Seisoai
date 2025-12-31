/**
 * Stripe service
 * Handles Stripe initialization and helpers
 */
import logger from '../utils/logger.js';
import config from '../config/env.js';

let stripe = null;

/**
 * Initialize Stripe
 */
export async function initializeStripe() {
  if (!config.STRIPE_SECRET_KEY) {
    logger.warn('STRIPE_SECRET_KEY not set - Stripe features disabled');
    return null;
  }

  const secretKey = config.STRIPE_SECRET_KEY;
  const isLiveKey = secretKey.startsWith('sk_live_');
  const isTestKey = secretKey.startsWith('sk_test_');

  if (!isLiveKey && !isTestKey) {
    logger.error('STRIPE_SECRET_KEY has invalid format');
    return null;
  }

  if (config.isProduction && isTestKey) {
    logger.warn('Using Stripe test key in production - disabled');
    return null;
  }

  try {
    const Stripe = (await import('stripe')).default;
    stripe = Stripe(secretKey);
    logger.info(`Stripe configured with ${isTestKey ? 'TEST' : 'LIVE'} key`);
    return stripe;
  } catch (error) {
    logger.error('Failed to initialize Stripe:', { error: error.message });
    return null;
  }
}

/**
 * Get Stripe instance
 */
export function getStripe() {
  return stripe;
}

/**
 * Calculate credits from USD amount
 */
export function calculateCredits(amountInDollars, isNFTHolder = false) {
  const baseRate = 5; // 5 credits per dollar
  
  let scalingMultiplier = 1.0;
  if (amountInDollars >= 80) {
    scalingMultiplier = 1.3;
  } else if (amountInDollars >= 40) {
    scalingMultiplier = 1.2;
  } else if (amountInDollars >= 20) {
    scalingMultiplier = 1.1;
  }
  
  const nftMultiplier = isNFTHolder ? 1.2 : 1;
  const credits = Math.floor(amountInDollars * baseRate * scalingMultiplier * nftMultiplier);
  
  return { credits, scalingMultiplier, nftMultiplier };
}

export default { initializeStripe, getStripe, calculateCredits };



