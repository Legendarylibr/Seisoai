/**
 * GalleryItem Model - Stores user gallery/saved images
 * Separated from User model to prevent document bloat
 */
import mongoose, { type Document, type Model } from 'mongoose';

// Types
interface GalleryItemMetadata {
  aspectRatio?: string;
  seed?: number;
  width?: number;
  height?: number;
}

export interface IGalleryItem extends Document {
  userId: string;
  itemId: string;
  imageUrl: string;
  videoUrl?: string;
  prompt?: string;
  style?: string;
  model?: string;
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
    unique: true,
    index: true
  },
  imageUrl: {
    type: String,
    required: true
  },
  videoUrl: String,
  prompt: String,
  style: String,
  model: String,
  creditsUsed: {
    type: Number,
    default: 0
  },
  metadata: {
    aspectRatio: String,
    seed: Number,
    width: Number,
    height: Number
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
galleryItemSchema.index({ userId: 1, createdAt: -1 });

const GalleryItem = mongoose.model<IGalleryItem>('GalleryItem', galleryItemSchema);

export default GalleryItem;





