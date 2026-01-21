/**
 * Referral Model - MongoDB Schema
 * Tracks individual referral events for analytics and fraud prevention
 */
import mongoose, { type Document, type Model } from 'mongoose';

export interface IReferral extends Document {
  referrerId: string;       // userId of the person who referred
  refereeId: string;        // userId of the person who was referred
  referralCode: string;     // The code that was used
  status: 'pending' | 'completed' | 'cancelled' | 'fraud';
  referrerCreditsAwarded: number;
  refereeCreditsAwarded: number;
  ipAddress?: string;       // For fraud detection
  userAgent?: string;       // For fraud detection
  completedAt?: Date;
  createdAt: Date;
}

interface ReferralModel extends Model<IReferral> {
  findByReferrerId(referrerId: string): Promise<IReferral[]>;
  findByRefereeId(refereeId: string): Promise<IReferral | null>;
  getLeaderboard(limit: number): Promise<{ userId: string; count: number; credits: number }[]>;
}

const referralSchema = new mongoose.Schema<IReferral>({
  referrerId: {
    type: String,
    required: true,
    index: true
  },
  refereeId: {
    type: String,
    required: true,
    unique: true,  // Each user can only be referred once
    index: true
  },
  referralCode: {
    type: String,
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'cancelled', 'fraud'],
    default: 'pending',
    index: true
  },
  referrerCreditsAwarded: {
    type: Number,
    default: 0,
    min: 0
  },
  refereeCreditsAwarded: {
    type: Number,
    default: 0,
    min: 0
  },
  ipAddress: {
    type: String,
    sparse: true
  },
  userAgent: {
    type: String,
    sparse: true
  },
  completedAt: {
    type: Date
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for analytics and queries
referralSchema.index({ createdAt: -1 });
referralSchema.index({ referrerId: 1, status: 1 });
referralSchema.index({ referrerId: 1, createdAt: -1 });

// Static methods
referralSchema.statics.findByReferrerId = function(referrerId: string): Promise<IReferral[]> {
  return this.find({ referrerId }).sort({ createdAt: -1 });
};

referralSchema.statics.findByRefereeId = function(refereeId: string): Promise<IReferral | null> {
  return this.findOne({ refereeId });
};

referralSchema.statics.getLeaderboard = async function(limit: number = 10): Promise<{ userId: string; count: number; credits: number }[]> {
  const result = await this.aggregate([
    { $match: { status: 'completed' } },
    {
      $group: {
        _id: '$referrerId',
        count: { $sum: 1 },
        credits: { $sum: '$referrerCreditsAwarded' }
      }
    },
    { $sort: { count: -1 } },
    { $limit: limit },
    {
      $project: {
        userId: '$_id',
        count: 1,
        credits: 1,
        _id: 0
      }
    }
  ]);
  return result;
};

const Referral = mongoose.model<IReferral, ReferralModel>('Referral', referralSchema);

export default Referral;
