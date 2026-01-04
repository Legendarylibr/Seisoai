/**
 * Application constants
 * Centralized configuration values
 */

// Types
export interface CreditsConfig {
  IMAGE_GENERATION: number;
  IMAGE_GENERATION_FLUX_2: number;
  IMAGE_GENERATION_NANO: number;
  IMAGE_GENERATION_MULTI: number;
  VIDEO_GENERATION_PER_SECOND: number;
  VIDEO_GENERATION_MINIMUM: number;
  MUSIC_GENERATION_PER_MINUTE: number;
  VIDEO_TO_AUDIO: number;
  LAYER_EXTRACTION: number;
}

export interface FreeImageLimits {
  PER_IP_REGULAR: number;
  PER_IP_NFT: number;
  GLOBAL_REGULAR: number;
  GLOBAL_NFT: number;
}

export interface RateLimitConfig {
  windowMs: number;
  max: number;
}

export interface RateLimitsConfig {
  GENERAL: RateLimitConfig;
  AUTH: RateLimitConfig;
  PAYMENT: RateLimitConfig;
  INSTANT_CHECK: RateLimitConfig;
  FREE_IMAGE: RateLimitConfig;
}

export interface FileLimits {
  VIDEO_MAX_SIZE: number;
  IMAGE_MAX_SIZE: number;
  JSON_MAX_SIZE: string;
}

export interface CacheConfig {
  TRANSACTION_CACHE_SIZE: number;
  TOKEN_BLACKLIST_SIZE: number;
  NFT_HOLDINGS_TTL: number;
  DUPLICATE_PREVENTION_TTL: number;
}

export interface JWTConfig {
  ACCESS_TOKEN_EXPIRY: string;
  REFRESH_TOKEN_EXPIRY: string;
  MIN_SECRET_LENGTH: number;
}

export interface ChainInfo {
  id: number | string;
  name: string;
}

export interface SupportedChains {
  ethereum: ChainInfo;
  polygon: ChainInfo;
  arbitrum: ChainInfo;
  optimism: ChainInfo;
  base: ChainInfo;
  solana: ChainInfo;
}

// Credit costs - 20% above API cost, Nano Banana at 50% off (loss leader)
// 1 credit = $0.10
export const CREDITS: CreditsConfig = {
  IMAGE_GENERATION: 0.6,         // Flux Pro Kontext ($0.05 API × 1.2 = $0.06)
  IMAGE_GENERATION_FLUX_2: 0.3,  // Flux 2 ($0.025 API × 1.2 = $0.03)
  IMAGE_GENERATION_NANO: 1.25,   // Nano Banana Pro ($0.25 API × 0.5 = $0.125 - LOSS LEADER)
  IMAGE_GENERATION_MULTI: 0.6,   // Multi-image (same as Flux Pro)
  VIDEO_GENERATION_PER_SECOND: 2,
  VIDEO_GENERATION_MINIMUM: 2,
  MUSIC_GENERATION_PER_MINUTE: 0.25, // Music ($0.02/min API × 1.2 = $0.024/min)
  VIDEO_TO_AUDIO: 0.5,           // MMAudio V2 - Video to synced audio ($0.04 API × 1.2 ≈ $0.05)
  LAYER_EXTRACTION: 0.3          // Same as Flux 2
};

// Free image limits
export const FREE_IMAGE_LIMITS: FreeImageLimits = {
  PER_IP_REGULAR: 2,
  PER_IP_NFT: 5,
  GLOBAL_REGULAR: 300,
  GLOBAL_NFT: 500
};

// Rate limiting
export const RATE_LIMITS: RateLimitsConfig = {
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
export const FILE_LIMITS: FileLimits = {
  VIDEO_MAX_SIZE: 50 * 1024 * 1024, // 50MB
  IMAGE_MAX_SIZE: 10 * 1024 * 1024, // 10MB
  JSON_MAX_SIZE: '200mb'
};

// Cache settings
export const CACHE: CacheConfig = {
  TRANSACTION_CACHE_SIZE: 1000,
  TOKEN_BLACKLIST_SIZE: 10000,
  NFT_HOLDINGS_TTL: 5 * 60 * 1000, // 5 minutes
  DUPLICATE_PREVENTION_TTL: 30 * 1000 // 30 seconds
};

// JWT settings
export const JWT: JWTConfig = {
  ACCESS_TOKEN_EXPIRY: '24h',
  REFRESH_TOKEN_EXPIRY: '30d',
  MIN_SECRET_LENGTH: 32
};

// Supported blockchain networks
export const SUPPORTED_CHAINS: SupportedChains = {
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

