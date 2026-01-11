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

export const config = {
  // Discord
  discord: {
    token: process.env.DISCORD_TOKEN || '',
    clientId: process.env.DISCORD_CLIENT_ID || '',
    guildId: process.env.DISCORD_GUILD_ID || '', // For development/testing
    privateChannelCategoryId: process.env.PRIVATE_CHANNEL_CATEGORY_ID || '',
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
    website: process.env.WEBSITE_URL || 'https://seisoai.com',
  }
} as const;

// Validate required config
export function validateConfig(): boolean {
  const required = [
    { name: 'DISCORD_TOKEN', value: config.discord.token },
    { name: 'DISCORD_CLIENT_ID', value: config.discord.clientId },
    { name: 'FAL_API_KEY', value: config.fal.apiKey },
  ];
  
  const missing = required.filter(r => !r.value);
  
  if (missing.length > 0) {
    console.error('Missing required environment variables:');
    missing.forEach(m => console.error(`  - ${m.name}`));
    return false;
  }
  
  return true;
}

export default config;

