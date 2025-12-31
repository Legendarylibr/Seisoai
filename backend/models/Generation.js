/**
 * Generation Model - Stores user generation history
 * Separated from User model to prevent document bloat
 */
import mongoose from 'mongoose';

const generationSchema = new mongoose.Schema({
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

// TTL index - auto-delete generations older than 90 days (optional, can be removed)
// generationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

const Generation = mongoose.model('Generation', generationSchema);

export default Generation;

