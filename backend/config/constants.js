/**
 * Application constants
 * Centralized configuration values
 */

// Credit costs
export const CREDITS = {
  IMAGE_GENERATION: 1,
  IMAGE_GENERATION_MULTI: 2,
  VIDEO_GENERATION_PER_SECOND: 2,
  VIDEO_GENERATION_MINIMUM: 2,
  MUSIC_GENERATION: 1,
  LAYER_EXTRACTION: 1
};

// Free image limits
export const FREE_IMAGE_LIMITS = {
  PER_IP_REGULAR: 2,
  PER_IP_NFT: 5,
  GLOBAL_REGULAR: 300,
  GLOBAL_NFT: 500
};

// Rate limiting
export const RATE_LIMITS = {
  GENERAL: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 500
  },
  AUTH: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10
  },
  PAYMENT: {
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 10
  },
  INSTANT_CHECK: {
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 300
  },
  FREE_IMAGE: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5
  }
};

// File size limits
export const FILE_LIMITS = {
  VIDEO_MAX_SIZE: 50 * 1024 * 1024, // 50MB
  IMAGE_MAX_SIZE: 10 * 1024 * 1024, // 10MB
  JSON_MAX_SIZE: '200mb'
};

// Cache settings
export const CACHE = {
  TRANSACTION_CACHE_SIZE: 1000,
  TOKEN_BLACKLIST_SIZE: 10000,
  NFT_HOLDINGS_TTL: 5 * 60 * 1000, // 5 minutes
  DUPLICATE_PREVENTION_TTL: 30 * 1000 // 30 seconds
};

// JWT settings
export const JWT = {
  ACCESS_TOKEN_EXPIRY: '24h',
  REFRESH_TOKEN_EXPIRY: '30d',
  MIN_SECRET_LENGTH: 32
};

// Supported blockchain networks
export const SUPPORTED_CHAINS = {
  ethereum: { id: 1, name: 'Ethereum' },
  polygon: { id: 137, name: 'Polygon' },
  arbitrum: { id: 42161, name: 'Arbitrum' },
  optimism: { id: 10, name: 'Optimism' },
  base: { id: 8453, name: 'Base' },
  solana: { id: 'solana', name: 'Solana' }
};

export default {
  CREDITS,
  FREE_IMAGE_LIMITS,
  RATE_LIMITS,
  FILE_LIMITS,
  CACHE,
  JWT,
  SUPPORTED_CHAINS
};



