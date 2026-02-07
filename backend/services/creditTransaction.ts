/**
 * Credit Transaction Service
 * Centralized credit deduction and refund logic
 * 
 * Eliminates the ~40-line credit deduction boilerplate
 * previously copy-pasted across 6 generation route handlers.
 */
import mongoose from 'mongoose';
import logger from '../utils/logger';
import { buildUserUpdateQuery } from './user';
import type { IUser } from '../models/User';

export interface CreditDeductionResult {
  remainingCredits: number;
  actualCreditsDeducted: number;
}

export class InsufficientCreditsError extends Error {
  public statusCode = 402;
  constructor() {
    super('Insufficient credits');
    this.name = 'InsufficientCreditsError';
  }
}

export class UserAccountRequiredError extends Error {
  public statusCode = 400;
  constructor() {
    super('User account required');
    this.name = 'UserAccountRequiredError';
  }
}

export class AuthenticationRequiredError extends Error {
  public statusCode = 401;
  constructor() {
    super('User authentication required');
    this.name = 'AuthenticationRequiredError';
  }
}

export class ServiceNotConfiguredError extends Error {
  public statusCode = 500;
  constructor(service = 'AI service') {
    super(`${service} not configured`);
    this.name = 'ServiceNotConfiguredError';
  }
}

/**
 * Validate that the user is authenticated and has a valid account
 * @throws AuthenticationRequiredError if user is not authenticated
 * @throws UserAccountRequiredError if user has no valid identifier
 */
export function validateUser(user: IUser | undefined): asserts user is IUser {
  if (!user) {
    throw new AuthenticationRequiredError();
  }
  const updateQuery = buildUserUpdateQuery(user);
  if (!updateQuery) {
    throw new UserAccountRequiredError();
  }
}

/**
 * Deduct credits from a user atomically
 * Skips deduction for users with free access (NFT/Token holders)
 * 
 * @param user - The authenticated user
 * @param creditsRequired - Number of credits to deduct
 * @param hasFreeAccess - Whether the user has free access via NFT/Token holdings
 * @returns The remaining credits and actual credits deducted
 * @throws InsufficientCreditsError if user doesn't have enough credits
 * @throws UserAccountRequiredError if user has no valid identifier
 */
export async function deductCredits(
  user: IUser,
  creditsRequired: number,
  hasFreeAccess: boolean
): Promise<CreditDeductionResult> {
  const User = mongoose.model<IUser>('User');
  const updateQuery = buildUserUpdateQuery(user);

  if (!updateQuery) {
    throw new UserAccountRequiredError();
  }

  // Skip credit deduction for NFT/Token holders with free access
  if (hasFreeAccess) {
    logger.info('Free generation - no credits deducted', {
      userId: user.userId || user.walletAddress,
      creditsWouldHaveCost: creditsRequired
    });
    return {
      remainingCredits: user.credits || 0,
      actualCreditsDeducted: 0
    };
  }

  const updateResult = await User.findOneAndUpdate(
    {
      ...updateQuery,
      credits: { $gte: creditsRequired }
    },
    {
      $inc: { credits: -creditsRequired, totalCreditsSpent: creditsRequired }
    },
    { new: true }
  );

  if (!updateResult) {
    throw new InsufficientCreditsError();
  }

  return {
    remainingCredits: updateResult.credits,
    actualCreditsDeducted: creditsRequired
  };
}

/**
 * Refund credits to a user after a failed generation
 * @param user - The user to refund
 * @param credits - Number of credits to refund
 * @param reason - Reason for the refund (for logging)
 * @returns The updated user document or null if refund failed
 */
export async function refundCredits(
  user: IUser,
  credits: number,
  reason: string
): Promise<IUser | null> {
  try {
    // Validate credits is a valid positive number
    if (!Number.isFinite(credits) || credits <= 0) {
      logger.error('Cannot refund invalid credits amount', { credits, reason, userId: user.userId });
      return null;
    }

    const User = mongoose.model<IUser>('User');
    const updateQuery = buildUserUpdateQuery(user);

    if (!updateQuery) {
      logger.error('Cannot refund credits: no valid user identifier', { userId: user.userId });
      return null;
    }

    const updatedUser = await User.findOneAndUpdate(
      updateQuery,
      {
        $inc: { credits: credits, totalCreditsSpent: -credits }
      },
      { new: true }
    );

    if (updatedUser) {
      logger.info('Credits refunded for failed generation', {
        userId: user.userId || user.walletAddress,
        creditsRefunded: credits,
        newBalance: updatedUser.credits,
        reason
      });
    }

    return updatedUser;
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to refund credits', {
      userId: user.userId,
      credits,
      reason,
      error: err.message
    });
    return null;
  }
}

/**
 * Handle credit-related errors in route handlers
 * Sends the appropriate HTTP response based on error type
 */
export function handleCreditError(err: unknown, res: {
  status: (code: number) => { json: (body: unknown) => void };
}): boolean {
  if (err instanceof AuthenticationRequiredError) {
    res.status(401).json({ success: false, error: err.message });
    return true;
  }
  if (err instanceof ServiceNotConfiguredError) {
    res.status(500).json({ success: false, error: err.message });
    return true;
  }
  if (err instanceof UserAccountRequiredError) {
    res.status(400).json({ success: false, error: err.message });
    return true;
  }
  if (err instanceof InsufficientCreditsError) {
    res.status(402).json({ success: false, error: err.message });
    return true;
  }
  return false;
}

export default {
  deductCredits,
  refundCredits,
  validateUser,
  handleCreditError,
  InsufficientCreditsError,
  UserAccountRequiredError,
  AuthenticationRequiredError,
  ServiceNotConfiguredError
};
