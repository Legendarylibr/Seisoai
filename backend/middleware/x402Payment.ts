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
import { generateJwt } from '@coinbase/cdp-sdk/auth';
import type { Request, Response, NextFunction } from 'express';
import config from '../config/env.js';
import logger from '../utils/logger.js';

// Coinbase CDP facilitator URL (correct path format)
const CDP_FACILITATOR_URL = 'https://api.cdp.coinbase.com/platform/v2/x402';

// Base mainnet network identifier (CAIP-2 format)
const BASE_NETWORK = 'eip155:8453';

/**
 * Generate CDP JWT for a specific request
 */
async function generateCdpJwt(method: string, path: string): Promise<string> {
  if (!config.CDP_API_KEY_ID || !config.CDP_API_KEY_SECRET) {
    throw new Error('CDP credentials not configured');
  }
  
  return generateJwt({
    apiKeyId: config.CDP_API_KEY_ID,
    apiKeySecret: config.CDP_API_KEY_SECRET,
    requestMethod: method,
    requestHost: 'api.cdp.coinbase.com',
    requestPath: path,
    expiresIn: 120,
  });
}

/**
 * Custom CDP Facilitator Client with dynamic JWT auth
 * HTTPFacilitatorClient doesn't support per-request auth, so we implement our own
 */
class CdpFacilitatorClient {
  private baseUrl = CDP_FACILITATOR_URL;
  
  async getSupported(): Promise<{ kinds: Array<{ x402Version: number; scheme: string; network: string }> }> {
    const jwt = await generateCdpJwt('GET', '/platform/v2/x402/supported');
    const response = await fetch(`${this.baseUrl}/supported`, {
      headers: { 'Authorization': `Bearer ${jwt}` }
    });
    if (!response.ok) throw new Error(`CDP getSupportedKinds failed: ${response.status}`);
    return response.json() as Promise<{ kinds: Array<{ x402Version: number; scheme: string; network: string }> }>;
  }
  
  async verify(payload: unknown, requirements: unknown): Promise<{ valid: boolean; invalidReason?: string }> {
    const jwt = await generateCdpJwt('POST', '/platform/v2/x402/verify');
    const response = await fetch(`${this.baseUrl}/verify`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${jwt}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ payload, paymentRequirements: requirements })
    });
    if (!response.ok) throw new Error(`CDP verify failed: ${response.status}`);
    return response.json() as Promise<{ valid: boolean; invalidReason?: string }>;
  }
  
  async settle(payload: unknown, requirements: unknown): Promise<{ success: boolean; transaction?: string }> {
    const jwt = await generateCdpJwt('POST', '/platform/v2/x402/settle');
    const response = await fetch(`${this.baseUrl}/settle`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${jwt}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ payload, paymentRequirements: requirements })
    });
    if (!response.ok) throw new Error(`CDP settle failed: ${response.status}`);
    return response.json() as Promise<{ success: boolean; transaction?: string }>;
  }
}

// 30% markup over Fal.ai API costs
const MARKUP = 1.30;

// USDC has 6 decimal places
const USDC_DECIMALS = 6;

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
  TRANSCRIBE: 0.01,            // Speech-to-text transcription
  
  // Image tools
  UPSCALE: 0.03,               // Image upscaling
  DESCRIBE: 0.01,              // Image to text
  
  // Prompt lab
  PROMPT_LAB: 0.001,           // Prompt lab chat
};

/**
 * Convert USD to USDC smallest units (6 decimals)
 * x402 requires amounts in the asset's smallest unit
 * $0.065 USD = 65000 USDC units (0.065 * 10^6)
 */
function usdToUsdcUnits(usdAmount: number): string {
  const units = Math.round(usdAmount * Math.pow(10, USDC_DECIMALS));
  return units.toString();
}

/**
 * Get price in USDC smallest units with markup applied
 */
function priceInUsdcUnits(falCost: number): string {
  const usdWithMarkup = falCost * MARKUP;
  return usdToUsdcUnits(usdWithMarkup);
}

/**
 * Get human-readable price string for logging
 */
function priceUsdReadable(falCost: number): string {
  const usd = falCost * MARKUP;
  return `$${usd.toFixed(4)}`;
}

// Payment wallet address (receives USDC payments)
const PAYMENT_WALLET = config.EVM_PAYMENT_WALLET || '';

// Dynamic price function for image generation based on model (returns USDC units)
function getImagePrice(context: { body?: { model?: string } }): string {
  const model = context.body?.model || 'flux-pro';
  
  switch (model) {
    case 'flux-2':
      return priceInUsdcUnits(FAL_API_COSTS.FLUX_2);  // ~32500 units ($0.0325)
    case 'nano-banana-pro':
      return priceInUsdcUnits(FAL_API_COSTS.NANO_BANANA);  // ~325000 units ($0.325)
    case 'flux-pro':
    default:
      return priceInUsdcUnits(FAL_API_COSTS.FLUX_PRO_KONTEXT);  // ~65000 units ($0.065)
  }
}

// Dynamic price for video based on duration (returns USDC units)
function getVideoPrice(context: { body?: { duration?: number | string } }): string {
  // Handle both number (5) and string ("5s") formats
  let duration = 5;
  const rawDuration = context.body?.duration;
  if (typeof rawDuration === 'number') {
    duration = rawDuration;
  } else if (typeof rawDuration === 'string') {
    duration = parseInt(rawDuration.replace('s', ''), 10) || 5;
  }
  const cost = FAL_API_COSTS.VIDEO_PER_SECOND * Math.min(Math.max(duration, 1), 30);
  return priceInUsdcUnits(cost);
}

// Dynamic price for music based on duration (returns USDC units)
function getMusicPrice(context: { body?: { duration?: number } }): string {
  const durationMinutes = (context.body?.duration || 60) / 60;  // Default 1 minute
  const cost = FAL_API_COSTS.MUSIC_PER_MINUTE * Math.min(Math.max(durationMinutes, 0.5), 5);
  return priceInUsdcUnits(cost);
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

// Dynamic pricing for gateway tool invocations
function getGatewayToolPrice(context: { body?: { toolId?: string; [key: string]: unknown } }): string {
  // Try to get price from tool registry
  try {
    const { toolRegistry } = require('../services/toolRegistry');
    const toolId = context.body?.toolId;
    if (toolId && typeof toolId === 'string') {
      const price = toolRegistry.calculatePrice(toolId, context.body || {});
      if (price) return price.usdcUnits;
    }
  } catch { /* tool registry not loaded yet */ }
  
  // Default gateway price
  return priceInUsdcUnits(FAL_API_COSTS.FLUX_PRO_KONTEXT);
}

// x402 route configuration with dynamic pricing
// Uses the new x402 API format with 'accepts' array
function buildRoutesConfig(): X402RoutesConfig {
  if (!PAYMENT_WALLET) return {} as X402RoutesConfig;
  
  return {
    // ============================================
    // Original generation routes
    // ============================================
    'POST /generate/image': {
      accepts: [{
        price: getImagePrice,
        network: 'eip155:8453' as const,  // Base mainnet
        payTo: PAYMENT_WALLET,
      }],
      description: 'Generate an AI image',
    },
    'POST /generate/image-stream': {
      accepts: [{
        price: getImagePrice,
        network: 'eip155:8453' as const,
        payTo: PAYMENT_WALLET,
      }],
      description: 'Generate an AI image (streaming)',
    },
    'POST /generate/video': {
      accepts: [{
        price: getVideoPrice,
        network: 'eip155:8453' as const,
        payTo: PAYMENT_WALLET,
      }],
      description: 'Generate an AI video',
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
        price: priceInUsdcUnits(FAL_API_COSTS.SFX),
        network: 'eip155:8453' as const,
        payTo: PAYMENT_WALLET,
      }],
      description: 'Generate sound effects',
    },
    'POST /audio/transcribe': {
      accepts: [{
        price: priceInUsdcUnits(FAL_API_COSTS.TRANSCRIBE),
        network: 'eip155:8453' as const,
        payTo: PAYMENT_WALLET,
      }],
      description: 'Transcribe audio/video to text',
    },
    'POST /generate/upscale': {
      accepts: [{
        price: priceInUsdcUnits(FAL_API_COSTS.UPSCALE),
        network: 'eip155:8453' as const,
        payTo: PAYMENT_WALLET,
      }],
      description: 'Upscale an image',
    },
    'POST /prompt-lab/chat': {
      accepts: [{
        price: priceInUsdcUnits(FAL_API_COSTS.PROMPT_LAB),
        network: 'eip155:8453' as const,
        payTo: PAYMENT_WALLET,
      }],
      description: 'Chat with prompt assistant',
    },
    // ============================================
    // Agentic Gateway routes - x402 for all tools
    // ============================================
    'POST /gateway/invoke': {
      accepts: [{
        price: getGatewayToolPrice,
        network: 'eip155:8453' as const,
        payTo: PAYMENT_WALLET,
      }],
      description: 'Invoke any AI tool via the gateway',
    },
    'POST /gateway/batch': {
      accepts: [{
        price: priceInUsdcUnits(FAL_API_COSTS.FLUX_PRO_KONTEXT * 3), // Estimate for batch
        network: 'eip155:8453' as const,
        payTo: PAYMENT_WALLET,
      }],
      description: 'Batch invoke multiple AI tools',
    },
    'POST /gateway/orchestrate': {
      accepts: [{
        price: priceInUsdcUnits(FAL_API_COSTS.FLUX_PRO_KONTEXT * 5), // Estimate for orchestration
        network: 'eip155:8453' as const,
        payTo: PAYMENT_WALLET,
      }],
      description: 'Orchestrate a multi-tool AI workflow',
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

/** Payment requirements for settlement */
export interface X402PaymentRequirements {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  resource: string;
  payTo: string;
  asset: string;
}

/** Extended request type with x402 payment info */
export interface X402Request extends Request {
  isX402Paid?: boolean;
  x402Payment?: {
    amount: string;
    transactionHash?: string;
    payer?: string;
    /** Payment payload for settlement */
    payload?: string;
    /** Payment requirements for settlement */
    requirements?: X402PaymentRequirements;
    /** Whether settlement has been completed */
    settled?: boolean;
  };
}

// Singleton CDP client for settlement
let cdpClient: CdpFacilitatorClient | null = null;

function getCdpClient(): CdpFacilitatorClient {
  if (!cdpClient) {
    cdpClient = new CdpFacilitatorClient();
  }
  return cdpClient;
}

/**
 * Settle an x402 payment after successful generation
 * Should be called after the generation completes successfully
 */
export async function settleX402Payment(req: X402Request): Promise<{ success: boolean; transaction?: string; error?: string }> {
  if (!req.isX402Paid || !req.x402Payment?.payload || !req.x402Payment?.requirements) {
    return { success: false, error: 'No x402 payment to settle' };
  }
  
  if (req.x402Payment.settled) {
    return { success: true, transaction: req.x402Payment.transactionHash };
  }
  
  try {
    const cdp = getCdpClient();
    const result = await cdp.settle(req.x402Payment.payload, req.x402Payment.requirements);
    
    if (result.success) {
      req.x402Payment.settled = true;
      req.x402Payment.transactionHash = result.transaction;
      logger.info('x402 payment settled', {
        path: req.path,
        transaction: result.transaction,
        amount: req.x402Payment.amount
      });
      return { success: true, transaction: result.transaction };
    } else {
      logger.error('x402 settlement failed', { path: req.path });
      return { success: false, error: 'Settlement failed' };
    }
  } catch (error) {
    const err = error as Error;
    logger.error('x402 settlement error', { error: err.message, path: req.path });
    return { success: false, error: err.message };
  }
}

/**
 * Create simple x402 payment middleware
 * Returns 402 with payment info for Claw clients without accounts
 */
export function createX402Middleware() {
  if (!PAYMENT_WALLET) {
    logger.warn('x402: No EVM_PAYMENT_WALLET configured, x402 payments disabled');
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }

  const hasCdpCredentials = !!(config.CDP_API_KEY_ID && config.CDP_API_KEY_SECRET);
  
  logger.info('x402: Payment middleware enabled', { 
    wallet: PAYMENT_WALLET.slice(0, 10) + '...',
    network: 'base (eip155:8453)',
    facilitator: hasCdpCredentials ? 'coinbase-cdp' : 'none'
  });

  // Test CDP connection on startup if credentials are configured
  if (hasCdpCredentials) {
    testCdpConnection().catch(err => {
      logger.error('x402: CDP connection test failed', { error: err.message });
    });
  }

  // Simple x402 middleware that returns proper payment info
  return async (req: Request, res: Response, next: NextFunction) => {
    const normalizedPath = req.path.replace('/api/', '/').replace(/^\/v1\//, '/');
    const routeKey = `${req.method} ${normalizedPath}`;
    const routes = buildRoutesConfig();
    let routeConfig = routes[routeKey];
    
    // Support dynamic gateway routes: /gateway/invoke/:toolId → /gateway/invoke
    if (!routeConfig && normalizedPath.startsWith('/gateway/invoke/')) {
      routeConfig = routes['POST /gateway/invoke'];
      // Inject toolId into body for price calculation
      if (routeConfig && !req.body?.toolId) {
        const toolId = normalizedPath.replace('/gateway/invoke/', '');
        req.body = { ...req.body, toolId };
      }
    }
    
    if (!routeConfig) {
      // Route not configured for x402, pass through
      return next();
    }

    // Calculate price for this request
    const price = typeof routeConfig.accepts[0].price === 'function'
      ? routeConfig.accepts[0].price({ body: req.body })
      : routeConfig.accepts[0].price;
    
    const resourceUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    
    // Build payment requirements (used for both verify and settle)
    const requirements: X402PaymentRequirements = {
      scheme: 'exact',
      network: BASE_NETWORK,
      maxAmountRequired: price,
      resource: resourceUrl,
      payTo: PAYMENT_WALLET,
      asset: 'USDC',
    };

    // Check if payment signature is present (accept common x402 header names)
    const paymentHeader =
      req.headers['payment-signature'] ||
      req.headers['x-payment'] ||
      req.headers['payment'];
    const paymentValue = typeof paymentHeader === 'string' ? paymentHeader : Array.isArray(paymentHeader) ? paymentHeader[0] : undefined;
    
    if (paymentValue) {
      // Payment present - verify with CDP if configured
      if (hasCdpCredentials) {
        try {
          const cdp = getCdpClient();
          const result = await cdp.verify(paymentValue, requirements);
          
          if (result.valid) {
            // Payment verified - store info for later settlement
            const x402Req = req as X402Request;
            x402Req.isX402Paid = true;
            x402Req.x402Payment = {
              amount: price,
              payload: paymentValue,
              requirements,
              settled: false,
            };
            
            // Set a mock user for x402 requests so route handlers don't fail
            (req as any).user = {
              isX402Guest: true,
              credits: 999999,
              walletAddress: 'x402-guest-' + Date.now(),
              userId: 'x402-guest',
            };
            // Set flags to skip credit deduction
            (req as any).hasFreeAccess = true;
            (req as any).creditsRequired = 0;
            
            logger.info('x402 payment verified', {
              path: req.path,
              amount: price,
              amountUsd: `$${(parseInt(price) / Math.pow(10, USDC_DECIMALS)).toFixed(4)}`
            });
            
            return next();
          } else {
            logger.warn('x402 payment verification failed', {
              path: req.path,
              reason: result.invalidReason
            });
            return res.status(402).json({ 
              error: 'Payment verification failed',
              reason: result.invalidReason 
            });
          }
        } catch (error) {
          const err = error as Error;
          logger.error('x402: Payment verification error', { error: err.message });
          return res.status(500).json({ error: 'Payment verification failed' });
        }
      }
      // No CDP - can't verify payments
      return res.status(402).json({ error: 'Payment verification not available' });
    }

    // No payment - return 402 with payment requirements
    // Convert USDC units to human-readable for display
    const amountUsd = parseInt(price) / Math.pow(10, USDC_DECIMALS);
    
    const paymentRequired = {
      x402Version: 2,
      error: 'Payment required',
      resource: {
        url: resourceUrl,
        description: routeConfig.description,
        mimeType: 'application/json',
      },
      accepts: [{
        scheme: 'exact',
        network: BASE_NETWORK,
        maxAmountRequired: price,
        asset: 'USDC',
        payTo: PAYMENT_WALLET,
        // Include human-readable price for debugging/display
        extra: {
          priceUsd: `$${amountUsd.toFixed(4)}`,
        },
      }],
    };

    const encoded = Buffer.from(JSON.stringify(paymentRequired)).toString('base64');
    res.setHeader('PAYMENT-REQUIRED', encoded);
    res.setHeader('X-Price-USD', `$${amountUsd.toFixed(4)}`);
    return res.status(402).json(paymentRequired);
  };
}

/**
 * Test CDP connection and log supported networks
 */
async function testCdpConnection(): Promise<void> {
  try {
    const jwt = await generateCdpJwt('GET', '/platform/v2/x402/supported');
    const response = await fetch(`${CDP_FACILITATOR_URL}/supported`, {
      headers: {
        'Authorization': `Bearer ${jwt}`,
        'Content-Type': 'application/json',
      }
    });
    
    if (response.ok) {
      const data = await response.json() as { kinds?: Array<{ network: string }> };
      logger.info('x402: CDP facilitator connected', { 
        networks: data.kinds?.map((k) => k.network) 
      });
    } else {
      logger.error('x402: CDP facilitator returned error', { 
        status: response.status,
        statusText: response.statusText 
      });
    }
  } catch (error) {
    logger.error('x402: Failed to connect to CDP facilitator', { error });
  }
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
  settleX402Payment,
  X402_PRICING,
  FAL_API_COSTS,
};
