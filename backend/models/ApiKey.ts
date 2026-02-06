/**
 * API Key Model - MongoDB Schema
 * Enables external agents to authenticate via API keys with prepaid credits
 * Supports rate limiting, usage tracking, and credit budgets per key
 */
import mongoose, { type Document, type Model } from 'mongoose';
import crypto from 'crypto';
import logger from '../utils/logger.js';

// Types
export interface IApiKey extends Document {
  /** The hashed API key (never store raw keys) */
  keyHash: string;
  /** Key prefix for identification (first 8 chars, e.g., "sk_live_ab") */
  keyPrefix: string;
  /** Human-readable label for the key */
  name: string;
  /** Owner user ID (links to User model) */
  ownerId: string;
  /** Owner wallet address (optional) */
  ownerWallet?: string;
  /** Credit balance allocated to this key */
  credits: number;
  /** Total credits ever loaded onto this key */
  totalCreditsLoaded: number;
  /** Total credits spent via this key */
  totalCreditsSpent: number;
  /** Rate limit: max requests per minute */
  rateLimitPerMinute: number;
  /** Rate limit: max requests per day */
  rateLimitPerDay: number;
  /** Allowed tool categories (empty = all allowed) */
  allowedCategories: string[];
  /** Allowed specific tool IDs (empty = all allowed) */
  allowedTools: string[];
  /** Webhook URL for async result delivery */
  webhookUrl?: string;
  /** Webhook secret for HMAC signature verification */
  webhookSecret?: string;
  /** Whether the key is currently active */
  active: boolean;
  /** When the key was last used */
  lastUsedAt?: Date;
  /** Total number of requests made with this key */
  totalRequests: number;
  /** When the key expires (null = never) */
  expiresAt?: Date;
  /** IP allowlist (empty = all IPs allowed) */
  ipAllowlist: string[];
  /** Creation timestamp */
  createdAt: Date;
  /** Update timestamp */
  updatedAt: Date;
  /** Usage stats per tool */
  usageByTool: Array<{
    toolId: string;
    requestCount: number;
    creditsSpent: number;
    lastUsedAt: Date;
  }>;
}

interface ApiKeyModel extends Model<IApiKey> {
  /** Find an API key by its raw key string */
  findByKey(rawKey: string): Promise<IApiKey | null>;
  /** Generate a new API key pair (raw key + document) */
  generateKey(params: {
    name: string;
    ownerId: string;
    ownerWallet?: string;
    credits?: number;
    rateLimitPerMinute?: number;
    rateLimitPerDay?: number;
    allowedCategories?: string[];
    allowedTools?: string[];
    webhookUrl?: string;
    expiresAt?: Date;
    ipAllowlist?: string[];
  }): Promise<{ rawKey: string; apiKey: IApiKey }>;
}

const usageByToolSchema = new mongoose.Schema({
  toolId: { type: String, required: true },
  requestCount: { type: Number, default: 0 },
  creditsSpent: { type: Number, default: 0 },
  lastUsedAt: { type: Date, default: Date.now },
}, { _id: false });

const apiKeySchema = new mongoose.Schema<IApiKey>({
  keyHash: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  keyPrefix: {
    type: String,
    required: true,
    index: true,
  },
  name: {
    type: String,
    required: true,
    maxlength: 100,
    trim: true,
  },
  ownerId: {
    type: String,
    required: true,
    index: true,
  },
  ownerWallet: {
    type: String,
    sparse: true,
  },
  credits: {
    type: Number,
    default: 0,
    min: 0,
  },
  totalCreditsLoaded: {
    type: Number,
    default: 0,
    min: 0,
  },
  totalCreditsSpent: {
    type: Number,
    default: 0,
    min: 0,
  },
  rateLimitPerMinute: {
    type: Number,
    default: 60,
    min: 1,
    max: 1000,
  },
  rateLimitPerDay: {
    type: Number,
    default: 10000,
    min: 1,
    max: 1000000,
  },
  allowedCategories: {
    type: [String],
    default: [],
  },
  allowedTools: {
    type: [String],
    default: [],
  },
  webhookUrl: {
    type: String,
    validate: {
      validator: function(v: string) {
        if (!v) return true;
        try {
          const url = new URL(v);
          return url.protocol === 'https:' || url.protocol === 'http:';
        } catch {
          return false;
        }
      },
      message: 'Webhook URL must be a valid HTTP(S) URL',
    },
  },
  webhookSecret: {
    type: String,
    select: false, // Don't return in queries by default
  },
  active: {
    type: Boolean,
    default: true,
  },
  lastUsedAt: {
    type: Date,
  },
  totalRequests: {
    type: Number,
    default: 0,
    min: 0,
  },
  expiresAt: {
    type: Date,
    sparse: true,
  },
  ipAllowlist: {
    type: [String],
    default: [],
  },
  usageByTool: {
    type: [usageByToolSchema],
    default: [],
    validate: {
      validator: function(v: unknown[]) { return v.length <= 200; },
      message: 'Usage tracking limited to 200 tools',
    },
  },
}, {
  timestamps: true,
});

// Indexes
apiKeySchema.index({ ownerId: 1, active: 1 });
apiKeySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // Auto-cleanup expired keys
apiKeySchema.index({ active: 1, lastUsedAt: -1 });

/**
 * Hash an API key for storage
 */
function hashKey(rawKey: string): string {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

/**
 * Generate a cryptographically secure API key
 * Format: sk_live_<32 random hex chars>
 */
function generateRawKey(): string {
  const randomBytes = crypto.randomBytes(24).toString('hex');
  return `sk_live_${randomBytes}`;
}

/**
 * Static method: Find API key by raw key
 */
apiKeySchema.statics.findByKey = async function(rawKey: string): Promise<IApiKey | null> {
  const hash = hashKey(rawKey);
  const key = await this.findOne({ keyHash: hash, active: true });
  
  if (!key) return null;
  
  // Check expiration
  if (key.expiresAt && key.expiresAt < new Date()) {
    logger.info('API key expired', { keyPrefix: key.keyPrefix });
    return null;
  }
  
  return key;
};

/**
 * Static method: Generate a new API key
 */
apiKeySchema.statics.generateKey = async function(params: {
  name: string;
  ownerId: string;
  ownerWallet?: string;
  credits?: number;
  rateLimitPerMinute?: number;
  rateLimitPerDay?: number;
  allowedCategories?: string[];
  allowedTools?: string[];
  webhookUrl?: string;
  expiresAt?: Date;
  ipAllowlist?: string[];
}): Promise<{ rawKey: string; apiKey: IApiKey }> {
  const rawKey = generateRawKey();
  const keyHash = hashKey(rawKey);
  const keyPrefix = rawKey.substring(0, 12); // "sk_live_xxxx"
  const webhookSecret = crypto.randomBytes(32).toString('hex');
  
  const apiKey = await this.create({
    keyHash,
    keyPrefix,
    name: params.name,
    ownerId: params.ownerId,
    ownerWallet: params.ownerWallet,
    credits: params.credits || 0,
    totalCreditsLoaded: params.credits || 0,
    rateLimitPerMinute: params.rateLimitPerMinute || 60,
    rateLimitPerDay: params.rateLimitPerDay || 10000,
    allowedCategories: params.allowedCategories || [],
    allowedTools: params.allowedTools || [],
    webhookUrl: params.webhookUrl,
    webhookSecret,
    expiresAt: params.expiresAt,
    ipAllowlist: params.ipAllowlist || [],
  });
  
  logger.info('API key generated', {
    keyPrefix,
    ownerId: params.ownerId,
    name: params.name,
  });
  
  return { rawKey, apiKey };
};

const ApiKey = mongoose.model<IApiKey, ApiKeyModel>('ApiKey', apiKeySchema);

export default ApiKey;
