/**
 * x402 Payment Middleware
 * Enables pay-per-request for AI agents using USDC on Base
 * 
 * This allows Claw/OpenClaw users (and any x402-compatible client)
 * to pay per request without needing a Seisoai account.
 * 
 * Uses Coinbase CDP facilitator for payment verification and settlement.
 * Requires CDP_API_KEY_ID and CDP_API_KEY_SECRET environment variables.
 */
import { paymentMiddlewareFromConfig } from '@x402/express';
import { HTTPFacilitatorClient } from '@x402/core/server';
import type { Request, Response, NextFunction } from 'express';
import config from '../config/env.js';
import logger from '../utils/logger.js';

// Coinbase CDP facilitator URL
const CDP_FACILITATOR_URL = 'https://api.cdp.coinbase.com/v2/x402';

// 30% markup over Fal.ai API costs
const MARKUP = 1.30;

// Fal.ai API costs (USD) - source of truth
export const FAL_API_COSTS = {
  // Image generation by model
  FLUX_PRO_KONTEXT: 0.05,      // Flux Pro Kontext (default)
  FLUX_2: 0.025,               // Flux 2
  NANO_BANANA: 0.25,           // Nano Banana Pro
  
  // Video generation (per second)
  VIDEO_PER_SECOND: 0.10,      // Kling/Minimax video
  
  // Music/Audio
  MUSIC_PER_MINUTE: 0.02,      // Music generation per minute
  SFX: 0.03,                   // Sound effects
  
  // Image tools
  UPSCALE: 0.03,               // Image upscaling
  DESCRIBE: 0.01,              // Image to text
  
  // Prompt lab
  PROMPT_LAB: 0.001,           // Prompt lab chat
};

// Apply 20% markup to Fal API cost
function priceUsd(falCost: number): string {
  const usd = falCost * MARKUP;
  return `$${usd.toFixed(4)}`;
}

// Payment wallet address (receives USDC payments)
const PAYMENT_WALLET = config.EVM_PAYMENT_WALLET || '';

// Dynamic price function for image generation based on model
function getImagePrice(context: { body?: { model?: string } }): string {
  const model = context.body?.model || 'flux-pro';
  
  switch (model) {
    case 'flux-2':
      return priceUsd(FAL_API_COSTS.FLUX_2);  // $0.03
    case 'nano-banana-pro':
      return priceUsd(FAL_API_COSTS.NANO_BANANA);  // $0.30
    case 'flux-pro':
    default:
      return priceUsd(FAL_API_COSTS.FLUX_PRO_KONTEXT);  // $0.06
  }
}

// Dynamic price for video based on duration
function getVideoPrice(context: { body?: { duration?: number } }): string {
  const duration = context.body?.duration || 5;  // Default 5 seconds
  const cost = FAL_API_COSTS.VIDEO_PER_SECOND * Math.min(Math.max(duration, 1), 30);
  return priceUsd(cost);
}

// Dynamic price for music based on duration
function getMusicPrice(context: { body?: { duration?: number } }): string {
  const durationMinutes = (context.body?.duration || 60) / 60;  // Default 1 minute
  const cost = FAL_API_COSTS.MUSIC_PER_MINUTE * Math.min(Math.max(durationMinutes, 0.5), 5);
  return priceUsd(cost);
}

// Route config type matching x402 API
interface X402RouteConfig {
  accepts: Array<{
    price: string | ((context: { body?: Record<string, unknown> }) => string);
    network: string;
    payTo: string;
  }>;
  description: string;
}

type X402RoutesConfig = Record<string, X402RouteConfig>;

// x402 route configuration with dynamic pricing
// Uses the new x402 API format with 'accepts' array
function buildRoutesConfig(): X402RoutesConfig {
  if (!PAYMENT_WALLET) return {} as X402RoutesConfig;
  
  return {
    'POST /generate/image': {
      accepts: [{
        price: getImagePrice,
        network: 'eip155:8453' as const,  // Base mainnet
        payTo: PAYMENT_WALLET,
      }],
      description: 'Generate an AI image',
    },
    'POST /generate/video': {
      accepts: [{
        price: getVideoPrice,
        network: 'eip155:8453' as const,
        payTo: PAYMENT_WALLET,
      }],
      description: 'Generate an AI video',
    },
    'POST /wan-animate/submit': {
      accepts: [{
        price: priceUsd(FAL_API_COSTS.VIDEO_PER_SECOND * 5),
        network: 'eip155:8453' as const,
        payTo: PAYMENT_WALLET,
      }],
      description: 'Animate an image to video',
    },
    'POST /generate/music': {
      accepts: [{
        price: getMusicPrice,
        network: 'eip155:8453' as const,
        payTo: PAYMENT_WALLET,
      }],
      description: 'Generate AI music',
    },
    'POST /audio/sfx': {
      accepts: [{
        price: priceUsd(FAL_API_COSTS.SFX),
        network: 'eip155:8453' as const,
        payTo: PAYMENT_WALLET,
      }],
      description: 'Generate sound effects',
    },
    'POST /generate/upscale': {
      accepts: [{
        price: priceUsd(FAL_API_COSTS.UPSCALE),
        network: 'eip155:8453' as const,
        payTo: PAYMENT_WALLET,
      }],
      description: 'Upscale an image',
    },
    'POST /image-tools/describe': {
      accepts: [{
        price: priceUsd(FAL_API_COSTS.DESCRIBE),
        network: 'eip155:8453' as const,
        payTo: PAYMENT_WALLET,
      }],
      description: 'Describe an image',
    },
    'POST /prompt-lab/chat': {
      accepts: [{
        price: priceUsd(FAL_API_COSTS.PROMPT_LAB),
        network: 'eip155:8453' as const,
        payTo: PAYMENT_WALLET,
      }],
      description: 'Chat with prompt assistant',
    },
  };
}

export const X402_PRICING = buildRoutesConfig();

/**
 * Check if a request should use x402 payment
 * Returns true if:
 * - Request has x402 payment header, OR
 * - Request is from Claw client without auth token
 */
export function shouldUseX402(req: Request): boolean {
  // If request already has x402 payment signature, use x402
  if (req.headers['payment-signature'] || req.headers['x-payment']) {
    return true;
  }
  
  // If request has Authorization header, use normal credit system
  if (req.headers.authorization) {
    return false;
  }
  
  // If request is from Claw client without auth, offer x402
  const isClawClient = (req as any).isClawClient;
  if (isClawClient) {
    return true;
  }
  
  return false;
}

/** Extended request type with x402 payment info */
export interface X402Request extends Request {
  isX402Paid?: boolean;
  x402Payment?: {
    amount: string;
    transactionHash?: string;
    payer?: string;
  };
}

/**
 * Create x402 payment middleware for specified routes
 */
export function createX402Middleware() {
  if (!PAYMENT_WALLET) {
    logger.warn('x402: No EVM_PAYMENT_WALLET configured, x402 payments disabled');
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }

  const routes = buildRoutesConfig();
  
  if (Object.keys(routes).length === 0) {
    logger.warn('x402: No routes configured');
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }

  // Check if CDP credentials are configured
  const hasCdpCredentials = !!(config.CDP_API_KEY_ID && config.CDP_API_KEY_SECRET);
  
  logger.info('x402: Payment middleware enabled', { 
    wallet: PAYMENT_WALLET.slice(0, 10) + '...',
    network: 'base (eip155:8453)',
    endpoints: Object.keys(routes).length,
    facilitator: hasCdpCredentials ? 'coinbase-cdp' : 'none (402 only)'
  });

  // Create CDP facilitator client if credentials are available
  let facilitator: HTTPFacilitatorClient | undefined;
  if (hasCdpCredentials) {
    // CDP API uses JWT bearer token authentication
    // Create a custom fetch that adds the authorization header
    facilitator = new HTTPFacilitatorClient({
      url: CDP_FACILITATOR_URL,
      // CDP auth is handled via API key headers
      headers: {
        'X-CDP-API-KEY-ID': config.CDP_API_KEY_ID!,
        'X-CDP-API-KEY-SECRET': config.CDP_API_KEY_SECRET!,
      }
    });
    logger.info('x402: Using Coinbase CDP facilitator for payment processing');
  } else {
    logger.warn('x402: No CDP credentials configured. Set CDP_API_KEY_ID and CDP_API_KEY_SECRET for full x402 support.');
    logger.warn('x402: Without facilitator, 402 responses will be returned but payments cannot be verified/settled.');
  }

  return paymentMiddlewareFromConfig(
    routes,
    facilitator,  // Use CDP facilitator if configured
    undefined,    // schemes (CDP facilitator handles this)
    undefined,    // paywallConfig
    undefined,    // paywall
    hasCdpCredentials  // Only sync if we have a facilitator
  );
}

/**
 * Conditional x402 middleware
 * Only applies x402 payment if shouldUseX402() returns true
 * Otherwise passes through to normal auth/credit system
 */
export function conditionalX402Middleware() {
  const x402Middleware = createX402Middleware();
  
  return (req: X402Request, res: Response, next: NextFunction) => {
    if (shouldUseX402(req)) {
      // Check if request has payment signature (indicating payment attempt)
      const hasPaymentSignature = !!(req.headers['payment-signature'] || req.headers['x-payment']);
      
      // Wrap next to detect when x402 middleware passes through
      const wrappedNext: NextFunction = (err?: unknown) => {
        if (!err && hasPaymentSignature) {
          // Payment was present and verified successfully
          req.isX402Paid = true;
          req.x402Payment = {
            amount: res.getHeader('x-payment-amount')?.toString() || 'unknown',
            transactionHash: res.getHeader('x-payment-tx')?.toString(),
            payer: res.getHeader('x-payment-payer')?.toString(),
          };
          
          logger.info('x402 payment verified and settled', {
            path: req.path,
            method: req.method,
            payment: req.x402Payment
          });
        }
        next(err);
      };
      
      // Use x402 payment flow
      return x402Middleware(req, res, wrappedNext);
    }
    // Use normal auth/credit flow
    next();
  };
}

export default {
  createX402Middleware,
  conditionalX402Middleware,
  shouldUseX402,
  X402_PRICING,
  FAL_API_COSTS,
};
