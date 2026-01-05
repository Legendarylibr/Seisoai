/**
 * Shared credit calculation utilities
 * Single source of truth for credit calculations across all payment flows
 */

// Types
interface ScalingTier {
  minAmount: number;
  multiplier: number;
}

interface CreditCalculationResult {
  credits: number;
  scalingMultiplier: number;
  nftMultiplier: number;
}

interface SubscriptionCreditsResult {
  finalCredits: number;
  isNFTHolder: boolean;
  nftMultiplier: number;
}

interface UserDocument {
  walletAddress?: string;
  nftCollections?: unknown[];
}

// Base rate: 5 credits per dollar (50 credits for $10)
export const BASE_RATE = 5;

// Subscription scaling tiers
const SCALING_TIERS: ScalingTier[] = [
  { minAmount: 80, multiplier: 1.3 },  // 30% bonus for $80+
  { minAmount: 40, multiplier: 1.2 },  // 20% bonus for $40-79
  { minAmount: 20, multiplier: 1.1 },  // 10% bonus for $20-39
  { minAmount: 0, multiplier: 1.0 }    // No bonus for <$20
];

// NFT holder bonus
export const NFT_HOLDER_BONUS = 1.2; // 20% bonus

/**
 * Calculate subscription credits with scaling and NFT bonus
 */
export function calculateCredits(amountInDollars: number, isNFTHolder: boolean = false): CreditCalculationResult {
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
 */
export function calculateCreditsFromAmount(amount: number | string, creditRate: number = 6.67): number {
  return Math.floor(parseFloat(String(amount)) * creditRate);
}

/**
 * Check if user is an NFT holder based on their collections
 */
export function isUserNFTHolder(user: UserDocument): boolean {
  return !!(user.walletAddress && user.nftCollections && user.nftCollections.length > 0);
}

/**
 * Calculate subscription credits for a user
 */
export function calculateSubscriptionCredits(user: UserDocument, amountInDollars: number): SubscriptionCreditsResult {
  const isNFTHolder = isUserNFTHolder(user);
  const { credits, nftMultiplier } = calculateCredits(amountInDollars, isNFTHolder);

  return {
    finalCredits: credits,
    isNFTHolder,
    nftMultiplier
  };
}





