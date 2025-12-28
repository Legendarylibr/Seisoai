/**
 * IP-based free image tracking to prevent abuse
 * Tracks how many free images have been used from each IP address
 */
import mongoose from 'mongoose';

const ipFreeImageSchema = new mongoose.Schema({
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

const IPFreeImage = mongoose.model('IPFreeImage', ipFreeImageSchema);

export default IPFreeImage;
