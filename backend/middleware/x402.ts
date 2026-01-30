/**
 * x402 Payment Middleware
 * Handles pay-per-request payments via Coinbase's x402 protocol
 * 
 * x402 is an HTTP-native payment protocol that uses the 402 Payment Required
 * status code to enable micropayments for API calls.
 * 
 * @see https://docs.cdp.coinbase.com/x402/welcome
 */

// Note: x402 packages use ESM-only type declarations (.d.mts)
// Using dynamic imports to work with the current moduleResolution setting
// @ts-expect-error - x402 packages have .d.mts types that require bundler/nodenext moduleResolution
import { paymentMiddleware, x402ResourceServer } from '@x402/express';
// @ts-expect-error - x402 packages have .d.mts types that require bundler/nodenext moduleResolution  
import { ExactEvmScheme } from '@x402/evm/exact/server';
// @ts-expect-error - x402 packages have .d.mts types that require bundler/nodenext moduleResolution
import { HTTPFacilitatorClient } from '@x402/core/server';
import type { Application } from 'express';
import logger from '../utils/logger';
import { X402_PRICES } from '../config/constants';

// =============================================================================
// Configuration
// =============================================================================

// Wallet address to receive payments
const X402_WALLET_ADDRESS = process.env.X402_WALLET_ADDRESS || 
                            process.env.EVM_PAYMENT_WALLET_ADDRESS ||
                            process.env.VITE_BASE_PAYMENT_WALLET;

// Network configuration (CAIP-2 format)
// Base Mainnet: eip155:8453
// Base Sepolia (testnet): eip155:84532
const X402_NETWORK = process.env.X402_NETWORK || 'eip155:8453';

// Facilitator URL
// Testnet: https://x402.org/facilitator
// Mainnet: https://api.cdp.coinbase.com/platform/v2/x402
const X402_FACILITATOR_URL = process.env.X402_FACILITATOR_URL || 
  (process.env.NODE_ENV === 'production' 
    ? 'https://api.cdp.coinbase.com/platform/v2/x402'
    : 'https://x402.org/facilitator');

// Re-export X402_PRICES for convenience
export { X402_PRICES };

// =============================================================================
// Route Configuration
// =============================================================================

/**
 * Define all routes that require payment
 * Format: "METHOD /path": { price, description, mimeType }
 * 
 * Route paths must match the actual Express routes:
 * - /api/generate/* - image, video, music generation
 * - /api/model3d/* - 3D model generation
 * - /api/extract-layers - layer extraction
 * - /api/image-tools/* - face swap, inpaint, etc.
 * - /api/audio/* - audio processing
 */
export function getRouteConfig(payTo: string, network: string) {
  return {
    // ===========================================
    // Image Generation (/api/generate/image)
    // Supports multiple models via 'model' body param
    // ===========================================
    'POST /api/generate/image': {
      accepts: [{
        scheme: 'exact',
        price: X402_PRICES.IMAGE_FLUX_PRO,
        network,
        payTo,
      }],
      description: 'Generate AI images (Flux Pro, Flux 2, Nano Banana)',
      mimeType: 'application/json',
    },
    'POST /api/generate/image-stream': {
      accepts: [{
        scheme: 'exact',
        price: X402_PRICES.IMAGE_FLUX_PRO,
        network,
        payTo,
      }],
      description: 'Generate AI images with streaming response',
      mimeType: 'application/json',
    },
    
    // ===========================================
    // Video Generation (/api/generate/video)
    // ===========================================
    'POST /api/generate/video': {
      accepts: [{
        scheme: 'exact',
        price: X402_PRICES.VIDEO_VEO_FAST,
        network,
        payTo,
      }],
      description: 'Generate AI videos (Veo 3.1, LTX)',
      mimeType: 'application/json',
    },
    
    // ===========================================
    // Music Generation (/api/generate/music)
    // ===========================================
    'POST /api/generate/music': {
      accepts: [{
        scheme: 'exact',
        price: X402_PRICES.MUSIC_PER_MINUTE,
        network,
        payTo,
      }],
      description: 'Generate AI music',
      mimeType: 'application/json',
    },
    
    // ===========================================
    // Video to Audio (/api/generate/video-to-audio)
    // ===========================================
    'POST /api/generate/video-to-audio': {
      accepts: [{
        scheme: 'exact',
        price: X402_PRICES.VIDEO_TO_AUDIO,
        network,
        payTo,
      }],
      description: 'Generate synced audio from video',
      mimeType: 'application/json',
    },
    
    // ===========================================
    // Upscale (/api/generate/upscale)
    // ===========================================
    'POST /api/generate/upscale': {
      accepts: [{
        scheme: 'exact',
        price: X402_PRICES.UPSCALE_2X,
        network,
        payTo,
      }],
      description: 'Upscale images using AI',
      mimeType: 'application/json',
    },
    
    // ===========================================
    // Layer Extraction (/api/extract-layers)
    // ===========================================
    'POST /api/extract-layers': {
      accepts: [{
        scheme: 'exact',
        price: X402_PRICES.LAYER_EXTRACTION,
        network,
        payTo,
      }],
      description: 'Extract layers from images',
      mimeType: 'application/json',
    },
    
    // ===========================================
    // 3D Models (/api/model3d/generate)
    // ===========================================
    'POST /api/model3d/generate': {
      accepts: [{
        scheme: 'exact',
        price: X402_PRICES.MODEL_3D_NORMAL,
        network,
        payTo,
      }],
      description: 'Generate 3D models from images using Hunyuan3D',
      mimeType: 'application/json',
    },
    
    // ===========================================
    // Audio Processing (/api/audio/*)
    // ===========================================
    'POST /api/audio/voice-clone': {
      accepts: [{
        scheme: 'exact',
        price: X402_PRICES.VOICE_CLONE,
        network,
        payTo,
      }],
      description: 'Clone voice from audio sample',
      mimeType: 'application/json',
    },
    'POST /api/audio/separate': {
      accepts: [{
        scheme: 'exact',
        price: X402_PRICES.STEM_SEPARATE,
        network,
        payTo,
      }],
      description: 'Separate audio stems (vocals, drums, etc.)',
      mimeType: 'application/json',
    },
    'POST /api/audio/sfx': {
      accepts: [{
        scheme: 'exact',
        price: X402_PRICES.SFX,
        network,
        payTo,
      }],
      description: 'Generate sound effects',
      mimeType: 'application/json',
    },
    
    // ===========================================
    // Image Tools (/api/image-tools/*)
    // ===========================================
    'POST /api/image-tools/face-swap': {
      accepts: [{
        scheme: 'exact',
        price: X402_PRICES.FACE_SWAP,
        network,
        payTo,
      }],
      description: 'Swap faces between images',
      mimeType: 'application/json',
    },
    'POST /api/image-tools/inpaint': {
      accepts: [{
        scheme: 'exact',
        price: X402_PRICES.INPAINT,
        network,
        payTo,
      }],
      description: 'Inpaint/edit parts of an image',
      mimeType: 'application/json',
    },
    'POST /api/image-tools/outpaint': {
      accepts: [{
        scheme: 'exact',
        price: X402_PRICES.OUTPAINT,
        network,
        payTo,
      }],
      description: 'Extend image beyond its borders',
      mimeType: 'application/json',
    },
    'POST /api/image-tools/describe': {
      accepts: [{
        scheme: 'exact',
        price: X402_PRICES.DESCRIBE,
        network,
        payTo,
      }],
      description: 'Generate description/caption for image',
      mimeType: 'application/json',
    },
  };
}

// =============================================================================
// Middleware Setup
// =============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let x402Server: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let x402Middleware: any = null;

/**
 * Initialize the x402 payment system
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function initializeX402(): { middleware: any; server: any } | null {
  if (!X402_WALLET_ADDRESS) {
    logger.warn('x402: No wallet address configured. Payment middleware disabled.');
    logger.warn('x402: Set X402_WALLET_ADDRESS or EVM_PAYMENT_WALLET_ADDRESS env var.');
    return null;
  }

  try {
    // Create facilitator client
    const facilitatorClient = new HTTPFacilitatorClient({
      url: X402_FACILITATOR_URL,
    });

    // Create resource server and register EVM scheme
    x402Server = new x402ResourceServer(facilitatorClient)
      .register(X402_NETWORK, new ExactEvmScheme());

    // Create payment middleware
    const routeConfig = getRouteConfig(X402_WALLET_ADDRESS, X402_NETWORK);
    x402Middleware = paymentMiddleware(routeConfig, x402Server);

    logger.info('x402: Payment middleware initialized', {
      network: X402_NETWORK,
      facilitator: X402_FACILITATOR_URL,
      wallet: X402_WALLET_ADDRESS.substring(0, 10) + '...',
      routes: Object.keys(routeConfig).length,
    });

    return { middleware: x402Middleware, server: x402Server };
  } catch (error) {
    logger.error('x402: Failed to initialize payment middleware', {
      error: (error as Error).message,
    });
    return null;
  }
}

/**
 * Apply x402 payment middleware to an Express app
 */
export function applyX402Middleware(app: Application): boolean {
  const result = initializeX402();
  
  if (result) {
    app.use(result.middleware);
    logger.info('x402: Payment middleware applied to Express app');
    return true;
  }
  
  return false;
}

/**
 * Get the current x402 configuration
 */
export function getX402Config() {
  return {
    enabled: !!X402_WALLET_ADDRESS,
    wallet: X402_WALLET_ADDRESS,
    network: X402_NETWORK,
    facilitator: X402_FACILITATOR_URL,
    prices: X402_PRICES,
    isTestnet: X402_NETWORK.includes('84532') || X402_NETWORK.includes('devnet'),
  };
}

export default {
  initializeX402,
  applyX402Middleware,
  getX402Config,
  X402_PRICES,
  getRouteConfig,
};
