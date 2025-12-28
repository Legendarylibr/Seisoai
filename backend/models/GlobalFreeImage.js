/**
 * Global free image counter for all users (drainable pools)
 */
import mongoose from 'mongoose';

const globalFreeImageSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    default: 'global'
  },
  totalFreeImagesUsed: {
    type: Number,
    default: 0,
    min: 0
  },
  totalFreeImagesUsedNFT: {
    type: Number,
    default: 0,
    min: 0
  }
}, {
  timestamps: true
});

const GlobalFreeImage = mongoose.model('GlobalFreeImage', globalFreeImageSchema);

export default GlobalFreeImage;
