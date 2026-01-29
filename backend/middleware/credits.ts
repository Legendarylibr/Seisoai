/**
 * Credits middleware
 * Handles credit checks and deductions for paid operations
 * 
 * NFT and Token holders get FREE generation:
 * - Users with NFT collections get free access
 * - Users with SEISO tokens get free access (when token is deployed)
 */
import type { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';
import type { IUser } from '../models/User';
import type { Model } from 'mongoose';
import { CREDITS } from '../config/constants';

// Types
interface CreditsRequest extends Request {
  user?: IUser;
  creditsRequired?: number;
  hasFreeAccess?: boolean;
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

// Token configuration - placeholder for future ERC-20 token
// TODO: Update with actual token contract address when deployed
const SEISO_TOKEN_CONFIG = {
  contractAddress: '', // Empty until token is deployed
  minimumBalance: 1    // Minimum tokens required for free access
};

/**
 * Check if user has NFT holdings that grant free access
 */
function isNFTHolder(user: IUser): boolean {
  return !!(user.nftCollections && user.nftCollections.length > 0);
}

/**
 * Check if user has token holdings that grant free access
 * TODO: Implement actual token balance check when token is deployed
 */
function isTokenHolder(_user: IUser): boolean {
  // Token not yet deployed - always return false
  if (!SEISO_TOKEN_CONFIG.contractAddress) {
    return false;
  }
  
  // TODO: Check user's token holdings from database or on-chain
  // For now, return false until token integration is complete
  return false;
}

/**
 * Check if user qualifies for free generation access
 */
export function hasFreeGenerationAccess(user: IUser): boolean {
  return isNFTHolder(user) || isTokenHolder(user);
}

/**
 * Create middleware that checks if user has enough credits
 * SECURITY: User must already be authenticated via JWT (set on req.user)
 */
export const createRequireCredits = (
  _getUserModel: () => Model<IUser>, 
  getUserFromRequest: (req: Request) => Promise<IUser | null>
) => {
  return (requiredCredits: number) => {
    return async (req: CreditsRequest, res: Response, next: NextFunction): Promise<void> => {
      try {
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

        req.user = user;

        // Check for free access (NFT/Token holders)
        if (hasFreeGenerationAccess(user)) {
          logger.info('Free generation access granted', {
            userId: user.userId || user.walletAddress,
            isNFT: isNFTHolder(user),
            isToken: isTokenHolder(user),
            path: req.path
          });
          req.hasFreeAccess = true;
          req.creditsRequired = 0;
          next();
          return;
        }

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

        if ((user.credits || 0) < requiredCredits) {
          res.status(402).json({
            success: false,
            error: `Insufficient credits. You have ${user.credits || 0} credits but need ${requiredCredits}.`,
            creditsRequired: requiredCredits,
            creditsAvailable: user.credits || 0
          });
          return;
        }

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
 * SECURITY: User must already be authenticated via JWT (set on req.user)
 */
export const createRequireCreditsForModel = (
  _getUserModel: () => Model<IUser>, 
  getUserFromRequest: (req: Request) => Promise<IUser | null>
) => {
  return () => {
    return async (req: CreditsRequest, res: Response, next: NextFunction): Promise<void> => {
      try {
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

        req.user = user;

        // Check for free access (NFT/Token holders)
        if (hasFreeGenerationAccess(user)) {
          logger.info('Free generation access granted for model', {
            userId: user.userId || user.walletAddress,
            isNFT: isNFTHolder(user),
            isToken: isTokenHolder(user),
            path: req.path
          });
          req.hasFreeAccess = true;
          req.creditsRequired = 0;
          next();
          return;
        }

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

        if ((user.credits || 0) < requiredCredits) {
          res.status(402).json({
            success: false,
            error: `Insufficient credits. You have ${user.credits || 0} credits but need ${requiredCredits}.`,
            creditsRequired: requiredCredits,
            creditsAvailable: user.credits || 0
          });
          return;
        }

        req.creditsRequired = requiredCredits;
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
 * SECURITY: User must already be authenticated via JWT (set on req.user)
 */
export const createRequireCreditsForVideo = (
  _getUserModel: () => Model<IUser>, 
  getUserFromRequest: (req: Request) => Promise<IUser | null>
) => {
  return () => {
    return async (req: CreditsRequest, res: Response, next: NextFunction): Promise<void> => {
      try {
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

        req.user = user;

        // Check for free access (NFT/Token holders)
        if (hasFreeGenerationAccess(user)) {
          logger.info('Free video generation access granted', {
            userId: user.userId || user.walletAddress,
            isNFT: isNFTHolder(user),
            isToken: isTokenHolder(user),
            path: req.path
          });
          req.hasFreeAccess = true;
          req.creditsRequired = 0;
          next();
          return;
        }

        // Minimum credits for video generation
        const minimumCredits = CREDITS.VIDEO_GENERATION_MINIMUM;

        if ((user.credits || 0) < minimumCredits) {
          res.status(402).json({
            success: false,
            error: `Insufficient credits for video generation. You have ${user.credits || 0} credits but need at least ${minimumCredits}.`,
            creditsRequired: minimumCredits,
            creditsAvailable: user.credits || 0
          });
          return;
        }

        req.creditsRequired = minimumCredits;
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
  calculateCredits,
  hasFreeGenerationAccess,
  isNFTHolder,
  isTokenHolder
};

