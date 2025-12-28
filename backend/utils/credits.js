/**
 * Shared credit calculation utilities
 * Single source of truth for credit calculations across all payment flows
 */

// Base rate: 5 credits per dollar (50 credits for $10)
const BASE_RATE = 5;

// Subscription scaling tiers
const SCALING_TIERS = [
  { minAmount: 80, multiplier: 1.3 },  // 30% bonus for $80+
  { minAmount: 40, multiplier: 1.2 },  // 20% bonus for $40-79
  { minAmount: 20, multiplier: 1.1 },  // 10% bonus for $20-39
  { minAmount: 0, multiplier: 1.0 }    // No bonus for <$20
];

// NFT holder bonus
const NFT_HOLDER_BONUS = 1.2; // 20% bonus

/**
 * Calculate subscription credits with scaling and NFT bonus
 * @param {number} amountInDollars - Payment amount in dollars
 * @param {boolean} isNFTHolder - Whether user holds qualifying NFTs
 * @returns {{credits: number, scalingMultiplier: number, nftMultiplier: number}}
 */
export function calculateCredits(amountInDollars, isNFTHolder = false) {
  // Find applicable scaling multiplier
  const tier = SCALING_TIERS.find(t => amountInDollars >= t.minAmount);
  const scalingMultiplier = tier ? tier.multiplier : 1.0;
  
  // NFT holder bonus
  const nftMultiplier = isNFTHolder ? NFT_HOLDER_BONUS : 1;
  
  const credits = Math.floor(amountInDollars * BASE_RATE * scalingMultiplier * nftMultiplier);
  
  return {
    credits,
    scalingMultiplier,
    nftMultiplier
  };
}

/**
 * Calculate credits from token amount with dynamic pricing
 * @param {number} amount - Token amount
 * @param {number} creditRate - Credits per token unit
 * @returns {number}
 */
export function calculateCreditsFromAmount(amount, creditRate = 6.67) {
  return Math.floor(parseFloat(amount) * creditRate);
}

/**
 * Check if user is an NFT holder based on their collections
 * @param {Object} user - User document
 * @returns {boolean}
 */
export function isUserNFTHolder(user) {
  return !!(user.walletAddress && user.nftCollections && user.nftCollections.length > 0);
}

/**
 * Calculate subscription credits for a user
 * @param {Object} user - User document  
 * @param {number} amountInDollars - Payment amount
 * @returns {{finalCredits: number, isNFTHolder: boolean, nftMultiplier: number}}
 */
export function calculateSubscriptionCredits(user, amountInDollars) {
  const isNFTHolder = isUserNFTHolder(user);
  const { credits, nftMultiplier } = calculateCredits(amountInDollars, isNFTHolder);

  return {
    finalCredits: credits,
    isNFTHolder,
    nftMultiplier
  };
}

export default {
  calculateCredits,
  calculateCreditsFromAmount,
  isUserNFTHolder,
  calculateSubscriptionCredits,
  BASE_RATE,
  NFT_HOLDER_BONUS
};
