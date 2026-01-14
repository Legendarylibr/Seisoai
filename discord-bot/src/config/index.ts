/**
 * Discord Bot Configuration
 * Loads environment variables and provides type-safe config
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env file from discord-bot directory
dotenv.config({ path: path.join(__dirname, '../../.env') });

// ============================================================================
// Production Domain Configuration
// Change this single value to update the domain everywhere in the codebase
// ============================================================================
export const PRODUCTION_DOMAIN = 'seisoai.com';
export const PRODUCTION_URL = `https://${PRODUCTION_DOMAIN}`;

export const config = {
  // Discord
  discord: {
    token: process.env.DISCORD_TOKEN || '',
    clientId: process.env.DISCORD_CLIENT_ID || '',
    guildId: process.env.DISCORD_GUILD_ID || '', // For development/testing
    privateChannelCategoryId: process.env.PRIVATE_CHANNEL_CATEGORY_ID || '',
    verifiedRoleId: process.env.VERIFIED_ROLE_ID || '', // Role given to users with credits
    mainChatChannelId: process.env.MAIN_CHAT_CHANNEL_ID || '', // Main chat requires verified role
  },
  
  // Database
  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/seisoai',
  },
  
  // Encryption
  encryption: {
    key: process.env.ENCRYPTION_KEY || '', // 64 hex chars (256 bits)
  },
  
  // FAL.ai
  fal: {
    apiKey: process.env.FAL_API_KEY || '',
  },
  
  // Credits
  credits: {
    freeOnLink: parseInt(process.env.FREE_CREDITS_ON_LINK || '5', 10),
    image: parseInt(process.env.DEFAULT_IMAGE_CREDITS || '1', 10),
    video: parseInt(process.env.DEFAULT_VIDEO_CREDITS || '8', 10),
    music: parseInt(process.env.DEFAULT_MUSIC_CREDITS || '2', 10),
    model3d: parseInt(process.env.DEFAULT_3D_CREDITS || '3', 10),
  },
  
  // Generation Limits
  limits: {
    maxPromptLength: 500,
    maxQueuePerUser: 3,
    videoMaxDuration: '8s',
    musicMaxDuration: 180,
    imageMaxBatch: 4,
  },
  
  // URLs
  urls: {
    website: process.env.WEBSITE_URL || PRODUCTION_URL,
    api: process.env.API_URL || process.env.WEBSITE_URL || PRODUCTION_URL,
  },
  
  // Health Check Server
  healthCheck: {
    port: parseInt(process.env.HEALTH_CHECK_PORT || '3002', 10),
    enabled: process.env.HEALTH_CHECK_ENABLED !== 'false',
  },
  
  // Shutdown
  shutdown: {
    timeoutMs: parseInt(process.env.SHUTDOWN_TIMEOUT_MS || '10000', 10),
  },
} as const;

// Environment type
export const isProduction = process.env.NODE_ENV === 'production';

// Validate required config
export function validateConfig(): boolean {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required in all environments
  const required = [
    { name: 'DISCORD_TOKEN', value: config.discord.token },
    { name: 'DISCORD_CLIENT_ID', value: config.discord.clientId },
    { name: 'FAL_API_KEY', value: config.fal.apiKey },
  ];
  
  const missing = required.filter(r => !r.value);
  if (missing.length > 0) {
    missing.forEach(m => errors.push(`Missing required: ${m.name}`));
  }

  // Required in production
  if (isProduction) {
    const botApiKey = process.env.DISCORD_BOT_API_KEY;
    if (!botApiKey || botApiKey.length < 32) {
      errors.push('DISCORD_BOT_API_KEY is required in production (minimum 32 characters)');
    }

    if (!process.env.API_URL) {
      errors.push('API_URL is required in production');
    }

    if (!process.env.MONGODB_URI) {
      errors.push('MONGODB_URI is required in production');
    }
  }

  // Validate encryption key format if provided
  if (config.encryption.key) {
    if (!/^[0-9a-fA-F]{64}$/.test(config.encryption.key)) {
      warnings.push('ENCRYPTION_KEY should be 64 hex characters (256 bits)');
    }
    // Check if it's the default placeholder
    if (config.encryption.key === '0000000000000000000000000000000000000000000000000000000000000000') {
      warnings.push('ENCRYPTION_KEY is set to default placeholder - change for production');
    }
  } else if (isProduction) {
    warnings.push('ENCRYPTION_KEY not set - field-level encryption disabled');
  }

  // Print warnings
  if (warnings.length > 0) {
    console.warn('⚠️  Configuration warnings:');
    warnings.forEach(w => console.warn(`  - ${w}`));
  }

  // Print errors and fail if any
  if (errors.length > 0) {
    console.error('❌ Configuration errors:');
    errors.forEach(e => console.error(`  - ${e}`));
    return false;
  }
  
  return true;
}

export default config;

