/**
 * User service
 * Handles user lookup and creation
 */
import mongoose, { type Model } from 'mongoose';
import logger from '../utils/logger';
import type { IUser } from '../models/User';

/**
 * Get User model (lazy load to avoid circular deps)
 */
function getUserModel(): Model<IUser> {
  return mongoose.model<IUser>('User');
}

/**
 * Normalize wallet address
 */
export function normalizeWalletAddress(address: unknown): string | null {
  if (!address || typeof address !== 'string') return null;
  return address.startsWith('0x') ? address.toLowerCase() : address;
}

/**
 * Find user by any identifier
 */
export async function findUserByIdentifier(
  walletAddress: string | null = null, 
  email: string | null = null, 
  userId: string | null = null
): Promise<IUser | null> {
  if (!walletAddress && !email && !userId) {
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

  if (email) {
    query.$or!.push({ email: email.toLowerCase() });
  }

  if (userId) {
    query.$or!.push({ userId });
  }

  if (query.$or!.length === 1) {
    return await User.findOne(query.$or![0])
      .select('-generationHistory -gallery -paymentHistory')
      .lean()
      .maxTimeMS(5000) as IUser | null;
  }

  return await User.findOne(query)
    .select('-generationHistory -gallery -paymentHistory')
    .lean()
    .maxTimeMS(5000) as IUser | null;
}

/**
 * Get or create user by wallet address
 */
export async function getOrCreateUser(
  walletAddress: string, 
  email: string | null = null
): Promise<IUser> {
  const User = getUserModel();
  const normalized = normalizeWalletAddress(walletAddress);
  
  if (!normalized) {
    throw new Error('Invalid wallet address');
  }

  // Try to find existing user
  let user = await User.findOne({ walletAddress: normalized });
  
  if (user) {
    // Link email if provided and not already set
    if (email && !user.email) {
      user.email = email.toLowerCase();
      await user.save();
    }
    return user;
  }

  // Create new user
  user = new User({
    walletAddress: normalized,
    email: email ? email.toLowerCase() : undefined,
    credits: 0,
    totalCreditsEarned: 0,
    totalCreditsSpent: 0,
    nftCollections: [],
    paymentHistory: [],
    generationHistory: [],
    gallery: []
  });

  await user.save();
  logger.info('New user created', { walletAddress: normalized });
  return user;
}

/**
 * Get or create user by email
 */
export async function getOrCreateUserByEmail(email: string): Promise<IUser> {
  const User = getUserModel();
  const normalized = email.toLowerCase();

  let user = await User.findOne({ email: normalized });
  
  if (user) {
    return user;
  }

  // New email users get 2 free credits
  user = new User({
    email: normalized,
    credits: 2,
    totalCreditsEarned: 2,
    totalCreditsSpent: 0,
    nftCollections: [],
    paymentHistory: [],
    generationHistory: [],
    gallery: []
  });

  await user.save();
  logger.info('New email user created with 2 credits', { email: normalized });
  return user;
}

/**
 * Build update query for user
 */
export function buildUserUpdateQuery(user: { walletAddress?: string; userId?: string; email?: string }): { walletAddress?: string; userId?: string; email?: string } | null {
  if (user.walletAddress) {
    const normalized = normalizeWalletAddress(user.walletAddress);
    if (!normalized) return null;
    return { walletAddress: normalized };
  } else if (user.userId) {
    return { userId: user.userId };
  } else if (user.email) {
    return { email: user.email.toLowerCase() };
  }
  return null;
}

/**
 * Get user from request body
 */
export async function getUserFromRequest(req: { body: { walletAddress?: string; userId?: string; email?: string } }): Promise<IUser | null> {
  const { walletAddress, userId, email } = req.body;
  
  let user = await findUserByIdentifier(walletAddress || null, email || null, userId || null);
  
  if (user) {
    return user;
  }

  // Create new user if wallet address provided
  if (walletAddress) {
    return await getOrCreateUser(walletAddress, email || null);
  }
  
  if (email) {
    return await getOrCreateUserByEmail(email);
  }

  return null;
}

export default {
  normalizeWalletAddress,
  findUserByIdentifier,
  getOrCreateUser,
  getOrCreateUserByEmail,
  buildUserUpdateQuery,
  getUserFromRequest
};


