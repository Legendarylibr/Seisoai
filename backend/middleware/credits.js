/**
 * Credits middleware
 * Handles credit checks and deductions for paid operations
 */
import logger from '../utils/logger.js';

/**
 * Create middleware that checks if user has enough credits
 * @param {number} requiredCredits - Minimum credits required
 * @param {Function} getUserModel - Function to get User model
 * @param {Function} getUserFromRequest - Function to get user from request
 */
export const createRequireCredits = (getUserModel, getUserFromRequest) => {
  return (requiredCredits) => {
    return async (req, res, next) => {
      try {
        const user = await getUserFromRequest(req);
        
        if (!user) {
          return res.status(400).json({
            success: false,
            error: 'User identification required. Please provide walletAddress, userId, or email.'
          });
        }

        req.user = user;

        if ((user.credits || 0) < requiredCredits) {
          return res.status(402).json({
            success: false,
            error: `Insufficient credits. You have ${user.credits || 0} credits but need ${requiredCredits}.`,
            creditsRequired: requiredCredits,
            creditsAvailable: user.credits || 0
          });
        }

        next();
      } catch (error) {
        logger.error('Error in requireCredits middleware:', error);
        return res.status(500).json({
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
export const createRequireCreditsForModel = (getUserModel, getUserFromRequest) => {
  return () => {
    return async (req, res, next) => {
      try {
        const user = await getUserFromRequest(req);
        
        if (!user) {
          return res.status(400).json({
            success: false,
            error: 'User identification required. Please provide walletAddress, userId, or email.'
          });
        }

        req.user = user;

        // Determine credit cost based on model and image count
        const { model, image_urls, image_url } = req.body;
        let requiredCredits = 1;

        // Multi-image or certain models cost more
        if (model === 'nano-banana-pro') {
          const imageCount = image_urls?.length || (image_url ? 1 : 0);
          requiredCredits = imageCount >= 2 ? 2 : 1;
        } else if (image_urls && image_urls.length >= 2) {
          requiredCredits = 2;
        }

        if ((user.credits || 0) < requiredCredits) {
          return res.status(402).json({
            success: false,
            error: `Insufficient credits. You have ${user.credits || 0} credits but need ${requiredCredits}.`,
            creditsRequired: requiredCredits,
            creditsAvailable: user.credits || 0
          });
        }

        req.creditsRequired = requiredCredits;
        next();
      } catch (error) {
        logger.error('Error in requireCreditsForModel middleware:', error);
        return res.status(500).json({
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
export const createRequireCreditsForVideo = (getUserModel, getUserFromRequest) => {
  return () => {
    return async (req, res, next) => {
      try {
        const user = await getUserFromRequest(req);
        
        if (!user) {
          return res.status(400).json({
            success: false,
            error: 'User identification required. Please provide walletAddress, userId, or email.'
          });
        }

        req.user = user;

        // Minimum 2 credits for video (1 second minimum)
        const minimumCredits = 2;

        if ((user.credits || 0) < minimumCredits) {
          return res.status(402).json({
            success: false,
            error: `Insufficient credits for video generation. You have ${user.credits || 0} credits but need at least ${minimumCredits}.`,
            creditsRequired: minimumCredits,
            creditsAvailable: user.credits || 0
          });
        }

        req.creditsRequired = minimumCredits;
        next();
      } catch (error) {
        logger.error('Error in requireCreditsForVideo middleware:', error);
        return res.status(500).json({
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
export const calculateCredits = (amountInDollars, isNFTHolder = false) => {
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
import { getUserFromRequest } from '../services/user.js';

const getUserModel = () => mongoose.model('User');

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

