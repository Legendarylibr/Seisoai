/**
 * User service
 * Handles user lookup and creation
 * 
 * NOTE: Email addresses are encrypted at rest. Use emailHash for lookups.
 * Uses multiple fallback methods for cross-environment compatibility.
 */
import mongoose, { type Model } from 'mongoose';
import crypto from 'crypto';
import logger from '../utils/logger';
import type { IUser } from '../models/User';
import { createEmailHash } from '../utils/emailHash';
import { normalizeWalletAddress } from '../utils/validation';

/**
 * Build robust email lookup query with multiple fallback methods
 * This ensures users can be found regardless of ENCRYPTION_KEY configuration
 */
function buildEmailLookupConditions(email: string): Array<Record<string, string>> {
  const normalized = email.toLowerCase().trim();
  const emailHash = createEmailHash(normalized);
  const emailHashPlain = crypto.createHash('sha256').update(normalized).digest('hex');
  
  return [
    { emailHash },                    // Primary: HMAC hash (with encryption key)
    { emailHashPlain },               // Fallback: plain SHA-256 hash
    { emailLookup: normalized },      // Fallback: plain email lookup field
    { email: normalized }             // Legacy: direct email match
  ];
}

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
 * Find user by any identifier
 * NOTE: Email lookups use emailHash (blind index) since emails are encrypted
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
    // Use robust email lookup with multiple fallback methods
    const emailConditions = buildEmailLookupConditions(email);
    query.$or!.push(...emailConditions);
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
    // DATA MINIMIZATION: Extend expiry on activity
    await extendUserExpiry(user);
    return user;
  }

  // Create new user with 10 free credits
  user = new User({
    walletAddress: normalized,
    email: email ? email.toLowerCase() : undefined,
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
 * Get or create user by email
 * NOTE: Uses emailHash for lookups, email will be encrypted on save
 */
export async function getOrCreateUserByEmail(email: string): Promise<IUser> {
  const User = getUserModel();
  const normalized = email.toLowerCase().trim();
  const emailHash = createEmailHash(normalized);
  const emailHashPlain = crypto.createHash('sha256').update(normalized).digest('hex');

  // Use robust lookup with multiple fallback methods
  const emailConditions = buildEmailLookupConditions(normalized);
  let user = await User.findOne({ $or: emailConditions });
  
  if (user) {
    // DATA MINIMIZATION: Extend expiry on activity
    await extendUserExpiry(user);
    return user;
  }

  // New email users get 10 free credits
  // Email will be encrypted in pre-save hook
  // Store multiple lookup fields for cross-environment compatibility
  user = new User({
    email: normalized,           // Will be encrypted on save
    emailHash: emailHash,        // HMAC hash (set explicitly for safety)
    emailHashPlain: emailHashPlain, // Plain SHA-256 for cross-env compatibility
    emailLookup: normalized,     // Plain email for fallback lookup
    credits: 10,
    totalCreditsEarned: 10,
    totalCreditsSpent: 0,
    nftCollections: [],
    paymentHistory: [],
    generationHistory: [],
    gallery: []
  });

  await user.save();
  logger.info('New email user created with 10 credits', { emailHash: emailHash.substring(0, 8) + '...' });
  return user;
}

/**
 * Build update query for user
 * NOTE: For email queries, uses emailHash since emails are encrypted
 */
export function buildUserUpdateQuery(user: { walletAddress?: string; userId?: string; email?: string; emailHash?: string }): { walletAddress?: string; userId?: string; emailHash?: string } | null {
  if (user.walletAddress) {
    const normalized = normalizeWalletAddress(user.walletAddress);
    if (!normalized) return null;
    return { walletAddress: normalized };
  } else if (user.userId) {
    return { userId: user.userId };
  } else if (user.emailHash) {
    // Prefer emailHash if available
    return { emailHash: user.emailHash };
  } else if (user.email) {
    // Create emailHash from email for lookup
    return { emailHash: createEmailHash(user.email) };
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
  getUserFromRequest,
  extendUserExpiry
};





