/**
 * Payment Model - Stores user payment/transaction history
 * Separated from User model to prevent document bloat
 */
import mongoose, { type Document, type Model } from 'mongoose';

// Types
interface PaymentMetadata {
  packageName?: string;
  bonusCredits?: number;
  promoCode?: string;
}

export interface IPayment extends Document {
  userId: string;
  paymentId: string;
  txHash?: string;
  type: 'crypto' | 'stripe' | 'nft_bonus' | 'referral' | 'admin' | 'subscription';
  tokenSymbol?: string;
  amount?: number;
  amountUSD?: number;
  credits: number;
  chainId?: string;
  walletType?: string;
  walletAddress?: string;
  stripePaymentId?: string;
  stripeSessionId?: string;
  subscriptionId?: string;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  metadata?: PaymentMetadata;
  createdAt: Date;
}

const paymentSchema = new mongoose.Schema<IPayment>({
  userId: {
    type: String,
    required: true,
    index: true
  },
  paymentId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  txHash: {
    type: String,
    index: true,
    sparse: true
  },
  type: {
    type: String,
    enum: ['crypto', 'stripe', 'nft_bonus', 'referral', 'admin', 'subscription'],
    default: 'crypto'
  },
  tokenSymbol: String,
  amount: Number,
  amountUSD: Number,
  credits: {
    type: Number,
    required: true
  },
  chainId: String,
  walletType: String,
  walletAddress: String,
  stripePaymentId: String,
  stripeSessionId: String,
  subscriptionId: {
    type: String,
    index: true,
    sparse: true
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'refunded'],
    default: 'completed'
  },
  metadata: {
    packageName: String,
    bonusCredits: Number,
    promoCode: String
  },
  // createdAt is auto-managed by timestamps: true
  // We define it here only to add the index
  createdAt: {
    type: Date,
    index: true
  }
}, {
  timestamps: true
});

// Compound index for efficient user queries
paymentSchema.index({ userId: 1, createdAt: -1 });

// NOTE: txHash already has index: true in field definition, no duplicate needed

// DATA RETENTION: Payment records are kept indefinitely (no TTL index)
// This is intentional for financial/legal compliance and dispute resolution
// Unlike Generation/GalleryItem which expire after 30 days

const Payment = mongoose.model<IPayment>('Payment', paymentSchema);

export default Payment;

