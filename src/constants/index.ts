/**
 * Application-wide constants
 * Centralized location for magic numbers and configuration values
 */

// File size limits (in bytes)
export const FILE_LIMITS = {
  AUDIO_UPLOAD_MAX_BYTES: 25 * 1024 * 1024, // 25MB
  VIDEO_UPLOAD_MAX_BYTES: 100 * 1024 * 1024, // 100MB
  IMAGE_UPLOAD_MAX_BYTES: 10 * 1024 * 1024, // 10MB
} as const;

// Gallery and history limits
export const STORAGE_LIMITS = {
  GALLERY_MAX_ITEMS: 100,
  GENERATION_HISTORY_MAX_ITEMS: 500,
} as const;

// Text input limits
export const TEXT_LIMITS = {
  VOICE_TEXT_MAX_LENGTH: 5000,
  PROMPT_MAX_LENGTH: 2000,
} as const;

// Duration limits for generation
export const DURATION_LIMITS = {
  MUSIC_MIN_SECONDS: 15,
  MUSIC_MAX_SECONDS: 180,
  VIDEO_MIN_SECONDS: 3,
  VIDEO_MAX_SECONDS: 10,
} as const;

// Credit pricing
export const PRICING = {
  COST_PER_CREDIT_DEFAULT: 0.15,
  COST_PER_CREDIT_NFT_HOLDER: 0.06,
  CREDITS_PER_USDC_DEFAULT: 6.67,
  CREDITS_PER_USDC_NFT_HOLDER: 16.67,
} as const;

// API retry configuration
export const API_CONFIG = {
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 1000,
  REQUEST_TIMEOUT_MS: 30000,
} as const;

// Cache TTLs (in milliseconds)
export const CACHE_TTL = {
  CREDITS_MS: 60 * 1000, // 1 minute
  NFT_CHECK_MS: 5 * 60 * 1000, // 5 minutes
  USER_DATA_MS: 30 * 1000, // 30 seconds
} as const;

// Blockchain network configuration
export const EVM_CHAINS = {
  1: { name: 'Ethereum', symbol: 'ETH', decimals: 18 },
  137: { name: 'Polygon', symbol: 'MATIC', decimals: 18 },
  42161: { name: 'Arbitrum', symbol: 'ETH', decimals: 18 },
  10: { name: 'Optimism', symbol: 'ETH', decimals: 18 },
  8453: { name: 'Base', symbol: 'ETH', decimals: 18 },
} as const;

// Solana configuration
export const SOLANA_CONFIG = {
  USDC_MINT: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDC_DECIMALS: 6,
} as const;

// UI size constants
export const UI_SIZES = {
  MODAL_MAX_WIDTH: 640,
  MODAL_MAX_HEIGHT_RATIO: 0.9,
  THUMBNAIL_SIZE: 128,
} as const;
