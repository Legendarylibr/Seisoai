/**
 * Discord User Model
 * Links Discord accounts to SeisoAI accounts
 */
import mongoose, { Document, Schema } from 'mongoose';

export interface IDiscordUser extends Document {
  discordId: string;
  discordUsername: string;
  // DATA MINIMIZATION: Removed discordDiscriminator and discordAvatar
  
  // Linked SeisoAI account
  seisoUserId?: string;
  // DATA MINIMIZATION: Removed email - use seisoUserId for linking
  walletAddress?: string;
  
  // Credits (mirrored from main user for quick access)
  credits: number;
  totalCreditsEarned: number;
  totalCreditsSpent: number;
  
  // Discord-specific
  privateChannelId?: string;
  activeGenerations: number;
  lastGeneration?: Date;
  
  // Generation history (last 20, reduced from 50)
  generations: Array<{
    id: string;
    type: 'image' | 'video' | 'music' | '3d';
    prompt: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    resultUrl?: string;
    creditsUsed: number;
    messageId?: string;
    timestamp: Date;
  }>;
  
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
  // DATA MINIMIZATION: Removed discordDiscriminator, discordAvatar, email
  
  // Linked accounts
  seisoUserId: {
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
  
  // Generation history
  generations: [{
    id: { type: String, required: true },
    type: { 
      type: String, 
      enum: ['image', 'video', 'music', '3d'],
      required: true 
    },
    prompt: { type: String, maxlength: 500 },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending'
    },
    resultUrl: String,
    creditsUsed: { type: Number, default: 1 },
    messageId: String,
    timestamp: { type: Date, default: Date.now }
  }],
  
  // Settings
  settings: {
    defaultStyle: String,
    defaultAspectRatio: { type: String, default: '16:9' },
    notifyOnComplete: { type: Boolean, default: true },
    autoThread: { type: Boolean, default: true }
  }
}, {
  timestamps: true
});

// Indexes
discordUserSchema.index({ 'generations.id': 1 });
discordUserSchema.index({ 'generations.status': 1 });

// DATA MINIMIZATION: Auto-delete inactive Discord users after 90 days
discordUserSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

// Methods
discordUserSchema.methods.hasEnoughCredits = function(amount: number): boolean {
  return this.credits >= amount;
};

discordUserSchema.methods.deductCredits = async function(amount: number): Promise<boolean> {
  if (this.credits < amount) return false;
  
  this.credits -= amount;
  this.totalCreditsSpent += amount;
  await this.save();
  return true;
};

discordUserSchema.methods.addCredits = async function(amount: number): Promise<void> {
  this.credits += amount;
  this.totalCreditsEarned += amount;
  await this.save();
};

// Statics
discordUserSchema.statics.findByDiscordId = function(discordId: string) {
  return this.findOne({ discordId });
};

// DATA MINIMIZATION: Only store essential Discord info
discordUserSchema.statics.findOrCreate = async function(discordUser: {
  id: string;
  username: string;
}) {
  let user = await this.findOne({ discordId: discordUser.id });
  
  if (!user) {
    user = await this.create({
      discordId: discordUser.id,
      discordUsername: discordUser.username,
      credits: 0,
      generations: [],
      settings: {
        notifyOnComplete: true,
        autoThread: true
      }
    });
  } else {
    // Update username if changed
    user.discordUsername = discordUser.username;
    await user.save();
  }
  
  return user;
};

export const DiscordUser = mongoose.model<IDiscordUser>('DiscordUser', discordUserSchema);

export default DiscordUser;

