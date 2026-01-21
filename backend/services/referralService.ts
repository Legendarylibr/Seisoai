/**
 * Referral Service
 * Handles referral code generation, validation, and credit awarding
 */
import mongoose from 'mongoose';
import crypto from 'crypto';
import logger from '../utils/logger';
import type { IUser } from '../models/User';
import Referral, { type IReferral } from '../models/Referral';

// Configuration
const REFERRER_CREDITS = 5;  // Credits awarded to the referrer
const REFEREE_BONUS_CREDITS = 5;  // Extra credits for referee (on top of normal 10)
const REFERRAL_CODE_LENGTH = 8;
const MAX_WEEKLY_SHARE_CREDITS = 5;

/**
 * Get User model (lazy load to avoid circular deps)
 */
function getUserModel() {
  return mongoose.model<IUser>('User');
}

/**
 * Generate a unique referral code
 * Format: 8 alphanumeric characters (uppercase)
 */
export function generateReferralCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  // Removed similar chars: I, O, 0, 1
  let code = '';
  const randomBytes = crypto.randomBytes(REFERRAL_CODE_LENGTH);
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i++) {
    code += chars[randomBytes[i] % chars.length];
  }
  return code;
}

/**
 * Get or create a referral code for a user
 */
export async function getOrCreateReferralCode(userId: string): Promise<string> {
  const User = getUserModel();
  const user = await User.findOne({ userId });
  
  if (!user) {
    throw new Error('User not found');
  }
  
  // Return existing code if user already has one
  if (user.referralCode) {
    return user.referralCode;
  }
  
  // Generate new unique code
  let code: string;
  let attempts = 0;
  const maxAttempts = 10;
  
  while (attempts < maxAttempts) {
    code = generateReferralCode();
    const existing = await User.findOne({ referralCode: code });
    if (!existing) {
      break;
    }
    attempts++;
  }
  
  if (attempts >= maxAttempts) {
    throw new Error('Failed to generate unique referral code');
  }
  
  // Save the code to the user
  user.referralCode = code!;
  await user.save();
  
  logger.info('Generated referral code', { userId, code: code! });
  return code!;
}

/**
 * Validate a referral code
 */
export async function validateReferralCode(code: string): Promise<{ valid: boolean; referrerId?: string; error?: string }> {
  if (!code || code.length !== REFERRAL_CODE_LENGTH) {
    return { valid: false, error: 'Invalid referral code format' };
  }
  
  const User = getUserModel();
  const referrer = await User.findOne({ referralCode: code.toUpperCase() });
  
  if (!referrer) {
    return { valid: false, error: 'Referral code not found' };
  }
  
  return { valid: true, referrerId: referrer.userId };
}

/**
 * Apply a referral code for a new user
 * Called during signup when a user provides a referral code
 */
export async function applyReferralCode(
  refereeUserId: string,
  referralCode: string,
  ipAddress?: string,
  userAgent?: string
): Promise<{ success: boolean; error?: string; bonusCredits?: number }> {
  const User = getUserModel();
  
  // Validate the referral code
  const validation = await validateReferralCode(referralCode);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }
  
  const referrerId = validation.referrerId!;
  
  // Check if user was already referred
  const referee = await User.findOne({ userId: refereeUserId });
  if (!referee) {
    return { success: false, error: 'Referee not found' };
  }
  
  if (referee.referredBy) {
    return { success: false, error: 'User was already referred' };
  }
  
  // Check if this referral already exists
  const existingReferral = await Referral.findOne({ refereeId: refereeUserId });
  if (existingReferral) {
    return { success: false, error: 'Referral already recorded' };
  }
  
  // Prevent self-referral
  if (referrerId === refereeUserId) {
    return { success: false, error: 'Cannot refer yourself' };
  }
  
  // Get referrer
  const referrer = await User.findOne({ userId: referrerId });
  if (!referrer) {
    return { success: false, error: 'Referrer not found' };
  }
  
  // Start a session for atomic operations
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    // Create referral record
    const referral = new Referral({
      referrerId,
      refereeId: refereeUserId,
      referralCode: referralCode.toUpperCase(),
      status: 'completed',
      referrerCreditsAwarded: REFERRER_CREDITS,
      refereeCreditsAwarded: REFEREE_BONUS_CREDITS,
      ipAddress,
      userAgent,
      completedAt: new Date()
    });
    await referral.save({ session });
    
    // Update referee
    referee.referredBy = referrerId;
    referee.credits += REFEREE_BONUS_CREDITS;
    referee.totalCreditsEarned += REFEREE_BONUS_CREDITS;
    referee.paymentHistory.push({
      amount: 0,
      credits: REFEREE_BONUS_CREDITS,
      timestamp: new Date(),
      type: 'referral'
    });
    await referee.save({ session });
    
    // Update referrer
    referrer.credits += REFERRER_CREDITS;
    referrer.totalCreditsEarned += REFERRER_CREDITS;
    referrer.referralCount = (referrer.referralCount || 0) + 1;
    referrer.referralCreditsEarned = (referrer.referralCreditsEarned || 0) + REFERRER_CREDITS;
    referrer.paymentHistory.push({
      amount: 0,
      credits: REFERRER_CREDITS,
      timestamp: new Date(),
      type: 'referral'
    });
    await referrer.save({ session });
    
    await session.commitTransaction();
    
    logger.info('Referral applied successfully', {
      referrerId,
      refereeId: refereeUserId,
      referrerCredits: REFERRER_CREDITS,
      refereeCredits: REFEREE_BONUS_CREDITS
    });
    
    return { success: true, bonusCredits: REFEREE_BONUS_CREDITS };
  } catch (error) {
    await session.abortTransaction();
    const err = error as Error;
    logger.error('Failed to apply referral', { error: err.message });
    return { success: false, error: 'Failed to apply referral' };
  } finally {
    session.endSession();
  }
}

/**
 * Get referral statistics for a user
 */
export async function getReferralStats(userId: string): Promise<{
  referralCode: string;
  referralCount: number;
  referralCreditsEarned: number;
  recentReferrals: { refereeId: string; completedAt: Date; creditsAwarded: number }[];
}> {
  const User = getUserModel();
  const user = await User.findOne({ userId });
  
  if (!user) {
    throw new Error('User not found');
  }
  
  // Get or create referral code
  const referralCode = await getOrCreateReferralCode(userId);
  
  // Get recent referrals
  const referrals = await Referral.find({ referrerId: userId, status: 'completed' })
    .sort({ completedAt: -1 })
    .limit(10);
  
  return {
    referralCode,
    referralCount: user.referralCount || 0,
    referralCreditsEarned: user.referralCreditsEarned || 0,
    recentReferrals: referrals.map(r => ({
      refereeId: r.refereeId,
      completedAt: r.completedAt || r.createdAt,
      creditsAwarded: r.referrerCreditsAwarded
    }))
  };
}

/**
 * Get referral leaderboard
 */
export async function getReferralLeaderboard(limit: number = 10): Promise<{
  rank: number;
  userId: string;
  referralCount: number;
  creditsEarned: number;
}[]> {
  const User = getUserModel();
  
  const topReferrers = await User.find({ referralCount: { $gt: 0 } })
    .select('userId referralCount referralCreditsEarned')
    .sort({ referralCount: -1 })
    .limit(limit);
  
  return topReferrers.map((user, index) => ({
    rank: index + 1,
    userId: user.userId || 'unknown',
    referralCount: user.referralCount || 0,
    creditsEarned: user.referralCreditsEarned || 0
  }));
}

/**
 * Track a social share
 */
export async function trackSocialShare(
  userId: string,
  platform: 'twitter' | 'discord' | 'reddit' | 'facebook' | 'linkedin',
  contentId: string
): Promise<{ success: boolean; creditsAwarded: number; error?: string }> {
  const User = getUserModel();
  const user = await User.findOne({ userId });
  
  if (!user) {
    return { success: false, creditsAwarded: 0, error: 'User not found' };
  }
  
  // Check if already shared this content on this platform
  const existingShare = user.socialShares?.find(
    s => s.platform === platform && s.contentId === contentId
  );
  
  if (existingShare) {
    return { success: false, creditsAwarded: 0, error: 'Already shared this content' };
  }
  
  // Check weekly limit
  const now = new Date();
  const weeklyReset = user.weeklyShareReset || new Date(0);
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  
  // Reset weekly counter if needed
  if (weeklyReset < oneWeekAgo) {
    user.weeklyShareCredits = 0;
    user.weeklyShareReset = now;
  }
  
  // Check if user has reached weekly limit
  if ((user.weeklyShareCredits || 0) >= MAX_WEEKLY_SHARE_CREDITS) {
    // Still track the share, but don't award credits
    if (!user.socialShares) user.socialShares = [];
    user.socialShares.push({
      platform,
      contentId,
      sharedAt: now,
      creditsAwarded: false
    });
    await user.save();
    return { success: true, creditsAwarded: 0, error: 'Weekly share credit limit reached' };
  }
  
  // Award 1 credit
  const creditsToAward = 1;
  user.credits += creditsToAward;
  user.totalCreditsEarned += creditsToAward;
  user.weeklyShareCredits = (user.weeklyShareCredits || 0) + creditsToAward;
  
  if (!user.socialShares) user.socialShares = [];
  user.socialShares.push({
    platform,
    contentId,
    sharedAt: now,
    creditsAwarded: true
  });
  
  // Keep only last 50 shares
  if (user.socialShares.length > 50) {
    user.socialShares = user.socialShares.slice(-50);
  }
  
  await user.save();
  
  logger.info('Social share tracked', { userId, platform, contentId, creditsAwarded: creditsToAward });
  return { success: true, creditsAwarded: creditsToAward };
}

/**
 * Get share statistics for a user
 */
export async function getShareStats(userId: string): Promise<{
  weeklyShareCredits: number;
  weeklyShareLimit: number;
  totalShares: number;
  sharesByPlatform: Record<string, number>;
}> {
  const User = getUserModel();
  const user = await User.findOne({ userId });
  
  if (!user) {
    throw new Error('User not found');
  }
  
  // Reset counter if needed
  const now = new Date();
  const weeklyReset = user.weeklyShareReset || new Date(0);
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  
  let weeklyShareCredits = user.weeklyShareCredits || 0;
  if (weeklyReset < oneWeekAgo) {
    weeklyShareCredits = 0;
  }
  
  // Count shares by platform
  const sharesByPlatform: Record<string, number> = {};
  for (const share of user.socialShares || []) {
    sharesByPlatform[share.platform] = (sharesByPlatform[share.platform] || 0) + 1;
  }
  
  return {
    weeklyShareCredits,
    weeklyShareLimit: MAX_WEEKLY_SHARE_CREDITS,
    totalShares: user.socialShares?.length || 0,
    sharesByPlatform
  };
}

export default {
  generateReferralCode,
  getOrCreateReferralCode,
  validateReferralCode,
  applyReferralCode,
  getReferralStats,
  getReferralLeaderboard,
  trackSocialShare,
  getShareStats
};
