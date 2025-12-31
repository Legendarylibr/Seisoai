/**
 * GalleryItem Model - Stores user gallery/saved images
 * Separated from User model to prevent document bloat
 */
import mongoose from 'mongoose';

const galleryItemSchema = new mongoose.Schema({
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

const GalleryItem = mongoose.model('GalleryItem', galleryItemSchema);

export default GalleryItem;

