/**
 * GalleryItem Model - Stores user gallery/saved images
 * Separated from User model to prevent document bloat
 * Includes field-level encryption for prompts (sensitive user content)
 */
import mongoose from 'mongoose';
import { encrypt, decrypt, isEncrypted, isEncryptionConfigured } from '../utils/encryption.js';
import logger from '../utils/logger.js';

// Types
interface GalleryItemMetadata {
  aspectRatio?: string;
  seed?: number;
  width?: number;
  height?: number;
}

export interface IGalleryItem {
  _id?: mongoose.Types.ObjectId;
  userId: string;
  itemId: string;
  imageUrl: string;
  videoUrl?: string;
  prompt?: string;
  style?: string;
  modelType?: string;
  creditsUsed: number;
  metadata?: GalleryItemMetadata;
  createdAt: Date;
}

const galleryItemSchema = new mongoose.Schema<IGalleryItem>({
  userId: {
    type: String,
    required: true,
    index: true
  },
  itemId: {
    type: String,
    required: true,
    unique: true  // unique: true already creates an index
  },
  imageUrl: {
    type: String,
    required: true
  },
  videoUrl: String,
  prompt: String,
  style: String,
  modelType: String,
  creditsUsed: {
    type: Number,
    default: 0
  },
  metadata: {
    aspectRatio: String,
    seed: Number,
    width: Number,
    height: Number
  }
  // createdAt is auto-managed by timestamps: true below
}, {
  timestamps: true
});

// Compound index for efficient user queries (sorted by newest first)
galleryItemSchema.index({ userId: 1, createdAt: -1 });

// Index on createdAt for TTL and time-based queries
galleryItemSchema.index({ createdAt: 1 });

// DATA MINIMIZATION: Auto-delete gallery items after 30 days
// Users are notified items expire - they can download before expiry
galleryItemSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

// Pre-save hook: Encrypt prompt
galleryItemSchema.pre('save', function(next) {
  try {
    if (this.prompt && this.isModified('prompt')) {
      // Skip if already encrypted
      if (!isEncrypted(this.prompt) && isEncryptionConfigured()) {
        this.prompt = encrypt(this.prompt);
        logger.debug('Gallery item prompt encrypted', { itemId: this.itemId });
      }
    }
    next();
  } catch (error) {
    const err = error as Error;
    logger.error('Error in gallery item pre-save hook', { error: err.message });
    next(err);
  }
});

// Post-find hooks: Decrypt prompt when reading from database
function decryptPrompt(doc: IGalleryItem | null): void {
  if (!doc || !doc.prompt) return;
  
  if (isEncrypted(doc.prompt)) {
    try {
      doc.prompt = decrypt(doc.prompt);
    } catch (error) {
      logger.error('Failed to decrypt gallery prompt', { itemId: doc.itemId });
    }
  }
}

galleryItemSchema.post('findOne', function(doc: IGalleryItem | null) {
  decryptPrompt(doc);
});

galleryItemSchema.post('find', function(docs: IGalleryItem[]) {
  if (Array.isArray(docs)) {
    docs.forEach(decryptPrompt);
  }
});

galleryItemSchema.post('findOneAndUpdate', function(doc: IGalleryItem | null) {
  decryptPrompt(doc);
});

const GalleryItem = mongoose.model<IGalleryItem>('GalleryItem', galleryItemSchema);

export default GalleryItem;





