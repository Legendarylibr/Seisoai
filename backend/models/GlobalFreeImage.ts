/**
 * Global free image counter for all users (drainable pools)
 */
import mongoose, { type Document } from 'mongoose';

// Types
export interface IGlobalFreeImage extends Document {
  key: string;
  totalFreeImagesUsed: number;
  totalFreeImagesUsedNFT: number;
}

const globalFreeImageSchema = new mongoose.Schema<IGlobalFreeImage>({
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

const GlobalFreeImage = mongoose.model<IGlobalFreeImage>('GlobalFreeImage', globalFreeImageSchema);

export default GlobalFreeImage;





