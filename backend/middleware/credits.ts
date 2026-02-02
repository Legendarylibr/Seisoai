/**
 * Credits middleware
 * Handles credit checks and deductions for paid operations
 * 
 * Token Gate holders get DAILY credits:
 * - Token gate holders (SEISO on Base) get 20 credits per day
 * - NFT holders also get 20 credits per day (legacy support)
 * - Daily credits reset at midnight UTC
 */
import type { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';
import type { IUser } from '../models/User';
import type { Model } from 'mongoose';
import { CREDITS, CLAW_CREDIT_MARKUP, DAILY_CREDITS, SEISO_TOKEN, TOKEN_GATE } from '../config/constants';
import { checkTokenGateAccess } from './tokenGate';

// Types
/** Request with optional Claw client flag (20% credit markup when true) */
export interface CreditsRequest extends Request {
  user?: IUser;
  creditsRequired?: number;
  hasFreeAccess?: boolean;
  isClawClient?: boolean;
  /** Set by x402 middleware when payment was verified and settled */
  isX402Paid?: boolean;
  /** x402 payment details (set after successful payment) */
  x402Payment?: {
    amount: string;
    transactionHash?: string;
    payer?: string;
  };
  body: {
    model?: string;
    image_urls?: string[];
    image_url?: string;
    walletAddress?: string;
    userId?: string;
    email?: string;
    numImages?: number;
    num_images?: number;
  };
}

// Batch processing premium (15% convenience fee for batch mode)
const BATCH_PREMIUM = 0.15;

/**
 * Apply Claw/OpenClaw markup (20% above base) when req.isClawClient is set.
 * Use when computing credits in route handlers (video, music, workflows, etc.).
 */
export function applyClawMarkup(req: Request & { isClawClient?: boolean }, baseCredits: number): number {
  if (!req.isClawClient || baseCredits <= 0) return baseCredits;
  return Math.ceil(baseCredits * CLAW_CREDIT_MARKUP * 10) / 10;
}

/**
 * Check if user has NFT holdings that qualify for daily credits
 */
export function isNFTHolder(user: IUser): boolean {
  return !!(user.nftCollections && user.nftCollections.length > 0);
}

/**
 * Check if user has SEISO token holdings that qualify for daily credits
 * Checks tokenHoldings array for sufficient balance
 */
export function isTokenHolder(user: IUser): boolean {
  // Token not yet deployed - check if contract address is configured
  if (!SEISO_TOKEN.CONTRACT_ADDRESS) {
    return false;
  }
  
  // Check if user has any token holdings with sufficient balance
  if (!user.tokenHoldings || user.tokenHoldings.length === 0) {
    return false;
  }
  
  // Find SEISO token holding and check balance
  const seisoHolding = user.tokenHoldings.find(
    (h: { contractAddress?: string }) => h.contractAddress?.toLowerCase() === SEISO_TOKEN.CONTRACT_ADDRESS.toLowerCase()
  );
  
  if (!seisoHolding || !seisoHolding.balance) {
    return false;
  }
  
  // Check if balance meets minimum requirement
  try {
    const balance = BigInt(seisoHolding.balance);
    const minimumWei = BigInt(DAILY_CREDITS.MINIMUM_TOKEN_BALANCE) * BigInt(10 ** SEISO_TOKEN.DECIMALS);
    return balance >= minimumWei;
  } catch {
    return false;
  }
}

/**
 * Check if user passes the token gate (holds SEISO token on Base)
 * This is checked on-chain via RPC
 */
export async function isTokenGateHolder(user: IUser): Promise<boolean> {
  // Token gate must be enabled
  if (!TOKEN_GATE.enabled) {
    return false;
  }
  
  // User must have a wallet address
  if (!user.walletAddress) {
    return false;
  }
  
  try {
    const status = await checkTokenGateAccess(user.walletAddress);
    return status.hasAccess;
  } catch (error) {
    logger.error('Error checking token gate status for credits:', { 
      error: (error as Error).message,
      userId: user.userId 
    });
    return false;
  }
}

/**
 * Check if user qualifies for daily credits (NFT, Token, or Token Gate holder)
 * Synchronous version - checks stored holdings only
 */
export function qualifiesForDailyCredits(user: IUser): boolean {
  return isNFTHolder(user) || isTokenHolder(user);
}

/**
 * Check if user qualifies for daily credits (includes token gate check)
 * Async version - also checks on-chain token gate status
 */
export async function qualifiesForDailyCreditsAsync(user: IUser): Promise<boolean> {
  // First check sync methods (NFT collections, stored token holdings)
  if (isNFTHolder(user) || isTokenHolder(user)) {
    return true;
  }
  
  // Then check token gate (on-chain)
  return await isTokenGateHolder(user);
}

/**
 * Check if daily credits need to be granted (new day in UTC)
 */
function needsDailyCreditsGrant(user: IUser): boolean {
  if (!user.dailyCreditsLastGrant) {
    return true;
  }
  
  const lastGrant = new Date(user.dailyCreditsLastGrant);
  const now = new Date();
  
  // Check if it's a new day (UTC)
  return lastGrant.toISOString().slice(0, 10) !== now.toISOString().slice(0, 10);
}

/**
 * Calculate total daily credits for a user based on their holdings
 * NFT holders get 20, Token holders get 20
 * Sync version - only checks stored holdings
 */
export function calculateDailyCredits(user: IUser): number {
  let dailyCredits = 0;
  
  if (isNFTHolder(user)) {
    dailyCredits += DAILY_CREDITS.NFT_HOLDER_DAILY_CREDITS;
  }
  
  if (isTokenHolder(user)) {
    dailyCredits += DAILY_CREDITS.TOKEN_HOLDER_DAILY_CREDITS;
  }
  
  return dailyCredits;
}

/**
 * Calculate total daily credits including token gate check
 * Token gate holders get 20 credits per day
 */
export async function calculateDailyCreditsAsync(user: IUser): Promise<number> {
  let dailyCredits = 0;
  
  // Check NFT holdings (stored)
  if (isNFTHolder(user)) {
    dailyCredits += DAILY_CREDITS.NFT_HOLDER_DAILY_CREDITS;
  }
  
  // Check token holdings (stored)
  if (isTokenHolder(user)) {
    dailyCredits += DAILY_CREDITS.TOKEN_HOLDER_DAILY_CREDITS;
  }
  
  // Check token gate (on-chain) - only if not already getting credits from above
  if (dailyCredits === 0 && TOKEN_GATE.enabled) {
    const isGateHolder = await isTokenGateHolder(user);
    if (isGateHolder) {
      dailyCredits = DAILY_CREDITS.TOKEN_HOLDER_DAILY_CREDITS; // 20 credits for token gate holders
    }
  }
  
  return dailyCredits;
}

/**
 * Grant daily credits for NFT/Token/TokenGate holders
 * Adds credits directly to user's main credits balance (same as paid credits)
 * Returns the updated user document
 */
export async function grantDailyCredits(
  user: IUser, 
  getUserModel: () => Model<IUser>
): Promise<{ granted: boolean; amount: number; user: IUser }> {
  // Check if grant is needed (new day)
  if (!needsDailyCreditsGrant(user)) {
    return { granted: false, amount: 0, user };
  }
  
  // Calculate daily credits based on holdings (includes token gate check)
  const dailyCreditsAmount = await calculateDailyCreditsAsync(user);
  
  if (dailyCreditsAmount === 0) {
    return { granted: false, amount: 0, user };
  }
  
  // Add daily credits to main credits balance (same as paid credits)
  const User = getUserModel();
  const updatedUser = await User.findOneAndUpdate(
    { userId: user.userId },
    {
      $inc: { 
        credits: dailyCreditsAmount,
        totalCreditsEarned: dailyCreditsAmount
      },
      $set: {
        dailyCreditsLastGrant: new Date()
      },
      $push: {
        paymentHistory: {
          $each: [{
            txHash: `DAILY_GRANT_${Date.now()}`,
            tokenSymbol: 'DAILY',
            amount: 0,
            credits: dailyCreditsAmount,
            timestamp: new Date(),
            type: 'token_gate_bonus'  // Token gate daily credits
          }],
          $slice: -30  // Keep last 30 entries
        }
      }
    },
    { new: true }
  );
  
  if (!updatedUser) {
    return { granted: false, amount: 0, user };
  }
  
  logger.info('Daily credits granted to main balance', {
    userId: user.userId,
    amount: dailyCreditsAmount,
    newBalance: updatedUser.credits,
    isNFT: isNFTHolder(user),
    isToken: isTokenHolder(user),
    isTokenGate: TOKEN_GATE.enabled
  });
  
  return { granted: true, amount: dailyCreditsAmount, user: updatedUser };
}

/**
 * Get user's available credits
 * Daily credits are now added directly to main balance
 */
export function getTotalAvailableCredits(user: IUser): number {
  return user.credits || 0;
}

/**
 * Legacy function - now returns false as we use daily credits instead
 * @deprecated Use qualifiesForDailyCredits and grantDailyCredits instead
 */
export function hasFreeGenerationAccess(_user: IUser): boolean {
  // No longer bypass credits - use daily credits system instead
  return false;
}

/**
 * Create middleware that checks if user has enough credits
 * Uses daily credits first (for NFT/Token holders), then regular credits
 * SECURITY: User must already be authenticated via JWT (set on req.user)
 */
export const createRequireCredits = (
  getUserModel: () => Model<IUser>, 
  getUserFromRequest: (req: Request) => Promise<IUser | null>
) => {
  return (requiredCredits: number) => {
    return async (req: CreditsRequest, res: Response, next: NextFunction): Promise<void> => {
      try {
        // x402 BYPASS: If request was paid via x402, skip credit checks
        // Payment was already verified and settled by x402 middleware
        if (req.isX402Paid) {
          logger.info('x402 payment detected, bypassing credit check', {
            path: req.path,
            payment: req.x402Payment
          });
          req.creditsRequired = 0; // No credits to deduct - already paid via x402
          next();
          return;
        }

        // SECURITY: Check if user is already authenticated via JWT
        // This middleware should be used AFTER authenticateToken or authenticateFlexible
        let user = req.user;
        
        if (!user) {
          // Fallback: try to get user from request (for backwards compatibility)
          // But log this as it should ideally come from JWT auth
          const fetchedUser = await getUserFromRequest(req);
          user = fetchedUser || undefined;
          if (user) {
            logger.debug('User resolved from request body in credits middleware', {
              path: req.path,
              hasJwtUser: false
            });
          }
        }
        
        if (!user) {
          res.status(401).json({
            success: false,
            error: 'Authentication required. Please sign in to continue.'
          });
          return;
        }

        // Check and grant daily credits if eligible (NFT/Token/TokenGate holders)
        const qualifies = await qualifiesForDailyCreditsAsync(user);
        if (qualifies) {
          const result = await grantDailyCredits(user, getUserModel);
          if (result.granted) {
            user = result.user;
            logger.info('Daily credits granted for token gate holder', {
              userId: user.userId,
              dailyCredits: result.amount
            });
          }
        }

        req.user = user;

        // SECURITY: Validate requiredCredits is a positive number (allows decimals like 0.5)
        if (typeof requiredCredits !== 'number' || requiredCredits <= 0 || !Number.isFinite(requiredCredits)) {
          logger.error('Invalid credits requirement', { requiredCredits, path: req.path });
          res.status(400).json({
            success: false,
            error: 'Invalid credits amount'
          });
          return;
        }

        // SECURITY: Validate credits don't exceed reasonable limit
        if (requiredCredits > 10000) {
          logger.error('Credits requirement too high', { requiredCredits, path: req.path });
          res.status(400).json({
            success: false,
            error: 'Credits amount too large'
          });
          return;
        }

        // Check available credits
        const availableCredits = user.credits || 0;
        
        if (availableCredits < requiredCredits) {
          res.status(402).json({
            success: false,
            error: `Insufficient credits. You have ${availableCredits} credits but need ${requiredCredits}.`,
            creditsRequired: requiredCredits,
            creditsAvailable: availableCredits
          });
          return;
        }
        
        req.creditsRequired = applyClawMarkup(req, requiredCredits);
        next();
      } catch (error) {
        const err = error as Error;
        logger.error('Error in requireCredits middleware:', err);
        res.status(500).json({
          success: false,
          error: 'Failed to check credits'
        });
      }
    };
  };
};

/**
 * Create middleware for model-based credit requirements
 * Different models have different credit costs
 * Supports batch generation with numImages parameter
 * Uses daily credits first (for NFT/Token holders), then regular credits
 * SECURITY: User must already be authenticated via JWT (set on req.user)
 */
export const createRequireCreditsForModel = (
  getUserModel: () => Model<IUser>, 
  getUserFromRequest: (req: Request) => Promise<IUser | null>
) => {
  return () => {
    return async (req: CreditsRequest, res: Response, next: NextFunction): Promise<void> => {
      try {
        // x402 BYPASS: If request was paid via x402, skip credit checks
        if (req.isX402Paid) {
          logger.info('x402 payment detected, bypassing model credit check', {
            path: req.path,
            payment: req.x402Payment
          });
          req.creditsRequired = 0;
          next();
          return;
        }

        // SECURITY: Check if user is already authenticated via JWT
        let user = req.user;
        
        if (!user) {
          const fetchedUser = await getUserFromRequest(req);
          user = fetchedUser || undefined;
        }
        
        if (!user) {
          res.status(401).json({
            success: false,
            error: 'Authentication required. Please sign in to continue.'
          });
          return;
        }

        // Check and grant daily credits if eligible (NFT/Token/TokenGate holders)
        const qualifies = await qualifiesForDailyCreditsAsync(user);
        if (qualifies) {
          const result = await grantDailyCredits(user, getUserModel);
          if (result.granted) {
            user = result.user;
            logger.info('Daily credits granted for model generation', {
              userId: user.userId,
              dailyCredits: result.amount
            });
          }
        }

        req.user = user;

        // Determine credit cost based on model
        // Uses centralized constants from config/constants.ts
        const { model, numImages, num_images } = req.body;
        let baseCreditsPerImage = CREDITS.IMAGE_GENERATION; // Default: Flux Pro

        if (model === 'flux-2') {
          baseCreditsPerImage = CREDITS.IMAGE_GENERATION_FLUX_2;
        } else if (model === 'nano-banana-pro') {
          baseCreditsPerImage = CREDITS.IMAGE_GENERATION_NANO;
        } else if (model === 'qwen-image-layered') {
          baseCreditsPerImage = CREDITS.LAYER_EXTRACTION;
        }
        // Default: flux, flux-multi = CREDITS.IMAGE_GENERATION

        // Get number of images to generate (support both naming conventions)
        const imageCount = numImages || num_images || 1;
        // Clamp to valid range (1-100)
        const validImageCount = Math.min(100, Math.max(1, Math.floor(imageCount)));
        
        // Apply batch premium for multiple images
        const premiumMultiplier = validImageCount > 1 ? (1 + BATCH_PREMIUM) : 1;
        const creditsPerImage = baseCreditsPerImage * premiumMultiplier;
        
        // Calculate total credits required
        const requiredCredits = Math.ceil(creditsPerImage * validImageCount * 10) / 10; // Round to 1 decimal

        // Check available credits
        const availableCredits = user.credits || 0;

        if (availableCredits < requiredCredits) {
          res.status(402).json({
            success: false,
            error: `Insufficient credits. You have ${availableCredits} credits but need ${requiredCredits}.`,
            creditsRequired: requiredCredits,
            creditsAvailable: availableCredits
          });
          return;
        }

        req.creditsRequired = applyClawMarkup(req, requiredCredits);
        next();
      } catch (error) {
        const err = error as Error;
        logger.error('Error in requireCreditsForModel middleware:', err);
        res.status(500).json({
          success: false,
          error: 'Failed to check credits'
        });
      }
    };
  };
};

/**
 * Create middleware for video credit requirements
 * Videos cost 2 credits per second with a minimum of 2
 * Grants daily credits to NFT/Token holders before checking
 * SECURITY: User must already be authenticated via JWT (set on req.user)
 */
export const createRequireCreditsForVideo = (
  getUserModel: () => Model<IUser>, 
  getUserFromRequest: (req: Request) => Promise<IUser | null>
) => {
  return () => {
    return async (req: CreditsRequest, res: Response, next: NextFunction): Promise<void> => {
      try {
        // x402 BYPASS: If request was paid via x402, skip credit checks
        if (req.isX402Paid) {
          logger.info('x402 payment detected, bypassing video credit check', {
            path: req.path,
            payment: req.x402Payment
          });
          req.creditsRequired = 0;
          next();
          return;
        }

        // SECURITY: Check if user is already authenticated via JWT
        let user = req.user;
        
        if (!user) {
          const fetchedUser = await getUserFromRequest(req);
          user = fetchedUser || undefined;
        }
        
        if (!user) {
          res.status(401).json({
            success: false,
            error: 'Authentication required. Please sign in to continue.'
          });
          return;
        }

        // Check and grant daily credits if eligible (NFT/Token/TokenGate holders)
        const qualifies = await qualifiesForDailyCreditsAsync(user);
        if (qualifies) {
          const result = await grantDailyCredits(user, getUserModel);
          if (result.granted) {
            user = result.user;
            logger.info('Daily credits granted for video generation', {
              userId: user.userId,
              amount: result.amount
            });
          }
        }

        req.user = user;

        // Minimum credits for video generation
        const minimumCredits = CREDITS.VIDEO_GENERATION_MINIMUM;
        const availableCredits = user.credits || 0;

        if (availableCredits < minimumCredits) {
          res.status(402).json({
            success: false,
            error: `Insufficient credits for video generation. You have ${availableCredits} credits but need at least ${minimumCredits}.`,
            creditsRequired: minimumCredits,
            creditsAvailable: availableCredits
          });
          return;
        }

        req.creditsRequired = applyClawMarkup(req, minimumCredits);
        next();
      } catch (error) {
        const err = error as Error;
        logger.error('Error in requireCreditsForVideo middleware:', err);
        res.status(500).json({
          success: false,
          error: 'Failed to check credits'
        });
      }
    };
  };
};

/**
 * Calculate subscription credits with scaling and NFT bonus
 */
export const calculateCredits = (amountInDollars: number, isNFTHolder: boolean = false): { credits: number; scalingMultiplier: number; nftMultiplier: number } => {
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
  
  return {
    credits,
    scalingMultiplier,
    nftMultiplier
  };
};

// Convenience exports with default dependencies
import mongoose from 'mongoose';
import { getUserFromRequest } from '../services/user';

const getUserModel = () => mongoose.model<IUser>('User');

export const requireCredits = createRequireCredits(getUserModel, getUserFromRequest);
export const requireCreditsForModel = createRequireCreditsForModel(getUserModel, getUserFromRequest);
export const requireCreditsForVideo = createRequireCreditsForVideo(getUserModel, getUserFromRequest);

export default {
  createRequireCredits,
  createRequireCreditsForModel,
  createRequireCreditsForVideo,
  requireCredits,
  requireCreditsForModel,
  requireCreditsForVideo,
  applyClawMarkup,
  calculateCredits,
  hasFreeGenerationAccess,
  isNFTHolder,
  isTokenHolder,
  isTokenGateHolder,
  qualifiesForDailyCredits,
  qualifiesForDailyCreditsAsync,
  grantDailyCredits,
  calculateDailyCredits,
  calculateDailyCreditsAsync,
  getTotalAvailableCredits
};

