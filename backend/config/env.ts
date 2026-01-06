/**
 * Environment configuration
 * Loads and validates environment variables
 */
import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from backend.env
const envPath = path.join(__dirname, '..', '..', 'backend.env');
dotenv.config({ path: envPath });

// Required environment variables
const REQUIRED_VARS = ['JWT_SECRET'];

// Validate required vars - enforce in all environments for security
const missingVars = REQUIRED_VARS.filter(v => !process.env[v]);
if (missingVars.length > 0) {
  console.error('SECURITY ERROR: Missing required environment variables:', missingVars);
  console.error('Please set these variables in your backend.env file');
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  } else {
    console.warn('WARNING: Running without proper security configuration. This is not safe for production.');
  }
}

// Validate JWT_SECRET minimum length
if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
  console.error('SECURITY ERROR: JWT_SECRET must be at least 32 characters long');
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
}

// Warn about permissive CORS in production
if (process.env.NODE_ENV === 'production') {
  const allowedOrigins = process.env.ALLOWED_ORIGINS;
  if (!allowedOrigins || allowedOrigins.trim() === '' || allowedOrigins === '*') {
    console.warn('SECURITY WARNING: CORS is set to allow all origins in production.');
    console.warn('This is acceptable for in-app browsers (Twitter, Instagram) but should be restricted for web-only deployments.');
    console.warn('Consider setting ALLOWED_ORIGINS to specific domains in production.');
  }
}

// Export validated env vars
export interface Config {
  PORT: number;
  NODE_ENV: string;
  HOST?: string;
  API_VERSION: string;
  MONGODB_URI?: string;
  REDIS_URL?: string;
  JWT_SECRET?: string;
  JWT_REFRESH_SECRET?: string;
  SESSION_SECRET?: string;
  FAL_API_KEY?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  ALLOWED_ORIGINS?: string;
  ETH_RPC_URL?: string;
  POLYGON_RPC_URL?: string;
  ARBITRUM_RPC_URL?: string;
  OPTIMISM_RPC_URL?: string;
  BASE_RPC_URL?: string;
  SOLANA_RPC_URL?: string;
  EVM_PAYMENT_WALLET?: string;
  SOLANA_PAYMENT_WALLET?: string;
  isProduction: boolean;
  isDevelopment: boolean;
}

export const config: Config = {
  // Server
  PORT: parseInt(process.env.PORT || '3001', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  HOST: process.env.HOST,
  API_VERSION: process.env.API_VERSION || 'v1',
  
  // Database
  MONGODB_URI: process.env.MONGODB_URI,
  REDIS_URL: process.env.REDIS_URL,
  
  // Security
  JWT_SECRET: process.env.JWT_SECRET,
  // Derive JWT_REFRESH_SECRET from JWT_SECRET if not provided (same as server.js)
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 
    (process.env.JWT_SECRET ? crypto.createHash('sha256').update(process.env.JWT_SECRET + '_refresh_token_salt').digest('hex') : undefined),
  SESSION_SECRET: process.env.SESSION_SECRET,
  
  // APIs
  FAL_API_KEY: process.env.FAL_API_KEY,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  
  // CORS
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
  
  // RPC URLs
  ETH_RPC_URL: process.env.ETH_RPC_URL,
  POLYGON_RPC_URL: process.env.POLYGON_RPC_URL,
  ARBITRUM_RPC_URL: process.env.ARBITRUM_RPC_URL,
  OPTIMISM_RPC_URL: process.env.OPTIMISM_RPC_URL,
  BASE_RPC_URL: process.env.BASE_RPC_URL,
  SOLANA_RPC_URL: process.env.SOLANA_RPC_URL,
  
  // Payment wallets
  EVM_PAYMENT_WALLET: process.env.EVM_PAYMENT_WALLET_ADDRESS || 
                      process.env.ETH_PAYMENT_WALLET ||
                      process.env.POLYGON_PAYMENT_WALLET,
  SOLANA_PAYMENT_WALLET: process.env.SOLANA_PAYMENT_WALLET_ADDRESS ||
                         process.env.SOLANA_PAYMENT_WALLET,
  
  // Flags
  isProduction: process.env.NODE_ENV === 'production',
  isDevelopment: process.env.NODE_ENV !== 'production'
};

export default config;

