/**
 * User service
 * Handles user lookup and creation (wallet-based only)
 */
import mongoose, { type Model } from 'mongoose';
import logger from '../utils/logger';
import type { IUser } from '../models/User';
import { normalizeWalletAddress } from '../utils/validation';

// Re-export for backwards compatibility
export { normalizeWalletAddress };

/**
 * Get User model (lazy load to avoid circular deps)
 */
function getUserModel(): Model<IUser> {
  return mongoose.model<IUser>('User');
}

/**
 * DATA MINIMIZATION: Extend user expiry on activity
 * Keeps active users while allowing inactive accounts to auto-delete
 * Called on login, generation, or payment
 */
export async function extendUserExpiry(user: IUser): Promise<void> {
  const User = getUserModel();
  // Extend expiry to 90 days from now for active users
  const newExpiry = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
  
  await User.updateOne(
    { _id: user._id },
    { 
      $set: { 
        lastActive: new Date(),
        expiresAt: newExpiry 
      } 
    }
  );
}

/**
 * Find user by wallet address or userId
 */
export async function findUserByIdentifier(
  walletAddress: string | null = null, 
  userId: string | null = null
): Promise<IUser | null> {
  if (!walletAddress && !userId) {
    return null;
  }

  const User = getUserModel();
  const query: { $or?: Array<Record<string, string>> } = { $or: [] };

  if (walletAddress) {
    const normalized = normalizeWalletAddress(walletAddress);
    if (normalized) {
      query.$or!.push({ walletAddress: normalized });
    }
  }

  if (userId) {
    query.$or!.push({ userId });
  }

  if (query.$or!.length === 1) {
    return await User.findOne(query.$or![0])
      .select('-generationHistory -gallery -paymentHistory')
      .maxTimeMS(5000) as IUser | null;
  }

  return await User.findOne(query)
    .select('-generationHistory -gallery -paymentHistory')
    .maxTimeMS(5000) as IUser | null;
}

/**
 * Get or create user by wallet address
 */
export async function getOrCreateUser(walletAddress: string): Promise<IUser> {
  const User = getUserModel();
  const normalized = normalizeWalletAddress(walletAddress);
  
  if (!normalized) {
    throw new Error('Invalid wallet address');
  }

  // Try to find existing user
  let user = await User.findOne({ walletAddress: normalized });
  
  if (user) {
    // DATA MINIMIZATION: Extend expiry on activity
    await extendUserExpiry(user);
    return user;
  }

  // Create new user with 10 free credits
  user = new User({
    walletAddress: normalized,
    credits: 10,
    totalCreditsEarned: 10,
    totalCreditsSpent: 0,
    nftCollections: [],
    paymentHistory: [],
    generationHistory: [],
    gallery: []
  });

  await user.save();
  logger.info('New user created with 10 credits', { walletAddress: normalized });
  return user;
}

/**
 * Build update query for user (wallet-based only)
 */
export function buildUserUpdateQuery(user: { walletAddress?: string; userId?: string }): { walletAddress?: string; userId?: string } | null {
  if (user.walletAddress) {
    const normalized = normalizeWalletAddress(user.walletAddress);
    if (!normalized) return null;
    return { walletAddress: normalized };
  } else if (user.userId) {
    return { userId: user.userId };
  }
  return null;
}

/**
 * Get user from request body (wallet-based only)
 */
export async function getUserFromRequest(req: { body: { walletAddress?: string; userId?: string } }): Promise<IUser | null> {
  const { walletAddress, userId } = req.body;
  
  let user = await findUserByIdentifier(walletAddress || null, userId || null);
  
  if (user) {
    return user;
  }

  // Create new user if wallet address provided
  if (walletAddress) {
    return await getOrCreateUser(walletAddress);
  }

  return null;
}

export default {
  normalizeWalletAddress,
  findUserByIdentifier,
  getOrCreateUser,
  buildUserUpdateQuery,
  getUserFromRequest,
  extendUserExpiry
};





