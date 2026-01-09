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
  emailHash?: string;  // Blind index for searching encrypted emails
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
  // SECURITY: Account lockout fields for brute force protection
  failedLoginAttempts?: number;
  lockoutUntil?: Date;
  // Virtual field to track if email was decrypted
  _emailDecrypted?: boolean;
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
  // Email is stored encrypted - use emailHash for lookups
  email: {
    type: String,
    required: false,
    sparse: true
    // Note: No validation here - encrypted emails won't match patterns
    // Validation happens before encryption in pre-save hook
  },
  // Blind index for searching by email (HMAC hash, not reversible)
  emailHash: {
    type: String,
    required: false,
    unique: true,
    sparse: true,
    index: true
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
    min: [0, 'Credits cannot be negative'],
    // SECURITY: Add validation to ensure credits never go negative
    validate: {
      validator: function(v: number) { return v >= 0; },
      message: 'Credits cannot be negative'
    }
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
  expiresAt: { type: Date, default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
  // SECURITY: Account lockout fields for brute force protection
  failedLoginAttempts: { type: Number, default: 0, min: 0 },
  lockoutUntil: { type: Date, required: false }
}, {
  timestamps: true
});

// Indexes for performance
userSchema.index({ walletAddress: 1 });
userSchema.index({ emailHash: 1 });  // Use emailHash for lookups, not email
userSchema.index({ userId: 1 });
userSchema.index({ createdAt: 1 });
userSchema.index({ expiresAt: 1 });
userSchema.index({ 'gallery.timestamp': 1 });
userSchema.index({ 'gallery.expiresAt': 1 }); // For cleaning up expired 3D models

// Helper to check if a string is already encrypted (contains our format)
function isEncrypted(value: string): boolean {
  if (!value) return false;
  const parts = value.split(':');
  return parts.length === 3 && parts[0].length > 10;
}

// Helper to validate email format (before encryption)
function isValidEmail(email: string): boolean {
  return /^\S+@\S+\.\S+$/.test(email);
}

// Pre-save hook: Encrypt email and generate userId
userSchema.pre('save', async function(next) {
  try {
    // Handle email encryption
    if (this.email && this.isModified('email')) {
      const plainEmail = this.email;
      
      // Skip if already encrypted
      if (!isEncrypted(plainEmail)) {
        // Validate email format before encryption
        if (!isValidEmail(plainEmail)) {
          return next(new Error('Please enter a valid email address'));
        }
        
        // Normalize email
        const normalizedEmail = plainEmail.toLowerCase().trim();
        
        // Create blind index for searching (before encryption)
        if (isEncryptionConfigured()) {
          this.emailHash = createBlindIndex(normalizedEmail);
          // Encrypt the email
          this.email = encrypt(normalizedEmail);
          logger.debug('Email encrypted for user', { 
            emailHash: this.emailHash.substring(0, 8) + '...',
            userId: this.userId 
          });
        } else {
          // Encryption not configured - store plaintext but log warning
          this.email = normalizedEmail;
          this.emailHash = crypto.createHash('sha256').update(normalizedEmail).digest('hex');
          logger.warn('Email stored without encryption - ENCRYPTION_KEY not configured');
        }
      }
    }
    
    // Generate unique userId for new users
    if (this.isNew && !this.userId) {
      let hash: string;
      let prefix: string;
      
      // Use emailHash if available (for encrypted emails), otherwise decrypt or use raw
      if (this.emailHash) {
        hash = this.emailHash.substring(0, 16);
        prefix = 'email_';
      } else if (this.email) {
        // Email might be encrypted or plain
        const emailForHash = isEncrypted(this.email) 
          ? decrypt(this.email) 
          : this.email;
        hash = crypto.createHash('sha256').update(emailForHash.toLowerCase()).digest('hex').substring(0, 16);
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
    }
    
    next();
  } catch (error) {
    const err = error as Error;
    logger.error('Error in user pre-save hook', { error: err.message });
    next(err);
  }
});

// Post-find hooks: Decrypt email and embedded prompts when reading from database
function decryptUserData(doc: IUser | null): void {
  if (!doc) return;
  
  // Decrypt email if it looks encrypted and not already decrypted
  if (doc.email && isEncrypted(doc.email) && !doc._emailDecrypted) {
    try {
      doc.email = decrypt(doc.email);
      doc._emailDecrypted = true;
    } catch (error) {
      logger.error('Failed to decrypt user email', { userId: doc.userId });
    }
  }
  
  // Decrypt embedded gallery prompts
  const gallery = (doc as any).gallery;
  if (Array.isArray(gallery)) {
    for (const item of gallery) {
      if (item?.prompt && isEncrypted(item.prompt)) {
        try {
          item.prompt = decrypt(item.prompt);
        } catch (error) {
          logger.error('Failed to decrypt gallery prompt', { userId: doc.userId });
        }
      }
    }
  }
  
  // Decrypt embedded generationHistory prompts
  const genHistory = (doc as any).generationHistory;
  if (Array.isArray(genHistory)) {
    for (const gen of genHistory) {
      if (gen?.prompt && isEncrypted(gen.prompt)) {
        try {
          gen.prompt = decrypt(gen.prompt);
        } catch (error) {
          logger.error('Failed to decrypt generation prompt', { userId: doc.userId });
        }
      }
    }
  }
}

userSchema.post('findOne', function(doc: IUser | null) {
  decryptUserData(doc);
});

userSchema.post('find', function(docs: IUser[]) {
  if (Array.isArray(docs)) {
    docs.forEach(decryptUserData);
  }
});

userSchema.post('findOneAndUpdate', function(doc: IUser | null) {
  decryptUserData(doc);
});

// Note: buildUserUpdateQuery is exported from services/user.ts to avoid circular dependencies
// The function in services/user.ts is the canonical implementation

const User = mongoose.model<IUser, UserModel>('User', userSchema);

export default User;

