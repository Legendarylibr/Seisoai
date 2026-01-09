/**
 * Generation Model - Stores user generation history
 * Separated from User model to prevent document bloat
 * Includes field-level encryption for prompts (sensitive user content)
 */
import mongoose, { type Document, type Model } from 'mongoose';
import { encrypt, decrypt, isEncryptionConfigured } from '../utils/encryption.js';
import logger from '../utils/logger.js';

// Types
interface GenerationMetadata {
  aspectRatio?: string;
  seed?: number;
  guidanceScale?: number;
  numImages?: number;
}

export interface IGeneration extends Document {
  userId: string;
  generationId: string;
  prompt: string;
  style?: string;
  model?: string;
  imageUrl?: string;
  videoUrl?: string;
  requestId?: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  creditsUsed: number;
  metadata?: GenerationMetadata;
  createdAt: Date;
}

const generationSchema = new mongoose.Schema<IGeneration>({
  userId: {
    type: String,
    required: true,
    index: true
  },
  generationId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  prompt: {
    type: String,
    required: true
  },
  style: String,
  model: String,
  imageUrl: String,
  videoUrl: String,
  requestId: String,
  status: {
    type: String,
    enum: ['queued', 'processing', 'completed', 'failed'],
    default: 'completed'
  },
  creditsUsed: {
    type: Number,
    default: 0
  },
  metadata: {
    aspectRatio: String,
    seed: Number,
    guidanceScale: Number,
    numImages: Number
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

// Compound index for efficient user queries
generationSchema.index({ userId: 1, createdAt: -1 });

// TTL index - auto-delete generations older than 90 days (storage optimization)
generationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

// Helper to check if a string is already encrypted (contains our format)
function isEncrypted(value: string): boolean {
  if (!value) return false;
  const parts = value.split(':');
  return parts.length === 3 && parts[0].length > 10;
}

// Pre-save hook: Encrypt prompt
generationSchema.pre('save', function(next) {
  try {
    if (this.prompt && this.isModified('prompt')) {
      // Skip if already encrypted
      if (!isEncrypted(this.prompt) && isEncryptionConfigured()) {
        this.prompt = encrypt(this.prompt);
        logger.debug('Generation prompt encrypted', { generationId: this.generationId });
      }
    }
    next();
  } catch (error) {
    const err = error as Error;
    logger.error('Error in generation pre-save hook', { error: err.message });
    next(err);
  }
});

// Post-find hooks: Decrypt prompt when reading from database
function decryptPrompt(doc: IGeneration | null): void {
  if (!doc || !doc.prompt) return;
  
  if (isEncrypted(doc.prompt)) {
    try {
      doc.prompt = decrypt(doc.prompt);
    } catch (error) {
      logger.error('Failed to decrypt generation prompt', { generationId: doc.generationId });
    }
  }
}

generationSchema.post('findOne', function(doc: IGeneration | null) {
  decryptPrompt(doc);
});

generationSchema.post('find', function(docs: IGeneration[]) {
  if (Array.isArray(docs)) {
    docs.forEach(decryptPrompt);
  }
});

generationSchema.post('findOneAndUpdate', function(doc: IGeneration | null) {
  decryptPrompt(doc);
});

const Generation = mongoose.model<IGeneration>('Generation', generationSchema);

export default Generation;

