/**
 * IP-based free image tracking to prevent abuse
 * Tracks how many free images have been used from each IP address
 */
import mongoose, { type Document, type Model } from 'mongoose';

// Types
export interface IIPFreeImage extends Document {
  ipAddress: string;
  freeImagesUsed: number;
  lastUsed: Date;
  createdAt: Date;
}

const ipFreeImageSchema = new mongoose.Schema<IIPFreeImage>({
  ipAddress: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  freeImagesUsed: {
    type: Number,
    default: 0,
    min: 0
  },
  lastUsed: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

ipFreeImageSchema.index({ ipAddress: 1 });
ipFreeImageSchema.index({ lastUsed: 1 });

// DATA MINIMIZATION: Auto-delete IP records after 7 days
// Only needed for short-term abuse prevention, not long-term storage
ipFreeImageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

const IPFreeImage = mongoose.model<IIPFreeImage>('IPFreeImage', ipFreeImageSchema);

export default IPFreeImage;





