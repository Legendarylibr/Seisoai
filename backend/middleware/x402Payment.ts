/**
 * x402 Payment Middleware
 * Enables pay-per-request for AI agents using USDC on Base
 * 
 * This allows Claw/OpenClaw users (and any x402-compatible client)
 * to pay per request without needing a Seisoai account.
 */
import { paymentMiddleware } from '@x402/express';
import type { Request, Response, NextFunction } from 'express';
import config from '../config/env.js';
import logger from '../utils/logger.js';

// 20% markup over Fal.ai API costs
const MARKUP = 1.20;

// Fal.ai API costs (USD) - source of truth
// All x402 prices are exactly 20% above these values
const FAL_API_COSTS = {
  // Image generation
  FLUX_PRO_KONTEXT: 0.05,      // Flux Pro Kontext
  FLUX_2: 0.025,               // Flux 2
  NANO_BANANA: 0.25,           // Nano Banana Pro
  
  // Video generation (per second)
  VIDEO_PER_SECOND: 0.10,      // Kling/Minimax video
  VIDEO_LTX_PER_SECOND: 0.04,  // LTX-2 budget video
  
  // Music/Audio
  MUSIC_PER_MINUTE: 0.02,      // Music generation per minute
  VIDEO_TO_AUDIO: 0.04,        // MMAudio V2
  SFX: 0.03,                   // Sound effects
  
  // Image tools
  UPSCALE: 0.03,               // Image upscaling
  DESCRIBE: 0.01,              // Image to text
  PROMPT_LAB: 0.001,           // Prompt lab chat
};

// Apply 20% markup to Fal API cost
function price(falCost: number): string {
  const usd = falCost * MARKUP;
  return `$${usd.toFixed(4)}`;
}

// x402 pricing configuration for endpoints
// Prices are exactly 20% above Fal.ai API costs, paid via USDC on Base
// Note: Routes are relative to /api/ mount point
export const X402_PRICING = {
  // Image generation
  'POST /generate/image': {
    price: price(FAL_API_COSTS.FLUX_PRO_KONTEXT),  // $0.05 × 1.2 = $0.06
    network: 'base' as const,
    description: 'Generate an AI image (Flux Pro)',
  },
  'POST /generate/image-flux2': {
    price: price(FAL_API_COSTS.FLUX_2),  // $0.025 × 1.2 = $0.03
    network: 'base' as const,
    description: 'Generate an AI image (Flux 2)',
  },
  'POST /generate/image-nano': {
    price: price(FAL_API_COSTS.NANO_BANANA),  // $0.25 × 1.2 = $0.30
    network: 'base' as const,
    description: 'Generate an AI image (Nano Banana)',
  },
  
  // Video generation (~5 seconds default)
  'POST /generate/video': {
    price: price(FAL_API_COSTS.VIDEO_PER_SECOND * 5),  // $0.50 × 1.2 = $0.60
    network: 'base' as const,
    description: 'Generate an AI video (~5 sec)',
  },
  'POST /wan-animate/submit': {
    price: price(FAL_API_COSTS.VIDEO_PER_SECOND * 5),  // $0.50 × 1.2 = $0.60
    network: 'base' as const,
    description: 'Animate an image to video',
  },
  
  // Music generation (1 minute default)
  'POST /generate/music': {
    price: price(FAL_API_COSTS.MUSIC_PER_MINUTE),  // $0.02 × 1.2 = $0.024
    network: 'base' as const,
    description: 'Generate AI music (1 minute)',
  },
  
  // Audio tools
  'POST /audio/sfx': {
    price: price(FAL_API_COSTS.SFX),  // $0.03 × 1.2 = $0.036
    network: 'base' as const,
    description: 'Generate sound effects',
  },
  
  // Image tools
  'POST /generate/upscale': {
    price: price(FAL_API_COSTS.UPSCALE),  // $0.03 × 1.2 = $0.036
    network: 'base' as const,
    description: 'Upscale an image',
  },
  'POST /image-tools/describe': {
    price: price(FAL_API_COSTS.DESCRIBE),  // $0.01 × 1.2 = $0.012
    network: 'base' as const,
    description: 'Describe an image',
  },
  // Prompt lab
  'POST /prompt-lab/chat': {
    price: price(FAL_API_COSTS.PROMPT_LAB),  // $0.001 × 1.2 = $0.0012
    network: 'base' as const,
    description: 'Chat with prompt assistant',
  },
};

// Export Fal costs for reference
export { FAL_API_COSTS };

// Payment wallet address (receives USDC payments)
// Uses the EVM_PAYMENT_WALLET from env, or a default Base address
const PAYMENT_WALLET = config.EVM_PAYMENT_WALLET || '0x0000000000000000000000000000000000000000';

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

/**
 * Create x402 payment middleware for specified routes
 */
export function createX402Middleware() {
  if (!PAYMENT_WALLET || PAYMENT_WALLET === '0x0000000000000000000000000000000000000000') {
    logger.warn('x402: No EVM_PAYMENT_WALLET configured, x402 payments disabled');
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }

  logger.info('x402: Payment middleware enabled', { 
    wallet: PAYMENT_WALLET.slice(0, 10) + '...',
    network: 'base',
    endpoints: Object.keys(X402_PRICING).length
  });

  return paymentMiddleware(PAYMENT_WALLET, X402_PRICING);
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
 * Conditional x402 middleware
 * Only applies x402 payment if shouldUseX402() returns true
 * Otherwise passes through to normal auth/credit system
 * 
 * When x402 payment is verified and settled, sets:
 * - req.isX402Paid = true
 * - req.x402Payment with payment details
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
          // x402 middleware calls next() only after successful verification/settlement
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
};
