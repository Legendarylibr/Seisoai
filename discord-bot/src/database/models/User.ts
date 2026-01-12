/**
 * Minimal User Model for Discord Bot
 * Only includes fields needed for linking Discord accounts
 * Shares the same collection as the main backend User model
 */
import mongoose, { Document, Schema } from 'mongoose';

export interface IUser extends Document {
  userId?: string;
  email?: string;
  emailHash?: string;
  emailHashPlain?: string;
  emailLookup?: string;
  walletAddress?: string;
  discordId?: string;
  discordUsername?: string;
  credits: number;
  totalCreditsEarned: number;
  totalCreditsSpent: number;
}

// Minimal schema matching the main User model structure
// Only includes fields we need for linking
const userSchema = new Schema<IUser>({
  userId: {
    type: String,
    unique: true,
    sparse: true,
    index: true,
  },
  email: {
    type: String,
    sparse: true,
  },
  emailHash: {
    type: String,
    unique: true,
    sparse: true,
    index: true,
  },
  emailHashPlain: {
    type: String,
    sparse: true,
    index: true,
  },
  emailLookup: {
    type: String,
    sparse: true,
    index: true,
  },
  walletAddress: {
    type: String,
    unique: true,
    sparse: true,
    index: true,
  },
  discordId: {
    type: String,
    unique: true,
    sparse: true,
    index: true,
  },
  discordUsername: String,
  credits: {
    type: Number,
    default: 0,
  },
  totalCreditsEarned: {
    type: Number,
    default: 0,
  },
  totalCreditsSpent: {
    type: Number,
    default: 0,
  },
}, {
  collection: 'users', // Use the same collection as main backend
  timestamps: true,
});

// Only register if not already registered
let User: mongoose.Model<IUser>;
if (mongoose.models.User) {
  User = mongoose.models.User as mongoose.Model<IUser>;
} else {
  User = mongoose.model<IUser>('User', userSchema);
}

// Ensure the model is registered by accessing it
// This helps prevent "Schema hasn't been registered" errors
export const ensureUserModel = (): mongoose.Model<IUser> => {
  if (!mongoose.models.User) {
    User = mongoose.model<IUser>('User', userSchema);
  }
  return mongoose.models.User as mongoose.Model<IUser>;
};

export default User;
