/**
 * Credits middleware
 * Handles credit checks and deductions for paid operations
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
  body: {
    model?: string;
    image_urls?: string[];
    image_url?: string;
    walletAddress?: string;
    userId?: string;
    email?: string;
  };
}

/**
 * Create middleware that checks if user has enough credits
 */
export const createRequireCredits = (
  getUserModel: () => Model<IUser>, 
  getUserFromRequest: (req: Request) => Promise<IUser | null>
) => {
  return (requiredCredits: number) => {
    return async (req: CreditsRequest, res: Response, next: NextFunction): Promise<void> => {
      try {
        const user = await getUserFromRequest(req);
        
        if (!user) {
          res.status(400).json({
            success: false,
            error: 'User identification required. Please provide walletAddress, userId, or email.'
          });
          return;
        }

        req.user = user;

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
 */
export const createRequireCreditsForModel = (
  getUserModel: () => Model<IUser>, 
  getUserFromRequest: (req: Request) => Promise<IUser | null>
) => {
  return () => {
    return async (req: CreditsRequest, res: Response, next: NextFunction): Promise<void> => {
      try {
        const user = await getUserFromRequest(req);
        
        if (!user) {
          res.status(400).json({
            success: false,
            error: 'User identification required. Please provide walletAddress, userId, or email.'
          });
          return;
        }

        req.user = user;

        // Determine credit cost based on model
        // Uses centralized constants from config/constants.ts
        const { model } = req.body;
        let requiredCredits = CREDITS.IMAGE_GENERATION; // Default: Flux Pro

        if (model === 'flux-2') {
          requiredCredits = CREDITS.IMAGE_GENERATION_FLUX_2;
        } else if (model === 'nano-banana-pro') {
          requiredCredits = CREDITS.IMAGE_GENERATION_NANO;
        } else if (model === 'qwen-image-layered') {
          requiredCredits = CREDITS.LAYER_EXTRACTION;
        }
        // Default: flux, flux-multi = CREDITS.IMAGE_GENERATION

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
 */
export const createRequireCreditsForVideo = (
  getUserModel: () => Model<IUser>, 
  getUserFromRequest: (req: Request) => Promise<IUser | null>
) => {
  return () => {
    return async (req: CreditsRequest, res: Response, next: NextFunction): Promise<void> => {
      try {
        const user = await getUserFromRequest(req);
        
        if (!user) {
          res.status(400).json({
            success: false,
            error: 'User identification required. Please provide walletAddress, userId, or email.'
          });
          return;
        }

        req.user = user;

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
  calculateCredits
};

