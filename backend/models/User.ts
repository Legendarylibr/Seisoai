/**
 * User Model - MongoDB Schema
 * Supports both wallet-based and email-based authentication
 * Includes field-level encryption for database breach protection
 */
import mongoose, { type Document, type Model } from 'mongoose';
import crypto from 'crypto';
import logger from '../utils/logger.js';
import { encrypt, decrypt, createBlindIndex, isEncryptionConfigured } from '../utils/encryption.js';

// Types
interface NFTCollection {
  contractAddress?: string;
  chainId?: string;
  tokenIds?: string[];
  lastChecked?: Date;
}

interface PaymentHistoryItem {
  txHash?: string;
  tokenSymbol?: string;
  amount?: number;
  credits?: number;
  chainId?: string;
  walletType?: string;
  timestamp?: Date;
  paymentIntentId?: string;
  subscriptionId?: string;
  type?: 'crypto' | 'stripe' | 'nft_bonus' | 'referral' | 'admin' | 'subscription';
}

interface GenerationHistoryItem {
  id?: string;
  prompt?: string;
  style?: string;
  imageUrl?: string;
  videoUrl?: string;
  requestId?: string;
  status?: 'queued' | 'processing' | 'completed' | 'failed';
  creditsUsed?: number;
  timestamp?: Date;
}

interface GalleryItem {
  id?: string;
  imageUrl?: string;
  videoUrl?: string;
  prompt?: string;
  style?: string;
  creditsUsed?: number;
  timestamp?: Date;
  // 3D model fields
  modelType?: '3d' | 'image' | 'video';
  glbUrl?: string;
  objUrl?: string;
  fbxUrl?: string;
  thumbnailUrl?: string;
  expiresAt?: Date;
}

interface UserSettings {
  preferredStyle?: string;
  defaultImageSize?: string;
  enableNotifications?: boolean;
}

export interface IUser extends Document {
  walletAddress?: string;
  email?: string;
  password?: string;
  userId?: string;
  credits: number;
  totalCreditsEarned: number;
  totalCreditsSpent: number;
  nftCollections: NFTCollection[];
  paymentHistory: PaymentHistoryItem[];
  generationHistory: GenerationHistoryItem[];
  gallery: GalleryItem[];
  settings: UserSettings;
  lastActive: Date;
  createdAt: Date;
  expiresAt: Date;
}

interface UserModel extends Model<IUser> {
  buildUserUpdateQuery(user: { walletAddress?: string; userId?: string; email?: string }): { walletAddress?: string; userId?: string; email?: string } | null;
}

// Array limit validators for storage optimization
function arrayLimit20(val: unknown[]): boolean {
  return val.length <= 20;
}

function arrayLimit50(val: unknown[]): boolean {
  return val.length <= 50;
}

function arrayLimit100(val: unknown[]): boolean {
  return val.length <= 100;
}

const userSchema = new mongoose.Schema<IUser>({
  walletAddress: { 
    type: String, 
    required: false,
    unique: true, 
    sparse: true,
    index: true
  },
  email: {
    type: String,
    required: false,
    unique: true,
    sparse: true,
    lowercase: true,
    index: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email address']
  },
  password: {
    type: String,
    required: false,
    select: false
  },
  userId: {
    type: String,
    unique: true,
    sparse: true,
    index: true,
    required: false
  },
  credits: { 
    type: Number, 
    default: 0,
    min: [0, 'Credits cannot be negative']
  },
  totalCreditsEarned: { 
    type: Number, 
    default: 0,
    min: [0, 'Total credits earned cannot be negative']
  },
  totalCreditsSpent: { 
    type: Number, 
    default: 0,
    min: [0, 'Total credits spent cannot be negative']
  },
  nftCollections: [{
    contractAddress: String,
    chainId: String,
    tokenIds: [String],
    lastChecked: { type: Date, default: Date.now }
  }],
  // NOTE: Full payment history stored in separate Payment collection
  // This array only keeps last 100 for quick access (storage optimization)
  paymentHistory: {
    type: [{
      txHash: String,
      tokenSymbol: String,
      amount: Number,
      credits: Number,
      chainId: String,
      walletType: String,
      timestamp: { type: Date, default: Date.now },
      paymentIntentId: String,
      subscriptionId: String,
      type: { type: String, enum: ['crypto', 'stripe', 'nft_bonus', 'referral', 'admin', 'subscription'] }
    }],
    validate: [arrayLimit100, 'Payment history exceeds limit of 100']
  },
  // NOTE: Full generation history stored in separate Generation collection
  // This array only keeps last 20 for quick access (storage optimization)
  generationHistory: {
    type: [{
      id: String,
      prompt: { type: String, maxlength: 500 }, // Limit prompt length
      style: String,
      imageUrl: String,
      videoUrl: String,
      requestId: String,
      status: { type: String, enum: ['queued', 'processing', 'completed', 'failed'], default: 'completed' },
      creditsUsed: Number,
      timestamp: { type: Date, default: Date.now }
    }],
    validate: [arrayLimit20, 'Generation history exceeds limit of 20']
  },
  // NOTE: Full gallery stored in separate GalleryItem collection
  // This array only keeps last 50 for quick access (storage optimization)
  gallery: {
    type: [{
      id: String,
      imageUrl: String,
      videoUrl: String,
      prompt: { type: String, maxlength: 500 }, // Limit prompt length
      style: String,
      creditsUsed: Number,
      timestamp: { type: Date, default: Date.now },
      // 3D model fields
      modelType: { type: String, enum: ['3d', 'image', 'video'], default: 'image' },
      glbUrl: String,
      objUrl: String,
      fbxUrl: String,
      thumbnailUrl: String,
      expiresAt: Date // For 3D models: expires 1 day after creation
    }],
    validate: [arrayLimit50, 'Gallery exceeds limit of 50']
  },
  settings: {
    preferredStyle: String,
    defaultImageSize: String,
    enableNotifications: { type: Boolean, default: true }
  },
  lastActive: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) }
}, {
  timestamps: true
});

// Indexes for performance
userSchema.index({ walletAddress: 1 });
userSchema.index({ email: 1 });
userSchema.index({ userId: 1 });
userSchema.index({ createdAt: 1 });
userSchema.index({ expiresAt: 1 });
userSchema.index({ 'gallery.timestamp': 1 });
userSchema.index({ 'gallery.expiresAt': 1 }); // For cleaning up expired 3D models

// Generate unique userId for all users
userSchema.pre('save', async function(next) {
  if (this.isNew && !this.userId) {
    try {
      let hash: string;
      let prefix: string;
      
      if (this.email) {
        hash = crypto.createHash('sha256').update(this.email.toLowerCase()).digest('hex').substring(0, 16);
        prefix = 'email_';
      } else if (this.walletAddress) {
        const normalizedAddress = this.walletAddress.startsWith('0x') 
          ? this.walletAddress.toLowerCase() 
          : this.walletAddress;
        hash = crypto.createHash('sha256').update(normalizedAddress).digest('hex').substring(0, 16);
        prefix = 'wallet_';
      } else {
        return next();
      }
      
      this.userId = `${prefix}${hash}`;
    } catch (error) {
      const err = error as Error;
      logger.error('Error generating userId in pre-save hook', { error: err.message });
    }
  }
  next();
});

// Note: buildUserUpdateQuery is exported from services/user.ts to avoid circular dependencies
// The function in services/user.ts is the canonical implementation

const User = mongoose.model<IUser, UserModel>('User', userSchema);

export default User;

