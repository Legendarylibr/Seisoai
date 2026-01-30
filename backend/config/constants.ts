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
  VIDEO_LTX_PER_SECOND: number;
  VIDEO_LTX_MINIMUM: number;
  MUSIC_GENERATION_PER_MINUTE: number;
  VIDEO_TO_AUDIO: number;
  LAYER_EXTRACTION: number;
  MODEL_3D_NORMAL: number;
  MODEL_3D_LOWPOLY: number;
  MODEL_3D_GEOMETRY: number;
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

// Daily credits configuration for NFT/Token holders
export interface DailyCreditsConfig {
  NFT_HOLDER_DAILY_CREDITS: number;
  TOKEN_HOLDER_DAILY_CREDITS: number;
  MINIMUM_TOKEN_BALANCE: number;
}

// SEISO Token configuration
export interface TokenConfig {
  CONTRACT_ADDRESS: string;
  CHAIN_ID: number;
  DECIMALS: number;
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

// Credit costs - at API cost (no markup)
// 1 credit = $0.10
// NOTE: Credits system is deprecated - x402 pay-per-request is now the primary payment method
export const CREDITS: CreditsConfig = {
  IMAGE_GENERATION: 0.5,         // Flux Pro Kontext ($0.05 API)
  IMAGE_GENERATION_FLUX_2: 0.25, // Flux 2 ($0.025 API)
  IMAGE_GENERATION_NANO: 2.5,    // Nano Banana Pro ($0.25 API)
  IMAGE_GENERATION_MULTI: 0.5,   // Multi-image (same as Flux Pro)
  VIDEO_GENERATION_PER_SECOND: 2.2, // Veo 3.1 fast ($0.22/s API)
  VIDEO_GENERATION_MINIMUM: 2,
  VIDEO_LTX_PER_SECOND: 0.4,     // LTX-2 19B ($0.04/s API)
  VIDEO_LTX_MINIMUM: 2,          // LTX-2 minimum credits
  MUSIC_GENERATION_PER_MINUTE: 0.2, // Music ($0.02/min API)
  VIDEO_TO_AUDIO: 0.4,           // MMAudio V2 ($0.04 API)
  LAYER_EXTRACTION: 0.25,        // Same as Flux 2 ($0.025 API)
  MODEL_3D_NORMAL: 2.5,          // Hunyuan3D V3 with full textures + PBR ($0.25 API)
  MODEL_3D_LOWPOLY: 2.5,         // Hunyuan3D V3 with optimized mesh + textures ($0.25 API)
  MODEL_3D_GEOMETRY: 2           // Hunyuan3D V3 geometry only ($0.20 API)
};

// x402 Payment Configuration (pay-per-request at API cost)
// All prices in USD - used by x402 middleware for HTTP 402 payments
// @see https://docs.cdp.coinbase.com/x402/welcome
export interface X402PricesConfig {
  // Image Generation
  IMAGE_FLUX_PRO: string;
  IMAGE_FLUX_2: string;
  IMAGE_NANO_BANANA: string;
  IMAGE_MULTI: string;
  // Video Generation
  VIDEO_LTX_PER_SECOND: string;
  VIDEO_VEO_FAST: string;
  VIDEO_VEO_QUALITY: string;
  // Audio
  MUSIC_PER_MINUTE: string;
  VIDEO_TO_AUDIO: string;
  VOICE_CLONE: string;
  STEM_SEPARATE: string;
  SFX: string;
  // Image Tools
  LAYER_EXTRACTION: string;
  UPSCALE_2X: string;
  UPSCALE_4X: string;
  FACE_SWAP: string;
  INPAINT: string;
  OUTPAINT: string;
  DESCRIBE: string;
  // 3D Models
  MODEL_3D_NORMAL: string;
  MODEL_3D_LOWPOLY: string;
  MODEL_3D_GEOMETRY: string;
}

export const X402_PRICES: X402PricesConfig = {
  // Image Generation (at API cost)
  IMAGE_FLUX_PRO: '$0.05',
  IMAGE_FLUX_2: '$0.025',
  IMAGE_NANO_BANANA: '$0.25',
  IMAGE_MULTI: '$0.05',
  // Video Generation
  VIDEO_LTX_PER_SECOND: '$0.04',
  VIDEO_VEO_FAST: '$0.22',
  VIDEO_VEO_QUALITY: '$0.55',
  // Audio
  MUSIC_PER_MINUTE: '$0.02',
  VIDEO_TO_AUDIO: '$0.04',
  VOICE_CLONE: '$0.10',
  STEM_SEPARATE: '$0.20',
  SFX: '$0.10',
  // Image Tools
  LAYER_EXTRACTION: '$0.025',
  UPSCALE_2X: '$0.02',
  UPSCALE_4X: '$0.04',
  FACE_SWAP: '$0.20',
  INPAINT: '$0.20',
  OUTPAINT: '$0.20',
  DESCRIBE: '$0.05',
  // 3D Models
  MODEL_3D_NORMAL: '$0.25',
  MODEL_3D_LOWPOLY: '$0.25',
  MODEL_3D_GEOMETRY: '$0.20',
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

// Pagination limits - prevent DoS via large page/offset requests
export interface PaginationConfig {
  DEFAULT_LIMIT: number;
  MAX_LIMIT: number;
  MAX_SKIP: number;
  MAX_PAGE: number;
}

export const PAGINATION: PaginationConfig = {
  DEFAULT_LIMIT: 50,      // Default items per page
  MAX_LIMIT: 1000,        // Maximum items per request
  MAX_SKIP: 100000,       // Maximum offset (prevents scanning entire collection)
  MAX_PAGE: 1000,         // Maximum page number (with MAX_LIMIT, allows 1M records)
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

// Daily credits for NFT and Token holders (20 credits per day each)
export const DAILY_CREDITS: DailyCreditsConfig = {
  NFT_HOLDER_DAILY_CREDITS: 20,
  TOKEN_HOLDER_DAILY_CREDITS: 20,
  MINIMUM_TOKEN_BALANCE: 1  // Minimum tokens required for daily credits
};

// SEISO ERC-20 Token configuration
// TODO: Update CONTRACT_ADDRESS when token is deployed
export const SEISO_TOKEN: TokenConfig = {
  CONTRACT_ADDRESS: '',  // Empty until token is deployed
  CHAIN_ID: 1,           // Ethereum mainnet (update as needed)
  DECIMALS: 18           // Standard ERC-20 decimals
};

// NFT contracts that qualify for daily credits
// Add NFT contract addresses here to enable NFT holder benefits
export interface QualifyingNFT {
  contractAddress: string;
  chainId: string;
  name: string;
}

export const QUALIFYING_NFT_CONTRACTS: QualifyingNFT[] = [
  // Add your NFT contract addresses here
  // Example:
  // { contractAddress: '0x...', chainId: '1', name: 'Seiso Genesis' },
  // { contractAddress: '0x...', chainId: '137', name: 'Seiso Polygon' },
];

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
  X402_PRICES,
  FREE_IMAGE_LIMITS,
  RATE_LIMITS,
  PAGINATION,
  FILE_LIMITS,
  CACHE,
  JWT,
  SUPPORTED_CHAINS,
  DAILY_CREDITS,
  SEISO_TOKEN
};

