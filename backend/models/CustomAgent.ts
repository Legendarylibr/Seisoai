/**
 * CustomAgent Model - MongoDB Schema
 * Persistent storage for user-created agents (replaces in-memory globalThis._customAgents)
 */
import mongoose, { type Document, type Model } from 'mongoose';

export interface ICustomAgent extends Document {
  agentId: string;
  name: string;
  description: string;
  type: string;
  tools: string[];
  owner: string;
  agentURI: string;
  registration: Record<string, unknown>;
  skillMd: string;
  systemPrompt: string;
  imageUrl: string;
  services: Array<{ name: string; endpoint: string }>;
  /** Which Claude model powers this agent's reasoning */
  chatModel: string;
  isCustom: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const customAgentSchema = new mongoose.Schema<ICustomAgent>(
  {
    agentId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      minlength: 1,
      maxlength: 64,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      minlength: 1,
      maxlength: 256,
      trim: true,
    },
    type: {
      type: String,
      required: true,
      enum: ['Image Generation', 'Video Generation', 'Music Generation', 'Chat/Assistant', 'Multi-Modal', 'Custom'],
    },
    tools: {
      type: [String],
      required: true,
      validate: {
        validator: (v: string[]) => v.length > 0,
        message: 'At least one tool must be selected',
      },
    },
    owner: {
      type: String,
      required: true,
      index: true,
    },
    agentURI: {
      type: String,
      default: '',
    },
    registration: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    skillMd: {
      type: String,
      default: '',
    },
    systemPrompt: {
      type: String,
      default: '',
    },
    imageUrl: {
      type: String,
      default: 'https://seisoai.com/seiso-logo.png',
    },
    services: {
      type: [{ name: String, endpoint: String }],
      default: [],
    },
    chatModel: {
      type: String,
      default: 'claude-sonnet-4-5',
      enum: ['claude-opus-4-6', 'claude-sonnet-4-5', 'claude-haiku-4-5'],
    },
    isCustom: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for owner lookups
customAgentSchema.index({ owner: 1, createdAt: -1 });

const CustomAgent: Model<ICustomAgent> = mongoose.models.CustomAgent || mongoose.model<ICustomAgent>('CustomAgent', customAgentSchema);

export default CustomAgent;
