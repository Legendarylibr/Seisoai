/**
 * Discord User Model (Backend)
 * Minimal model to sync with Discord bot's DiscordUser collection
 * Used when users link Discord via the website OAuth flow
 */
import mongoose, { Document, Schema, Model } from 'mongoose';

interface DiscordGeneration {
  id?: string;
  type?: 'image' | 'video' | 'music' | '3d';
  prompt?: string;
  status?: 'pending' | 'processing' | 'completed' | 'failed';
  resultUrl?: string;
  creditsUsed?: number;
  messageId?: string;
  timestamp?: Date;
}

export interface IDiscordUser extends Document {
  discordId: string;
  discordUsername: string;
  
  // Linked SeisoAI account
  seisoUserId?: string;
  email?: string;
  walletAddress?: string;
  
  // Credits (mirrored from main user for quick access)
  credits: number;
  totalCreditsEarned: number;
  totalCreditsSpent: number;
  
  // Discord-specific
  privateChannelId?: string;
  activeGenerations: number;
  lastGeneration?: Date;
  
  // Generation history
  generations?: DiscordGeneration[];
  
  // Settings
  settings: {
    defaultStyle?: string;
    defaultAspectRatio?: string;
    notifyOnComplete: boolean;
    autoThread: boolean;
  };
  
  createdAt: Date;
  updatedAt: Date;
}

export interface IDiscordUserModel extends Model<IDiscordUser> {
  syncFromMainUser(mainUser: {
    userId?: string;
    email?: string;
    walletAddress?: string;
    credits?: number;
    totalCreditsEarned?: number;
    totalCreditsSpent?: number;
    discordId: string;
    discordUsername: string;
  }): Promise<IDiscordUser>;
}

const discordUserSchema = new Schema<IDiscordUser>({
  discordId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  discordUsername: {
    type: String,
    required: true
  },
  
  // Linked accounts
  seisoUserId: {
    type: String,
    sparse: true,
    index: true
  },
  email: {
    type: String,
    sparse: true,
    index: true
  },
  walletAddress: {
    type: String,
    sparse: true,
    index: true
  },
  
  // Credits
  credits: {
    type: Number,
    default: 0,
    min: 0
  },
  totalCreditsEarned: {
    type: Number,
    default: 0,
    min: 0
  },
  totalCreditsSpent: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // Discord-specific
  privateChannelId: String,
  activeGenerations: {
    type: Number,
    default: 0,
    min: 0
  },
  lastGeneration: Date,
  
  // Generation history - not managed by backend, just schema compatibility
  generations: [{
    id: String,
    type: { 
      type: String, 
      enum: ['image', 'video', 'music', '3d']
    },
    prompt: String,
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending'
    },
    resultUrl: String,
    creditsUsed: Number,
    messageId: String,
    timestamp: Date
  }],
  
  // Settings
  settings: {
    defaultStyle: String,
    defaultAspectRatio: { type: String, default: '16:9' },
    notifyOnComplete: { type: Boolean, default: true },
    autoThread: { type: Boolean, default: true }
  }
}, {
  timestamps: true,
  collection: 'discordusers' // Same collection as Discord bot
});

/**
 * Sync a DiscordUser record from the main User model
 * Creates or updates the DiscordUser when linking via website OAuth
 */
discordUserSchema.statics.syncFromMainUser = async function(mainUser: {
  userId?: string;
  email?: string;
  walletAddress?: string;
  credits?: number;
  totalCreditsEarned?: number;
  totalCreditsSpent?: number;
  discordId: string;
  discordUsername: string;
}): Promise<IDiscordUser> {
  const existingUser = await this.findOne({ discordId: mainUser.discordId });
  
  if (existingUser) {
    // Update existing record
    existingUser.discordUsername = mainUser.discordUsername;
    existingUser.seisoUserId = mainUser.userId;
    if (mainUser.email) existingUser.email = mainUser.email;
    if (mainUser.walletAddress) existingUser.walletAddress = mainUser.walletAddress;
    existingUser.credits = mainUser.credits ?? existingUser.credits;
    existingUser.totalCreditsEarned = mainUser.totalCreditsEarned ?? existingUser.totalCreditsEarned;
    existingUser.totalCreditsSpent = mainUser.totalCreditsSpent ?? existingUser.totalCreditsSpent;
    await existingUser.save();
    return existingUser;
  }
  
  // Create new record
  const newUser = new this({
    discordId: mainUser.discordId,
    discordUsername: mainUser.discordUsername,
    seisoUserId: mainUser.userId,
    email: mainUser.email,
    walletAddress: mainUser.walletAddress,
    credits: mainUser.credits ?? 0,
    totalCreditsEarned: mainUser.totalCreditsEarned ?? 0,
    totalCreditsSpent: mainUser.totalCreditsSpent ?? 0,
    generations: [],
    settings: {
      notifyOnComplete: true,
      autoThread: true
    }
  });
  await newUser.save();
  return newUser;
};

/**
 * Get the DiscordUser model, ensuring it's only registered once
 */
export function getDiscordUserModel(): IDiscordUserModel {
  if (mongoose.models.DiscordUser) {
    return mongoose.models.DiscordUser as IDiscordUserModel;
  }
  return mongoose.model<IDiscordUser, IDiscordUserModel>('DiscordUser', discordUserSchema);
}

export default getDiscordUserModel;
