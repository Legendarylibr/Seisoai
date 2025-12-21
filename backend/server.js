// Simplified AI Image Generator Backend
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import { ethers } from 'ethers';
import { Connection, PublicKey } from '@solana/web3.js';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import logger from './utils/logger.js';
import { 
  isDisposableEmail, 
  generateBrowserFingerprint,
  checkAccountAge,
  extractClientIP,
  createFreeImageRateLimiter
} from './abusePrevention.js';

// ES module setup
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from backend.env in root directory (single source of truth)
// This ensures there's only one backend configuration file
const envPath = path.join(__dirname, '..', 'backend.env');
dotenv.config({ path: envPath });

// Initialize Stripe - optional, allows test keys in development
let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  const Stripe = (await import('stripe')).default;
  const secretKey = process.env.STRIPE_SECRET_KEY;
  
  // Validate key format
  const isLiveKey = secretKey.startsWith('sk_live_');
  const isTestKey = secretKey.startsWith('sk_test_');
  
  if (!isLiveKey && !isTestKey) {
    logger.error('❌ ERROR: STRIPE_SECRET_KEY has invalid format. Must start with sk_live_ or sk_test_');
    logger.warn('⚠️  Stripe features will be disabled. Server will continue without Stripe.');
  } else {
    // In production, warn if using test key but don't fail
    if (process.env.NODE_ENV === 'production' && isTestKey) {
      logger.warn('⚠️  WARNING: Using Stripe test key in production mode. Live keys (sk_live_...) are required for real payments.');
      logger.warn('⚠️  Stripe features will be disabled in production with test keys.');
      // Don't initialize Stripe in production with test keys
    } else {
      if (isTestKey) {
        logger.info('✅ Stripe configured with TEST key - ready for testing');
      } else {
        logger.info('✅ Stripe configured with LIVE key - ready to accept payments');
      }
      stripe = Stripe(secretKey);
    }
  }
} else {
  logger.warn('⚠️  STRIPE_SECRET_KEY not set - Stripe payment features will be disabled');
}

const app = express();

// Trust proxy for accurate IP addresses
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://js.stripe.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://js.stripe.com", "https://checkout.stripe.com", "https://hooks.stripe.com", "https://static.cloudflareinsights.com"], // Allow inline scripts for Vite and Stripe
      imgSrc: ["'self'", "data:", "https:", "blob:", "https://*.stripe.com"],
      connectSrc: ["'self'", "http://localhost:3001", "http://localhost:3000", "http://localhost:5173", "https://api.fal.ai", "https://api.mainnet-beta.solana.com", "https://solana-api.projectserum.com", "https://rpc.ankr.com", "https://solana-mainnet.g.alchemy.com", "https://mainnet.helius-rpc.com", "https://api.devnet.solana.com", "https://js.stripe.com", "https://api.stripe.com", "https://hooks.stripe.com", "https://checkout.stripe.com", "https://static.cloudflareinsights.com", "https:", "wss:"],
      fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'", "data:", "blob:", "https:"],
      frameSrc: ["'self'", "https://js.stripe.com", "https://checkout.stripe.com", "https://hooks.stripe.com"],
    },
  },
  crossOriginEmbedderPolicy: false
}));

// Compression middleware
app.use(compression());


// Input validation utilities
const isValidEthereumAddress = (address) => {
  if (!address || typeof address !== 'string') return false;
  return /^0x[a-fA-F0-9]{40}$/.test(address);
};

const isValidSolanaAddress = (address) => {
  if (!address || typeof address !== 'string') return false;
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
};

const isValidWalletAddress = (address) => {
  if (!address || typeof address !== 'string') return false;
  return isValidEthereumAddress(address) || isValidSolanaAddress(address);
};

const sanitizeString = (str) => {
  if (typeof str !== 'string') return '';
  return str.trim().slice(0, 1000); // Limit length
};

const sanitizeNumber = (num) => {
  const parsed = parseFloat(num);
  if (isNaN(parsed) || !isFinite(parsed)) return null;
  return parsed;
};

// Middleware to validate request inputs
const validateInput = (req, res, next) => {
  // Sanitize query parameters
  if (req.query) {
    Object.keys(req.query).forEach(key => {
      if (typeof req.query[key] === 'string') {
        req.query[key] = sanitizeString(req.query[key]);
      }
    });
  }

  // Sanitize body parameters
  if (req.body) {
    Object.keys(req.body).forEach(key => {
      const value = req.body[key];
      if (typeof value === 'string') {
        req.body[key] = sanitizeString(value);
      } else if (typeof value === 'number') {
        req.body[key] = sanitizeNumber(value);
      }
    });
  }

  next();
};

app.use(validateInput);

// Helper function to sanitize error messages for client responses
const getSafeErrorMessage = (error, defaultMessage = 'An error occurred') => {
  if (process.env.NODE_ENV === 'production') {
    // In production, return generic messages only
    // Log actual error details server-side
    return defaultMessage;
  }
  // In development, show actual error for debugging
  return error?.message || defaultMessage;
};

// Transaction deduplication cache with LRU behavior
class LRUCache {
  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  set(key, value) {
    if (this.cache.has(key)) {
      // Move to end (most recently used)
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Remove least recently used (first item)
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  get(key) {
    if (this.cache.has(key)) {
      const value = this.cache.get(key);
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
      return value;
    }
    return undefined;
  }

  has(key) {
    return this.cache.has(key);
  }

  delete(key) {
    return this.cache.delete(key);
  }

  size() {
    return this.cache.size;
  }

  clear() {
    this.cache.clear();
  }
}

const processedTransactions = new LRUCache(1000);

// Middleware to prevent duplicate transactions
const checkTransactionDedup = async (req, res, next) => {
  const txHash = req.body?.txHash || req.params?.txHash;
  if (!txHash) {
    return next();
  }

  // Check if transaction already processed
  if (processedTransactions.has(txHash)) {
    const processedData = processedTransactions.get(txHash);
    logger.warn('Duplicate transaction attempt detected', { txHash, originalData: processedData });
    return res.status(400).json({
      success: false,
      error: 'This transaction has already been processed',
      alreadyProcessed: true
    });
  }

  // Add transaction to cache
  processedTransactions.set(txHash, {
    timestamp: new Date(),
    walletAddress: req.body?.walletAddress || 'unknown'
  });

  // Clean up old transactions (keep last 1000)
  if (processedTransactions.size > 1000) {
    const entries = Array.from(processedTransactions.entries());
    entries.sort((a, b) => b[1].timestamp - a[1].timestamp);
    processedTransactions.clear();
    entries.slice(0, 1000).forEach(([hash, data]) => {
      processedTransactions.set(hash, data);
    });
  }

  next();
};

// Apply deduplication to payment endpoints
app.use('/api/payments/', checkTransactionDedup);
app.use('/api/payment/', checkTransactionDedup);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 500 : 1000, // limit each IP to 500 requests per windowMs in production (for polling)
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Only skip rate limiting for health checks (not instant-check)
    return req.path === '/api/health';
  }
});

// Apply rate limiting to all routes
app.use('/api/', limiter);

// Stricter rate limiting for payment endpoints
const paymentLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10, // limit each IP to 10 payment requests per 5 minutes
  message: {
    error: 'Too many payment requests, please try again later.',
    retryAfter: '5 minutes'
  }
});

app.use('/api/payments/', paymentLimiter);

// More lenient rate limiting for instant-check endpoint (used for polling)
const instantCheckLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 300, // limit each IP to 300 requests per minute (allow 5 per second for aggressive polling)
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '1 minute'
  }
});

// Note: Applied directly to route handler below

// Rate limiters for Wan 2.2 endpoints (prevent API abuse)
// Defined early so they're available to route handlers

// Stricter rate limiting for free image generation (prevents abuse)
const freeImageRateLimiter = createFreeImageRateLimiter(rateLimit);

// In-memory cache for duplicate request prevention (prevents same request within 30 seconds)
const recentSubmissions = new Map();
const DUPLICATE_PREVENTION_TTL = 30 * 1000; // 30 seconds

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of recentSubmissions.entries()) {
    if (now - timestamp > DUPLICATE_PREVENTION_TTL) {
      recentSubmissions.delete(key);
    }
  }
}, 60000); // Cleanup every minute

// Status checks - allow 60 requests per minute per IP
const wanStatusLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60, // limit each IP to 60 requests per minute
  message: {
    error: 'Too many status check requests. Please wait a moment.',
    retryAfter: '1 minute'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Submit endpoint - prevent spam submissions (strict limit)
const wanSubmitLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10, // limit each IP to 10 submissions per 5 minutes
  message: {
    error: 'Too many video generation requests. Please wait before submitting another.',
    retryAfter: '5 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Result endpoint - prevent result fetching spam
const wanResultLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // limit each IP to 30 result fetches per minute
  message: {
    error: 'Too many result requests. Please wait a moment.',
    retryAfter: '1 minute'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Endpoints that should allow requests without origin (webhooks, health checks, monitoring)
// Defined early so it's available to all middleware
const noOriginAllowedPaths = [
  '/api/health',
  '/api/metrics',  // Prometheus metrics scraping
  '/api/stripe/webhook',
  '/api/webhook',
  '/api/webhooks'
];

// Request logging and security middleware (before CORS)
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const userAgent = req.headers['user-agent'] || 'Unknown';
  const ip = req.ip || req.connection.remoteAddress;
  const referer = req.headers.referer || req.headers.referrer;
  
  // Check if request has no origin (external tools, scripts, etc.)
  const hasNoOrigin = !origin;
  const isLocalhost = origin && (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:'));
  const isAllowedOrigin = process.env.ALLOWED_ORIGINS 
    ? process.env.ALLOWED_ORIGINS.split(',').includes(origin)
    : false;
  
  // Check if this is a path that allows no-origin requests
  const path = req.path || req.url?.split('?')[0];
  const isNoOriginAllowedPath = path && noOriginAllowedPaths.some(allowedPath => path.startsWith(allowedPath));
  
  // Log suspicious requests (no origin in production, or non-whitelisted origins)
  // But skip logging for legitimate no-origin paths (webhooks, health checks)
  // Also suppress logging here since CORS errors will be logged by error handler
  if (process.env.NODE_ENV === 'production') {
    // Only log if it's NOT a no-origin allowed path AND has an origin (but not allowed)
    // Don't log no-origin requests here - they'll be handled by CORS and logged once there
    if (!isNoOriginAllowedPath && origin && !isAllowedOrigin && !isLocalhost) {
      logger.warn('⚠️  External API request detected', {
        ip,
        origin: origin || 'NO_ORIGIN',
        userAgent,
        referer,
        path: req.path,
        method: req.method,
        timestamp: new Date().toISOString()
      });
    }
    // Suppress logging for no-origin allowed paths - these are expected
    // Suppress logging for no-origin requests - they'll be logged by CORS error handler if needed
  } else {
    // In development, log all non-localhost requests
    if (hasNoOrigin || (!isLocalhost && !isAllowedOrigin)) {
      logger.info('External request in development', {
        ip,
        origin: origin || 'NO_ORIGIN',
        userAgent,
        path: req.path,
        method: req.method
      });
    }
  }
  
  next();
});

// CORS configuration
// Middleware to handle CORS for paths that allow no-origin requests (webhooks, health checks)
// This runs BEFORE the main CORS middleware to handle special cases
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const path = req.path || req.url?.split('?')[0];
  
  // If this is a path that allows no-origin requests, handle CORS manually
  if (path && noOriginAllowedPaths.some(allowedPath => path.startsWith(allowedPath))) {
    // For webhook endpoints (server-to-server), no CORS headers needed
    if (path.startsWith('/api/stripe/webhook') || path.startsWith('/api/webhook') || path.startsWith('/api/webhooks')) {
      // Webhooks don't need CORS - they're server-to-server
      // Mark that CORS is already handled for this request
      req._corsHandled = true;
      return next();
    }
    
    // For health checks and metrics (may be accessed from browsers/monitoring tools)
    if (path.startsWith('/api/health') || path.startsWith('/api/metrics')) {
      // Set CORS headers but never use wildcard with credentials
      if (origin) {
        // Browser request - set specific origin, no credentials
        res.header('Access-Control-Allow-Origin', origin);
        res.header('Access-Control-Allow-Credentials', 'false');
      } else {
        // Server-to-server request - no CORS headers needed
        // Don't set wildcard to avoid security issues
      }
      res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type');
      res.header('Access-Control-Max-Age', '86400');
      
      // Mark that CORS is already handled for this request
      req._corsHandled = true;
      
      // Handle OPTIONS preflight requests for these paths
      if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
      }
      return next();
    }
  }
  next();
});

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests without origin - these are handled by middleware above for specific paths
    if (!origin) {
      // Allow no origin for testing tools (same in dev and production)
      // The middleware above will have already set headers for allowed paths
      return callback(null, true);
    }
    
    // Dynamic port handling - allow any localhost port (same in dev and production)
    const isLocalhost = origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:');
    
    // Check if origin is in allowed list (trim whitespace and handle variations)
    const allowedOriginsList = process.env.ALLOWED_ORIGINS 
      ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim().toLowerCase())
      : [];
    const originLower = origin.toLowerCase();
    
    // Helper function to normalize URLs for comparison
    const normalizeUrl = (url) => {
      return url
        .replace(/\/$/, '') // Remove trailing slash
        .replace(/^https?:\/\//, '') // Remove protocol
        .replace(/^www\./, ''); // Remove www
    };
    
    const isAllowedOrigin = allowedOriginsList.some(allowed => {
      // Exact match (case-insensitive)
      if (allowed === originLower) return true;
      
      // Match without trailing slash
      if (allowed.replace(/\/$/, '') === originLower.replace(/\/$/, '')) return true;
      
      // Match normalized (without protocol and www)
      const normalizedAllowed = normalizeUrl(allowed);
      const normalizedOrigin = normalizeUrl(originLower);
      if (normalizedAllowed === normalizedOrigin) return true;
      
      // Match with/without www prefix (but keep protocol)
      const allowedNoWww = allowed.replace(/^www\./, '');
      const originNoWww = originLower.replace(/^www\./, '');
      if (allowedNoWww === originNoWww) return true;
      
      return false;
    });
    
    // Allow localhost, whitelisted origins, or any origin if ALLOWED_ORIGINS not set
    // Same logic for both dev and production
    if (isLocalhost || isAllowedOrigin || allowedOriginsList.length === 0) {
      // Log when origin is allowed (info level so it's visible)
      const reason = isLocalhost ? 'localhost' : 
                     isAllowedOrigin ? 'in allowed list' : 
                     'ALLOWED_ORIGINS not set (permissive mode)';
      logger.info('CORS: ✅ Allowed origin', { 
        origin, 
        reason,
        isLocalhost, 
        isAllowedOrigin, 
        allowedOriginsCount: allowedOriginsList.length,
        allowedOrigins: allowedOriginsList.length > 0 ? allowedOriginsList : ['any origin allowed']
      });
      // Return the actual origin (not true) so CORS library sets it correctly with credentials
      return callback(null, origin);
    }
    
    // Reject non-localhost, non-whitelisted origins (only if ALLOWED_ORIGINS is set)
    logger.warn('CORS: ❌ Rejected origin', { 
      origin, 
      originLower,
      allowedOrigins: process.env.ALLOWED_ORIGINS,
      allowedOriginsArray: allowedOriginsList,
      isAllowed: isAllowedOrigin,
      isLocalhost,
      reason: 'Origin not in ALLOWED_ORIGINS list and not localhost'
    });
    return callback(new Error(`Not allowed by CORS. Origin '${origin}' is not in ALLOWED_ORIGINS: ${process.env.ALLOWED_ORIGINS || 'not set'}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Stripe-Signature'],
  exposedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200
};

// Apply CORS middleware - it will skip requests where _corsHandled is set
app.use((req, res, next) => {
  // Skip CORS if already handled by middleware above
  if (req._corsHandled) {
    return next();
  }
  // Apply CORS for all other paths
  return cors(corsOptions)(req, res, next);
});

// Log CORS configuration on startup
logger.info('CORS configuration', {
  nodeEnv: process.env.NODE_ENV || 'development',
  allowedOrigins: process.env.ALLOWED_ORIGINS || 'localhost (any port)',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  credentials: true
});

// Stripe webhook needs raw body - MUST be before express.json()
app.post('/api/stripe/webhook', express.raw({type: 'application/json'}), async (req, res) => {
  // Check if Stripe is configured
  if (!stripe) {
    return res.status(400).json({
      success: false,
      error: 'Stripe payment is not configured'
    });
  }

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    logger.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object;
      logger.info('Payment succeeded via webhook', {
        paymentIntentId: paymentIntent.id,
        amount: paymentIntent.amount,
        metadata: paymentIntent.metadata
      });
      
      // Process credits via webhook (idempotent - will skip if already processed)
      try {
        // Get user from metadata
        let user;
        if (paymentIntent.metadata.userId) {
          user = await User.findById(paymentIntent.metadata.userId);
        } else if (paymentIntent.metadata.walletAddress) {
          user = await getOrCreateUser(paymentIntent.metadata.walletAddress);
        }
        
        if (user && !isPaymentAlreadyProcessed(user, null, paymentIntent.id)) {
          // Calculate credits using same formula as verify-payment endpoint
          const amount = paymentIntent.amount / 100; // Convert from cents
          const baseRate = 5; // 5 credits per dollar (50 credits for $10)
          
          // Subscription scaling based on amount
          let scalingMultiplier = 1.0;
          if (amount >= 80) {
            scalingMultiplier = 1.3; // 30% bonus for $80+
          } else if (amount >= 40) {
            scalingMultiplier = 1.2; // 20% bonus for $40-79
          } else if (amount >= 20) {
            scalingMultiplier = 1.1; // 10% bonus for $20-39
          }
          // $10: 5 credits/dollar (no bonus) = 50 credits
          
          // Check if user is NFT holder
          let isNFTHolder = false;
          if (user.walletAddress) {
            isNFTHolder = user.nftCollections && user.nftCollections.length > 0;
          }
          
          const nftMultiplier = isNFTHolder ? 1.2 : 1;
          const finalCredits = Math.floor(amount * baseRate * scalingMultiplier * nftMultiplier);
          
          // Add credits
          await addCreditsToUser(user, {
            txHash: paymentIntent.id,
            tokenSymbol: 'USD',
            amount,
            credits: finalCredits,
            chainId: 'stripe',
            walletType: 'card',
            paymentIntentId: paymentIntent.id
          });
          
          logger.info('Credits added via webhook', {
            paymentIntentId: paymentIntent.id,
            userId: user.userId || null,
            walletAddress: user.walletAddress || null,
            credits: finalCredits
          });
        } else if (user && isPaymentAlreadyProcessed(user, null, paymentIntent.id)) {
          logger.info('Payment already processed via webhook', {
            paymentIntentId: paymentIntent.id
          });
        }
      } catch (webhookError) {
        // Log error but don't fail webhook - verify-payment endpoint can still handle it
        logger.error('Error processing webhook payment:', webhookError);
      }
      break;

    case 'checkout.session.completed':
      // Handle subscription checkout completion
      const session = event.data.object;
      logger.info('Checkout session completed via webhook', {
        sessionId: session.id,
        mode: session.mode,
        customer: session.customer,
        metadata: session.metadata
      });

      // Only process subscription checkouts
      if (session.mode === 'subscription' && session.metadata) {
        try {
          // Get user from metadata
          let user;
          if (session.metadata.userId) {
            user = await User.findById(session.metadata.userId);
          } else if (session.metadata.walletAddress) {
            user = await getOrCreateUser(session.metadata.walletAddress);
          } else if (session.metadata.email) {
            user = await User.findOne({ email: session.metadata.email.toLowerCase() });
          }

          if (user) {
            logger.info('User found for subscription checkout', {
              userId: user._id.toString(),
              email: user.email || null,
              walletAddress: user.walletAddress || null,
              currentCredits: user.credits
            });
            
            // Retrieve the subscription to get the amount
            const subscriptionId = session.subscription;
            if (subscriptionId) {
              const subscription = await stripe.subscriptions.retrieve(subscriptionId);
              const amount = subscription.items.data[0]?.price?.unit_amount || 0;
              const amountInDollars = amount / 100;

              logger.info('Subscription retrieved', {
                subscriptionId,
                amount: amountInDollars,
                priceId: subscription.items.data[0]?.price?.id
              });

              // Use session ID as payment identifier to prevent duplicates
              const paymentId = `checkout_${session.id}`;
              
              if (!isPaymentAlreadyProcessed(user, null, paymentId)) {
                // Calculate credits using same formula
                const baseRate = 5; // 5 credits per dollar (50 credits for $10)
                let scalingMultiplier = 1.0;
                if (amountInDollars >= 80) {
                  scalingMultiplier = 1.3; // 30% bonus for $80+
                } else if (amountInDollars >= 40) {
                  scalingMultiplier = 1.2; // 20% bonus for $40-79
                } else if (amountInDollars >= 20) {
                  scalingMultiplier = 1.1; // 10% bonus for $20-39
                }
                // $10: 5 credits/dollar (no bonus) = 50 credits

                let isNFTHolder = false;
                if (user.walletAddress) {
                  isNFTHolder = user.nftCollections && user.nftCollections.length > 0;
                }

                const nftMultiplier = isNFTHolder ? 1.2 : 1;
                const finalCredits = Math.floor(amountInDollars * baseRate * scalingMultiplier * nftMultiplier);

                // Add credits
                await addCreditsToUser(user, {
                  txHash: paymentId,
                  tokenSymbol: 'USD',
                  amount: amountInDollars,
                  credits: finalCredits,
                  chainId: 'stripe',
                  walletType: 'card',
                  paymentIntentId: paymentId,
                  subscriptionId: subscriptionId
                });

                logger.info('Credits added via subscription checkout webhook', {
                  sessionId: session.id,
                  subscriptionId: subscriptionId,
                  userId: user.userId || null,
                  walletAddress: user.walletAddress || null,
                  amount: amountInDollars,
                  credits: finalCredits,
                  totalCredits: user.credits
                });
              } else {
                logger.info('Subscription checkout already processed', {
                  sessionId: session.id,
                  paymentId: paymentId
                });
              }
            } else {
              logger.warn('No subscription ID found in checkout session', {
                sessionId: session.id
              });
            }
          } else {
            logger.warn('Could not find user for subscription checkout', {
              sessionId: session.id,
              metadata: session.metadata,
              customerEmail: session.customer_email || null,
              customer: session.customer || null
            });
            
            // Try to get customer email and find user that way
            if (session.customer) {
              try {
                const customer = await stripe.customers.retrieve(session.customer);
                if (customer && customer.email) {
                  const userByEmail = await User.findOne({ email: customer.email.toLowerCase() });
                  if (userByEmail) {
                    logger.info('Found user by customer email, retrying credit addition', {
                      email: customer.email,
                      userId: userByEmail._id.toString()
                    });
                    // Retry with this user (will be handled by recursive call or manual retry)
                  }
                }
              } catch (customerError) {
                logger.error('Error retrieving customer:', customerError);
              }
            }
          }
        } catch (webhookError) {
          logger.error('Error processing subscription checkout webhook:', webhookError);
        }
      }
      break;

    case 'invoice.payment_succeeded':
      // Handle recurring subscription payments
      const invoice = event.data.object;
      logger.info('Invoice payment succeeded via webhook', {
        invoiceId: invoice.id,
        subscription: invoice.subscription,
        amount: invoice.amount_paid,
        customer: invoice.customer
      });

      // Only process subscription invoices
      if (invoice.subscription && invoice.amount_paid > 0) {
        try {
          // Retrieve subscription to get metadata
          const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
          const customerId = subscription.customer;
          
          // Try to get customer to find email
          let customer = null;
          if (customerId) {
            try {
              customer = await stripe.customers.retrieve(customerId);
            } catch (e) {
              logger.warn('Could not retrieve customer:', e.message);
            }
          }

          // Get user from subscription metadata or customer email
          let user = null;
          if (subscription.metadata && subscription.metadata.userId) {
            user = await User.findById(subscription.metadata.userId);
          } else if (subscription.metadata && subscription.metadata.walletAddress) {
            user = await getOrCreateUser(subscription.metadata.walletAddress);
          } else if (customer && customer.email) {
            user = await User.findOne({ email: customer.email.toLowerCase() });
          }

          if (user) {
            const amountInDollars = invoice.amount_paid / 100;
            const paymentId = `invoice_${invoice.id}`;

            if (!isPaymentAlreadyProcessed(user, null, paymentId)) {
              // Calculate credits using same formula
              const baseRate = 5; // 5 credits per dollar (50 credits for $10)
              let scalingMultiplier = 1.0;
              if (amountInDollars >= 80) {
                scalingMultiplier = 1.3; // 30% bonus for $80+
              } else if (amountInDollars >= 40) {
                scalingMultiplier = 1.2; // 20% bonus for $40-79
              } else if (amountInDollars >= 20) {
                scalingMultiplier = 1.1; // 10% bonus for $20-39
              }
              // $10: 5 credits/dollar (no bonus) = 50 credits

              let isNFTHolder = false;
              if (user.walletAddress) {
                isNFTHolder = user.nftCollections && user.nftCollections.length > 0;
              }

              const nftMultiplier = isNFTHolder ? 1.2 : 1;
              const finalCredits = Math.floor(amountInDollars * baseRate * scalingMultiplier * nftMultiplier);

              // Add credits
              await addCreditsToUser(user, {
                txHash: paymentId,
                tokenSymbol: 'USD',
                amount: amountInDollars,
                credits: finalCredits,
                chainId: 'stripe',
                walletType: 'card',
                paymentIntentId: paymentId,
                subscriptionId: invoice.subscription
              });

              logger.info('Credits added via subscription invoice webhook', {
                invoiceId: invoice.id,
                subscriptionId: invoice.subscription,
                userId: user.userId || null,
                walletAddress: user.walletAddress || null,
                amount: amountInDollars,
                credits: finalCredits,
                totalCredits: user.credits
              });
            } else {
              logger.info('Subscription invoice already processed', {
                invoiceId: invoice.id,
                paymentId: paymentId
              });
            }
          } else {
            logger.warn('Could not find user for subscription invoice', {
              invoiceId: invoice.id,
              subscriptionId: invoice.subscription,
              customerId: customerId,
              customerEmail: customer?.email || null
            });
          }
        } catch (webhookError) {
          logger.error('Error processing subscription invoice webhook:', webhookError);
        }
      } else {
        logger.info('Skipping non-subscription invoice or zero amount', {
          invoiceId: invoice.id,
          hasSubscription: !!invoice.subscription,
          amountPaid: invoice.amount_paid
        });
      }
      break;

    default:
      logger.info(`Unhandled event type ${event.type}`);
  }

  res.json({received: true});
});

// Body parsing middleware - AFTER webhook route
// Wan 2.2 Animate Replace - Direct file upload endpoint (must be before express.json())
// Direct file upload endpoint (for large files via FormData)
app.post('/api/wan-animate/upload-video-direct', express.raw({ type: 'multipart/form-data', limit: '200mb' }), async (req, res) => {
  try {
    if (!FAL_API_KEY) {
      return res.status(500).json({ success: false, error: 'FAL_API_KEY not configured' });
    }

    // For now, return error - use data URI endpoint instead
    // This endpoint would need proper multipart parsing library like multer
    return res.status(501).json({ 
      success: false, 
      error: 'Direct upload not yet implemented. Please use smaller files (<50MB) or upload via data URI.' 
    });
  } catch (error) {
    logger.error('Wan-animate video upload error (direct)', { error: error.message });
    res.status(500).json({ success: false, error: getSafeErrorMessage(error, 'Failed to upload video') });
  }
});

// Increase JSON limit for image/video data URIs (can be large even after optimization)
// Videos especially can be very large, so we need a higher limit
// Note: Railway's reverse proxy may have a default 10MB limit. If you see 413 errors,
// you may need to configure Railway's proxy settings or use direct fal.ai uploads from frontend
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ extended: true, limit: '200mb' }));

// Serve static files from parent dist directory (frontend build)
const distPath = path.join(__dirname, '..', 'dist');

// Check if dist directory exists
if (!fs.existsSync(distPath)) {
  logger.warn(`⚠️  Dist directory not found at ${distPath}. Frontend may not be built.`);
} else {
  logger.info(`✅ Serving static files from ${distPath}`);
  app.use(express.static(distPath, {
    maxAge: '1d', // Cache static assets for 1 day
    etag: true,
    lastModified: true
  }));
}

// FAL API Key for Wan 2.2 Animate Replace
// IMPORTANT: Only use backend environment variable for security
// Never use VITE_FAL_API_KEY in backend (it's exposed to frontend)
const FAL_API_KEY = process.env.FAL_API_KEY;

// Wan 2.2 Animate Replace endpoints
// Direct file upload endpoint (for large files via FormData)
app.post('/api/wan-animate/upload-video-direct', async (req, res) => {
  try {
    if (!FAL_API_KEY) {
      return res.status(500).json({ success: false, error: 'FAL_API_KEY not configured' });
    }

    // Handle multipart/form-data
    const formData = await new Promise((resolve, reject) => {
      const chunks = [];
      req.on('data', chunk => chunks.push(chunk));
      req.on('end', () => {
        const buffer = Buffer.concat(chunks);
        // Parse multipart form data manually
        const boundary = req.headers['content-type']?.split('boundary=')[1];
        if (!boundary) {
          return reject(new Error('No boundary in Content-Type'));
        }
        
        const parts = buffer.toString('binary').split(`--${boundary}`);
        for (const part of parts) {
          if (part.includes('Content-Disposition: form-data')) {
            const headerEnd = part.indexOf('\r\n\r\n');
            if (headerEnd === -1) continue;
            
            const headers = part.substring(0, headerEnd);
            const body = part.substring(headerEnd + 4);
            const bodyEnd = body.indexOf(`\r\n--${boundary}`);
            const fileData = bodyEnd === -1 ? body : body.substring(0, bodyEnd);
            
            if (headers.includes('name="video"')) {
              return resolve(Buffer.from(fileData, 'binary'));
            }
          }
        }
        reject(new Error('No video field found'));
      });
      req.on('error', reject);
    });

    // Determine MIME type from file extension or default
    const mimeType = 'video/mp4';
    const extension = 'mp4';
    
    // Create multipart/form-data for fal.ai
    const boundary = `----formdata-${Date.now()}`;
    const CRLF = '\r\n';
    
    let formDataBody = '';
    formDataBody += `--${boundary}${CRLF}`;
    formDataBody += `Content-Disposition: form-data; name="file"; filename="video.${extension}"${CRLF}`;
    formDataBody += `Content-Type: ${mimeType}${CRLF}${CRLF}`;
    
    const formDataBuffer = Buffer.concat([
      Buffer.from(formDataBody, 'utf8'),
      formData,
      Buffer.from(`${CRLF}--${boundary}--${CRLF}`, 'utf8')
    ]);
    
    // Upload to fal.ai storage API
    const uploadResponse = await fetch('https://fal.ai/files', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${FAL_API_KEY}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body: formDataBuffer
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      logger.error('Failed to upload video to fal.ai (direct)', { 
        status: uploadResponse.status, 
        error: errorText.substring(0, 200) 
      });
      return res.status(uploadResponse.status).json({ 
        success: false, 
        error: `Failed to upload video: ${errorText.substring(0, 200)}` 
      });
    }

    const uploadData = await uploadResponse.json();
    const videoUrl = uploadData.url || uploadData.file?.url;
    
    if (!videoUrl) {
      logger.error('No video URL in fal.ai upload response (direct)', { uploadData });
      return res.status(500).json({ success: false, error: 'No video URL returned from upload' });
    }

    logger.info('Video uploaded to fal.ai (direct)', { videoUrl });
    res.json({ success: true, url: videoUrl });
  } catch (error) {
    logger.error('Wan-animate video upload error (direct)', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: getSafeErrorMessage(error, 'Failed to upload video') });
  }
});

app.post('/api/wan-animate/upload-video', async (req, res) => {
  try {
    if (!FAL_API_KEY) {
      return res.status(500).json({ success: false, error: 'FAL_API_KEY not configured' });
    }

    const { videoDataUri } = req.body;
    
    if (!videoDataUri || !videoDataUri.startsWith('data:')) {
      return res.status(400).json({ success: false, error: 'Invalid video data URI' });
    }

    // SECURITY: Limit data URI size to prevent memory exhaustion (50MB max)
    const MAX_DATA_URI_SIZE = 50 * 1024 * 1024; // 50MB
    if (videoDataUri.length > MAX_DATA_URI_SIZE) {
      logger.warn('Video data URI too large', { 
        size: videoDataUri.length,
        maxSize: MAX_DATA_URI_SIZE,
        ip: req.ip
      });
      return res.status(400).json({ 
        success: false, 
        error: `Video file too large. Maximum size is ${MAX_DATA_URI_SIZE / (1024 * 1024)}MB.` 
      });
    }

    // Convert data URI to buffer
    const base64Data = videoDataUri.split(',')[1];
    if (!base64Data) {
      return res.status(400).json({ success: false, error: 'Invalid video data URI format' });
    }
    
    const buffer = Buffer.from(base64Data, 'base64');
    
    // Additional size check after decoding (base64 is ~33% larger)
    if (buffer.length > MAX_DATA_URI_SIZE) {
      logger.warn('Decoded video buffer too large', { 
        bufferSize: buffer.length,
        maxSize: MAX_DATA_URI_SIZE,
        ip: req.ip
      });
      return res.status(400).json({ 
        success: false, 
        error: `Video file too large after decoding. Maximum size is ${MAX_DATA_URI_SIZE / (1024 * 1024)}MB.` 
      });
    }
    
    // Determine MIME type from data URI
    const mimeMatch = videoDataUri.match(/data:([^;]+)/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'video/mp4';
    const extension = mimeType.includes('quicktime') ? 'mov' : 'mp4';
    
    // Create multipart/form-data manually for Node.js
    const boundary = `----formdata-${Date.now()}`;
    const CRLF = '\r\n';
    
    let formDataBody = '';
    formDataBody += `--${boundary}${CRLF}`;
    formDataBody += `Content-Disposition: form-data; name="file"; filename="video.${extension}"${CRLF}`;
    formDataBody += `Content-Type: ${mimeType}${CRLF}${CRLF}`;
    
    const formDataBuffer = Buffer.concat([
      Buffer.from(formDataBody, 'utf8'),
      buffer,
      Buffer.from(`${CRLF}--${boundary}--${CRLF}`, 'utf8')
    ]);
    
    // Upload to fal.ai storage API
    const uploadResponse = await fetch('https://fal.ai/files', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${FAL_API_KEY}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body: formDataBuffer
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      logger.error('Failed to upload video to fal.ai', { 
        status: uploadResponse.status, 
        error: errorText.substring(0, 200) 
      });
      return res.status(uploadResponse.status).json({ 
        success: false, 
        error: `Failed to upload video: ${errorText.substring(0, 200)}` 
      });
    }

    const uploadData = await uploadResponse.json();
    const videoUrl = uploadData.url || uploadData.file?.url;
    
    if (!videoUrl) {
      logger.error('No video URL in fal.ai upload response', { uploadData });
      return res.status(500).json({ success: false, error: 'No video URL returned from upload' });
    }

    logger.info('Video uploaded to fal.ai', { videoUrl });
    res.json({ success: true, url: videoUrl });
  } catch (error) {
    logger.error('Wan-animate video upload error', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: getSafeErrorMessage(error, 'Failed to upload video') });
  }
});

app.post('/api/wan-animate/upload-image', async (req, res) => {
  try {
    if (!FAL_API_KEY) {
      return res.status(500).json({ success: false, error: 'FAL_API_KEY not configured' });
    }

    const { imageDataUri } = req.body;
    
    if (!imageDataUri || !imageDataUri.startsWith('data:')) {
      return res.status(400).json({ success: false, error: 'Invalid image data URI' });
    }

    // SECURITY: Limit data URI size to prevent memory exhaustion (10MB max for images)
    const MAX_IMAGE_DATA_URI_SIZE = 10 * 1024 * 1024; // 10MB
    if (imageDataUri.length > MAX_IMAGE_DATA_URI_SIZE) {
      logger.warn('Image data URI too large', { 
        size: imageDataUri.length,
        maxSize: MAX_IMAGE_DATA_URI_SIZE,
        ip: req.ip
      });
      return res.status(400).json({ 
        success: false, 
        error: `Image file too large. Maximum size is ${MAX_IMAGE_DATA_URI_SIZE / (1024 * 1024)}MB.` 
      });
    }

    // Convert data URI to buffer
    const base64Data = imageDataUri.split(',')[1];
    if (!base64Data) {
      return res.status(400).json({ success: false, error: 'Invalid image data URI format' });
    }
    
    const buffer = Buffer.from(base64Data, 'base64');
    
    // Additional size check after decoding
    if (buffer.length > MAX_IMAGE_DATA_URI_SIZE) {
      logger.warn('Decoded image buffer too large', { 
        bufferSize: buffer.length,
        maxSize: MAX_IMAGE_DATA_URI_SIZE,
        ip: req.ip
      });
      return res.status(400).json({ 
        success: false, 
        error: `Image file too large after decoding. Maximum size is ${MAX_IMAGE_DATA_URI_SIZE / (1024 * 1024)}MB.` 
      });
    }
    
    // Determine MIME type from data URI
    const mimeMatch = imageDataUri.match(/data:([^;]+)/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const extension = mimeType.includes('png') ? 'png' : 'jpg';
    
    // Create multipart/form-data manually for Node.js
    const boundary = `----formdata-${Date.now()}`;
    const CRLF = '\r\n';
    
    let formDataBody = '';
    formDataBody += `--${boundary}${CRLF}`;
    formDataBody += `Content-Disposition: form-data; name="file"; filename="image.${extension}"${CRLF}`;
    formDataBody += `Content-Type: ${mimeType}${CRLF}${CRLF}`;
    
    const formDataBuffer = Buffer.concat([
      Buffer.from(formDataBody, 'utf8'),
      buffer,
      Buffer.from(`${CRLF}--${boundary}--${CRLF}`, 'utf8')
    ]);
    
    // Upload to fal.ai storage API
    const uploadResponse = await fetch('https://fal.ai/files', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${FAL_API_KEY}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body: formDataBuffer
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      logger.error('Failed to upload image to fal.ai', { 
        status: uploadResponse.status, 
        error: errorText.substring(0, 200) 
      });
      return res.status(uploadResponse.status).json({ 
        success: false, 
        error: `Failed to upload image: ${errorText.substring(0, 200)}` 
      });
    }

    const uploadData = await uploadResponse.json();
    const imageUrl = uploadData.url || uploadData.file?.url;
    
    if (!imageUrl) {
      logger.error('No image URL in fal.ai upload response', { uploadData });
      return res.status(500).json({ success: false, error: 'No image URL returned from upload' });
    }

    logger.info('Image uploaded to fal.ai', { imageUrl });
    res.json({ success: true, url: imageUrl });
  } catch (error) {
    logger.error('Wan-animate image upload error', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: getSafeErrorMessage(error, 'Failed to upload image') });
  }
});

// Wan 2.2 Animate Replace API endpoint
// Documentation: https://fal.ai/models/fal-ai/wan/v2.2-14b/animate/replace/api
// SECURITY: Requires credits check before making external API calls
// Minimum 2 credits required for video generation (2 credits per second)
app.post('/api/wan-animate/submit', wanSubmitLimiter, requireCredits(2), async (req, res) => {
  try {
    if (!FAL_API_KEY) {
      logger.error('FAL_API_KEY not configured');
      return res.status(500).json({ success: false, error: 'FAL_API_KEY not configured' });
    }
    
    // Extract input from request body (can be nested in 'input' or at root level)
    // User identification (walletAddress, userId, email) is at root level, not in input
    const input = req.body?.input || req.body;
    
    logger.debug('Wan-animate submit request', {
      hasInput: !!input,
      hasVideoUrl: !!input?.video_url,
      hasImageUrl: !!input?.image_url,
      userId: req.user?.userId,
      email: req.user?.email,
      walletAddress: req.user?.walletAddress,
      requestBodyKeys: Object.keys(req.body)
    });
    
    // Validate required inputs
    if (!input?.video_url || typeof input.video_url !== 'string' || input.video_url.trim() === '') {
      return res.status(400).json({ success: false, error: 'video_url is required and must be a non-empty string' });
    }
    if (!input?.image_url || typeof input.image_url !== 'string' || input.image_url.trim() === '') {
      return res.status(400).json({ success: false, error: 'image_url is required and must be a non-empty string' });
    }
    
    // SECURITY: Validate URLs to prevent SSRF attacks
    // Only allow URLs from trusted domains (fal.ai, fal.media, or data URIs)
    const videoUrl = input.video_url.trim();
    const imageUrl = input.image_url.trim();
    
    const isValidUrl = (url) => {
      // Allow data URIs (for uploaded files)
      if (url.startsWith('data:')) return true;
      
      // Allow fal.ai and fal.media domains (trusted CDN)
      try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname.toLowerCase();
        return hostname.includes('fal.ai') || 
               hostname.includes('fal.media') ||
               hostname.endsWith('.fal.ai') ||
               hostname.endsWith('.fal.media');
      } catch (e) {
        return false; // Invalid URL format
      }
    };
    
    if (!isValidUrl(videoUrl)) {
      logger.warn('Invalid video URL - potential SSRF attempt', { 
        videoUrl: videoUrl.substring(0, 100),
        userId: req.user?.userId,
        email: req.user?.email,
        walletAddress: req.user?.walletAddress,
        ip: req.ip
      });
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid video_url. Only URLs from fal.ai/fal.media or data URIs are allowed.' 
      });
    }
    
    if (!isValidUrl(imageUrl)) {
      logger.warn('Invalid image URL - potential SSRF attempt', { 
        imageUrl: imageUrl.substring(0, 100),
        userId: req.user?.userId,
        email: req.user?.email,
        walletAddress: req.user?.walletAddress,
        ip: req.ip
      });
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid image_url. Only URLs from fal.ai/fal.media or data URIs are allowed.' 
      });
    }
    
    // Validate and sanitize optional parameters according to API spec
    // https://fal.ai/models/fal-ai/wan/v2.2-14b/animate/replace/api
    const validResolutions = ['480p', '580p', '720p'];
    const validVideoQualities = ['low', 'medium', 'high', 'maximum'];
    const validVideoWriteModes = ['fast', 'balanced', 'small'];
    
    const validatedInput = {
      video_url: videoUrl,
      image_url: imageUrl
    };
    
    // SECURITY: Prevent duplicate submissions within 30 seconds
    // Create a hash of the request to identify duplicates
    const requestHash = crypto.createHash('sha256')
      .update(`${videoUrl}|${imageUrl}|${req.user?.userId || req.user?.email || req.user?.walletAddress || req.ip}`)
      .digest('hex');
    
    const now = Date.now();
    const lastSubmission = recentSubmissions.get(requestHash);
    if (lastSubmission && (now - lastSubmission < DUPLICATE_PREVENTION_TTL)) {
      const timeRemaining = Math.ceil((DUPLICATE_PREVENTION_TTL - (now - lastSubmission)) / 1000);
      logger.warn('Duplicate submission attempt blocked', {
        requestHash: requestHash.substring(0, 16),
        timeRemaining,
        userId: req.user?.userId,
        email: req.user?.email,
        walletAddress: req.user?.walletAddress,
        ip: req.ip
      });
      return res.status(429).json({
        success: false,
        error: `Duplicate request detected. Please wait ${timeRemaining} second(s) before submitting the same request again.`
      });
    }
    
    // Record this submission
    recentSubmissions.set(requestHash, now);
    
    // Optional parameters with validation
    if (input.guidance_scale !== undefined) {
      const guidanceScale = parseFloat(input.guidance_scale);
      if (isNaN(guidanceScale) || guidanceScale < 0) {
        return res.status(400).json({ success: false, error: 'guidance_scale must be a non-negative number' });
      }
      validatedInput.guidance_scale = guidanceScale;
    }
    
    if (input.resolution !== undefined) {
      if (!validResolutions.includes(input.resolution)) {
        return res.status(400).json({ 
          success: false, 
          error: `resolution must be one of: ${validResolutions.join(', ')}` 
        });
      }
      validatedInput.resolution = input.resolution;
    }
    
    if (input.seed !== undefined && input.seed !== null) {
      const seed = parseInt(input.seed);
      if (isNaN(seed)) {
        return res.status(400).json({ success: false, error: 'seed must be an integer' });
      }
      validatedInput.seed = seed;
    }
    
    if (input.num_inference_steps !== undefined) {
      const steps = parseInt(input.num_inference_steps);
      if (isNaN(steps) || steps < 1) {
        return res.status(400).json({ success: false, error: 'num_inference_steps must be a positive integer' });
      }
      validatedInput.num_inference_steps = steps;
    }
    
    if (input.enable_safety_checker !== undefined) {
      validatedInput.enable_safety_checker = Boolean(input.enable_safety_checker);
    }
    
    if (input.enable_output_safety_checker !== undefined) {
      validatedInput.enable_output_safety_checker = Boolean(input.enable_output_safety_checker);
    }
    
    if (input.shift !== undefined) {
      const shift = parseFloat(input.shift);
      if (isNaN(shift) || shift < 1.0 || shift > 10.0) {
        return res.status(400).json({ 
          success: false, 
          error: 'shift must be a number between 1.0 and 10.0' 
        });
      }
      validatedInput.shift = shift;
    }
    
    if (input.video_quality !== undefined) {
      if (!validVideoQualities.includes(input.video_quality)) {
        return res.status(400).json({ 
          success: false, 
          error: `video_quality must be one of: ${validVideoQualities.join(', ')}` 
        });
      }
      validatedInput.video_quality = input.video_quality;
    }
    
    if (input.video_write_mode !== undefined) {
      if (!validVideoWriteModes.includes(input.video_write_mode)) {
        return res.status(400).json({ 
          success: false, 
          error: `video_write_mode must be one of: ${validVideoWriteModes.join(', ')}` 
        });
      }
      validatedInput.video_write_mode = input.video_write_mode;
    }
    
    if (input.return_frames_zip !== undefined) {
      validatedInput.return_frames_zip = Boolean(input.return_frames_zip);
    }
    
    if (input.use_turbo !== undefined) {
      validatedInput.use_turbo = Boolean(input.use_turbo);
    }
    
    logger.info('Wan-animate submit request', {
      hasVideoUrl: !!validatedInput.video_url,
      hasImageUrl: !!validatedInput.image_url,
      resolution: validatedInput.resolution,
      videoQuality: validatedInput.video_quality,
      videoWriteMode: validatedInput.video_write_mode
    });
    
    // Official fal.ai API endpoint for Wan 2.2 Animate Replace
    // See: https://fal.ai/models/fal-ai/wan/v2.2-14b/animate/replace/api
    // The API expects the input fields directly in the body, not nested in an "input" object
    logger.debug('Making request to fal.ai', {
      endpoint: 'https://queue.fal.run/fal-ai/wan/v2.2-14b/animate/replace',
      hasVideoUrl: !!validatedInput.video_url,
      hasImageUrl: !!validatedInput.image_url,
      hasApiKey: !!FAL_API_KEY && FAL_API_KEY.length > 0
    });
    
    const response = await fetch('https://queue.fal.run/fal-ai/wan/v2.2-14b/animate/replace', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${FAL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(validatedInput)
    });
    
    // Handle response text first to avoid JSON parse errors
    const responseText = await response.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      logger.error('Failed to parse wan-animate response', { 
        status: response.status, 
        statusText: response.statusText,
        responseText: responseText.substring(0, 500)
      });
      return res.status(response.status).json({ 
        success: false, 
        error: `API response parse error: ${responseText.substring(0, 200)}` 
      });
    }
    
    if (!response.ok) {
      // Extract detailed error message from API response
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      if (data) {
        // Handle different error response formats from fal.ai API
        if (data.detail) {
          // fal.ai often returns errors in { detail: "..." } format
          errorMessage = Array.isArray(data.detail) 
            ? data.detail.map(err => err.msg || err).join('; ')
            : data.detail;
        } else if (data.error) {
          errorMessage = data.error;
        } else if (data.message) {
          errorMessage = data.message;
        } else if (typeof data === 'string') {
          errorMessage = data;
        }
      }
      
      // Check if error is related to API key authentication (401 or 403 status)
      const isAuthError = response.status === 401 || response.status === 403;
      const isKeyError = errorMessage.toLowerCase().includes('key') || 
                         errorMessage.toLowerCase().includes('secret') || 
                         errorMessage.toLowerCase().includes('not found') || 
                         errorMessage.toLowerCase().includes('invalid') ||
                         errorMessage.toLowerCase().includes('unauthorized') ||
                         errorMessage.toLowerCase().includes('authentication');
      
      if (isAuthError || isKeyError) {
        logger.error('FAL_API_KEY authentication error', {
          status: response.status,
          errorMessage,
          responseText: responseText.substring(0, 500),
          hasApiKey: !!FAL_API_KEY && FAL_API_KEY.length > 0,
          apiKeyLength: FAL_API_KEY ? FAL_API_KEY.length : 0,
          apiKeyPrefix: FAL_API_KEY ? FAL_API_KEY.substring(0, 10) + '...' : 'none',
          apiKeyStartsWith: FAL_API_KEY ? (FAL_API_KEY.startsWith('fal_') ? 'fal_' : 'other') : 'none'
        });
        return res.status(401).json({ 
          success: false, 
          error: `FAL_API_KEY authentication failed (${response.status}). ${errorMessage}. Please check your API key configuration in backend.env.`
        });
      }
      
      logger.error('Wan-animate submit error', {
        status: response.status, 
        errorMessage,
        data,
        responseText: responseText.substring(0, 500),
        userId: req.user?.userId,
        email: req.user?.email,
        walletAddress: req.user?.walletAddress
      });
      
      return res.status(response.status).json({ 
        success: false, 
        error: errorMessage,
        ...(data && typeof data === 'object' ? data : {})
      });
    }
    
    res.json({ success: true, ...data });
  } catch (error) {
    logger.error('Wan-animate submit proxy error', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: getSafeErrorMessage(error, 'Failed to submit video generation request') });
  }
});

/**
 * Dynamic credit requirement middleware factory
 * Determines required credits based on model selection before checking
 */
const requireCreditsForModel = () => {
  return async (req, res, next) => {
    try {
      // Determine required credits based on model selection
      const { model, image_urls, image_url } = req.body;
      const isMultipleImages = image_urls && Array.isArray(image_urls) && image_urls.length >= 2;
      const isSingleImage = image_url || (image_urls && image_urls.length === 1);
      const isNanoBananaPro = model === 'nano-banana-pro' && (isMultipleImages || isSingleImage);
      const requiredCredits = isNanoBananaPro ? 2 : 1; // 2 credits for Nano Banana Pro ($0.20), 1 for others
      
      // Store required credits for use in handler
      req.requiredCreditsForModel = requiredCredits;
      
      // Use requireCredits middleware with dynamic credit amount
      return requireCredits(requiredCredits)(req, res, next);
    } catch (error) {
      logger.error('Error determining required credits', { error: error.message });
      return res.status(500).json({ success: false, error: 'Failed to determine required credits' });
    }
  };
};

/**
 * Image generation endpoint - SECURITY: Requires credits check before making external API calls
 * This endpoint proxies image generation requests to fal.ai after verifying user has credits
 */
// Apply free image rate limiter to image generation endpoint
app.post('/api/generate/image', freeImageRateLimiter, requireCreditsForModel(), async (req, res) => {
  try {
    if (!FAL_API_KEY) {
      return res.status(500).json({ success: false, error: 'FAL_API_KEY not configured' });
    }

    const {
      prompt,
      style,
      guidanceScale = 7.5,
      imageSize = 'square',
      numImages = 1,
      image_url,
      image_urls,
      aspect_ratio,
      seed,
      model
    } = req.body;

    // Validate required inputs
    if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
      return res.status(400).json({ success: false, error: 'prompt is required and must be a non-empty string' });
    }

    // Determine endpoint based on whether reference images are provided and model selection
    let endpoint;
    const isMultipleImages = image_urls && Array.isArray(image_urls) && image_urls.length >= 2;
    const isSingleImage = image_url || (image_urls && image_urls.length === 1);
    const isNanoBananaPro = model === 'nano-banana-pro' && (isMultipleImages || isSingleImage);
    
    if (isNanoBananaPro) {
      // Nano Banana Pro selected (works for both single and multiple images)
      endpoint = 'https://fal.run/fal-ai/nano-banana-pro/edit';
    } else if (isMultipleImages) {
      // Multiple images - use multi model
      endpoint = 'https://fal.run/fal-ai/flux-pro/kontext/max/multi';
    } else if (isSingleImage) {
      // Single image - use max model
      endpoint = 'https://fal.run/fal-ai/flux-pro/kontext/max';
    } else {
      // No images - use text-to-image
      endpoint = 'https://fal.run/fal-ai/flux-pro/kontext/text-to-image';
    }

    // Build request body for fal.ai
    // Nano Banana Pro has different parameters than FLUX
    let requestBody;
    
    if (isNanoBananaPro) {
      // Nano Banana Pro API format
      requestBody = {
        prompt: prompt.trim()
      };
      
      // For Nano Banana Pro, use image_urls for multiple images or single image
      if (isMultipleImages) {
        requestBody.image_urls = image_urls;
      } else if (isSingleImage) {
        // For single image, Nano Banana Pro also uses image_urls array format
        const singleImageUrl = image_url || (image_urls && image_urls[0]);
        requestBody.image_urls = [singleImageUrl];
      }
      
      // Add aspect ratio if provided
      if (aspect_ratio) {
        requestBody.aspect_ratio = aspect_ratio;
      }
      
      // Nano Banana Pro supports resolution parameter (1K, 2K, 4K)
      // Default to 1K if not specified
      requestBody.resolution = '1K';
    } else {
      // FLUX Kontext API format
      requestBody = {
        prompt: prompt.trim(),
        guidance_scale: guidanceScale,
        num_images: numImages,
        output_format: 'jpeg',
        safety_tolerance: '6',
        prompt_safety_tolerance: '6',
        enhance_prompt: true
      };

      // Add seed if provided
      if (seed !== undefined && seed !== null) {
        requestBody.seed = seed;
      } else {
        // Generate random seed if not provided
        requestBody.seed = Math.floor(Math.random() * 2147483647);
      }

      // Add reference image(s)
      if (image_urls && Array.isArray(image_urls) && image_urls.length >= 2) {
        requestBody.image_urls = image_urls;
      } else if (image_url || (image_urls && image_urls.length === 1)) {
        requestBody.image_url = image_url || image_urls[0];
      }

      // Add aspect ratio if provided
      if (aspect_ratio) {
        requestBody.aspect_ratio = aspect_ratio;
      }
    }

    logger.info('Image generation request', {
      endpoint,
      model: isNanoBananaPro ? 'nano-banana-pro' : 'flux',
      hasImage: !!requestBody.image_url,
      hasImages: !!requestBody.image_urls,
      imageCount: requestBody.image_urls?.length || 0,
      userId: req.user?.userId,
      email: req.user?.email,
      walletAddress: req.user?.walletAddress
    });

    // Make request to fal.ai
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Key ${FAL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      let errorMessage = `HTTP error! status: ${response.status}`;
      let errorData = null;
      try {
        errorData = await response.json();
        if (errorData.detail) {
          errorMessage = Array.isArray(errorData.detail)
            ? errorData.detail.map(err => err.msg || err).join('; ')
            : errorData.detail;
        } else if (errorData.error) {
          errorMessage = errorData.error;
        } else if (errorData.message) {
          errorMessage = errorData.message;
        }
      } catch (parseError) {
        const errorText = await response.text();
        errorMessage = errorText || errorMessage;
      }
      
      // Check if error is related to API key authentication (401 or 403 status)
      const isAuthError = response.status === 401 || response.status === 403;
      const isKeyError = errorMessage.toLowerCase().includes('key') || 
                         errorMessage.toLowerCase().includes('secret') || 
                         errorMessage.toLowerCase().includes('not found') || 
                         errorMessage.toLowerCase().includes('invalid') ||
                         errorMessage.toLowerCase().includes('unauthorized') ||
                         errorMessage.toLowerCase().includes('authentication') ||
                         errorMessage.toLowerCase().includes('no user found');
      
      if (isAuthError || isKeyError) {
        logger.error('FAL_API_KEY authentication error in image generation', {
          status: response.status,
          errorMessage,
          errorData,
          hasApiKey: !!FAL_API_KEY && FAL_API_KEY.length > 0,
          apiKeyLength: FAL_API_KEY ? FAL_API_KEY.length : 0,
          apiKeyPrefix: FAL_API_KEY ? FAL_API_KEY.substring(0, 10) + '...' : 'none',
          apiKeyStartsWith: FAL_API_KEY ? (FAL_API_KEY.startsWith('fal_') ? 'fal_' : 'other') : 'none'
        });
        return res.status(401).json({ 
          success: false, 
          error: `FAL_API_KEY authentication failed (${response.status}). ${errorMessage}. Please check your FAL_API_KEY in backend.env - it should start with 'fal_' and be a valid fal.ai API key.`
        });
      }
      
      logger.error('Fal.ai image generation error', { status: response.status, errorMessage, errorData });
      return res.status(response.status).json({ success: false, error: errorMessage });
    }

    const data = await response.json();
    
    // Handle both FLUX and Nano Banana Pro response formats
    // FLUX returns: { images: [{ url: ... }, ...] }
    // Nano Banana Pro returns: { images: [{ url: ... }, ...] } or similar format
    let images = [];
    if (data.images && Array.isArray(data.images)) {
      images = data.images;
    } else if (data.image && typeof data.image === 'string') {
      // Single image as string
      images = [{ url: data.image }];
    } else if (data.url && typeof data.url === 'string') {
      // Single image URL
      images = [{ url: data.url }];
    }
    
    if (images.length > 0) {
      logger.info('Image generation successful', {
        model: isNanoBananaPro ? 'nano-banana-pro' : 'flux',
        imageCount: images.length,
        userId: req.user?.userId,
        email: req.user?.email,
        walletAddress: req.user?.walletAddress
      });
      res.json({ success: true, images: images });
    } else {
      logger.error('No images in fal.ai response', { data, model: isNanoBananaPro ? 'nano-banana-pro' : 'flux' });
      return res.status(500).json({ success: false, error: 'No image generated' });
    }
  } catch (error) {
    logger.error('Image generation proxy error', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: getSafeErrorMessage(error, 'Failed to generate image') });
  }
});

// Status endpoint for Wan 2.2 Animate Replace
// API: https://fal.ai/models/fal-ai/wan/v2.2-14b/animate/replace/api
app.get('/api/wan-animate/status/:requestId', wanStatusLimiter, async (req, res) => {
  try {
    if (!FAL_API_KEY) {
      return res.status(500).json({ success: false, error: 'FAL_API_KEY not configured' });
    }
    const { requestId } = req.params;
    
    // SECURITY: Validate requestId format to prevent injection attacks
    // fal.ai request IDs are typically UUIDs or alphanumeric strings
    if (!requestId || typeof requestId !== 'string' || requestId.length > 200) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid request ID format' 
      });
    }
    
    // Only allow alphanumeric, hyphens, underscores, and dots
    if (!/^[a-zA-Z0-9._-]+$/.test(requestId)) {
      logger.warn('Invalid requestId format - potential injection attempt', { 
        requestId: requestId.substring(0, 50),
        ip: req.ip
      });
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid request ID format. Only alphanumeric characters, hyphens, underscores, and dots are allowed.' 
      });
    }
    // fal.ai queue API: try alternative endpoint structure
    // Based on: https://fal.ai/models/fal-ai/wan/v2.2-14b/animate/replace/api
    // Try using the model endpoint with requestId as query parameter
    const url = `https://queue.fal.run/fal-ai/wan/v2.2-14b/animate/replace/requests/${requestId}/status`;
    
    let response;
    try {
      // Try GET first (standard REST pattern)
      response = await fetch(url, { 
        method: 'GET',
        headers: { 
          'Authorization': `Key ${FAL_API_KEY}`
        }
      });
      
      // If GET returns 405, try POST (some queue APIs use POST)
      if (response.status === 405) {
        response = await fetch(url, { 
          method: 'POST',
          headers: { 
            'Authorization': `Key ${FAL_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ request_id: requestId })
        });
      }
    } catch (fetchError) {
      logger.error('Wan-animate status proxy fetch error', { 
        requestId, 
        error: fetchError.message, 
        stack: fetchError.stack 
      });
      return res.status(500).json({ success: false, error: `Network error: ${fetchError.message}` });
    }

    const responseText = await response.text();
    
    // Check if response is ok first, before trying to parse JSON
    if (!response.ok) {
      // Handle specific error statuses
      if (response.status === 404) {
        return res.status(404).json({ 
          success: false, 
          error: 'Request ID not found. The video generation request may have expired.' 
        });
      }
      
      if (response.status === 405) {
        logger.error('Wan-animate status method not allowed', {
          requestId,
          status: response.status,
          responseText: responseText.substring(0, 200),
          url
        });
        return res.status(405).json({ 
          success: false, 
          error: `Method not allowed. The API endpoint may have changed. Response: ${responseText.substring(0, 200)}` 
        });
      }
      
      // Try to parse error response as JSON, but fall back to plain text
      let errorData = {};
      try {
        if (responseText.trim()) {
          errorData = JSON.parse(responseText);
        }
      } catch (parseError) {
        // If parsing fails, use the plain text as error message
        errorData = { error: responseText.trim() || `HTTP ${response.status}: ${response.statusText}` };
      }
      
      logger.error('Wan-animate status error', {
        requestId,
        status: response.status,
        errorData,
        responseText: responseText.substring(0, 500)
      });
      
      return res.status(response.status).json({ 
        success: false, 
        error: errorData.error || errorData.message || `HTTP ${response.status}: ${response.statusText}`,
        ...errorData 
      });
    }

    // Response is ok, try to parse as JSON
    let data;
    try {
      if (responseText.trim()) {
        // Try to find the first valid JSON object in case there's extra content
        const jsonStart = responseText.indexOf('{');
        const jsonEnd = responseText.lastIndexOf('}');
        
        if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
          // Extract just the JSON portion
          const jsonText = responseText.substring(jsonStart, jsonEnd + 1);
          data = JSON.parse(jsonText);
        } else {
          // Try parsing the whole response
          data = JSON.parse(responseText.trim());
        }
      } else {
        data = {};
      }
    } catch (parseError) {
      logger.error('Wan-animate status proxy parse error', { 
        requestId,
        status: response.status,
        responseText: responseText.substring(0, 500),
        error: parseError.message 
      });
      return res.status(500).json({ 
        success: false, 
        error: `Invalid JSON response from Wan-animate API: ${parseError.message}. Response: ${responseText.substring(0, 200)}` 
      });
    }

    res.json({ success: true, ...data });
  } catch (error) {
    logger.error('Wan-animate status proxy error', { 
      requestId: req.params.requestId,
      error: error.message, 
      stack: error.stack 
    });
    res.status(500).json({ success: false, error: getSafeErrorMessage(error, 'Failed to check video generation status') });
  }
});

// Result endpoint for Wan 2.2 Animate Replace
// API: https://fal.ai/models/fal-ai/wan/v2.2-14b/animate/replace/api
app.get('/api/wan-animate/result/:requestId', wanResultLimiter, async (req, res) => {
  try {
    if (!FAL_API_KEY) {
      return res.status(500).json({ success: false, error: 'FAL_API_KEY not configured' });
    }
    const { requestId } = req.params;
    
    // SECURITY: Validate requestId format to prevent injection attacks
    if (!requestId || typeof requestId !== 'string' || requestId.length > 200) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid request ID format' 
      });
    }
    
    // Only allow alphanumeric, hyphens, underscores, and dots
    if (!/^[a-zA-Z0-9._-]+$/.test(requestId)) {
      logger.warn('Invalid requestId format - potential injection attempt', { 
        requestId: requestId.substring(0, 50),
        ip: req.ip
      });
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid request ID format. Only alphanumeric characters, hyphens, underscores, and dots are allowed.' 
      });
    }
    // fal.ai queue API: try alternative endpoint structure
    // Based on: https://fal.ai/models/fal-ai/wan/v2.2-14b/animate/replace/api
    // Try using the model endpoint with requestId as query parameter
    const url = `https://queue.fal.run/fal-ai/wan/v2.2-14b/animate/replace/requests/${requestId}/result`;
    
    let response;
    try {
      // Try GET first (standard REST pattern)
      response = await fetch(url, { 
        method: 'GET',
        headers: { 
          'Authorization': `Key ${FAL_API_KEY}`
        }
      });
      
      // If GET returns 405, try POST (some queue APIs use POST)
      if (response.status === 405) {
        response = await fetch(url, { 
          method: 'POST',
          headers: { 
            'Authorization': `Key ${FAL_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ request_id: requestId })
        });
      }
    } catch (fetchError) {
      logger.error('Wan-animate result proxy fetch error', { 
        requestId, 
        error: fetchError.message, 
        stack: fetchError.stack 
      });
      return res.status(500).json({ success: false, error: `Network error: ${fetchError.message}` });
    }

    const responseText = await response.text();
    
    // Check if response is ok first, before trying to parse JSON
    if (!response.ok) {
      // Handle specific error statuses
      if (response.status === 404) {
        return res.status(404).json({ 
          success: false, 
          error: 'Request ID not found. The video generation request may have expired.' 
        });
      }
      
      if (response.status === 405) {
        logger.error('Wan-animate result method not allowed', {
          requestId,
          status: response.status,
          responseText: responseText.substring(0, 200),
          url
        });
        return res.status(405).json({ 
          success: false, 
          error: `Method not allowed. The API endpoint may have changed. Response: ${responseText.substring(0, 200)}` 
        });
      }
      
      // Try to parse error response as JSON, but fall back to plain text
      let errorData = {};
      try {
        if (responseText.trim()) {
          errorData = JSON.parse(responseText);
        }
      } catch (parseError) {
        // If parsing fails, use the plain text as error message
        errorData = { error: responseText.trim() || `HTTP ${response.status}: ${response.statusText}` };
      }
      
      logger.error('Wan-animate result error', {
        requestId,
        status: response.status,
        errorData,
        responseText: responseText.substring(0, 500)
      });
      
      return res.status(response.status).json({ 
        success: false, 
        error: errorData.error || errorData.message || `HTTP ${response.status}: ${response.statusText}`,
        ...errorData 
      });
    }

    // Response is ok, try to parse as JSON
    let data;
    try {
      if (responseText.trim()) {
        // Try to find the first valid JSON object in case there's extra content
        const jsonStart = responseText.indexOf('{');
        const jsonEnd = responseText.lastIndexOf('}');
        
        if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
          // Extract just the JSON portion
          const jsonText = responseText.substring(jsonStart, jsonEnd + 1);
          data = JSON.parse(jsonText);
        } else {
          // Try parsing the whole response
          data = JSON.parse(responseText.trim());
        }
      } else {
        data = {};
      }
      
      // Log the result structure for debugging
      logger.debug('Wan-animate result response from fal.ai', {
        requestId,
        hasVideo: !!data.video,
        hasData: !!data.data,
        dataKeys: Object.keys(data),
        dataPreview: JSON.stringify(data).substring(0, 500)
      });
      
      // Ensure we're properly passing through the video data
      // The response should contain the video URL in one of these formats:
      // - data.video (string or object with url)
      // - data.data.video (string or object with url)
      // - data itself might be the video URL
      
      // Log video URL if found for verification
      let detectedVideoUrl = null;
      if (data.video) {
        detectedVideoUrl = typeof data.video === 'string' ? data.video : (data.video.url || data.video.file?.url);
      } else if (data.data?.video) {
        detectedVideoUrl = typeof data.data.video === 'string' ? data.data.video : (data.data.video.url || data.data.video.file?.url);
      } else if (typeof data === 'string' && data.startsWith('http')) {
        detectedVideoUrl = data;
      }
      
      if (detectedVideoUrl) {
        logger.info('Video URL detected in fal.ai response', {
          requestId,
          videoUrl: detectedVideoUrl.substring(0, 100),
          urlHost: new URL(detectedVideoUrl).hostname
        });
      } else {
        logger.warn('No video URL detected in fal.ai response structure', {
          requestId,
          dataKeys: Object.keys(data),
          dataStructure: JSON.stringify(data).substring(0, 500)
        });
      }
    } catch (parseError) {
      logger.error('Wan-animate result proxy parse error', { 
        requestId,
        status: response.status,
        responseText: responseText.substring(0, 500),
        error: parseError.message 
      });
      return res.status(500).json({ 
        success: false, 
        error: `Invalid JSON response from Wan-animate API: ${parseError.message}. Response: ${responseText.substring(0, 200)}` 
      });
    }

    // Return the fal.ai response wrapped in success flag
    // This ensures the frontend can extract the video URL properly
    res.json({ success: true, ...data });
  } catch (error) {
    logger.error('Wan-animate result proxy error', { 
      requestId: req.params.requestId,
      error: error.message, 
      stack: error.stack 
    });
    res.status(500).json({ success: false, error: getSafeErrorMessage(error, 'Failed to get video generation result') });
  }
});

/**
 * Complete video generation - deduct credits based on duration and add to gallery
 * Called by frontend after video is successfully generated and duration is calculated
 */
app.post('/api/wan-animate/complete', async (req, res) => {
  try {
    const { requestId, videoUrl, duration, walletAddress, userId, email } = req.body;
    
    if (!videoUrl) {
      return res.status(400).json({ success: false, error: 'videoUrl is required' });
    }
    
    if (!duration || duration <= 0) {
      return res.status(400).json({ success: false, error: 'duration is required and must be greater than 0' });
    }
    
    // Get user
    let user;
    if (walletAddress) {
      const isSolanaAddress = !walletAddress.startsWith('0x');
      const normalizedWalletAddress = isSolanaAddress ? walletAddress : walletAddress.toLowerCase();
      user = await getOrCreateUser(normalizedWalletAddress);
    } else if (userId) {
      user = await User.findOne({ userId });
      if (!user) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }
    } else if (email) {
      user = await User.findOne({ email: email.toLowerCase() });
      if (!user) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }
    } else {
      return res.status(400).json({ success: false, error: 'walletAddress, userId, or email is required' });
    }
    
    // Calculate credits (2 credits per second, minimum 2 credits)
    const creditsToDeduct = Math.max(Math.ceil(duration * 2), 2);
    
    // Check if user has enough credits
    const availableCredits = user.credits || 0;
    if (availableCredits < creditsToDeduct) {
      logger.warn('Insufficient credits for video completion', {
        userId: user.userId,
        email: user.email,
        walletAddress: user.walletAddress,
        availableCredits,
        creditsToDeduct,
        duration
      });
      return res.status(400).json({
        success: false,
        error: `Insufficient credits. Video requires ${creditsToDeduct} credits (${duration}s × 2), but you only have ${availableCredits} credits.`
      });
    }
    
    // Deduct credits and add to gallery
    const generationId = `gen_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const generation = {
      id: generationId,
      prompt: 'Video Animate Replace',
      style: 'Wan 2.2 Animate',
      videoUrl,
      creditsUsed: creditsToDeduct,
      timestamp: new Date()
    };
    
    const galleryItem = {
      id: generationId,
      prompt: 'Video Animate Replace',
      style: 'Wan 2.2 Animate',
      videoUrl,
      creditsUsed: creditsToDeduct,
      timestamp: new Date()
    };
    
    // Build update query
    let updateQuery;
    if (walletAddress) {
      const isSolanaAddress = !walletAddress.startsWith('0x');
      const normalizedWalletAddress = isSolanaAddress ? walletAddress : walletAddress.toLowerCase();
      updateQuery = { walletAddress: normalizedWalletAddress };
    } else if (userId) {
      updateQuery = { userId };
    } else if (email) {
      updateQuery = { email: email.toLowerCase() };
    }
    
    // Atomic update: deduct credits and add to history/gallery
    const updateResult = await User.findOneAndUpdate(
      updateQuery,
      {
        $inc: { 
          credits: -creditsToDeduct,
          totalCreditsSpent: creditsToDeduct
        },
        $push: {
          generationHistory: generation,
          gallery: galleryItem
        }
      },
      { new: true }
    );
    
    if (!updateResult) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    logger.info('Video generation completed and credits deducted', {
      userId: user.userId,
      email: user.email,
      walletAddress: user.walletAddress,
      generationId,
      requestId,
      duration,
      creditsToDeduct,
      remainingCredits: updateResult.credits
    });
    
    res.json({
      success: true,
      generationId,
      remainingCredits: updateResult.credits,
      creditsDeducted: creditsToDeduct,
      duration
    });
  } catch (error) {
    logger.error('Error completing video generation', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: getSafeErrorMessage(error, 'Failed to complete video generation') });
  }
});

// Validate required environment variables
const requiredEnvVars = ['MONGODB_URI', 'JWT_SECRET', 'SESSION_SECRET'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

// In production, payment wallet addresses are REQUIRED (no hardcoded fallbacks)
// Support both new unified variable (EVM_PAYMENT_WALLET_ADDRESS) and old individual chain variables
const productionRequiredVars = [];
if (process.env.NODE_ENV === 'production') {
  // Check for new unified EVM wallet or any of the old individual chain wallets
  const hasEVMWallet = process.env.EVM_PAYMENT_WALLET_ADDRESS || 
                       process.env.ETH_PAYMENT_WALLET || 
                       process.env.POLYGON_PAYMENT_WALLET || 
                       process.env.ARBITRUM_PAYMENT_WALLET || 
                       process.env.OPTIMISM_PAYMENT_WALLET || 
                       process.env.BASE_PAYMENT_WALLET;
  if (!hasEVMWallet) {
    productionRequiredVars.push('EVM_PAYMENT_WALLET_ADDRESS (or ETH_PAYMENT_WALLET, POLYGON_PAYMENT_WALLET, etc.)');
  }
  if (!process.env.SOLANA_PAYMENT_WALLET_ADDRESS && !process.env.SOLANA_PAYMENT_WALLET) {
    productionRequiredVars.push('SOLANA_PAYMENT_WALLET_ADDRESS or SOLANA_PAYMENT_WALLET');
  }
}

// Optional but recommended variables for full functionality
const recommendedEnvVars = [
  'ETH_RPC_URL',
  'POLYGON_RPC_URL',
  'STRIPE_SECRET_KEY'
];
const missingRecommended = recommendedEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  logger.error('Missing required environment variables:', { missingVars });
  // Don't exit in development, just warn
  if (process.env.NODE_ENV === 'production') {
    logger.error('❌ CRITICAL: Required environment variables missing in production. Server cannot start.');
    process.exit(1);
  } else {
    logger.warn('Running in development mode with missing required environment variables');
  }
}

if (productionRequiredVars.length > 0) {
  logger.error('❌ CRITICAL: Payment wallet addresses are REQUIRED in production:', { 
    missing: productionRequiredVars,
    note: 'Payment wallet addresses must be set via environment variables. Hardcoded fallbacks are not allowed in production.'
  });
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
}

if (missingRecommended.length > 0) {
  logger.warn('Missing recommended environment variables (some features may not work):', { 
    missingRecommended,
    note: 'Blockchain verification and payment features may be limited'
  });
}

// MongoDB connection
const mongoOptions = {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
};

// Add SSL for production
if (process.env.NODE_ENV === 'production') {
  mongoOptions.ssl = true;
  // SECURITY: Only allow invalid certificates in development/testing
  // In production, certificates MUST be valid for security
  mongoOptions.tlsAllowInvalidCertificates = process.env.MONGODB_ALLOW_INVALID_CERT === 'true' ? true : false;
  mongoOptions.authSource = 'admin';
  // Additional security options
  mongoOptions.retryWrites = true;
  mongoOptions.w = 'majority';
}

// Connect to MongoDB
if (process.env.MONGODB_URI) {
  logger.info('Connecting to MongoDB');
  mongoose.connect(process.env.MONGODB_URI, mongoOptions).catch((err) => {
    logger.error('MongoDB connection failed:', {
      message: err.message,
      code: err.code,
      note: 'Check that MONGODB_URI is correct and MongoDB is accessible'
    });
  });
} else {
  const errorMsg = 'MONGODB_URI not provided - signup and database features will not work';
  logger.error(errorMsg);
  if (process.env.NODE_ENV === 'production') {
    logger.error('❌ CRITICAL: MONGODB_URI is required in production. Set it in Railway environment variables.');
  }
}

// Create indexes for better performance
async function createIndexes() {
  try {
    if (mongoose.connection.readyState === 1) {
      // Ensure walletAddress index is sparse + unique (allows multiple documents with no wallet)
      const existingIndexes = await User.collection.indexes();
      const walletIndex = existingIndexes.find(idx => idx.name === 'walletAddress_1');

      if (walletIndex) {
        const needsUpdate = !(walletIndex.unique && walletIndex.sparse);
        if (needsUpdate) {
          logger.warn('Recreating walletAddress index to enforce unique+sparse');
          await User.collection.dropIndex('walletAddress_1');
          await User.collection.createIndex(
            { "walletAddress": 1 },
            { unique: true, sparse: true, background: true }
          );
        }
      } else {
        await User.collection.createIndex(
          { "walletAddress": 1 },
          { unique: true, sparse: true, background: true }
        );
      }

      // Create other indexes for frequently queried fields (only if they don't exist)
      await User.collection.createIndex({ "paymentHistory.txHash": 1 }, { background: true });
      await User.collection.createIndex({ "createdAt": 1 }, { background: true });
      await User.collection.createIndex({ "userId": 1 }, { background: true });
      await User.collection.createIndex({ "expiresAt": 1 }, { background: true });
      
      logger.info('Database indexes created successfully');
    }
  } catch (error) {
    // Ignore duplicate key errors (index already exists)
    if (error.code !== 11000) {
      logger.error('Error creating database indexes', { error: error.message });
    } else {
      logger.info('Database indexes already exist');
    }
  }
}

// Create indexes after connection
mongoose.connection.on('connected', async () => {
  logger.info('MongoDB connected successfully');
  await createIndexes();
});

mongoose.connection.on('error', (err) => {
  logger.error('MongoDB connection error', { 
    error: err.message,
    code: err.code,
    note: 'Check MONGODB_URI environment variable and MongoDB accessibility'
  });
  if (process.env.NODE_ENV === 'production') {
    logger.error('❌ CRITICAL: MongoDB connection failed in production. Signup will not work.');
  } else {
    logger.warn('MongoDB connection failed - app will continue without database');
  }
});

mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB disconnected');
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  if (err.message && err.message.includes('querySrv ENOTFOUND')) {
    logger.warn('MongoDB DNS error - continuing without database');
    return;
  }
  logger.error('Uncaught Exception', { error: err.message, stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  if (reason && reason.message && reason.message.includes('querySrv ENOTFOUND')) {
    logger.warn('MongoDB DNS error - continuing without database');
    return;
  }
  logger.error('Unhandled Rejection', { reason: reason?.message, promise });
});


// User Schema
const userSchema = new mongoose.Schema({
  walletAddress: { 
    type: String, 
    required: false,  // Allow for email-only users
    unique: true, 
    sparse: true,  // Allow multiple docs without walletAddress
    lowercase: true,
    index: true
  },
  email: {
    type: String,
    required: false,  // Allow for wallet-only users
    unique: true,
    sparse: true,  // Allow multiple docs without email
    lowercase: true,
    index: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email address']
  },
  password: {
    type: String,
    required: false,  // Only required for email users
    select: false  // Don't return password by default
  },
  userId: {  // For email-based users (auto-generated)
    type: String,
    unique: true,
    sparse: true,
    index: true,
    required: false
  },
  credits: { type: Number, default: 0 },
  totalCreditsEarned: { type: Number, default: 0 },
  totalCreditsSpent: { type: Number, default: 0 },
  nftCollections: [{
    contractAddress: String,
    chainId: String,
    tokenIds: [String],
    lastChecked: { type: Date, default: Date.now }
  }],
  // Payment History Schema - All payment entries must match this structure
  // Required fields: txHash, tokenSymbol, amount, credits, chainId, walletType, timestamp
  paymentHistory: [{
    txHash: String,
    tokenSymbol: String,
    amount: Number,
    credits: Number,
    chainId: String,
    walletType: String,
    timestamp: { type: Date, default: Date.now }
  }],
  generationHistory: [{
    id: String,
    prompt: String,
    style: String,
    imageUrl: String, // For images
    videoUrl: String, // For videos
    requestId: String, // For tracking queued video generations
    status: { type: String, enum: ['queued', 'processing', 'completed', 'failed'], default: 'completed' },
    creditsUsed: Number,
    timestamp: { type: Date, default: Date.now }
  }],
  gallery: [{
    id: String,
    imageUrl: String, // For images
    videoUrl: String, // For videos
    prompt: String,
    style: String,
    creditsUsed: Number,
    timestamp: { type: Date, default: Date.now }
  }],
  settings: {
    preferredStyle: String,
    defaultImageSize: String,
    enableNotifications: { type: Boolean, default: true }
  },
  lastActive: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) } // 30 days
}, {
  timestamps: true
});

// Add indexes for performance
userSchema.index({ walletAddress: 1 });
userSchema.index({ email: 1 });
userSchema.index({ userId: 1 });
userSchema.index({ createdAt: 1 });
userSchema.index({ expiresAt: 1 });
userSchema.index({ 'gallery.timestamp': 1 });

// Generate unique userId for email users
userSchema.pre('save', async function(next) {
  if (this.isNew && this.email && !this.userId) {
    try {
      // Generate userId from email hash
      const hash = crypto.createHash('sha256').update(this.email).digest('hex').substring(0, 16);
      this.userId = `email_${hash}`;
    } catch (error) {
      logger.error('Error generating userId in pre-save hook', { error: error.message });
      // Don't block save, but log the error
    }
  }
  next();
});

const User = mongoose.model('User', userSchema);

// IP-based free image tracking to prevent abuse
// Tracks how many free images have been used from each IP address
const ipFreeImageSchema = new mongoose.Schema({
  ipAddress: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  freeImagesUsed: {
    type: Number,
    default: 0,
    min: 0
  },
  lastUsed: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

ipFreeImageSchema.index({ ipAddress: 1 });
ipFreeImageSchema.index({ lastUsed: 1 });

const IPFreeImage = mongoose.model('IPFreeImage', ipFreeImageSchema);

// Maximum free images allowed per IP address
// NFT holders get 5 free images TOTAL (not per NFT), regular users get 2
// If user has ANY NFTs (nftCollections.length > 0), they get the NFT holder limit
const MAX_FREE_IMAGES_PER_IP_REGULAR = 2;
const MAX_FREE_IMAGES_PER_IP_NFT = 5;

// JWT Secret - REQUIRED in production, default only for development
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  logger.error('❌ CRITICAL: JWT_SECRET is required in production. Server cannot start without a secure JWT secret.');
  process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-here-32-chars-minimum-change-in-production';
if (process.env.NODE_ENV === 'production' && JWT_SECRET.length < 32) {
  logger.error('❌ CRITICAL: JWT_SECRET must be at least 32 characters long in production.');
  process.exit(1);
}

// JWT Authentication Middleware
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Find user by userId or email
    const user = await User.findOne({
      $or: [
        { userId: decoded.userId },
        { email: decoded.email }
      ]
    }).select('-password'); // Don't return password

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'User not found'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    logger.error('JWT authentication error:', error);
    return res.status(403).json({
      success: false,
      error: 'Invalid or expired token'
    });
  }
};

// Helper function to get or create user by email or wallet
async function getOrCreateUserByIdentifier(identifier, type = 'wallet') {
  let user;
  
  if (type === 'email') {
    user = await User.findOne({ email: identifier.toLowerCase() });
    if (!user) {
      user = new User({
        email: identifier.toLowerCase(),
        credits: 0,
        totalCreditsEarned: 0,
        totalCreditsSpent: 0,
        hasUsedFreeImage: false,
        nftCollections: [],
        paymentHistory: [],
        generationHistory: [],
        gallery: [],
        settings: {
          preferredStyle: null,
          defaultImageSize: '1024x1024',
          enableNotifications: true
        }
      });
      await user.save();
    }
  } else {
    // Wallet address (existing logic)
    return await getOrCreateUser(identifier);
  }
  
  return user;
}

/**
 * Helper function to get user from request body (walletAddress, userId, or email)
 * Used for endpoints that need to identify user before making external API calls
 */
async function getUserFromRequest(req) {
  const { walletAddress, userId, email } = req.body;
  
  logger.debug('Getting user from request', {
    hasWalletAddress: !!walletAddress,
    hasUserId: !!userId,
    hasEmail: !!email,
    walletAddress: walletAddress ? (walletAddress.substring(0, 10) + '...') : null,
    userId: userId ? (userId.substring(0, 10) + '...') : null,
    email: email ? (email.substring(0, 10) + '...') : null
  });
  
  if (walletAddress) {
    const isSolanaAddress = !walletAddress.startsWith('0x');
    const normalizedWalletAddress = isSolanaAddress ? walletAddress : walletAddress.toLowerCase();
    const user = await getOrCreateUser(normalizedWalletAddress);
    logger.debug('User found by wallet address', { 
      walletAddress: normalizedWalletAddress.substring(0, 10) + '...',
      userId: user?.userId,
      credits: user?.credits 
    });
    return user;
  } else if (userId) {
    let user = await User.findOne({ userId });
    if (!user) {
      // Create user if they don't exist (for email users who haven't been created yet)
      logger.info('Creating new user with userId', { userId });
      user = new User({
        userId,
        credits: 0,
        totalCreditsEarned: 0,
        totalCreditsSpent: 0,
        hasUsedFreeImage: false,
        nftCollections: [],
        paymentHistory: [],
        generationHistory: [],
        gallery: [],
        settings: {
          preferredStyle: null,
          defaultImageSize: '1024x1024',
          enableNotifications: true
        }
      });
      await user.save();
      logger.debug('New user created with userId', { userId, credits: user.credits });
    } else {
      logger.debug('User found by userId', { userId, credits: user.credits });
    }
    return user;
  } else if (email) {
    const normalizedEmail = email.toLowerCase();
    let user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      // Create user if they don't exist (for email users who haven't been created yet)
      logger.info('Creating new user with email', { email: normalizedEmail });
      user = new User({
        email: normalizedEmail,
        credits: 0,
        totalCreditsEarned: 0,
        totalCreditsSpent: 0,
        hasUsedFreeImage: false,
        nftCollections: [],
        paymentHistory: [],
        generationHistory: [],
        gallery: [],
        settings: {
          preferredStyle: null,
          defaultImageSize: '1024x1024',
          enableNotifications: true
        }
      });
      await user.save();
      logger.debug('New user created with email', { email: normalizedEmail, credits: user.credits });
    } else {
      logger.debug('User found by email', { email: normalizedEmail, credits: user.credits });
    }
    return user;
  }
  
  logger.warn('No user identification provided in request body');
  return null;
}

/**
 * Middleware to check credits before allowing external API calls
 * Requires walletAddress, userId, or email in request body
 */
function requireCredits(requiredCredits = 1) {
  return async (req, res, next) => {
    try {
      // Get user from request
      const user = await getUserFromRequest(req);
      
      if (!user) {
        logger.warn('No user identification in request', {
          requestBodyKeys: Object.keys(req.body || {}),
          hasWalletAddress: !!req.body?.walletAddress,
          hasUserId: !!req.body?.userId,
          hasEmail: !!req.body?.email
        });
        return res.status(400).json({
          success: false,
          error: 'User identification required. Please provide walletAddress, userId, or email.'
        });
      }
      
      // Check if user has enough credits OR if they're eligible for free images based on IP
      const availableCredits = user.credits || 0;
      const clientIP = extractClientIP(req);
      
      // Check IP-based free image usage (prevents abuse across multiple accounts)
      let ipFreeImageRecord = await IPFreeImage.findOne({ ipAddress: clientIP });
      if (!ipFreeImageRecord) {
        ipFreeImageRecord = new IPFreeImage({
          ipAddress: clientIP,
          freeImagesUsed: 0
        });
        await ipFreeImageRecord.save();
      }
      
      const freeImagesUsedFromIP = ipFreeImageRecord.freeImagesUsed || 0;
      
      // Check if user is NFT holder (has ANY NFTs - not counting how many)
      // NFT holders get 5 free images TOTAL per IP, not 5 per NFT
      const isNFTHolder = user.nftCollections && user.nftCollections.length > 0;
      const maxFreeImages = isNFTHolder ? MAX_FREE_IMAGES_PER_IP_NFT : MAX_FREE_IMAGES_PER_IP_REGULAR;
      const isEligibleForFreeImage = freeImagesUsedFromIP < maxFreeImages && requiredCredits === 1; // Only allow free image for single credit requests
      
      // Additional abuse prevention checks for free images (skip for NFT holders)
      if (isEligibleForFreeImage && availableCredits < requiredCredits && !isNFTHolder) {
        // Check disposable email (only for email users)
        if (user.email && isDisposableEmail(user.email)) {
          logger.warn('Disposable email detected for free image request', {
            email: user.email,
            clientIP
          });
          return res.status(400).json({
            success: false,
            error: 'Temporary email addresses are not allowed. Please use a permanent email address.'
          });
        }
        
        // Check account age (must be at least 2 minutes old) - skip for NFT holders
        const accountAgeCheck = checkAccountAge(user);
        if (!accountAgeCheck.allowed) {
          logger.warn('Account too new for free image', {
            userId: user.userId,
            email: user.email,
            accountAge: accountAgeCheck.reason
          });
          return res.status(400).json({
            success: false,
            error: accountAgeCheck.reason
          });
        }
      }
      
      if (availableCredits < requiredCredits && !isEligibleForFreeImage) {
        logger.warn('Insufficient credits for external API call', {
          userId: user.userId,
          email: user.email,
          walletAddress: user.walletAddress,
          availableCredits,
          requiredCredits,
          freeImagesUsedFromIP,
          maxFreeImages,
          isNFTHolder
        });
        return res.status(400).json({
          success: false,
          error: `Insufficient credits. You have ${availableCredits} credits but need ${requiredCredits}. Please purchase credits first.`
        });
      }
      
      // If using free image, mark it in the request for later tracking
      if (isEligibleForFreeImage) {
        req.isUsingFreeImage = true;
        req.clientIP = clientIP;
        logger.info('User eligible for free image (IP-based)', {
          userId: user.userId,
          email: user.email,
          walletAddress: user.walletAddress,
          clientIP,
          freeImagesUsedFromIP,
          maxFreeImages,
          isNFTHolder,
          browserFingerprint: generateBrowserFingerprint(req)
        });
      }
      
      // Attach user to request for use in route handler
      req.user = user;
      req.requiredCredits = requiredCredits;
      logger.debug('Credit check passed', {
        userId: user.userId,
        email: user.email,
        walletAddress: user.walletAddress,
        availableCredits,
        requiredCredits
      });
      next();
    } catch (error) {
      logger.error('Error in requireCredits middleware', { 
        error: error.message,
        stack: error.stack,
        requestBodyKeys: Object.keys(req.body || {})
      });
      return res.status(500).json({
        success: false,
        error: getSafeErrorMessage(error, 'Failed to verify credits')
      });
    }
  };
}

// Payment wallet addresses - use single EVM address for all EVM chains
// SECURITY: In production, these MUST be set via environment variables (no hardcoded fallbacks)
// Support both new unified variable and old individual chain variables for backward compatibility
let EVM_PAYMENT_ADDRESS;
let SOLANA_PAYMENT_ADDRESS;

// Get EVM wallet address - check new unified variable first, then fall back to old individual chain variables
EVM_PAYMENT_ADDRESS = process.env.EVM_PAYMENT_WALLET_ADDRESS || 
                      process.env.ETH_PAYMENT_WALLET || 
                      process.env.POLYGON_PAYMENT_WALLET || 
                      process.env.ARBITRUM_PAYMENT_WALLET || 
                      process.env.OPTIMISM_PAYMENT_WALLET || 
                      process.env.BASE_PAYMENT_WALLET;

// Get Solana wallet address
SOLANA_PAYMENT_ADDRESS = process.env.SOLANA_PAYMENT_WALLET_ADDRESS || process.env.SOLANA_PAYMENT_WALLET;

if (process.env.NODE_ENV === 'production') {
  // Production: Validate wallet address formats (addresses should be set by validation above)
  if (EVM_PAYMENT_ADDRESS && !/^0x[a-fA-F0-9]{40}$/.test(EVM_PAYMENT_ADDRESS)) {
    logger.error('❌ CRITICAL: EVM payment wallet address has invalid format. Must be a valid Ethereum address (0x followed by 40 hex characters).');
    process.exit(1);
  }
  if (SOLANA_PAYMENT_ADDRESS && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(SOLANA_PAYMENT_ADDRESS)) {
    logger.error('❌ CRITICAL: SOLANA payment wallet address has invalid format. Must be a valid Solana address.');
    process.exit(1);
  }
} else {
  // Development: Allow fallbacks for testing
  if (!EVM_PAYMENT_ADDRESS) {
    EVM_PAYMENT_ADDRESS = '0xa0aE05e2766A069923B2a51011F270aCadFf023a';
  }
  if (!SOLANA_PAYMENT_ADDRESS) {
    SOLANA_PAYMENT_ADDRESS = 'CkhFmeUNxdr86SZEPg6bLgagFkRyaDMTmFzSVL69oadA';
  }
}

const PAYMENT_WALLETS = {
  '1': EVM_PAYMENT_ADDRESS, // Ethereum
  '137': EVM_PAYMENT_ADDRESS, // Polygon
  '42161': EVM_PAYMENT_ADDRESS, // Arbitrum
  '10': EVM_PAYMENT_ADDRESS, // Optimism
  '8453': EVM_PAYMENT_ADDRESS, // Base
  'solana': SOLANA_PAYMENT_ADDRESS
};

// Token configurations
const TOKEN_CONFIGS = {
  '1': {
    'USDC': { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6, creditRate: 6.67 },
    'USDT': { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6, creditRate: 6.67 },
    'DAI': { address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', decimals: 18, creditRate: 6.67 },
    'WETH': { address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals: 18, creditRate: 2000 }
  },
  '137': {
    'USDC': { address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', decimals: 6, creditRate: 6.67 },
    'USDT': { address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6, creditRate: 6.67 },
    'WMATIC': { address: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', decimals: 18, creditRate: 1.5 }
  },
  '42161': {
    'USDC': { address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6, creditRate: 6.67 },
    'USDT': { address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', decimals: 6, creditRate: 6.67 }
  },
  '10': {
    'USDC': { address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', decimals: 6, creditRate: 6.67 }
  },
  '8453': {
    'USDC': { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6, creditRate: 6.67 }
  }
};

// Credit calculation constants
const STANDARD_CREDITS_PER_USDC = 6.67; // $0.15 per credit

// Qualifying NFT collections and token contracts for discount/benefits
const QUALIFYING_NFT_COLLECTIONS = [
  // Your NFT Collections
  { chainId: '1', address: '0x8e84dcaf616c3e04ed45d3e0912b81e7283a48da', name: 'Your NFT Collection 1', type: 'erc721' },
  { chainId: '1', address: '0xd7d1431f43767a47bf7f5c6a651d24398e537729', name: 'Your NFT Collection 2', type: 'erc721' },
  { chainId: '8453', address: '0x1e71ea45fb939c92045ff32239a8922395eeb31b', name: 'Your Base NFT Collection', type: 'erc721' },
  // Token Holdings
  { chainId: '1', address: '0x0000000000c5dc95539589fbD24BE07c6C14eCa4', name: '$CULT Holders', type: 'erc20', minBalance: '500000' }
];

// Helper function to check if payment already processed
const isPaymentAlreadyProcessed = (user, txHash, paymentIntentId = null) => {
  if (paymentIntentId) {
    return user.paymentHistory.some(p => p.paymentIntentId === paymentIntentId);
  }
  return user.paymentHistory.some(p => p.txHash === txHash);
};

// Helper function to calculate credits from USDC amount
const calculateCreditsFromAmount = (amount, creditsPerUSDC = STANDARD_CREDITS_PER_USDC) => {
  return Math.floor(parseFloat(amount) * creditsPerUSDC);
};

// Helper to calculate subscription credits (shared by webhook + verification endpoint)
const calculateSubscriptionCredits = (user, amountInDollars) => {
  const baseRate = 5; // 5 credits per dollar (50 credits for $10)
  let scalingMultiplier = 1.0;
  if (amountInDollars >= 80) {
    scalingMultiplier = 1.3; // 30% bonus for $80+
  } else if (amountInDollars >= 40) {
    scalingMultiplier = 1.2; // 20% bonus for $40-79
  } else if (amountInDollars >= 20) {
    scalingMultiplier = 1.1; // 10% bonus for $20-39
  }

  const isNFTHolder = !!(user.walletAddress && user.nftCollections && user.nftCollections.length > 0);
  const nftMultiplier = isNFTHolder ? 1.2 : 1;

  const finalCredits = Math.floor(amountInDollars * baseRate * scalingMultiplier * nftMultiplier);

  return {
    finalCredits,
    isNFTHolder,
    nftMultiplier
  };
};

// Helper function to add credits and payment history to user
const addCreditsToUser = async (user, {
  txHash,
  tokenSymbol,
  amount,
  credits,
  chainId,
  walletType,
  timestamp = new Date(),
  paymentIntentId = null,
  subscriptionId = null
}) => {
  user.credits += credits;
  user.totalCreditsEarned += credits;
  
  const paymentEntry = {
    txHash: paymentIntentId || txHash,
    tokenSymbol: tokenSymbol || 'USDC',
    amount: parseFloat(amount),
    credits,
    chainId: chainId || 'unknown',
    walletType: walletType || 'evm',
    timestamp
  };
  
  if (paymentIntentId) {
    paymentEntry.paymentIntentId = paymentIntentId;
  }
  
  if (subscriptionId) {
    paymentEntry.subscriptionId = subscriptionId;
  }
  
  user.paymentHistory.push(paymentEntry);
  await user.save();
  
  return paymentEntry;
};

const addSubscriptionCredits = async (user, {
  amountInDollars,
  paymentId,
  subscriptionId,
  chainId = 'stripe',
  walletType = 'card'
}) => {
  const { finalCredits } = calculateSubscriptionCredits(user, amountInDollars);

  await addCreditsToUser(user, {
    txHash: paymentId,
    tokenSymbol: 'USD',
    amount: amountInDollars,
    credits: finalCredits,
    chainId,
    walletType,
    paymentIntentId: paymentId,
    subscriptionId
  });

  return finalCredits;
};

/**
 * Shared helper function to check NFT holdings for a wallet
 * @param {string} walletAddress - The wallet address to check
 * @param {Array} collections - Optional collections to check (defaults to QUALIFYING_NFT_COLLECTIONS)
 * @returns {Promise<{ownedCollections: Array, isHolder: boolean}>}
 */
const checkNFTHoldingsForWallet = async (walletAddress, collections = QUALIFYING_NFT_COLLECTIONS) => {
  const ownedCollections = [];
  
  // Normalize wallet address (EVM addresses should be lowercase, Solana stays as-is)
  const isSolanaAddress = !walletAddress.startsWith('0x');
  const normalizedWalletAddress = isSolanaAddress ? walletAddress : walletAddress.toLowerCase();
  
  logger.info('Starting NFT check for wallet', { 
    original: walletAddress,
    normalized: normalizedWalletAddress,
    isSolana: isSolanaAddress,
    collectionCount: collections.length 
  });
  
  // Group collections by chain for parallel processing
  const collectionsByChain = {};
  for (const collection of collections) {
    if (!collectionsByChain[collection.chainId]) {
      collectionsByChain[collection.chainId] = [];
    }
    collectionsByChain[collection.chainId].push(collection);
  }
  
  // Process each chain in parallel
  const chainResults = await Promise.allSettled(
    Object.entries(collectionsByChain).map(async ([chainId, chainCollections]) => {
      const rpcUrl = RPC_ENDPOINTS[chainId];
      if (!rpcUrl) {
        logger.warn('No RPC URL for chain', { chainId });
        return [];
      }
      
      logger.debug('Processing chain collections', { chainId, count: chainCollections.length });
      const provider = new ethers.JsonRpcProvider(rpcUrl, undefined, {
        polling: false,
        batchMaxCount: 10,
        batchMaxWait: 100,
        staticNetwork: { chainId: parseInt(chainId), name: chainId === '1' ? 'mainnet' : 'base' }
      });
      
      // Process collections in parallel within each chain
      return Promise.allSettled(
        chainCollections.map(async (collection) => {
          try {
            // Validate collection address before attempting to check
            if (collection.type === 'erc721' || collection.type === 'erc20') {
              if (!ethers.isAddress(collection.address)) {
                logger.debug(`Skipping invalid collection address: ${collection.address}`, { 
                  collectionName: collection.name,
                  chainId: collection.chainId,
                  type: collection.type
                });
                return null;
              }
            }
            
            logger.debug('Checking collection', { 
              address: collection.address, 
              chainId: collection.chainId, 
              name: collection.name,
              type: collection.type 
            });
            
            if (collection.type === 'erc721') {
              // Skip EVM NFT checks for Solana addresses
              if (!normalizedWalletAddress.startsWith('0x')) {
                logger.debug('Skipping EVM NFT check for Solana address', { walletAddress: normalizedWalletAddress, collection: collection.name });
                return null;
              }
              
              // Validate wallet address
              if (!ethers.isAddress(normalizedWalletAddress)) {
                throw new Error(`Invalid wallet address format: ${normalizedWalletAddress}`);
              }
              
              // Use Alchemy NFT API - simple and reliable
              const apiKey = getAlchemyApiKey(collection.chainId);
              const apiBase = ALCHEMY_API_BASES[collection.chainId];
              
              if (!apiKey || !apiBase) {
                logger.warn('Alchemy API key not configured for chain', { chainId: collection.chainId });
                // Fallback to ethers contract call
                const nftContract = new ethers.Contract(
                  collection.address,
                  ['function balanceOf(address owner) view returns (uint256)'],
                  provider
                );
                const balance = await nftContract.balanceOf(normalizedWalletAddress);
                const balanceNumber = Number(balance);
                if (balanceNumber > 0) {
                  return {
                    contractAddress: collection.address,
                    chainId: collection.chainId,
                    name: collection.name,
                    type: collection.type,
                    balance: balance.toString(),
                    tokenIds: [],
                    lastChecked: new Date()
                  };
                }
                return null;
              }
              
              // Simple Alchemy API call: Get NFTs for wallet and filter by collection
              const alchemyUrl = `${apiBase}/v2/${apiKey}/getNFTs?owner=${normalizedWalletAddress}&contractAddresses[]=${collection.address}&withMetadata=false`;
              
              logger.info('Checking NFT via Alchemy API', { 
                url: `${apiBase}/v2/${apiKey}/getNFTs?owner=...&contractAddresses[]=${collection.address}`,
                collection: collection.address,
                wallet: normalizedWalletAddress,
                chainId: collection.chainId
              });
              
              const response = await fetch(alchemyUrl, {
                method: 'GET',
                headers: { 'Accept': 'application/json' },
                signal: AbortSignal.timeout(10000)
              });
              
              if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Alchemy API error: ${response.status} - ${errorText}`);
              }
              
              const data = await response.json();
              const nfts = data.ownedNfts || [];
              const balance = nfts.length;
              
              logger.info('Alchemy API response', { 
                collection: collection.address,
                wallet: normalizedWalletAddress,
                balance,
                nftCount: nfts.length
              });
              
              if (balance > 0) {
                logger.info('✅ NFT FOUND via Alchemy! User is a holder', { 
                  address: collection.address, 
                  name: collection.name, 
                  balance,
                  chainId: collection.chainId,
                  walletAddress: normalizedWalletAddress
                });
                return {
                  contractAddress: collection.address,
                  chainId: collection.chainId,
                  name: collection.name,
                  type: collection.type,
                  balance: balance.toString(),
                  tokenIds: nfts.map(nft => nft.id?.tokenId || nft.tokenId).filter(Boolean),
                  lastChecked: new Date()
                };
              }
              
              return null;
            } else if (collection.type === 'erc20') {
              // Skip EVM token checks for Solana addresses
              if (!normalizedWalletAddress.startsWith('0x')) {
                logger.debug('Skipping EVM token check for Solana address', { walletAddress: normalizedWalletAddress, collection: collection.name });
                return null;
              }
              
              // Validate wallet address (collection address already validated above)
              if (!ethers.isAddress(normalizedWalletAddress)) {
                throw new Error(`Invalid wallet address format: ${normalizedWalletAddress}`);
              }
              
              // Token contract check with timeout
              const tokenContract = new ethers.Contract(
                collection.address,
                ['function balanceOf(address owner) view returns (uint256)', 'function decimals() view returns (uint8)'],
                provider
              );
              
              logger.debug('Calling token balanceOf', { 
                collection: collection.address, 
                wallet: normalizedWalletAddress,
                chainId: collection.chainId 
              });
              
              const [balance, decimals] = await Promise.race([
                Promise.all([tokenContract.balanceOf(normalizedWalletAddress), tokenContract.decimals()]),
                new Promise((_, reject) => 
                  setTimeout(() => reject(new Error('Contract call timeout')), 10000)
                )
              ]);
              
              const formattedBalance = parseFloat(ethers.formatUnits(balance, decimals));
              const minBalance = parseFloat(collection.minBalance);
              const meetsMinimum = formattedBalance >= minBalance;
              
              logger.info('Token balance check result', { 
                address: collection.address, 
                walletAddress: normalizedWalletAddress,
                chainId: collection.chainId,
                collectionName: collection.name,
                balance: formattedBalance,
                balanceRaw: balance.toString(),
                minBalance,
                decimals,
                meetsMinimum
              });
              
              if (meetsMinimum) {
                logger.info('✅ TOKEN BALANCE SUFFICIENT! User is a holder', { 
                  address: collection.address, 
                  name: collection.name, 
                  balance: formattedBalance,
                  minBalance,
                  chainId: collection.chainId,
                  walletAddress: normalizedWalletAddress
                });
                return {
                  contractAddress: collection.address,
                  chainId: collection.chainId,
                  name: collection.name,
                  type: collection.type,
                  balance: formattedBalance.toString(),
                  minBalance: collection.minBalance,
                  lastChecked: new Date()
                };
              } else {
                logger.debug('Token balance insufficient', {
                  address: collection.address,
                  name: collection.name,
                  balance: formattedBalance,
                  minBalance,
                  walletAddress: normalizedWalletAddress
                });
              }
              return null;
            }
          } catch (error) {
            // Log detailed error information for debugging
            const errorDetails = {
              collectionAddress: collection.address,
              chainId: collection.chainId,
              collectionName: collection.name,
              collectionType: collection.type,
              walletAddress: normalizedWalletAddress,
              errorMessage: error.message,
              errorName: error.name,
              errorCode: error.code,
              // Only include stack trace in development or for critical errors
              ...(process.env.NODE_ENV === 'development' && { errorStack: error.stack?.substring(0, 500) })
            };
            
            // Categorize common errors
            if (error.message?.includes('timeout') || error.message?.includes('Contract call timeout')) {
              logger.debug(`Collection check timeout (will retry on next check): ${collection.address}`, errorDetails);
            } else if (error.message?.includes('network') || error.message?.includes('ECONNREFUSED') || error.message?.includes('fetch failed')) {
              logger.debug(`Network error checking collection (will retry on next check): ${collection.address}`, errorDetails);
            } else if (error.code === 'CALL_EXCEPTION' || error.message?.includes('call exception')) {
              logger.debug(`Contract call exception (contract may not exist or be incompatible): ${collection.address}`, errorDetails);
            } else {
              // Unknown errors - log as warning for investigation
              logger.warn(`Error checking collection ${collection.address}:`, errorDetails);
            }
            
            return null; // Return null instead of throwing to continue processing other collections
          }
        })
      );
    })
  );
  
  // Flatten results and filter out nulls
  let totalChecked = 0;
  let successfulChecks = 0;
  let failedChecks = 0;
  
  for (const chainResult of chainResults) {
    if (chainResult.status === 'fulfilled') {
      for (const collectionResult of chainResult.value) {
        totalChecked++;
        if (collectionResult.status === 'fulfilled') {
          if (collectionResult.value) {
            ownedCollections.push(collectionResult.value);
            successfulChecks++;
            logger.info(`✅ Collection check successful: ${collectionResult.value.name}`, {
              address: collectionResult.value.contractAddress,
              balance: collectionResult.value.balance,
              chainId: collectionResult.value.chainId
            });
          } else {
            // Result was null (no balance or other reason)
            failedChecks++;
          }
        } else {
          // Promise was rejected
          failedChecks++;
          logger.warn('Collection check failed (promise rejected):', {
            reason: collectionResult.reason?.message || collectionResult.reason,
            error: collectionResult.reason
          });
        }
      }
    } else {
      // Chain-level failure
      logger.warn('Chain check failed:', {
        chainId: chainResult.reason?.chainId || 'unknown',
        error: chainResult.reason?.message || chainResult.reason
      });
    }
  }
  
  // Only consider wallet as NFT holder if they actually have NFTs (balance > 0)
  // Handle both integer balances (ERC721) and decimal balances (ERC20)
  const isHolder = ownedCollections.some(collection => {
    if (!collection.balance || collection.error) {
      logger.debug('Skipping collection with invalid balance', { collection });
      return false;
    }
    const balance = parseFloat(collection.balance);
    const isValid = !isNaN(balance) && balance > 0;
    if (isValid) {
      logger.info(`NFT Holder detected! Collection: ${collection.name}, Balance: ${balance}`);
    }
    return isValid;
  });
  
  logger.info('NFT check completed', { 
    walletAddress: normalizedWalletAddress,
    originalWalletAddress: walletAddress,
    isHolder,
    ownedCollectionsCount: ownedCollections.length,
    totalChecked,
    successfulChecks,
    failedChecks,
    collections: ownedCollections.map(c => ({ name: c.name, balance: c.balance, chainId: c.chainId, type: c.type })),
    // Include details about failed checks for debugging
    ...(failedChecks > 0 && {
      warning: `${failedChecks} collection checks failed - check logs for details`
    })
  });
  
  return { ownedCollections, isHolder };
};

// Alchemy API Key (extract from RPC URL or use dedicated env var)
const getAlchemyApiKey = (chainId) => {
  const apiKey = process.env.ALCHEMY_API_KEY;
  if (apiKey) return apiKey;
  
  // Try to extract from RPC URL
  const rpcUrl = RPC_ENDPOINTS[chainId] || '';
  const match = rpcUrl.match(/\/v2\/([^\/\?]+)/);
  return match ? match[1] : null;
};

// RPC endpoints - REQUIRED environment variables (no hardcoded fallbacks)
const RPC_ENDPOINTS = {
  '1': process.env.ETH_RPC_URL,
  '8453': process.env.BASE_RPC_URL,
  '137': process.env.POLYGON_RPC_URL,
  '42161': process.env.ARBITRUM_RPC_URL,
  '10': process.env.OPTIMISM_RPC_URL
};

// Validate RPC endpoints are configured
const missingRpcEndpoints = Object.entries(RPC_ENDPOINTS)
  .filter(([chainId, url]) => !url)
  .map(([chainId]) => chainId);

if (missingRpcEndpoints.length > 0) {
  logger.warn('Missing RPC endpoints for chains:', missingRpcEndpoints);
  if (process.env.NODE_ENV === 'production') {
    logger.error('RPC endpoints are required in production. Missing:', missingRpcEndpoints);
  }
}

// Alchemy API base URLs by chain
const ALCHEMY_API_BASES = {
  '1': 'https://eth-mainnet.g.alchemy.com',
  '8453': 'https://base-mainnet.g.alchemy.com',
  '137': 'https://polygon-mainnet.g.alchemy.com',
  '42161': 'https://arb-mainnet.g.alchemy.com',
  '10': 'https://opt-mainnet.g.alchemy.com'
};

// ERC-20 ABI
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "function transfer(address to, uint256 amount) returns (bool)"
];

/**
 * Get or create user
 */
async function getOrCreateUser(walletAddress) {
  // Detect wallet type: Solana addresses don't start with 0x
  const isSolanaAddress = !walletAddress.startsWith('0x');
  const normalizedAddress = isSolanaAddress ? walletAddress : walletAddress.toLowerCase();
  
  // Use findOneAndUpdate with upsert to make this atomic and prevent race conditions
  // This ensures that if credits were granted before user connects, they won't be lost
  const user = await User.findOneAndUpdate(
    { walletAddress: normalizedAddress },
    {
      $setOnInsert: {
        walletAddress: normalizedAddress,
        credits: 0,
        totalCreditsEarned: 0,
        totalCreditsSpent: 0,
        hasUsedFreeImage: false,
        nftCollections: [],
        paymentHistory: [],
        generationHistory: [],
        gallery: [],
        settings: {
          preferredStyle: null,
          defaultImageSize: '1024x1024',
          enableNotifications: true
        }
      },
      $set: {
        lastActive: new Date()
      }
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true
    }
  );
  
  // Always refetch to ensure we have the absolute latest data, especially credits
  // This handles the case where credits might have been granted between the upsert and now
  const latestUser = await User.findOne({ walletAddress: normalizedAddress });
  
  if (!latestUser) {
    // This shouldn't happen, but handle edge case
    logger.error('User not found after creation', { walletAddress: normalizedAddress });
    return user;
  }
  
  // Log if this was a new user creation
  if (latestUser.createdAt && Date.now() - new Date(latestUser.createdAt).getTime() < 2000) {
    logger.info('New user created/accessed', { 
      walletAddress: normalizedAddress, 
      isSolana: isSolanaAddress, 
      credits: latestUser.credits,
      totalCreditsEarned: latestUser.totalCreditsEarned
    });
  }
  
  // If user already had credits (granted before first connection), log it
  if (latestUser.credits > 0 && latestUser.createdAt && Date.now() - new Date(latestUser.createdAt).getTime() < 2000) {
    logger.info('User created with existing credits (granted before first connection)', {
      walletAddress: normalizedAddress,
      credits: latestUser.credits
    });
  }
  
  return latestUser;
}

/**
 * Verify EVM payment transaction
 */
async function verifyEVMPayment(txHash, walletAddress, tokenSymbol, amount, chainId) {
  try {
    const rpcUrl = RPC_ENDPOINTS[chainId];
    if (!rpcUrl) {
      throw new Error(`Unsupported chain: ${chainId}`);
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const tx = await provider.getTransaction(txHash);
    
    if (!tx) {
      throw new Error('Transaction not found');
    }

    const receipt = await tx.wait();
    if (receipt.status !== 1) {
      throw new Error('Transaction failed');
    }

    const tokenConfig = TOKEN_CONFIGS[chainId]?.[tokenSymbol];
    if (!tokenConfig) {
      throw new Error(`Token ${tokenSymbol} not supported on chain ${chainId}`);
    }

    const paymentWallet = PAYMENT_WALLETS[chainId];
    logger.debug('Payment wallet for chain', { chainId, paymentWallet });
    
    if (!paymentWallet) {
      throw new Error(`Payment wallet not configured for chain ${chainId}`);
    }

    logger.debug('Transaction verification', { 
      txFrom: tx.from, 
      walletAddress: walletAddress.toLowerCase() 
    });
    
    if (tx.from.toLowerCase() !== walletAddress.toLowerCase()) {
      throw new Error('Transaction sender does not match wallet address');
    }

    // Parse transfer logs
    const tokenContract = new ethers.Contract(tokenConfig.address, ERC20_ABI, provider);
    const transferTopic = ethers.id('Transfer(address,address,uint256)');
    const transferLogs = receipt.logs.filter(log => log.topics[0] === transferTopic);
    
    logger.debug(`Found ${transferLogs.length} transfer event(s) for verification`);
    
    let validTransfer = false;
    let actualAmount = 0;

    for (const log of transferLogs) {
      try {
        const decoded = tokenContract.interface.parseLog(log);
        const from = decoded.args[0];
        const to = decoded.args[1];
        const value = decoded.args[2];

        if (to.toLowerCase() === paymentWallet.toLowerCase() && 
            from.toLowerCase() === walletAddress.toLowerCase()) {
          validTransfer = true;
          actualAmount = parseFloat(ethers.formatUnits(value, tokenConfig.decimals));
          logger.debug(`Valid transfer found`, { amount: actualAmount, from, to });
          break;
        }
      } catch (e) {
        logger.warn(`Error parsing transfer log`, { error: e.message });
        continue;
      }
    }

    if (!validTransfer) {
      logger.warn(`No valid transfer found to payment wallet`, { paymentWallet, walletAddress });
      throw new Error('No valid transfer found to payment wallet');
    }

    const credits = Math.floor(actualAmount * tokenConfig.creditRate);

    return {
      success: true,
      credits,
      actualAmount,
      txHash,
      blockNumber: receipt.blockNumber
    };

  } catch (error) {
    logger.error('EVM payment verification error:', error);
    throw new Error(`Payment verification failed: ${error.message}`);
  }
}

// API Routes

/**
 * Health check - Railway compatible
 * Always returns 200 as long as the server is running
 * Database connection status is informational only
 * This endpoint must be simple and fast - no async operations that could fail
 */
app.get('/api/health', (req, res) => {
  try {
    // Simple synchronous health check - no async operations
    const dbState = mongoose.connection.readyState;
    const dbStatus = dbState === 1 ? 'connected' : dbState === 2 ? 'connecting' : 'disconnected';
    
    // Get CORS configuration (synchronous)
    const allowedOriginsList = process.env.ALLOWED_ORIGINS 
      ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
      : [];
    
    // Check critical environment variables for signup
    const criticalVars = {
      MONGODB_URI: !!process.env.MONGODB_URI,
      JWT_SECRET: !!process.env.JWT_SECRET,
      SESSION_SECRET: !!process.env.SESSION_SECRET
    };
    const missingCritical = Object.entries(criticalVars)
      .filter(([_, exists]) => !exists)
      .map(([name]) => name);
    
    const health = {
      status: missingCritical.length > 0 ? 'degraded' : 'healthy',
      timestamp: new Date().toISOString(),
      signupAvailable: dbState === 1 && criticalVars.MONGODB_URI && criticalVars.JWT_SECRET,
      missingEnvVars: missingCritical.length > 0 ? missingCritical : undefined,
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      database: dbStatus,
      port: process.env.PORT || 3001,
      version: '1.0.0',
      cors: {
        allowedOriginsCount: allowedOriginsList.length,
        allowedOrigins: allowedOriginsList.length > 0 ? allowedOriginsList : ['localhost (any port)', 'any origin (ALLOWED_ORIGINS not set)'],
        credentials: true
      }
    };
    
    // Always return 200 - server is healthy if it can respond
    // Database connection can happen asynchronously and shouldn't fail healthcheck
    res.status(200).json(health);
  } catch (error) {
    // Even if there's an error, try to return something
    // This ensures Railway knows the server is running
    logger.error('Health check error:', error);
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      note: 'Health check had minor error but server is running',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * CORS debug endpoint - shows current CORS configuration
 * Useful for debugging CORS issues
 * This endpoint itself validates CORS, so you can see if your origin is allowed
 */
app.get('/api/cors-info', (req, res) => {
  const allowedOriginsList = process.env.ALLOWED_ORIGINS 
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : [];
  
  const origin = req.headers.origin;
  let wouldBeAllowed = 'unknown';
  let validationDetails = {};
  
  if (!origin) {
    wouldBeAllowed = 'yes (no origin - handled by middleware)';
  } else {
    const isLocalhost = origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:');
    const originLower = origin.toLowerCase();
    
    const isAllowedOrigin = allowedOriginsList.some(allowed => {
      const allowedLower = allowed.toLowerCase();
      return allowedLower === originLower || 
             allowedLower.replace(/\/$/, '') === originLower.replace(/\/$/, '');
    });
    
    if (isLocalhost) {
      wouldBeAllowed = 'yes (localhost - always allowed)';
    } else if (allowedOriginsList.length === 0) {
      wouldBeAllowed = 'yes (ALLOWED_ORIGINS not set - permissive mode)';
    } else if (isAllowedOrigin) {
      wouldBeAllowed = 'yes (in allowed list)';
    } else {
      wouldBeAllowed = 'no (not in allowed list)';
    }
    
    validationDetails = {
      isLocalhost,
      isAllowedOrigin,
      originLower,
      checkedAgainst: allowedOriginsList
    };
  }
  
  const corsInfo = {
    environment: process.env.NODE_ENV || 'development',
    allowedOrigins: {
      raw: process.env.ALLOWED_ORIGINS || 'not set',
      parsed: allowedOriginsList,
      count: allowedOriginsList.length,
      mode: allowedOriginsList.length === 0 ? 'permissive (allows any origin)' : 'restrictive (only listed origins)',
      note: allowedOriginsList.length === 0 
        ? '⚠️ WARNING: ALLOWED_ORIGINS not set - allowing ALL origins (not recommended for production)'
        : '✅ ALLOWED_ORIGINS is set - only listed origins are allowed'
    },
    localhost: {
      allowed: true,
      note: 'localhost and 127.0.0.1 are always allowed on any port'
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    currentRequest: {
      origin: origin || 'no origin header',
      wouldBeAllowed,
      validationDetails
    },
    verification: {
      message: 'If you can see this response, CORS validation is working!',
      note: 'Check server logs for "CORS: ✅ Allowed origin" or "CORS: ❌ Rejected origin" messages'
    }
  };
  
  res.status(200).json(corsInfo);
});

/**
 * Prometheus metrics endpoint
 * Returns metrics in Prometheus text format for scraping
 */
app.get('/api/metrics', async (req, res) => {
  try {
    const dbState = mongoose.connection.readyState;
    const dbStatus = dbState === 1 ? 1 : 0; // 1 = connected, 0 = not connected
    
    // Get memory usage
    const memUsage = process.memoryUsage();
    const uptime = process.uptime();
    
    // Prometheus text format metrics
    const metrics = [
      '# HELP nodejs_up Node.js application is up',
      '# TYPE nodejs_up gauge',
      `nodejs_up 1`,
      '',
      '# HELP nodejs_uptime_seconds Node.js application uptime in seconds',
      '# TYPE nodejs_uptime_seconds gauge',
      `nodejs_uptime_seconds ${uptime}`,
      '',
      '# HELP nodejs_memory_heap_used_bytes Node.js heap memory used in bytes',
      '# TYPE nodejs_memory_heap_used_bytes gauge',
      `nodejs_memory_heap_used_bytes ${memUsage.heapUsed}`,
      '',
      '# HELP nodejs_memory_heap_total_bytes Node.js heap memory total in bytes',
      '# TYPE nodejs_memory_heap_total_bytes gauge',
      `nodejs_memory_heap_total_bytes ${memUsage.heapTotal}`,
      '',
      '# HELP nodejs_memory_rss_bytes Node.js resident set size in bytes',
      '# TYPE nodejs_memory_rss_bytes gauge',
      `nodejs_memory_rss_bytes ${memUsage.rss}`,
      '',
      '# HELP mongodb_connection_status MongoDB connection status (1=connected, 0=disconnected)',
      '# TYPE mongodb_connection_status gauge',
      `mongodb_connection_status ${dbStatus}`,
      ''
    ].join('\n');
    
    res.set('Content-Type', 'text/plain; version=0.0.4');
    res.status(200).send(metrics);
  } catch (error) {
    logger.error('Metrics endpoint error:', error);
    res.status(500).send('# Error generating metrics\n');
  }
});

/**
 * Frontend logging endpoint
 */
app.post('/api/logs', (req, res) => {
  try {
    const { level, message, data, timestamp, userAgent, url } = req.body;
    
    // Log frontend messages with appropriate level
    switch (level) {
      case 'error':
        logger.error(`[FRONTEND] ${message}`, { 
          data, 
          userAgent, 
          url, 
          timestamp 
        });
        break;
      case 'warn':
        logger.warn(`[FRONTEND] ${message}`, { 
          data, 
          userAgent, 
          url, 
          timestamp 
        });
        break;
      case 'info':
        logger.info(`[FRONTEND] ${message}`, { 
          data, 
          userAgent, 
          url, 
          timestamp 
        });
        break;
      case 'debug':
        logger.debug(`[FRONTEND] ${message}`, { 
          data, 
          userAgent, 
          url, 
          timestamp 
        });
        break;
      default:
        logger.info(`[FRONTEND] ${message}`, { 
          data, 
          userAgent, 
          url, 
          timestamp 
        });
    }
    
    res.json({ success: true });
  } catch (error) {
    logger.error('Error processing frontend log', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to process log' });
  }
});

// Favicon handler - serve the PNG icon as favicon.ico
app.get('/favicon.ico', (req, res) => {
  const faviconPath = path.join(__dirname, '..', 'dist', '1d1c7555360a737bb22bbdfc2784655f.png');
  const defaultFaviconPath = path.join(__dirname, '..', 'public', 'favicon.ico');
  
  // Try to serve the PNG icon first, then fallback to default favicon
  if (fs.existsSync(faviconPath)) {
    res.setHeader('Content-Type', 'image/png');
    res.sendFile(faviconPath);
  } else if (fs.existsSync(defaultFaviconPath)) {
    res.sendFile(defaultFaviconPath);
  } else {
    // Return 204 No Content if no favicon exists (prevents 403 errors)
    res.status(204).end();
  }
});

// Root route - serve frontend index.html (SPA routing)
// Health check is available at /api/health
app.get('/', (req, res) => {
  const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
  
  // Check if index.html exists
  if (!fs.existsSync(indexPath)) {
    // If dist doesn't exist, return a simple message
    return res.status(200).json({
      status: 'healthy',
      service: 'Seiso AI Backend',
      message: 'Frontend not built. Please build the frontend and ensure dist/ directory exists.',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      port: process.env.PORT || 3001
    });
  }
  
  // Serve the frontend
  res.sendFile(indexPath);
});

/**
 * Email Authentication Routes
 */

/**
 * Sign up with email and password
 */
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required'
      });
    }

    // Validate email format
    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format'
      });
    }

    // Check for disposable/temporary email addresses
    if (isDisposableEmail(email)) {
      logger.warn('Signup attempt with disposable email blocked', { email });
      return res.status(400).json({
        success: false,
        error: 'Temporary email addresses are not allowed. Please use a permanent email address to create an account.'
      });
    }

    // Validate password length
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 6 characters'
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'Email already registered'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = new User({
      email: email.toLowerCase(),
      password: hashedPassword,
      credits: 0,
      totalCreditsEarned: 0,
      totalCreditsSpent: 0,
      hasUsedFreeImage: false,
      nftCollections: [],
      paymentHistory: [],
      generationHistory: [],
      gallery: [],
      settings: {
        preferredStyle: null,
        defaultImageSize: '1024x1024',
        enableNotifications: true
      }
    });

    await user.save();

    // Ensure userId was generated (should be done by pre-save hook, but verify)
    if (!user.userId) {
      logger.error('userId was not generated for new user', { email: user.email });
      return res.status(500).json({
        success: false,
        error: 'Failed to create user account'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.userId, email: user.email },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    logger.info('New user signed up', { email: user.email, userId: user.userId });

    res.json({
      success: true,
      token,
      user: {
        userId: user.userId,
        email: user.email,
        credits: user.credits,
        totalCreditsEarned: user.totalCreditsEarned,
        walletAddress: user.walletAddress || null,
        isNFTHolder: user.nftCollections && user.nftCollections.length > 0
      }
    });

  } catch (error) {
    // Log detailed error for debugging
    logger.error('Sign up error:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code
    });
    
    // Check for common issues
    if (error.message && error.message.includes('buffering timed out')) {
      logger.error('MongoDB connection issue - MONGODB_URI may not be set or MongoDB is not accessible');
    }
    if (error.message && error.message.includes('JWT_SECRET')) {
      logger.error('JWT_SECRET is missing or invalid');
    }
    
    res.status(500).json({
      success: false,
      error: getSafeErrorMessage(error, 'Failed to create account')
    });
  }
});

/**
 * Sign in with email and password
 */
app.post('/api/auth/signin', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required'
      });
    }

    // Find user and include password for comparison
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    // Update last active
    user.lastActive = new Date();
    await user.save();

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.userId, email: user.email },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    logger.info('User signed in', { email: user.email, userId: user.userId });

    res.json({
      success: true,
      token,
      user: {
        userId: user.userId,
        email: user.email,
        credits: user.credits,
        totalCreditsEarned: user.totalCreditsEarned,
        walletAddress: user.walletAddress || null,
        isNFTHolder: user.nftCollections && user.nftCollections.length > 0
      }
    });

  } catch (error) {
    logger.error('Sign in error:', error);
    res.status(500).json({
      success: false,
      error: getSafeErrorMessage(error, 'Failed to sign in')
    });
  }
});

/**
 * Verify JWT token
 */
app.get('/api/auth/verify', authenticateToken, async (req, res) => {
  try {
    const user = req.user;
    
    // Check NFT status if wallet is linked
    let isNFTHolder = false;
    if (user.walletAddress) {
      isNFTHolder = user.nftCollections && user.nftCollections.length > 0;
    }

    res.json({
      success: true,
      user: {
        userId: user.userId,
        email: user.email,
        credits: user.credits,
        totalCreditsEarned: user.totalCreditsEarned,
        walletAddress: user.walletAddress || null,
        isNFTHolder
      }
    });

  } catch (error) {
    logger.error('Token verification error:', error);
    res.status(500).json({
      success: false,
      error: getSafeErrorMessage(error, 'Failed to verify token')
    });
  }
});

/**
 * Get current user data (protected route)
 */
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const user = req.user;
    
    // Check NFT status if wallet is linked
    let isNFTHolder = false;
    if (user.walletAddress) {
      isNFTHolder = user.nftCollections && user.nftCollections.length > 0;
    }

    res.json({
      success: true,
      user: {
        userId: user.userId,
        email: user.email,
        credits: user.credits,
        totalCreditsEarned: user.totalCreditsEarned,
        walletAddress: user.walletAddress || null,
        isNFTHolder
      }
    });

  } catch (error) {
    logger.error('Get user data error:', error);
    res.status(500).json({
      success: false,
      error: getSafeErrorMessage(error, 'Failed to get user data')
    });
  }
});

/**
 * Link wallet to email account
 */
app.post('/api/auth/link-wallet', authenticateToken, async (req, res) => {
  try {
    const { walletAddress } = req.body;
    const user = req.user;

    if (!walletAddress) {
      return res.status(400).json({
        success: false,
        error: 'Wallet address is required'
      });
    }

    // Validate wallet address
    if (!isValidWalletAddress(walletAddress)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid wallet address'
      });
    }

    // Normalize wallet address
    const isSolanaAddress = !walletAddress.startsWith('0x');
    const normalizedAddress = isSolanaAddress ? walletAddress : walletAddress.toLowerCase();

    // Check if wallet is already linked to another account
    const existingWalletUser = await User.findOne({ walletAddress: normalizedAddress });
    if (existingWalletUser && existingWalletUser.userId !== user.userId) {
      return res.status(400).json({
        success: false,
        error: 'Wallet is already linked to another account'
      });
    }

    // Link wallet to user
    user.walletAddress = normalizedAddress;
    await user.save();

    // Check NFT holdings
    let isNFTHolder = false;
    try {
      const nftCheckResponse = await fetch(`${req.protocol}://${req.get('host')}/api/nft/check-holdings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: normalizedAddress })
      });
      if (nftCheckResponse.ok) {
        const nftData = await nftCheckResponse.json();
        isNFTHolder = nftData.isNFTHolder || false;
      }
    } catch (nftError) {
      logger.warn('Failed to check NFT holdings during wallet link', { error: nftError.message });
    }

    logger.info('Wallet linked to email account', { email: user.email, walletAddress: normalizedAddress });

    res.json({
      success: true,
      user: {
        userId: user.userId,
        email: user.email,
        credits: user.credits,
        totalCreditsEarned: user.totalCreditsEarned,
        walletAddress: user.walletAddress,
        isNFTHolder
      }
    });

  } catch (error) {
    logger.error('Link wallet error:', error);
    res.status(500).json({
      success: false,
      error: getSafeErrorMessage(error, 'Failed to link wallet')
    });
  }
});

/**
 * Unlink wallet from email account
 */
app.post('/api/auth/unlink-wallet', authenticateToken, async (req, res) => {
  try {
    const user = req.user;

    // Unlink wallet
    user.walletAddress = undefined;
    user.nftCollections = [];
    await user.save();

    logger.info('Wallet unlinked from email account', { email: user.email });

    res.json({
      success: true,
      user: {
        userId: user.userId,
        email: user.email,
        credits: user.credits,
        totalCreditsEarned: user.totalCreditsEarned,
        walletAddress: null,
        isNFTHolder: false
      }
    });

  } catch (error) {
    logger.error('Unlink wallet error:', error);
    res.status(500).json({
      success: false,
      error: getSafeErrorMessage(error, 'Failed to unlink wallet')
    });
  }
});

/**
 * Get user's active subscription
 */
app.get('/api/stripe/subscription', authenticateToken, async (req, res) => {
  try {
    if (!stripe) {
      return res.status(400).json({
        success: false,
        error: 'Stripe is not configured'
      });
    }

    const user = req.user;
    
    // Find subscription in payment history
    let subscriptionId = null;
    if (user.paymentHistory && user.paymentHistory.length > 0) {
      // Find the most recent subscription
      const subscriptionPayment = user.paymentHistory
        .filter(p => p.subscriptionId)
        .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))[0];
      
      if (subscriptionPayment) {
        subscriptionId = subscriptionPayment.subscriptionId;
      }
    }

    if (!subscriptionId) {
      // Try to find by customer email
      try {
        const customers = await stripe.customers.list({
          email: user.email,
          limit: 1
        });

        if (customers.data.length > 0) {
          const subscriptions = await stripe.subscriptions.list({
            customer: customers.data[0].id,
            status: 'all',
            limit: 1
          });

          if (subscriptions.data.length > 0) {
            subscriptionId = subscriptions.data[0].id;
          }
        }
      } catch (stripeError) {
        logger.error('Error finding subscription by customer:', stripeError);
      }
    }

    if (!subscriptionId) {
      return res.json({
        success: true,
        subscription: null,
        error: 'No active subscription found'
      });
    }

    // Retrieve subscription from Stripe
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);

    res.json({
      success: true,
      subscription: {
        id: subscription.id,
        status: subscription.status,
        current_period_start: subscription.current_period_start,
        current_period_end: subscription.current_period_end,
        cancel_at_period_end: subscription.cancel_at_period_end,
        canceled_at: subscription.canceled_at,
        items: subscription.items
      }
    });

  } catch (error) {
    logger.error('Get subscription error:', error);
    res.status(500).json({
      success: false,
      error: getSafeErrorMessage(error, 'Failed to get subscription')
    });
  }
});

/**
 * Cancel user's subscription
 */
app.post('/api/stripe/subscription/cancel', authenticateToken, async (req, res) => {
  try {
    if (!stripe) {
      return res.status(400).json({
        success: false,
        error: 'Stripe is not configured'
      });
    }

    const { subscriptionId } = req.body;
    const user = req.user;

    if (!subscriptionId) {
      return res.status(400).json({
        success: false,
        error: 'Subscription ID is required'
      });
    }

    // Verify subscription belongs to user
    let userSubscriptionId = null;
    if (user.paymentHistory && user.paymentHistory.length > 0) {
      const subscriptionPayment = user.paymentHistory.find(p => p.subscriptionId === subscriptionId);
      if (!subscriptionPayment) {
        // Try to verify by customer email
        try {
          const customers = await stripe.customers.list({
            email: user.email,
            limit: 1
          });

          if (customers.data.length > 0) {
            const subscription = await stripe.subscriptions.retrieve(subscriptionId);
            if (subscription.customer !== customers.data[0].id) {
              return res.status(403).json({
                success: false,
                error: 'Subscription does not belong to this user'
              });
            }
          }
        } catch (stripeError) {
          logger.error('Error verifying subscription ownership:', stripeError);
          return res.status(403).json({
            success: false,
            error: 'Unable to verify subscription ownership'
          });
        }
      }
    }

    // Cancel subscription at period end
    const subscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true
    });

    logger.info('Subscription canceled at period end', {
      subscriptionId: subscription.id,
      userId: user.userId || user._id.toString(),
      email: user.email,
      cancelAt: subscription.current_period_end
    });

    res.json({
      success: true,
      subscription: {
        id: subscription.id,
        status: subscription.status,
        current_period_start: subscription.current_period_start,
        current_period_end: subscription.current_period_end,
        cancel_at_period_end: subscription.cancel_at_period_end,
        canceled_at: subscription.canceled_at,
        items: subscription.items
      }
    });

  } catch (error) {
    logger.error('Cancel subscription error:', error);
    res.status(500).json({
      success: false,
      error: getSafeErrorMessage(error, 'Failed to cancel subscription')
    });
  }
});

/**
 * Get user data
 */
app.get('/api/users/:walletAddress', async (req, res) => {
  try {
    const { walletAddress } = req.params;
    const { refreshNFTs, skipNFTs } = req.query; // Allow forcing NFT refresh or skipping NFT checks
    
    // Normalize address once at the start
    const isSolanaAddress = !walletAddress.startsWith('0x');
    const normalizedAddress = isSolanaAddress ? walletAddress : walletAddress.toLowerCase();
    
    // When skipNFTs=true, optimize for speed - single query, no NFT checks
    if (skipNFTs === 'true') {
      // Single optimized query - just get user data, no NFT checking
      const user = await User.findOneAndUpdate(
        { walletAddress: normalizedAddress },
        { $set: { lastActive: new Date() } },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: {
            walletAddress: normalizedAddress,
            credits: 0,
            totalCreditsEarned: 0,
            totalCreditsSpent: 0,
            nftCollections: [],
            paymentHistory: [],
            generationHistory: [],
            gallery: [],
            settings: {
              preferredStyle: null,
              defaultImageSize: '1024x1024',
              enableNotifications: true
            }
          }
        }
      );
      
      // Ensure totalCreditsEarned field exists
      if (user.totalCreditsEarned == null) {
        user.totalCreditsEarned = user.credits || 0;
        if (user.totalCreditsSpent == null) {
          user.totalCreditsSpent = 0;
        }
        await user.save();
      }
      
      const isNFTHolder = user.nftCollections && user.nftCollections.length > 0;
      const userCredits = user.credits != null ? user.credits : 0;
      const userTotalCreditsEarned = user.totalCreditsEarned != null ? user.totalCreditsEarned : 0;
      const userTotalCreditsSpent = user.totalCreditsSpent != null ? user.totalCreditsSpent : 0;
      
      // Fast response for skipNFTs mode
      return res.json({
        success: true,
        user: {
          walletAddress: user.walletAddress,
          credits: userCredits,
          totalCreditsEarned: userTotalCreditsEarned,
          totalCreditsSpent: userTotalCreditsSpent,
          nftCollections: user.nftCollections || [],
          paymentHistory: user.paymentHistory || [],
          generationHistory: user.generationHistory || [],
          gallery: user.gallery || [],
          settings: user.settings || {
            preferredStyle: null,
            defaultImageSize: '1024x1024',
            enableNotifications: true
          },
          lastActive: user.lastActive || new Date(),
          isNFTHolder: isNFTHolder,
          pricing: {
            costPerCredit: isNFTHolder ? 0.06 : 0.15,
            creditsPerUSDC: isNFTHolder ? 16.67 : STANDARD_CREDITS_PER_USDC
          }
        }
      });
    }
    
    // Normal flow with NFT checking
    // Get actual user data from database
    const user = await getOrCreateUser(walletAddress);
    
    // Always check NFT holdings from blockchain when not explicitly skipped
    // This ensures NFT detection works reliably without conditional conflicts
    let isNFTHolder = false;
    try {
      // Normalize wallet address for NFT checking (lowercase for EVM, unchanged for Solana)
      const normalizedWalletForNFT = isSolanaAddress ? walletAddress : walletAddress.toLowerCase();
      
      logger.debug('Checking NFT holdings', { 
        originalAddress: walletAddress, 
        normalizedAddress: normalizedWalletForNFT,
        isSolana: isSolanaAddress,
        refreshRequested: refreshNFTs === 'true'
      });
      
      // Use shared helper function to check NFT holdings directly from blockchain
      const { ownedCollections, isHolder: nftCheckResult } = await checkNFTHoldingsForWallet(normalizedWalletForNFT);
      
      // Update user's NFT collections in database based on actual blockchain data
      // Always update to reflect current blockchain state
      if (ownedCollections.length > 0) {
        await User.findOneAndUpdate(
          { walletAddress: user.walletAddress },
          { $set: { nftCollections: ownedCollections } },
          { new: true }
        );
        isNFTHolder = true;
        logger.info('✅ Updated NFT collections for user', { 
          walletAddress, 
          collectionCount: ownedCollections.length,
          collections: ownedCollections.map(c => ({ name: c.name, balance: c.balance, chainId: c.chainId }))
        });
      } else {
        // Clear NFT data if none found - always reflect current blockchain state
        await User.findOneAndUpdate(
          { walletAddress: user.walletAddress },
          { $set: { nftCollections: [] } },
          { new: true }
        );
        isNFTHolder = false;
        logger.info('No NFTs found for user', { walletAddress });
      }
    } catch (nftError) {
      logger.warn('Error checking NFT holdings', { error: nftError.message, walletAddress });
      // Fall back to database state if blockchain check fails
      isNFTHolder = user.nftCollections && user.nftCollections.length > 0;
    }
    
    // Refetch user from database to ensure we have the latest credits
    const latestUser = await User.findOne({ walletAddress: normalizedAddress });
    if (!latestUser) {
      logger.error('User not found after refetch', { 
        walletAddress, 
        normalizedAddress,
        userWalletAddress: user.walletAddress,
        warning: 'User should exist after getOrCreateUser'
      });
      return res.status(500).json({ success: false, error: 'User not found' });
    }
    
    // Ensure totalCreditsEarned field exists - fix legacy documents
    if (latestUser.totalCreditsEarned == null) {
      logger.warn('User missing totalCreditsEarned field, initializing', {
        walletAddress: normalizedAddress,
        credits: latestUser.credits
      });
      // Initialize based on existing credits (if they have credits, they were earned)
      latestUser.totalCreditsEarned = latestUser.credits || 0;
      // Also ensure totalCreditsSpent exists
      if (latestUser.totalCreditsSpent == null) {
        latestUser.totalCreditsSpent = 0;
      }
      await latestUser.save();
      logger.info('Fixed missing totalCreditsEarned field', {
        walletAddress: normalizedAddress,
        totalCreditsEarned: latestUser.totalCreditsEarned
      });
    }
    
    // Update isNFTHolder based on latest data
    isNFTHolder = latestUser.nftCollections && latestUser.nftCollections.length > 0;
    
    // Explicitly check for null/undefined and default to 0, but preserve actual 0 values
    const userCredits = latestUser.credits != null ? latestUser.credits : 0;
    const userTotalCreditsEarned = latestUser.totalCreditsEarned != null ? latestUser.totalCreditsEarned : 0;
    const userTotalCreditsSpent = latestUser.totalCreditsSpent != null ? latestUser.totalCreditsSpent : 0;
    
    logger.debug('Returning user data', { 
      walletAddress,
      normalizedAddress,
      credits: userCredits,
      totalCreditsEarned: userTotalCreditsEarned,
      rawCredits: latestUser.credits,
      rawTotalCreditsEarned: latestUser.totalCreditsEarned,
      isNFTHolder 
    });
    
    // Log if totalCreditsEarned seems wrong
    if (userTotalCreditsEarned === 0 && userCredits > 0) {
      logger.warn('totalCreditsEarned is 0 but credits > 0 - this might indicate a data issue', {
        walletAddress: normalizedAddress,
        credits: userCredits,
        totalCreditsEarned: userTotalCreditsEarned
      });
    }
    
    res.json({
      success: true,
      user: {
        walletAddress: latestUser.walletAddress,
        credits: userCredits,
        totalCreditsEarned: userTotalCreditsEarned,
        totalCreditsSpent: userTotalCreditsSpent,
        nftCollections: latestUser.nftCollections || [],
        paymentHistory: latestUser.paymentHistory || [],
        generationHistory: latestUser.generationHistory || [],
        gallery: latestUser.gallery || [],
        settings: latestUser.settings || {
          preferredStyle: null,
          defaultImageSize: '1024x1024',
          enableNotifications: true
        },
        lastActive: latestUser.lastActive || new Date(),
        isNFTHolder: isNFTHolder,
        pricing: {
          costPerCredit: isNFTHolder ? 0.06 : 0.15,
          creditsPerUSDC: isNFTHolder ? 16.67 : STANDARD_CREDITS_PER_USDC
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching user data:', error);
    res.status(500).json({ success: false, error: getSafeErrorMessage(error, 'Failed to fetch user data') });
  }
});

/**
 * Check credits
 */
app.post('/api/nft/check-credits', async (req, res) => {
  try {
    const { walletAddress } = req.body;
    
    if (!walletAddress) {
      return res.status(400).json({
        success: false,
        error: 'Wallet address required'
      });
    }
    
    // Get user from database to check NFT status
    const user = await getOrCreateUser(walletAddress);
    const isNFTHolder = user.nftCollections && user.nftCollections.length > 0;
    
    res.json({
      success: true,
      totalCredits: user.credits || 0,
      totalCreditsEarned: user.totalCreditsEarned || 0,
      totalCreditsSpent: user.totalCreditsSpent || 0,
      isNFTHolder: isNFTHolder,
        pricing: {
          costPerCredit: isNFTHolder ? 0.06 : 0.15,
          creditsPerUSDC: isNFTHolder ? 16.67 : STANDARD_CREDITS_PER_USDC
        }
    });
  } catch (error) {
    logger.error('Error checking credits:', error);
    res.status(500).json({ success: false, error: getSafeErrorMessage(error, 'Failed to check credits') });
  }
});

/**
 * Check NFT holdings for wallet
 */
app.post('/api/nft/check-holdings', async (req, res) => {
  try {
    const { walletAddress, collections } = req.body;
    
    if (!walletAddress) {
      return res.status(400).json({
        success: false,
        error: 'Wallet address required'
      });
    }

    // Normalize wallet address for NFT checking (lowercase for EVM, unchanged for Solana)
    const isSolanaAddress = !walletAddress.startsWith('0x');
    const normalizedWalletForNFT = isSolanaAddress ? walletAddress : walletAddress.toLowerCase();
    
    logger.info('Checking NFT holdings', { 
      originalAddress: walletAddress, 
      normalizedAddress: normalizedWalletForNFT,
      isSolana: isSolanaAddress 
    });
    
    // Use shared helper function to check NFT holdings (works without database)
    const { ownedCollections, isHolder } = await checkNFTHoldingsForWallet(normalizedWalletForNFT);
    
    logger.info('NFT check completed', { walletAddress, isHolder, collectionCount: ownedCollections.length });
    
    // Auto-grant credits to NFT holders (one-time, idempotent)
    let creditsGranted = 0;
    if (isHolder && ownedCollections.length > 0) {
      try {
        // Get or create user
        const user = await getOrCreateUser(normalizedWalletForNFT);
        
        // Update NFT collections in database
        await User.findOneAndUpdate(
          { walletAddress: user.walletAddress },
          { $set: { nftCollections: ownedCollections } },
          { new: true }
        );
        
        // Count ETH NFTs (chainId === '1') for credit calculation
        // Grant 2 credits per ETH NFT (matching grant-eth-nft-credits.js script)
        const ethNFTs = ownedCollections
          .filter(c => (c?.chainId || '').toString() === '1')
          .reduce((sum, c) => sum + (Array.isArray(c?.tokenIds) ? c.tokenIds.length : 0), 0);
        
        const creditsToGrant = ethNFTs * 2;
        
        // Check if NFT credits have already been granted by looking for payment entry
        const nftGrantTxHash = `NFT_GRANT_${normalizedWalletForNFT}`;
        const hasBeenGranted = user.paymentHistory && user.paymentHistory.some(
          entry => entry.txHash === nftGrantTxHash
        );
        
        if (creditsToGrant > 0 && !hasBeenGranted) {
          // Grant credits using addCreditsToUser helper
          await addCreditsToUser(user, {
            txHash: nftGrantTxHash,
            tokenSymbol: 'NFT',
            amount: 0,
            credits: creditsToGrant,
            chainId: '1',
            walletType: isSolanaAddress ? 'solana' : 'evm',
            timestamp: new Date()
          });
          
          creditsGranted = creditsToGrant;
          logger.info('NFT credits granted automatically', { 
            walletAddress: normalizedWalletForNFT,
            ethNFTs,
            creditsGranted 
          });
        } else if (hasBeenGranted) {
          logger.debug('NFT credits already granted', { walletAddress: normalizedWalletForNFT });
        }
      } catch (grantError) {
        logger.error('Error granting NFT credits', { 
          error: grantError.message,
          walletAddress: normalizedWalletForNFT 
        });
        // Don't fail the request if credit granting fails
      }
    }
    
    res.json({
      success: true,
      isHolder,
      collections: ownedCollections,
      message: isHolder 
        ? 'Qualifying NFTs found! You have access to free generation.' 
        : 'No qualifying NFTs found. Purchase credits to generate images.',
      pricing: {
        costPerCredit: isHolder ? 0.06 : 0.15,
        creditsPerUSDC: isHolder ? 16.67 : STANDARD_CREDITS_PER_USDC
      },
      freeCredits: isHolder ? 10 : 0,
      creditsGranted // Return how many credits were just granted
    });
    
  } catch (error) {
    logger.error('Error checking NFT holdings:', error);
    res.status(500).json({ 
      success: false, 
      error: getSafeErrorMessage(error, 'Failed to check NFT holdings'),
      isHolder: false,
      collections: []
    });
  }
});

/**
 * Get payment address for user
 */
app.post('/api/payment/get-address', async (req, res) => {
  try {
    const { walletAddress } = req.body;
    
    if (!walletAddress) {
      return res.status(400).json({
        success: false,
        error: 'Wallet address required'
      });
    }
    
    // Return dedicated payment addresses for different chains
    const evmPaymentAddress = EVM_PAYMENT_ADDRESS;
    const solanaPaymentAddress = PAYMENT_WALLETS['solana'];
    
  res.json({
    success: true,
    paymentAddress: evmPaymentAddress, // EVM chains
    solanaPaymentAddress: solanaPaymentAddress, // Solana
    supportedTokens: ['USDC', 'USDT'],
    networks: ['Ethereum', 'Polygon', 'Arbitrum', 'Optimism', 'Base', 'Solana']
  });
  } catch (error) {
    console.error('[ERROR] Get payment address error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get payment address'
    });
  }
});

// USDC Token Contract ABI (ERC-20 Transfer event)
const USDC_ABI = [
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "function decimals() view returns (uint8)"
];

// Token addresses for different chains (must match TOKEN_CONFIGS)
const TOKEN_ADDRESSES = {
  ethereum: {
    USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7'
  },
  polygon: {
    USDC: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
    USDT: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F'
  },
  arbitrum: {
    USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // Native USDC (bridgeless)
    USDT: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9'
  },
  optimism: {
    USDC: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', // Native USDC (bridgeless)
    USDT: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58'
  },
  base: {
    USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    USDT: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb'
  }
};

// Get provider for chain using public RPC endpoints with connection pooling
const providerCache = new Map();

function getProvider(chain = 'ethereum') {
  if (providerCache.has(chain)) {
    return providerCache.get(chain);
  }

  // Use RPC endpoints from environment (required, no hardcoded fallbacks)
  const rpcUrls = {
    ethereum: process.env.ETH_RPC_URL,
    base: process.env.BASE_RPC_URL
  };
  
  const rpcUrl = rpcUrls[chain] || rpcUrls.ethereum;
  if (!rpcUrl) {
    throw new Error(`RPC URL not configured for chain: ${chain}. Please set ${chain === 'base' ? 'BASE_RPC_URL' : 'ETH_RPC_URL'} environment variable.`);
  }
  
  const provider = new ethers.JsonRpcProvider(rpcUrl, undefined, {
    polling: false, // Disable automatic polling
    batchMaxCount: 10, // Batch requests
    batchMaxWait: 100 // Wait max 100ms for batching
  });
  
  providerCache.set(chain, provider);
  return provider;
}

/**
 * Check for recent USDC transfers to payment address
 */
async function checkForTokenTransfer(paymentAddress, token = 'USDC', chain = 'ethereum') {
  try {
    logger.debug(`Checking for ${token} transfers on ${chain}`, { paymentAddress });
    
    const provider = getProvider(chain);
    const tokenAddress = TOKEN_ADDRESSES[chain]?.[token];
    
    if (!tokenAddress) {
      logger.warn(`Token ${token} not supported on chain ${chain}`);
      return null;
    }
    
    const contract = new ethers.Contract(tokenAddress, USDC_ABI, provider);
    const decimals = await contract.decimals();
    
    // Get current block and check recent blocks for new transfers (reduced for performance)
    const currentBlock = await provider.getBlockNumber();
    const blocksToCheck = 20; // Check last 20 blocks for better performance
    const fromBlock = Math.max(0, currentBlock - blocksToCheck);
    
    // Query Transfer events TO our payment address (second parameter is recipient)
    const filter = contract.filters.Transfer(null, paymentAddress);
    
    const events = await contract.queryFilter(filter, fromBlock, currentBlock);
    
    logger.debug(`Found ${events.length} transfer(s) to payment wallet`, { 
      chain, 
      blocksScanned: `${fromBlock}-${currentBlock}` 
    });
    
    if (events.length === 0) {
      return null;
    }
    
    // Get the most recent transfer (any amount to payment wallet qualifies)
    if (events.length > 0) {
      const event = events[events.length - 1]; // Most recent event
      const amount = event.args.value;
      const from = event.args.from;
      const to = event.args.to;
      const amountFormatted = ethers.formatUnits(amount, decimals);
      
      const block = await event.getBlock();
      
      logger.info(`Transfer found to payment wallet`, {
        chain,
        txHash: event.transactionHash,
        from,
        to,
        amount: amountFormatted,
        token,
        blockNumber: event.blockNumber
      });
      
      return {
        found: true,
        txHash: event.transactionHash,
        from: from,
        amount: amountFormatted,
        timestamp: block.timestamp,
        blockNumber: event.blockNumber,
        chain: chain,
        token: token
      };
    }
  } catch (error) {
    console.error(`[${chain.toUpperCase()}] ❌ Error:`, error.message);
    if (error.stack) {
      console.error(`[${chain.toUpperCase()}] Stack:`, error.stack);
    }
    return null;
  }
}

/**
 * Check for Solana USDC transfers
 */
async function checkForSolanaUSDC(paymentAddress, expectedAmount = null) {
  try {
    console.log(`\n[SOLANA] Starting check for USDC transfers...`);
    console.log(`[SOLANA] Looking for ANY transfers TO: ${paymentAddress}`);
    
    // Use optimized RPC endpoints for better reliability with public endpoints
    const rpcUrls = [
      process.env.SOLANA_RPC_URL,
      'https://api.mainnet-beta.solana.com',
      'https://solana-mainnet.g.alchemy.com/v2/demo',
      'https://rpc.ankr.com/solana',
      'https://solana-api.projectserum.com'
    ].filter(Boolean);
    
    let connection;
    let lastError;
    
    // Try each RPC endpoint until one works with timeout
    for (const rpcUrl of rpcUrls) {
      try {
        connection = new Connection(rpcUrl, 'confirmed');
        // Test the connection with timeout
        await Promise.race([
          connection.getLatestBlockhash(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), 5000))
        ]);
        logger.debug(`Using Solana RPC endpoint`, { rpcUrl });
        break;
      } catch (error) {
        logger.debug(`Failed to connect to Solana RPC`, { rpcUrl, error: error.message });
        lastError = error;
        continue;
      }
    }
    
    if (!connection) {
      throw new Error(`[SOLANA] All RPC endpoints failed. Last error: ${lastError?.message}`);
    }
    
    const paymentPubkey = new PublicKey(paymentAddress);
    
    // USDC Token Mint on Solana
    const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    
    // Get recent signatures for the payment address (reduced for performance)
    const signatures = await connection.getSignaturesForAddress(paymentPubkey, { limit: 20 });
    
    logger.debug(`Found ${signatures.length} recent Solana transaction(s)`, { paymentAddress });
    
    if (signatures.length === 0) {
      return null;
    }
    
    // Check each transaction for USDC transfers with timeout
    for (const sig of signatures) {
      try {
        const tx = await Promise.race([
          connection.getParsedTransaction(sig.signature, {
            maxSupportedTransactionVersion: 0
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Transaction fetch timeout')), 3000))
        ]);
        
        if (!tx || !tx.meta) continue;
        
        // Look for SPL Token transfers in the transaction
        const instructions = tx.transaction.message.instructions;
        
        for (const instruction of instructions) {
          // Check if it's a token transfer instruction
          if (instruction.program === 'spl-token' && instruction.parsed?.type === 'transfer') {
            const info = instruction.parsed.info;
            
            // Check if it's to our payment address and is USDC
            // Note: info.destination is the token account address, not the wallet address
            // We need to check if this token account belongs to our payment wallet
            try {
              const destinationTokenAccount = await connection.getAccountInfo(new PublicKey(info.destination));
              if (destinationTokenAccount && destinationTokenAccount.data) {
                // Parse the token account data to get the owner
                const tokenAccountData = destinationTokenAccount.data;
                // Token account layout: mint(32) + owner(32) + amount(8) + ...
                const ownerBytes = tokenAccountData.slice(32, 64);
                const ownerAddress = new PublicKey(ownerBytes).toString();
                
                if (ownerAddress === paymentAddress) {
                  // Get token account info to verify it's USDC
                  const amount = info.amount / 1e6; // USDC has 6 decimals
                  
                  // Check if amount matches (within 1% tolerance) or if no expected amount specified
                  if (expectedAmount === null || expectedAmount === undefined) {
                    logger.info(`Solana USDC transfer found`, {
                      txHash: sig.signature,
                      from: info.authority,
                      amount,
                      timestamp: new Date(sig.blockTime * 1000).toISOString()
                    });
                    
                    return {
                      found: true,
                      txHash: sig.signature,
                      from: info.authority,
                      amount: amount.toString(),
                      timestamp: sig.blockTime,
                      chain: 'solana',
                      token: 'USDC'
                    };
                  }
                  
                  const tolerance = expectedAmount * 0.01;
                  
                  if (amount >= expectedAmount - tolerance && amount <= expectedAmount + tolerance) {
                    logger.info(`Solana USDC transfer found`, {
                      txHash: sig.signature,
                      from: info.authority,
                      amount,
                      expectedAmount,
                      timestamp: new Date(sig.blockTime * 1000).toISOString()
                    });
                    
                    return {
                      found: true,
                      txHash: sig.signature,
                      from: info.authority,
                      amount: amount.toString(),
                      timestamp: sig.blockTime,
                      chain: 'solana',
                      token: 'USDC'
                    };
                  }
                }
              }
            } catch (accountError) {
              logger.warn(`Error checking Solana token account`, { error: accountError.message });
            }
          }
        }
      } catch (txError) {
        logger.warn(`Error parsing Solana transaction`, { txHash: sig.signature, error: txError.message });
        continue;
      }
    }
    
    return null;
  } catch (error) {
    logger.error('Solana payment check error', { error: error.message, stack: error.stack });
    return null;
  }
}

/**
 * Check for payment - monitors blockchain for incoming payments
 */
app.post('/api/payment/check-payment', async (req, res) => {
  try {
    const { walletAddress, expectedAmount, token = 'USDC' } = req.body;
    
    logger.info('Payment check started', { walletAddress, expectedAmount, token });
    
    if (!walletAddress || !expectedAmount) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }
    
    const evmPaymentAddress = EVM_PAYMENT_ADDRESS;
    const solanaPaymentAddress = PAYMENT_WALLETS['solana'];
    
    // Check multiple chains in parallel (EVM + Solana)
    const evmChains = ['ethereum', 'polygon', 'arbitrum', 'optimism', 'base'];
    
    const evmPromises = evmChains.map(chain => 
      Promise.race([
        checkForTokenTransfer(evmPaymentAddress, token, chain),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
      ]).catch(err => {
        logger.warn(`Payment check failed for ${chain}`, { error: err.message });
        return null;
      })
    );
    
    // Also check Solana with its own payment address
    const solanaPromise = Promise.race([
      checkForSolanaUSDC(solanaPaymentAddress, expectedAmount),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
    ]).catch(err => {
      logger.warn('Solana payment check failed', { error: err.message });
      return null;
    });
    
    const allPromises = [...evmPromises, solanaPromise];
    const results = await Promise.all(allPromises);
    
    const payment = results.find(r => r && r.found);
    
    if (payment) {
      logger.info(`Payment detected on ${payment.chain}`, { payment });
      
      // Get the sender's wallet address from the blockchain event (the actual person who sent USDC)
      const senderAddress = payment.from;
      
      // Process payment for the actual sender
      const user = await getOrCreateUser(senderAddress);
      
      // Middleware should have caught duplicates, but double-check for safety
      if (isPaymentAlreadyProcessed(user, payment.txHash)) {
        logger.info(`Payment already processed`, { txHash: payment.txHash, senderAddress });
        return res.json({
          success: true,
          paymentDetected: true,
          alreadyProcessed: true,
          message: 'Payment already credited'
        });
      }
      
      // Refresh NFT holder status in real-time before calculating credits
      const normalizedAddressForNFT = senderAddress.toLowerCase();
      let isNFTHolder = false;
      let updatedUser = user;
      try {
        const { ownedCollections, isHolder } = await checkNFTHoldingsForWallet(normalizedAddressForNFT);
        if (ownedCollections.length > 0) {
          updatedUser = await User.findOneAndUpdate(
            { walletAddress: user.walletAddress },
            { $set: { nftCollections: ownedCollections } },
            { new: true }
          );
          isNFTHolder = true;
          logger.info(`NFT holder detected - applying discount rate`, { senderAddress });
        } else {
          updatedUser = await User.findOneAndUpdate(
            { walletAddress: user.walletAddress },
            { $set: { nftCollections: [] } },
            { new: true }
          );
          isNFTHolder = false;
        }
      } catch (nftError) {
        logger.warn(`Error checking NFT holdings, using database state`, { senderAddress, error: nftError.message });
        isNFTHolder = user.nftCollections && user.nftCollections.length > 0;
      }
      
      const creditsPerUSDC = isNFTHolder ? 16.67 : STANDARD_CREDITS_PER_USDC;
      
      // Calculate credits
      const creditsToAdd = calculateCreditsFromAmount(payment.amount, creditsPerUSDC);
      
      logger.info(`Adding credits to user`, { 
        senderAddress, 
        creditsToAdd, 
        previousBalance: updatedUser.credits 
      });
      
      // Add credits to user using helper function (use updated user object)
      await addCreditsToUser(updatedUser, {
        txHash: payment.txHash,
        tokenSymbol: payment.token || 'USDC',
        amount: payment.amount,
        credits: creditsToAdd,
        chainId: payment.chain || 'unknown',
        walletType: 'unknown', // Can be enhanced with actual wallet type
        timestamp: new Date(payment.timestamp * 1000)
      });
      
      // Refetch user to get latest credits
      const finalUser = await User.findOne({ walletAddress: user.walletAddress });
      logger.info(`Credits added successfully`, { 
        senderAddress, 
        creditsAdded: creditsToAdd, 
        newBalance: finalUser.credits 
      });
      
      return res.json({
        success: true,
        paymentDetected: true,
        payment: {
          txHash: payment.txHash,
          amount: payment.amount,
          token: payment.token,
          chain: payment.chain,
          creditsAdded: creditsToAdd
        },
        newBalance: user.credits,
        senderAddress: senderAddress
      });
    }
    
    // No payment found
    logger.debug('No payment detected on any chain', { walletAddress, expectedAmount });
    res.json({
      success: true,
      paymentDetected: false,
      message: 'Payment not detected yet. Please wait for blockchain confirmation.'
    });
    
  } catch (error) {
    logger.error('Payment check error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: 'Failed to check payment: ' + error.message
    });
  }
});

/**
 * Credit user immediately after transaction signature (no blockchain verification)
 */
app.post('/api/payments/credit', async (req, res) => {
  try {
    const { 
      txHash, 
      walletAddress, 
      tokenSymbol, 
      amount, 
      chainId, 
      walletType 
    } = req.body;

    logger.info('Payment credit started', { txHash, walletAddress, tokenSymbol, amount, chainId, walletType });

    if (!txHash || !walletAddress || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }

    // Middleware should have caught duplicates, but double-check for safety
    const user = await getOrCreateUser(walletAddress);
    
    if (isPaymentAlreadyProcessed(user, txHash)) {
      logger.info('Payment already processed', { txHash, walletAddress });
      return res.json({
        success: true,
        credits: 0,
        totalCredits: user.credits,
        message: 'Payment already processed'
      });
    }

    // CRITICAL: Refresh NFT holder status in real-time before calculating credits
    // This ensures NFT holders get 16.67 credits/USDC instead of 6.67 credits/USDC
    const normalizedAddressForNFT = walletAddress.toLowerCase();
    let isNFTHolder = false;
    let updatedUser = user;
    try {
      const { ownedCollections, isHolder } = await checkNFTHoldingsForWallet(normalizedAddressForNFT);
      if (ownedCollections.length > 0) {
        updatedUser = await User.findOneAndUpdate(
          { walletAddress: user.walletAddress },
          { $set: { nftCollections: ownedCollections } },
          { new: true }
        );
        isNFTHolder = true;
        logger.info('NFT holder detected - applying discount rate', { walletAddress });
      } else {
        updatedUser = await User.findOneAndUpdate(
          { walletAddress: user.walletAddress },
          { $set: { nftCollections: [] } },
          { new: true }
        );
        isNFTHolder = false;
      }
    } catch (nftError) {
      logger.warn('Error checking NFT holdings, using database state', { walletAddress, error: nftError.message });
      isNFTHolder = user.nftCollections && user.nftCollections.length > 0;
    }

    const creditsPerUSDC = isNFTHolder ? 16.67 : STANDARD_CREDITS_PER_USDC;
    
    // Credit immediately based on signature (no verification)
    const creditsToAdd = calculateCreditsFromAmount(amount, creditsPerUSDC);
    
    logger.debug('Calculating credits', {
      walletAddress: updatedUser.walletAddress,
      walletType: walletType || 'evm',
      amount: parseFloat(amount),
      creditsPerUSDC: creditsPerUSDC,
      isNFTHolder: isNFTHolder,
      creditsToAdd
    });
    
    // Add credits using helper function (use updated user object)
    await addCreditsToUser(updatedUser, {
      txHash,
      tokenSymbol: tokenSymbol || 'USDC',
      amount,
      credits: creditsToAdd,
      chainId: chainId || 'unknown',
      walletType: walletType || 'evm'
    });
    
    // Refetch user to get latest credits
    const finalUser = await User.findOne({ walletAddress: walletAddress });
    logger.info('Credits added successfully', {
      walletAddress: finalUser.walletAddress,
      credits: creditsToAdd,
      totalCredits: finalUser.credits,
      txHash
    });
    
    res.json({
      success: true,
      credits: creditsToAdd,
      totalCredits: finalUser.credits,
      message: `Payment credited! ${creditsToAdd} credits added to your account.`
    });

  } catch (error) {
    logger.error('Payment credit error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: getSafeErrorMessage(error, 'Failed to credit payment')
    });
  }
});

/**
 * Verify payment (with blockchain verification)
 */
app.post('/api/payments/verify', async (req, res) => {
  try {
    const { 
      txHash, 
      walletAddress, 
      tokenSymbol, 
      amount, 
      chainId, 
      walletType 
    } = req.body;

    logger.info('Payment verification started', { txHash, walletAddress, tokenSymbol, amount, chainId, walletType });

    if (!txHash || !walletAddress || !tokenSymbol || !amount || !chainId || !walletType) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }

    // Middleware should have caught duplicates, but double-check for safety
    const user = await getOrCreateUser(walletAddress);
    
    if (isPaymentAlreadyProcessed(user, txHash)) {
      logger.info('Payment already processed', { txHash, walletAddress });
      return res.json({
        success: true,
        credits: 0,
        message: 'Payment already processed'
      });
    }

    // Refresh NFT holder status in real-time before calculating credits
    const normalizedAddressForNFT = walletAddress.toLowerCase();
    let isNFTHolder = false;
    let updatedUser = user;
    try {
      const { ownedCollections, isHolder } = await checkNFTHoldingsForWallet(normalizedAddressForNFT);
      if (ownedCollections.length > 0) {
        updatedUser = await User.findOneAndUpdate(
          { walletAddress: user.walletAddress },
          { $set: { nftCollections: ownedCollections } },
          { new: true }
        );
        isNFTHolder = true;
        logger.info('NFT holder detected - applying discount rate', { walletAddress });
      } else {
        updatedUser = await User.findOneAndUpdate(
          { walletAddress: user.walletAddress },
          { $set: { nftCollections: [] } },
          { new: true }
        );
        isNFTHolder = false;
      }
    } catch (nftError) {
      logger.warn('Error checking NFT holdings, using database state', { walletAddress, error: nftError.message });
      isNFTHolder = user.nftCollections && user.nftCollections.length > 0;
    }

    const creditsPerUSDC = isNFTHolder ? 16.67 : STANDARD_CREDITS_PER_USDC;

    let verification;
    if (walletType === 'solana') {
      // Calculate credits based on NFT holder status
      const credits = calculateCreditsFromAmount(parseFloat(amount), creditsPerUSDC);
      verification = {
        success: true,
        credits: credits,
        actualAmount: parseFloat(amount),
        txHash
      };
    } else {
      logger.debug('Verifying EVM payment', { txHash, walletAddress, tokenSymbol, amount, chainId });
      verification = await verifyEVMPayment(txHash, walletAddress, tokenSymbol, amount, chainId);
      logger.debug('EVM payment verification result', { verification });
      
      // Recalculate credits based on NFT holder status if verification succeeded
      if (verification.success && verification.actualAmount) {
        verification.credits = calculateCreditsFromAmount(verification.actualAmount, creditsPerUSDC);
        logger.debug('Recalculated credits', {
          isNFTHolder,
          creditsPerUSDC,
          actualAmount: verification.actualAmount,
          credits: verification.credits
        });
      }
    }

    if (verification.success) {
      // Add credits using helper function (use updated user object)
      await addCreditsToUser(updatedUser, {
        txHash,
        tokenSymbol,
        amount: verification.actualAmount,
        credits: verification.credits,
        chainId,
        walletType
      });
      
      // Refetch user to get latest credits
      const finalUser = await User.findOne({ walletAddress: walletAddress });
      
      logger.info('Payment verified successfully', {
        walletAddress: walletAddress.toLowerCase(),
        credits: verification.credits,
        txHash
      });
      
      res.json({
        success: true,
        credits: verification.credits,
        totalCredits: finalUser.credits,
        message: `Payment verified! ${verification.credits} credits added to your account.`
      });
    } else {
      res.status(400).json({
        success: false,
        error: 'Payment verification failed'
      });
    }

  } catch (error) {
    logger.error('Payment verification error:', error);
    res.status(500).json({
      success: false,
      error: getSafeErrorMessage(error, 'Failed to verify payment')
    });
  }
});

/**
 * Create Stripe payment intent
 */
app.post('/api/stripe/create-payment-intent', async (req, res) => {
  try {
    // Check if Stripe is configured
    if (!stripe) {
      return res.status(400).json({
        success: false,
        error: 'Stripe payment is not configured. Please use token payment instead.'
      });
    }

    const { 
      walletAddress, 
      userId,  // For email users
      amount, 
      currency = 'usd',
      credits 
    } = req.body;

    if (!amount || !credits) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: amount and credits'
      });
    }

    // Verify user exists - support both wallet and email auth
    let user;
    if (userId) {
      // Email user
      user = await User.findOne({ userId });
      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }
    } else if (walletAddress) {
      // Wallet user
      user = await getOrCreateUser(walletAddress);
    } else {
      return res.status(400).json({
        success: false,
        error: 'Either walletAddress or userId is required'
      });
    }

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: currency.toLowerCase(),
      metadata: {
        userId: user._id.toString(),
        walletAddress: user.walletAddress ? user.walletAddress.toLowerCase() : '',
        email: user.email || '',
        credits: credits.toString()
      },
      automatic_payment_methods: {
        enabled: true,
      },
    });

    logger.info('Stripe payment intent created', {
      userId: user.userId,
      email: user.email || null,
      walletAddress: user.walletAddress || null,
      amount,
      credits,
      paymentIntentId: paymentIntent.id
    });

    res.json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    });

  } catch (error) {
    logger.error('Stripe payment intent creation error:', error);
    res.status(500).json({
      success: false,
      error: getSafeErrorMessage(error, 'Failed to create payment intent')
    });
  }
});

/**
 * Verify Stripe payment and award credits
 */
app.post('/api/stripe/verify-payment', async (req, res) => {
  try {
    // Check if Stripe is configured
    if (!stripe) {
      return res.status(400).json({
        success: false,
        error: 'Stripe payment is not configured. Please use token payment instead.'
      });
    }

    const { 
      paymentIntentId, 
      walletAddress,
      userId  // For email users
    } = req.body;

    if (!paymentIntentId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: paymentIntentId'
      });
    }

    // Retrieve payment intent from Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    logger.info('Stripe payment verification', {
      paymentIntentId,
      status: paymentIntent.status,
      userId: userId || null,
      walletAddress: walletAddress || null,
      amount: paymentIntent.amount,
      metadata: paymentIntent.metadata
    });

    if (paymentIntent.status !== 'succeeded') {
      return res.status(400).json({
        success: false,
        error: `Payment not completed. Status: ${paymentIntent.status}. Please wait for payment to process or try again.`
      });
    }

    // Get user from metadata or provided identifier
    let user;
    if (paymentIntent.metadata.userId) {
      user = await User.findById(paymentIntent.metadata.userId);
    } else if (userId) {
      user = await User.findOne({ userId });
    } else if (walletAddress) {
      user = await getOrCreateUser(walletAddress);
    } else {
      return res.status(400).json({
        success: false,
        error: 'Unable to identify user. Please provide userId or walletAddress.'
      });
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    if (isPaymentAlreadyProcessed(user, null, paymentIntentId)) {
      return res.json({
        success: true,
        credits: 0,
        message: 'Payment already processed'
      });
    }

    // Calculate credits using same formula as frontend (50 credits for $10 base rate with scaling)
    const amount = paymentIntent.amount / 100; // Convert from cents
    
    // Base rate: 50 credits for $10 = 5 credits per dollar
    const baseRate = 50 / 10; // 5 credits per dollar
    
    // Subscription scaling based on amount (monthly recurring)
    let scalingMultiplier = 1.0;
    if (amount >= 80) {
      scalingMultiplier = 1.3; // 30% bonus for $80+ (6.5 credits/dollar)
    } else if (amount >= 40) {
      scalingMultiplier = 1.2; // 20% bonus for $40-79 (6 credits/dollar)
    } else if (amount >= 20) {
      scalingMultiplier = 1.1; // 10% bonus for $20-39 (5.5 credits/dollar)
    }
    // $10: 5 credits/dollar (no bonus) = 50 credits
    
    // Check if user is NFT holder (if wallet is linked)
    let isNFTHolder = false;
    if (user.walletAddress) {
      isNFTHolder = user.nftCollections && user.nftCollections.length > 0;
    }
    
    // NFT holder bonus (additional 20% on top of subscription scaling)
    const nftMultiplier = isNFTHolder ? 1.2 : 1;
    
    // Calculate final credits
    const finalCredits = Math.floor(amount * baseRate * scalingMultiplier * nftMultiplier);

    // Add credits using helper function
    await addCreditsToUser(user, {
      txHash: paymentIntentId,
      tokenSymbol: 'USD',
      amount,
      credits: finalCredits,
      chainId: 'stripe',
      walletType: 'card',
      paymentIntentId
    });
    
    // Refetch user to get latest credits
    const finalUser = await User.findById(user._id);
    
    logger.info('Stripe payment verified successfully', {
      walletAddress: walletAddress ? walletAddress.toLowerCase() : null,
      userId: user.userId || null,
      credits: finalCredits,
      paymentIntentId,
      totalCredits: finalUser.credits
    });
    
    res.json({
      success: true,
      credits: finalCredits,
      totalCredits: finalUser.credits,
      message: `Payment verified! ${finalCredits} credits added to your account.`
    });

  } catch (error) {
    logger.error('Stripe payment verification error:', error);
    res.status(500).json({
      success: false,
      error: getSafeErrorMessage(error, 'Failed to verify payment')
    });
  }
});

/**
 * Create Stripe Checkout Session for subscriptions
 */
app.post('/create-checkout-session', async (req, res) => {
  try {
    // Check if Stripe is configured
    if (!stripe) {
      return res.status(400).json({
        success: false,
        error: 'Stripe payment is not configured. Please use token payment instead.'
      });
    }

    const { 
      lookup_key,
      walletAddress, 
      userId,  // For email users
      success_url,
      cancel_url
    } = req.body;

    if (!lookup_key) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: lookup_key'
      });
    }

    // Verify user exists - support both wallet and email auth
    let user;
    if (userId) {
      // Email user
      user = await User.findOne({ userId });
      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }
    } else if (walletAddress) {
      // Wallet user
      user = await getOrCreateUser(walletAddress);
    } else {
      return res.status(400).json({
        success: false,
        error: 'Either walletAddress or userId is required'
      });
    }

    // Get base URL from environment or request
    const isValidHttpUrl = (candidate) => {
      if (!candidate || typeof candidate !== 'string') return false;
      try {
        const parsed = new URL(candidate);
        return parsed.protocol === 'https:' || parsed.protocol === 'http:';
      } catch (err) {
        return false;
      }
    };

    const fallbackFrontendUrl = 'https://seisoai.com';
    const envFrontendUrl = process.env.FRONTEND_URL;
    const requestOrigin = req.headers.origin;
    const inferredHost = req.headers.host ? `https://${req.headers.host}` : null;
    let baseUrl = null;

    if (isValidHttpUrl(envFrontendUrl)) {
      baseUrl = envFrontendUrl;
    } else if (isValidHttpUrl(requestOrigin)) {
      baseUrl = requestOrigin;
    } else if (isValidHttpUrl(inferredHost)) {
      baseUrl = inferredHost;
    } else {
      baseUrl = fallbackFrontendUrl;
    }

    if (!isValidHttpUrl(baseUrl)) {
      logger.warn('Invalid base URL detected for checkout session, falling back', {
        envFrontendUrl,
        requestOrigin,
        inferredHost,
        fallbackFrontendUrl
      });
      baseUrl = fallbackFrontendUrl;
    }

    // Look up the price by lookup_key if it's not already a price ID
    let priceId = lookup_key;
    
    // If lookup_key doesn't start with 'price_', assume it's a lookup_key and retrieve the price
    if (!lookup_key.startsWith('price_')) {
      const prices = await stripe.prices.list({
        lookup_keys: [lookup_key],
        limit: 1,
      });
      
      if (prices.data.length === 0) {
        return res.status(400).json({
          success: false,
          error: `Price with lookup_key "${lookup_key}" not found`
        });
      }
      
      priceId = prices.data[0].id;
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      customer_email: user.email || undefined,
      metadata: {
        userId: user.userId || user._id.toString(), // Use custom userId if available, fallback to _id
        walletAddress: user.walletAddress ? user.walletAddress.toLowerCase() : '',
        email: user.email || '',
      },
      subscription_data: {
        metadata: {
          userId: user.userId || user._id.toString(), // Use custom userId if available, fallback to _id
          walletAddress: user.walletAddress ? user.walletAddress.toLowerCase() : '',
          email: user.email || '',
        },
      },
      success_url: success_url || `${baseUrl}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancel_url || `${baseUrl}?canceled=true`,
    });

    logger.info('Stripe checkout session created', {
      userId: user.userId,
      email: user.email || null,
      walletAddress: user.walletAddress || null,
      lookup_key,
      sessionId: session.id
    });

    res.json({
      success: true,
      sessionId: session.id,
      url: session.url
    });

  } catch (error) {
    logger.error('Stripe checkout session creation error:', error);
    res.status(500).json({
      success: false,
      error: getSafeErrorMessage(error, 'Failed to create checkout session')
    });
  }
});

/**
 * Verify subscription checkout session manually (fallback if webhook missed)
 */
app.post('/api/subscription/verify', async (req, res) => {
  try {
    if (!stripe) {
      return res.status(400).json({
        success: false,
        error: 'Stripe payment is not configured. Please contact support.'
      });
    }

    const { sessionId, userId } = req.body;
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'sessionId is required'
      });
    }

    logger.info('Subscription verification started', { sessionId, userId: userId || 'not provided' });

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (!session) {
      logger.error('Checkout session not found', { sessionId });
      return res.status(404).json({
        success: false,
        error: 'Checkout session not found'
      });
    }

    if (session.mode !== 'subscription') {
      logger.warn('Non-subscription checkout attempted', { sessionId, mode: session.mode });
      return res.status(400).json({
        success: false,
        error: 'Only subscription checkouts can be verified'
      });
    }

    if (session.payment_status !== 'paid') {
      logger.warn('Payment not completed yet', { sessionId, payment_status: session.payment_status });
      return res.status(400).json({
        success: false,
        error: 'Payment is not completed yet. Please wait a moment and refresh.'
      });
    }

    const subscriptionId = session.subscription;
    if (!subscriptionId) {
      logger.error('No subscription ID in session', { sessionId });
      return res.status(400).json({
        success: false,
        error: 'No subscription found for this checkout session'
      });
    }

    const metadata = session.metadata || {};
    let user = null;

    // Try to get user from auth token first
    const authHeader = req.headers['authorization'];
    if (authHeader) {
      try {
        const token = authHeader.split(' ')[1]; // Bearer TOKEN
        if (token) {
          const decoded = jwt.verify(token, JWT_SECRET);
          user = await User.findOne({
            $or: [
              { userId: decoded.userId },
              { email: decoded.email }
            ]
          });
          if (user) {
            logger.info('User found via auth token', { userId: user.userId, email: user.email });
          }
        }
      } catch (tokenError) {
        logger.warn('Invalid or missing auth token', { error: tokenError.message });
      }
    }

    // Try userId from request body (custom userId field, not MongoDB _id)
    if (!user && userId) {
      user = await User.findOne({ userId });
      if (user) {
        logger.info('User found via request userId', { userId });
      } else {
        logger.warn('User not found by request userId', { userId });
      }
    }

    // Try userId from session metadata (could be custom userId or MongoDB _id)
    if (!user && metadata.userId) {
      // First try as custom userId field
      user = await User.findOne({ userId: metadata.userId });
      if (!user) {
        // If not found, try as MongoDB _id
        try {
          user = await User.findById(metadata.userId);
        } catch (idError) {
          // Invalid ObjectId format, ignore
        }
      }
      if (user) {
        logger.info('User found via session metadata userId', { metadataUserId: metadata.userId, foundUserId: user.userId });
      }
    }

    // Try walletAddress from metadata
    if (!user && metadata.walletAddress) {
      user = await getOrCreateUser(metadata.walletAddress);
      if (user) {
        logger.info('User found/created via walletAddress', { walletAddress: metadata.walletAddress });
      }
    }

    // Try email from metadata
    if (!user && metadata.email) {
      user = await User.findOne({ email: metadata.email.toLowerCase() });
      if (user) {
        logger.info('User found via session metadata email', { email: metadata.email });
      }
    }

    // Try customer email from Stripe
    if (!user && session.customer) {
      try {
        const customer = await stripe.customers.retrieve(session.customer);
        if (customer && customer.email) {
          user = await User.findOne({ email: customer.email.toLowerCase() });
          if (user) {
            logger.info('User found via Stripe customer email', { email: customer.email });
          }
        }
      } catch (customerError) {
        logger.warn('Could not retrieve customer while verifying subscription', { error: customerError.message });
      }
    }

    if (!user) {
      logger.error('User not found for subscription verification', {
        sessionId,
        requestUserId: userId || null,
        metadataUserId: metadata.userId || null,
        metadataEmail: metadata.email || null,
        metadataWalletAddress: metadata.walletAddress || null,
        sessionCustomer: session.customer || null
      });
      return res.status(404).json({
        success: false,
        error: 'We could not find your user account for this payment. Please contact support with your receipt.'
      });
    }

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const price = subscription?.items?.data?.[0]?.price;
    const amountInDollars = price?.unit_amount ? price.unit_amount / 100 : null;

    if (!amountInDollars) {
      return res.status(400).json({
        success: false,
        error: 'Unable to determine subscription amount. Please contact support.'
      });
    }

    const paymentId = `checkout_${session.id}`;

    if (isPaymentAlreadyProcessed(user, null, paymentId)) {
      const refreshedUser = await User.findById(user._id);
      return res.json({
        success: true,
        alreadyProcessed: true,
        credits: 0,
        totalCredits: refreshedUser?.credits ?? user.credits,
        planName: price?.nickname || null,
        planPrice: price?.unit_amount ? `$${(price.unit_amount / 100).toFixed(2)}/month` : null,
        amount: amountInDollars
      });
    }

    const finalCredits = await addSubscriptionCredits(user, {
      amountInDollars,
      paymentId,
      subscriptionId
    });

    const updatedUser = await User.findById(user._id);

    logger.info('Credits added via subscription verification endpoint', {
      sessionId,
      subscriptionId,
      userId: user.userId || null,
      walletAddress: user.walletAddress || null,
      amount: amountInDollars,
      credits: finalCredits,
      totalCredits: updatedUser?.credits ?? user.credits
    });

    return res.json({
      success: true,
      credits: finalCredits,
      totalCredits: updatedUser?.credits ?? user.credits,
      planName: price?.nickname || null,
      planPrice: price?.unit_amount ? `$${(price.unit_amount / 100).toFixed(2)}/month` : null,
      amount: amountInDollars
    });
  } catch (error) {
    logger.error('Subscription verification error', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: getSafeErrorMessage(error, 'Failed to verify subscription payment')
    });
  }
});

/**
 * Instant payment detection - checks for payments immediately after wallet connection
 * Note: Rate limiting applied via instantCheckLimiter above
 */
app.post('/api/payment/instant-check', instantCheckLimiter, async (req, res) => {
  try {
    const { walletAddress, chainId, expectedAmount } = req.body;
    const token = 'USDC';
    
    console.log(`[INSTANT CHECK] Starting instant payment check for ${walletAddress || 'any wallet'} on chain ${chainId}`);
    console.log(`[INSTANT CHECK] Expected amount: ${expectedAmount} USDC`);
    
    const evmPaymentAddress = EVM_PAYMENT_ADDRESS;
    
    // Map chainId to backend chain name
    const chainIdToChainName = {
      1: 'ethereum',
      137: 'polygon',
      42161: 'arbitrum',
      10: 'optimism',
      8453: 'base'
    };
    
    const chainName = chainIdToChainName[chainId];
    
    // Only check the chain the wallet is connected to
    if (chainName) {
      console.log(`[INSTANT CHECK] Checking ${chainName} only (Chain ID: ${chainId})`);
      console.log(`[INSTANT CHECK] Looking for USDC transfers TO: ${evmPaymentAddress}`);
      console.log(`[INSTANT CHECK] On chain: ${chainName}`);
      const quickPromises = [Promise.race([
        checkForTokenTransfer(evmPaymentAddress, token, chainName),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 30000)) // Increase timeout to 30s
      ]).catch(err => {
        console.log(`[QUICK] ${chainName} check failed:`, err.message);
        return null;
      })];
      
      const quickResults = await Promise.all(quickPromises);
      const quickPayment = quickResults.find(r => r && r.found);
      
      if (quickPayment) {
        console.log(`[INSTANT] Payment found on ${quickPayment.chain}!`);
        
        // Get the sender's wallet address from the blockchain event
        const senderAddress = quickPayment.from;
        
        // Verify the payment is from the requesting wallet address
        if (walletAddress && senderAddress.toLowerCase() !== walletAddress.toLowerCase()) {
          console.log(`[INSTANT] Payment sender ${senderAddress} does not match requesting wallet ${walletAddress}`);
          return res.json({
            success: true,
            paymentDetected: false,
            message: 'Payment found but sender does not match'
          });
        }
        
        // Verify amount if provided
        if (expectedAmount) {
          const paymentAmount = parseFloat(quickPayment.amount);
          const expected = parseFloat(expectedAmount);
          const tolerance = expected * 0.01; // 1% tolerance
          
          if (paymentAmount < expected - tolerance || paymentAmount > expected + tolerance) {
            console.log(`[INSTANT] Payment amount ${paymentAmount} does not match expected ${expectedAmount} (tolerance: ${tolerance})`);
            return res.json({
              success: true,
              paymentDetected: false,
              message: `Payment found but amount ${paymentAmount} does not match expected ${expectedAmount}`
            });
          }
        }
        
        console.log(`[CREDIT] Crediting sender: ${senderAddress} for USDC transfer`);
        
        // Process payment for the sender
        const user = await getOrCreateUser(senderAddress);
        
        // Middleware should have caught duplicates, but double-check for safety
        if (isPaymentAlreadyProcessed(user, quickPayment.txHash)) {
          return res.json({
            success: true,
            paymentDetected: true,
            alreadyProcessed: true,
            message: 'Payment already credited'
          });
        }
        
        // CRITICAL: Refresh NFT holder status in real-time before calculating credits
        // This ensures NFT holders get 16.67 credits/USDC instead of 6.67 credits/USDC
        const normalizedAddressForNFT = senderAddress.toLowerCase();
        let isNFTHolder = false;
        let updatedUser = user;
        try {
          const { ownedCollections, isHolder } = await checkNFTHoldingsForWallet(normalizedAddressForNFT);
          if (ownedCollections.length > 0) {
            updatedUser = await User.findOneAndUpdate(
              { walletAddress: user.walletAddress },
              { $set: { nftCollections: ownedCollections } },
              { new: true }
            );
            isNFTHolder = true;
            logger.info('NFT holder detected - applying discount rate', { senderAddress });
          } else {
            updatedUser = await User.findOneAndUpdate(
              { walletAddress: user.walletAddress },
              { $set: { nftCollections: [] } },
              { new: true }
            );
            isNFTHolder = false;
          }
        } catch (nftError) {
          logger.warn('Error checking NFT holdings, using database state', { senderAddress, error: nftError.message });
          isNFTHolder = user.nftCollections && user.nftCollections.length > 0;
        }
        
        // Calculate credits using pay-per-credit pricing ($0.15 for non-NFT holders, $0.06 for NFT holders)
        const creditsPerUSDC = isNFTHolder ? 16.67 : STANDARD_CREDITS_PER_USDC;
        const creditsToAdd = calculateCreditsFromAmount(quickPayment.amount, creditsPerUSDC);
        
        // Add credits using helper function (use updated user object)
        await addCreditsToUser(updatedUser, {
          txHash: quickPayment.txHash,
          tokenSymbol: quickPayment.token || 'USDC',
          amount: quickPayment.amount,
          credits: creditsToAdd,
          chainId: quickPayment.chain || 'unknown',
          walletType: 'unknown',
          timestamp: new Date(quickPayment.timestamp * 1000)
        });
        
        console.log(`[INSTANT] Added ${creditsToAdd} credits to ${senderAddress}!`);
        
        return res.json({
          success: true,
          paymentDetected: true,
          payment: quickPayment,
          credits: creditsToAdd,
          newBalance: user.credits,
          senderAddress: senderAddress,
          message: 'Payment detected and credits added instantly!'
        });
      }
    }
    
    // If no chainId provided or chain not found, fall back to checking all chains
    console.log(`[INSTANT CHECK] No specific chain requested or unsupported chainId (${chainId}), checking all chains`);
    const allChains = ['polygon', 'ethereum', 'base', 'arbitrum', 'optimism'];
    const quickPromises = allChains.map(chain => 
      Promise.race([
        checkForTokenTransfer(evmPaymentAddress, token, chain),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
      ]).catch(err => {
        console.log(`[QUICK] ${chain} check failed:`, err.message);
        return null;
      })
    );
    
    const quickResults = await Promise.all(quickPromises);
    const quickPayment = quickResults.find(r => r && r.found);
    
    if (quickPayment) {
      console.log(`[INSTANT] Payment found on ${quickPayment.chain}!`);
      
      // Get the sender's wallet address from the blockchain event
      const senderAddress = quickPayment.from;
      
      // Verify the payment is from the requesting wallet address
      if (walletAddress && senderAddress.toLowerCase() !== walletAddress.toLowerCase()) {
        console.log(`[INSTANT] Payment sender ${senderAddress} does not match requesting wallet ${walletAddress}`);
        return res.json({
          success: true,
          paymentDetected: false,
          message: 'Payment found but sender does not match'
        });
      }
      
      // Verify amount if provided
      if (expectedAmount) {
        const paymentAmount = parseFloat(quickPayment.amount);
        const expected = parseFloat(expectedAmount);
        const tolerance = expected * 0.01; // 1% tolerance
        
        if (paymentAmount < expected - tolerance || paymentAmount > expected + tolerance) {
          console.log(`[INSTANT] Payment amount ${paymentAmount} does not match expected ${expectedAmount} (tolerance: ${tolerance})`);
          return res.json({
            success: true,
            paymentDetected: false,
            message: `Payment found but amount ${paymentAmount} does not match expected ${expectedAmount}`
          });
        }
      }
      
      console.log(`[CREDIT] Crediting sender: ${senderAddress} for USDC transfer`);
      
      // Process payment for the sender
      const user = await getOrCreateUser(senderAddress);
      
      // Middleware should have caught duplicates, but double-check for safety
      if (isPaymentAlreadyProcessed(user, quickPayment.txHash)) {
        return res.json({
          success: true,
          paymentDetected: true,
          alreadyProcessed: true,
          message: 'Payment already credited'
        });
      }
      
      // CRITICAL: Refresh NFT holder status in real-time before calculating credits
      // This ensures NFT holders get 16.67 credits/USDC instead of 6.67 credits/USDC
      const normalizedAddressForNFT = senderAddress.toLowerCase();
      let isNFTHolder = false;
      let updatedUser = user;
      try {
        const { ownedCollections, isHolder } = await checkNFTHoldingsForWallet(normalizedAddressForNFT);
        if (ownedCollections.length > 0) {
          updatedUser = await User.findOneAndUpdate(
            { walletAddress: user.walletAddress },
            { $set: { nftCollections: ownedCollections } },
            { new: true }
          );
          isNFTHolder = true;
          logger.info('NFT holder detected - applying discount rate', { senderAddress });
        } else {
          updatedUser = await User.findOneAndUpdate(
            { walletAddress: user.walletAddress },
            { $set: { nftCollections: [] } },
            { new: true }
          );
          isNFTHolder = false;
        }
      } catch (nftError) {
        logger.warn('Error checking NFT holdings, using database state', { senderAddress, error: nftError.message });
        isNFTHolder = user.nftCollections && user.nftCollections.length > 0;
      }
      
      // Calculate credits using pay-per-credit pricing ($0.15 for non-NFT holders, $0.06 for NFT holders)
      const creditsPerUSDC = isNFTHolder ? 16.67 : STANDARD_CREDITS_PER_USDC;
      const creditsToAdd = calculateCreditsFromAmount(quickPayment.amount, creditsPerUSDC);
      
      // Add credits using helper function (use updated user object)
      await addCreditsToUser(updatedUser, {
        txHash: quickPayment.txHash,
        tokenSymbol: quickPayment.token || 'USDC',
        amount: quickPayment.amount,
        credits: creditsToAdd,
        chainId: quickPayment.chain || 'unknown',
        walletType: 'unknown',
        timestamp: new Date(quickPayment.timestamp * 1000)
      });
      
      // Refetch user to get latest credits
      const finalUser = await User.findOne({ walletAddress: senderAddress });
      
      console.log(`[INSTANT] Added ${creditsToAdd} credits to ${senderAddress}!`);
      
      return res.json({
        success: true,
        paymentDetected: true,
        payment: quickPayment,
        credits: creditsToAdd,
        newBalance: finalUser.credits,
        senderAddress: senderAddress,
        message: 'Payment detected and credits added instantly!'
      });
    }
    
    // If no quick payment found, return not detected
    return res.json({
      success: true,
      paymentDetected: false,
      message: 'No payment detected yet'
    });
    
  } catch (error) {
    console.error('[INSTANT CHECK] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Instant payment check failed'
    });
  }
});

// Stripe webhook handler moved to before express.json() middleware

/**
 * Add generation to history
 */
app.post('/api/generations/add', async (req, res) => {
  try {
    logger.debug('Generation add request received', {
      hasWalletAddress: !!req.body?.walletAddress,
      hasUserId: !!req.body?.userId,
      hasEmail: !!req.body?.email,
      hasImageUrl: !!req.body?.imageUrl,
      creditsUsed: req.body?.creditsUsed
    });

    const { 
      walletAddress, 
      userId,
      email,
      prompt, 
      style, 
      imageUrl, 
      videoUrl,
      requestId,
      status,
      creditsUsed 
    } = req.body;

    // Either imageUrl or videoUrl must be provided
    if (!imageUrl && !videoUrl) {
      logger.error('Missing required field: imageUrl or videoUrl');
      return res.status(400).json({
        success: false,
        error: 'Missing required field: imageUrl or videoUrl is required'
      });
    }

    // Support both wallet address and email/userId authentication
    let user;
    if (walletAddress) {
      // Wallet-based user
      const isSolanaAddress = !walletAddress.startsWith('0x');
      const normalizedWalletAddress = isSolanaAddress ? walletAddress : walletAddress.toLowerCase();
      
      logger.debug('Getting user by wallet address', {
        originalWalletAddress: walletAddress,
        normalizedWalletAddress: normalizedWalletAddress,
        isSolana: isSolanaAddress
      });
      
      user = await getOrCreateUser(normalizedWalletAddress);
    } else if (userId) {
      // Email-based user (userId format: email_xxxxx)
      logger.debug('Getting user by userId', { userId });
      user = await User.findOne({ userId });
      if (!user) {
        logger.error('User not found by userId', { userId });
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }
    } else if (email) {
      // Email-based user (by email)
      logger.debug('Getting user by email', { email });
      user = await User.findOne({ email: email.toLowerCase() });
      if (!user) {
        logger.error('User not found by email', { email });
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }
    } else {
      logger.error('Missing user identifier', { hasWalletAddress: !!walletAddress, hasUserId: !!userId, hasEmail: !!email });
      return res.status(400).json({
        success: false,
        error: 'Missing user identifier: walletAddress, userId, or email is required'
      });
    }
    logger.debug('User found for generation', {
      userId: user.userId,
      email: user.email,
      walletAddress: user.walletAddress,
      credits: user.credits,
      totalCreditsEarned: user.totalCreditsEarned,
      totalCreditsSpent: user.totalCreditsSpent
    });
    
    // Check credits directly - credits is the spendable balance
    // totalCreditsEarned is a lifetime total for tracking, not for spending
    const availableCredits = user.credits || 0;
    const creditsToDeduct = creditsUsed || 1; // Default to 1 credit if not specified
    
    // Check IP-based free image eligibility (prevents abuse across multiple accounts)
    const clientIP = extractClientIP(req);
    let ipFreeImageRecord = await IPFreeImage.findOne({ ipAddress: clientIP });
    if (!ipFreeImageRecord) {
      ipFreeImageRecord = new IPFreeImage({
        ipAddress: clientIP,
        freeImagesUsed: 0
      });
      await ipFreeImageRecord.save();
    }
    
    const freeImagesUsedFromIP = ipFreeImageRecord.freeImagesUsed || 0;
    
    // Check if user is NFT holder (has ANY NFTs - not counting how many)
    // NFT holders get 5 free images TOTAL per IP, not 5 per NFT
    const isNFTHolder = user.nftCollections && user.nftCollections.length > 0;
    const maxFreeImages = isNFTHolder ? MAX_FREE_IMAGES_PER_IP_NFT : MAX_FREE_IMAGES_PER_IP_REGULAR;
    const isEligibleForFreeImage = freeImagesUsedFromIP < maxFreeImages && creditsToDeduct === 1; // Only allow free image for single credit requests
    const isFreeImage = isEligibleForFreeImage && availableCredits < creditsToDeduct;
    
    logger.debug('Checking credits for generation', {
      userId: user.userId,
      email: user.email,
      walletAddress: user.walletAddress,
      credits: user.credits,
      totalCreditsEarned: user.totalCreditsEarned,
      availableCredits,
      creditsToDeduct,
      clientIP,
      freeImagesUsedFromIP,
      maxFreeImages,
      isNFTHolder,
      isEligibleForFreeImage,
      isFreeImage
    });
    
    // Check if user has enough credits (unless this is a free image based on IP)
    if (availableCredits < creditsToDeduct && !isFreeImage) {
      logger.warn('Insufficient credits for generation', {
        userId: user.userId,
        email: user.email,
        walletAddress: user.walletAddress,
        availableCredits,
        creditsToDeduct,
        totalCreditsEarned: user.totalCreditsEarned,
        clientIP,
        freeImagesUsedFromIP,
        maxFreeImages,
        isNFTHolder
      });
      return res.status(400).json({
        success: false,
        error: `Insufficient credits. You have ${availableCredits} credits but need ${creditsToDeduct}`
      });
    }

    // Deduct credits (if not free) and add generation in a SINGLE atomic operation to prevent conflicts
    const previousCredits = user.credits || 0;
    const previousTotalSpent = user.totalCreditsSpent || 0;
    const actualCreditsDeducted = isFreeImage ? 0 : creditsToDeduct;
    
    logger.debug('Before credit deduction', {
      previousCredits,
      previousTotalSpent,
      creditsToDeduct,
      availableCredits,
      userId: user.userId,
      email: user.email,
      walletAddress: user.walletAddress
    });
    
    // Create generation object
    // For free images, set creditsUsed to 0 immediately
    const generationId = `gen_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const generation = {
      id: generationId,
      prompt: prompt || 'No prompt',
      style: style || 'No Style',
      ...(imageUrl && { imageUrl }),
      ...(videoUrl && { videoUrl }),
      ...(requestId && { requestId }),
      ...(status && { status }),
      creditsUsed: isFreeImage ? 0 : creditsToDeduct, // Set to 0 for free images
      timestamp: new Date()
    };
    
    // Create gallery item (only add to gallery if completed, or if it's an image)
    const galleryItem = {
      id: generationId,
      prompt: prompt || 'No prompt',
      style: style || 'No Style',
      ...(imageUrl && { imageUrl }),
      ...(videoUrl && { videoUrl }),
      creditsUsed: isFreeImage ? 0 : creditsToDeduct, // Set to 0 for free images
      timestamp: new Date()
    };
    
    // Use atomic update to do BOTH credit deduction AND add generation in one operation
    // This prevents race conditions and ensures credits are always deducted
    // DO NOT call user.save() after this - it would overwrite the atomic update!
    // Build query based on how we found the user
    let updateQuery;
    if (walletAddress) {
      const isSolanaAddress = !walletAddress.startsWith('0x');
      const normalizedWalletAddress = isSolanaAddress ? walletAddress : walletAddress.toLowerCase();
      updateQuery = { walletAddress: normalizedWalletAddress };
    } else if (userId) {
      updateQuery = { userId };
    } else if (email) {
      updateQuery = { email: email.toLowerCase() };
    }
    
    logger.debug('Executing atomic update', {
      updateQuery,
      creditsToDeduct,
      isFreeImage,
      actualCreditsUsed: generation.creditsUsed,
      hasGeneration: !!generation,
      hasVideoUrl: !!videoUrl,
      hasRequestId: !!requestId,
      status: status || 'completed'
    });
    
    // Build update object - only add to gallery if completed or if it's an image
    // For free images, don't deduct credits but still mark as used
    const updateObj = {
      $push: {
        generationHistory: generation
      }
    };
    
    // Only deduct credits if this is not a free image
    if (!isFreeImage) {
      updateObj.$inc = { 
        credits: -creditsToDeduct,
        totalCreditsSpent: creditsToDeduct
      };
    } else {
      // For free images, increment IP-based free image counter (atomic operation)
      await IPFreeImage.findOneAndUpdate(
        { ipAddress: clientIP },
        { 
          $inc: { freeImagesUsed: 1 },
          $set: { lastUsed: new Date() }
        },
        { upsert: true, new: true }
      );
      
      logger.info('Using free image (IP-based)', {
        userId: user.userId,
        email: user.email,
        walletAddress: user.walletAddress,
        clientIP,
        freeImagesUsedAfter: freeImagesUsedFromIP + 1,
        maxFreeImages,
        isNFTHolder
      });
    }
    
    // Only add to gallery if completed (has videoUrl/imageUrl) or if status is not queued/processing
    if (status !== 'queued' && status !== 'processing' && (videoUrl || imageUrl)) {
      updateObj.$push.gallery = galleryItem;
    }
    
    const updateResult = await User.findOneAndUpdate(
      updateQuery,
      updateObj,
      { new: true }
    );
    
    logger.debug('Atomic update result', {
      found: !!updateResult,
      returnedCredits: updateResult?.credits,
      returnedTotalSpent: updateResult?.totalCreditsSpent,
      generationHistoryLength: updateResult?.generationHistory?.length,
      galleryLength: updateResult?.gallery?.length
    });
    
    if (!updateResult) {
      logger.error('Failed to update user - user not found', { updateQuery });
      // Try to find the user to see if it exists
      const checkUser = await User.findOne(updateQuery);
      logger.error('User check after failed update', {
        exists: !!checkUser,
        updateQuery,
        foundUserId: checkUser?.userId,
        foundEmail: checkUser?.email,
        foundWalletAddress: checkUser?.walletAddress
      });
      throw new Error(`Failed to update user credits. User not found in database.`);
    }
    
    // Ensure credits don't go negative (shouldn't happen due to availableCredits check, but safety)
    if (updateResult.credits < 0) {
      logger.warn('Credits went negative, correcting to 0', { updateQuery, credits: updateResult.credits });
      await User.findOneAndUpdate(
        updateQuery,
        { $set: { credits: 0 } },
        { new: true }
      );
      updateResult.credits = 0;
    }
    
    logger.info('Atomic update completed', {
      newCredits: updateResult.credits,
      newTotalSpent: updateResult.totalCreditsSpent,
      generationId,
      previousCredits,
      creditsDeducted: creditsToDeduct
    });
    
    // Refetch to verify everything saved correctly
    const savedUser = await User.findOne(updateQuery);
    logger.debug('Verified saved credits', {
      savedCredits: savedUser?.credits,
      savedTotalSpent: savedUser?.totalCreditsSpent,
      generationHistoryCount: savedUser?.generationHistory?.length,
      galleryCount: savedUser?.gallery?.length,
      matchExpected: savedUser?.credits === updateResult.credits,
      creditsActuallyDeducted: previousCredits - (savedUser?.credits || 0)
    });
    
    // Use updateResult for response
    const finalCredits = updateResult.credits;
    
    // Get updated IP free image count for message (if free image was used)
    let updatedIPRecord = null;
    let remainingFreeImages = 0;
    if (isFreeImage) {
      updatedIPRecord = await IPFreeImage.findOne({ ipAddress: clientIP });
      const updatedFreeImagesUsed = updatedIPRecord?.freeImagesUsed || 0;
      remainingFreeImages = Math.max(0, maxFreeImages - updatedFreeImagesUsed);
    }
    
    logger.info('Generation added to history and credits deducted', {
      userId: user.userId,
      email: user.email,
      walletAddress: user.walletAddress,
      generationId,
      creditsUsed: isFreeImage ? 0 : creditsToDeduct,
      isFreeImage,
      clientIP,
      freeImagesUsedFromIP: updatedIPRecord?.freeImagesUsed || freeImagesUsedFromIP,
      remainingFreeImages,
      maxFreeImages,
      isNFTHolder,
      previousCredits,
      newCredits: finalCredits,
      savedCredits: savedUser?.credits,
      totalCreditsSpent: updateResult.totalCreditsSpent,
      creditsActuallyDeducted: previousCredits - finalCredits
    });
    
    const message = isFreeImage 
      ? `Generation added to history. This was a free image! ${remainingFreeImages} free image(s) remaining for your IP. Remaining credits: ${finalCredits}.`
      : `Generation added to history. ${creditsToDeduct} credit(s) deducted. Remaining: ${finalCredits} credits.`;
    
    res.json({
      success: true,
      generationId,
      remainingCredits: finalCredits,
      creditsDeducted: actualCreditsDeducted,
      previousCredits: previousCredits,
      isFreeImage,
      message
    });
  } catch (error) {
    console.error('❌ [GENERATION ADD] ERROR:', error);
    console.error('❌ [GENERATION ADD] Error stack:', error.stack);
    logger.error('Error adding generation:', error);
    res.status(500).json({ success: false, error: getSafeErrorMessage(error, 'Failed to add generation') });
  }
});

/**
 * Update a generation (e.g., when video completes)
 */
app.put('/api/generations/update/:generationId', async (req, res) => {
  try {
    const { generationId } = req.params;
    const { 
      walletAddress, 
      userId,
      email,
      videoUrl,
      imageUrl,
      status
    } = req.body;

    if (!generationId) {
      return res.status(400).json({
        success: false,
        error: 'generationId is required'
      });
    }

    // Find user
    let user;
    let updateQuery;
    if (walletAddress) {
      const isSolanaAddress = !walletAddress.startsWith('0x');
      const normalizedWalletAddress = isSolanaAddress ? walletAddress : walletAddress.toLowerCase();
      updateQuery = { walletAddress: normalizedWalletAddress };
      user = await User.findOne(updateQuery);
    } else if (userId) {
      updateQuery = { userId };
      user = await User.findOne(updateQuery);
    } else if (email) {
      updateQuery = { email: email.toLowerCase() };
      user = await User.findOne(updateQuery);
    } else {
      return res.status(400).json({
        success: false,
        error: 'walletAddress, userId, or email is required'
      });
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Find the generation in history
    const generation = user.generationHistory.find(gen => gen.id === generationId);
    if (!generation) {
      return res.status(404).json({
        success: false,
        error: 'Generation not found'
      });
    }

    // Build update object
    const updateFields = {};
    if (videoUrl) updateFields['generationHistory.$.videoUrl'] = videoUrl;
    if (imageUrl) updateFields['generationHistory.$.imageUrl'] = imageUrl;
    if (status) updateFields['generationHistory.$.status'] = status;

    // Update generation in history
    await User.updateOne(
      { ...updateQuery, 'generationHistory.id': generationId },
      { $set: updateFields }
    );

    // If completed and has videoUrl/imageUrl, add to gallery
    if ((status === 'completed' || !status) && (videoUrl || imageUrl)) {
      const galleryItem = {
        id: generationId,
        prompt: generation.prompt,
        style: generation.style,
        ...(imageUrl && { imageUrl }),
        ...(videoUrl && { videoUrl }),
        creditsUsed: generation.creditsUsed,
        timestamp: generation.timestamp || new Date()
      };

      // Check if already in gallery
      const inGallery = user.gallery.some(item => item.id === generationId);
      if (!inGallery) {
        await User.updateOne(
          updateQuery,
          { $push: { gallery: galleryItem } }
        );
      } else {
        // Update existing gallery item
        const galleryUpdateFields = {};
        if (videoUrl) galleryUpdateFields['gallery.$.videoUrl'] = videoUrl;
        if (imageUrl) galleryUpdateFields['gallery.$.imageUrl'] = imageUrl;
        await User.updateOne(
          { ...updateQuery, 'gallery.id': generationId },
          { $set: galleryUpdateFields }
        );
      }
    }

    logger.info('Generation updated', { generationId, status, hasVideoUrl: !!videoUrl, hasImageUrl: !!imageUrl });

    res.json({
      success: true,
      message: 'Generation updated successfully'
    });
  } catch (error) {
    logger.error('Error updating generation:', error);
    res.status(500).json({ success: false, error: getSafeErrorMessage(error, 'Failed to update generation') });
  }
});

/**
 * TEST ENDPOINT: Manually deduct credits for testing
 * SECURITY: Only available in development mode
 */
app.post('/api/test/deduct-credits', async (req, res) => {
  // Disable in production for security
  if (process.env.NODE_ENV === 'production') {
    logger.warn('Test endpoint accessed in production', { ip: req.ip, path: req.path });
    return res.status(403).json({ 
      success: false, 
      error: 'Test endpoints are disabled in production' 
    });
  }
  
  try {
    const { walletAddress, creditsToDeduct = 1 } = req.body;
    
    if (!walletAddress) {
      return res.status(400).json({ success: false, error: 'walletAddress required' });
    }
    
    const isSolanaAddress = !walletAddress.startsWith('0x');
    const normalizedWalletAddress = isSolanaAddress ? walletAddress : walletAddress.toLowerCase();
    
    console.log('🧪 [TEST] Manual credit deduction test:', {
      original: walletAddress,
      normalized: normalizedWalletAddress,
      creditsToDeduct
    });
    
    const user = await User.findOne({ walletAddress: normalizedWalletAddress });
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    const beforeCredits = user.credits || 0;
    
    const updateResult = await User.findOneAndUpdate(
      { walletAddress: normalizedWalletAddress },
      {
        $inc: { credits: -creditsToDeduct, totalCreditsSpent: creditsToDeduct }
      },
      { new: true }
    );
    
    const afterCredits = updateResult?.credits || 0;
    
    const savedUser = await User.findOne({ walletAddress: normalizedWalletAddress });
    
    return res.json({
      success: true,
      beforeCredits,
      afterCredits,
      savedCredits: savedUser?.credits,
      creditsDeducted: creditsToDeduct,
      matched: afterCredits === savedUser?.credits,
      message: `Test deduction: ${beforeCredits} -> ${afterCredits} (saved: ${savedUser?.credits})`
    });
  } catch (error) {
    console.error('❌ [TEST] Error:', error);
    logger.error('Test endpoint error:', error);
    return res.status(500).json({ success: false, error: getSafeErrorMessage(error, 'Test operation failed') });
  }
});

/**
 * Log safety violations
 */
app.post('/api/safety/violation', async (req, res) => {
  try {
    const { walletAddress, violation, userAgent, url } = req.body;
    
    logger.warn('Safety violation detected', {
      walletAddress: walletAddress?.toLowerCase(),
      violation,
      userAgent,
      url,
      ip: req.ip
    });
    
    res.json({ success: true, message: 'Violation logged' });
  } catch (error) {
    logger.error('Error logging safety violation:', error);
    res.status(500).json({ success: false, error: getSafeErrorMessage(error, 'Failed to log safety violation') });
  }
});

/**
 * Get user gallery (filtered to last 30 days)
 */
app.get('/api/gallery/:identifier', async (req, res) => {
  try {
    const { identifier } = req.params;
    const { page = 1, limit = 20, userId, email } = req.query;
    
    let user;
    // Support wallet address, userId, or email
    if (identifier.startsWith('0x') || (identifier.length > 20 && !identifier.startsWith('email_'))) {
      // Wallet address
      const isSolanaAddress = !identifier.startsWith('0x');
      const normalizedWalletAddress = isSolanaAddress ? identifier : identifier.toLowerCase();
      user = await getOrCreateUser(normalizedWalletAddress);
    } else if (userId || identifier.startsWith('email_')) {
      // UserId
      user = await User.findOne({ userId: userId || identifier });
      if (!user) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }
    } else if (email) {
      // Email
      user = await User.findOne({ email: email.toLowerCase() });
      if (!user) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }
    } else {
      // Try as wallet address first
      try {
        user = await getOrCreateUser(identifier);
      } catch {
        return res.status(400).json({ success: false, error: 'Invalid identifier format' });
      }
    }
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    // Filter gallery to last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentGallery = (user.gallery || []).filter(item => 
      item.timestamp && new Date(item.timestamp) >= thirtyDaysAgo
    );
    
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    
    const gallery = recentGallery
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(startIndex, endIndex);
    
    res.json({
      success: true,
      gallery,
      total: recentGallery.length,
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (error) {
    logger.error('Error fetching gallery:', error);
    res.status(500).json({ success: false, error: getSafeErrorMessage(error, 'Failed to fetch gallery') });
  }
});

/**
 * Update user settings
 */
app.put('/api/users/:walletAddress/settings', async (req, res) => {
  try {
    const { walletAddress } = req.params;
    const { settings } = req.body;
    
    const user = await getOrCreateUser(walletAddress);
    user.settings = { ...user.settings, ...settings };
    await user.save();
    
    res.json({
      success: true,
      settings: user.settings,
      message: 'Settings updated'
    });
  } catch (error) {
    logger.error('Error updating settings:', error);
    res.status(500).json({ success: false, error: getSafeErrorMessage(error, 'Failed to update settings') });
  }
});

/**
 * Get gallery statistics (30-day window)
 */
app.get('/api/gallery/:walletAddress/stats', async (req, res) => {
  try {
    const { walletAddress } = req.params;
    const user = await getOrCreateUser(walletAddress);
    
    // Filter to last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentGallery = user.gallery.filter(item => 
      new Date(item.timestamp) >= thirtyDaysAgo
    );
    
    const stats = {
      totalImages: recentGallery.length,
      totalCreditsUsed: recentGallery.reduce((sum, item) => sum + (item.creditsUsed || 0), 0),
      recentImages: recentGallery.filter(img => 
        new Date(img.timestamp) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      ).length,
      storageDays: 30
    };
    
    res.json({
      success: true,
      stats
    });
  } catch (error) {
    logger.error('Error fetching gallery stats:', error);
    res.status(500).json({ success: false, error: getSafeErrorMessage(error, 'Failed to fetch gallery statistics') });
  }
});

/**
 * Delete generation from gallery
 */
app.delete('/api/gallery/:walletAddress/:generationId', async (req, res) => {
  try {
    const { walletAddress, generationId } = req.params;
    
    const user = await getOrCreateUser(walletAddress);
    user.gallery = user.gallery.filter(item => item.id !== generationId);
    await user.save();
    
    res.json({
      success: true,
      message: 'Generation removed from gallery'
    });
  } catch (error) {
    logger.error('Error deleting generation:', error);
    res.status(500).json({ success: false, error: getSafeErrorMessage(error, 'Failed to delete generation') });
  }
});


// Rate limiting for CORS error logging to prevent log spam
const corsErrorLogCache = new Map();
const CORS_ERROR_LOG_INTERVAL = 60000; // 1 minute

// Global error handler
app.use((error, req, res, next) => {
  // Handle CORS errors separately - these are expected for unauthorized requests
  if (error.message && error.message.includes('CORS')) {
    // CORS errors are handled by the CORS middleware, but if they reach here,
    // it means the request was rejected. Log as warning, not error.
    const path = req.path || req.url?.split('?')[0];
    const isNoOriginAllowedPath = path && noOriginAllowedPaths.some(allowedPath => path.startsWith(allowedPath));
    
    // If it's a legitimate no-origin path, don't log - it's expected and handled by middleware
    // Only log if it's NOT a no-origin allowed path
    if (!isNoOriginAllowedPath) {
      // Rate limit CORS error logging to prevent spam
      const logKey = `${req.ip || 'unknown'}-${path || 'unknown'}`;
      const lastLogTime = corsErrorLogCache.get(logKey);
      const now = Date.now();
      
      // Only log if we haven't logged this IP+path combination in the last minute
      if (!lastLogTime || (now - lastLogTime) > CORS_ERROR_LOG_INTERVAL) {
        corsErrorLogCache.set(logKey, now);
        
        // Clean up old entries from cache (keep it under 1000 entries)
        if (corsErrorLogCache.size > 1000) {
          const oldestKey = corsErrorLogCache.keys().next().value;
          corsErrorLogCache.delete(oldestKey);
        }
        
        // Log at debug level to reduce noise, or suppress entirely for no-origin requests
        const hasNoOrigin = !req.headers.origin;
        if (hasNoOrigin) {
          // No-origin requests are common from monitoring tools - only log at debug level
          logger.debug('CORS: No-origin request rejected', {
            path,
            ip: req.ip,
            method: req.method
          });
        } else {
          // Requests with origin but not allowed - log as warning
          logger.warn('CORS: Unauthorized origin rejected', {
            message: error.message,
            path,
            origin: req.headers.origin,
            ip: req.ip
          });
        }
      }
    }
    // Don't log anything if it's a no-origin allowed path - these are handled by middleware
    
    // Set CORS headers on error response so browser can read it
    const origin = req.headers.origin;
    if (origin) {
      // Check if origin should be allowed (for error responses, we need to allow it to send the error)
      // Use same logic as main CORS handler
      const isLocalhost = origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:');
      const allowedOriginsList = process.env.ALLOWED_ORIGINS 
        ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim().toLowerCase())
        : [];
      const originLower = origin.toLowerCase();
      const isAllowedOrigin = allowedOriginsList.some(allowed => {
        const allowedLower = allowed.toLowerCase();
        return allowedLower === originLower || 
               allowedLower.replace(/\/$/, '') === originLower.replace(/\/$/, '');
      });
      
      // Allow origin for error response if it's localhost, in allowed list, or ALLOWED_ORIGINS not set
      // Same logic for both dev and production
      if (isLocalhost || isAllowedOrigin || allowedOriginsList.length === 0) {
        res.header('Access-Control-Allow-Origin', origin);
        res.header('Access-Control-Allow-Credentials', 'true');
      }
    }
    
    // Return CORS error response
    return res.status(403).json({
      success: false,
      error: getSafeErrorMessage(error, 'Not allowed by CORS')
    });
  }
  
  // Log other unhandled errors
  logger.error('Unhandled error:', error);
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : error.message
  });
});

// 404 handler for API routes only
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'API endpoint not found'
  });
});


// Serve index.html for all non-API routes (SPA routing)
// This MUST be last so static files are served first
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
  res.sendFile(indexPath);
});

// Dynamic port handling with fallback
const startServer = async (port = process.env.PORT || 3001) => {
  console.log('🚀 Starting server...');
  console.log('Environment variables:');
  console.log('PORT:', process.env.PORT);
  console.log('NODE_ENV:', process.env.NODE_ENV);
  console.log('MONGODB_URI:', process.env.MONGODB_URI ? 'Set' : 'Not set');
  
  // Ensure port is a number
  const serverPort = parseInt(port, 10);
  
  if (isNaN(serverPort) || serverPort < 1 || serverPort > 65535) {
    const error = new Error(`Invalid port: ${port}`);
    console.error('❌ Invalid port:', port);
    throw error;
  }
  
  return new Promise((resolve, reject) => {
    const server = app.listen(serverPort, '0.0.0.0', () => {
      logger.info(`AI Image Generator API running on port ${serverPort}`);
      logger.info(`MongoDB connected: ${mongoose.connection.readyState === 1 ? 'Yes' : 'No'}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`✅ Server started successfully on port ${serverPort}`);
      console.log(`🌐 Health check: http://0.0.0.0:${serverPort}/api/health`);
      console.log(`🌐 Health check (localhost): http://localhost:${serverPort}/api/health`);
      
      // Health check endpoint is ready - no need to verify with fetch
      // The endpoint will respond when Railway's healthcheck probes it
      
      resolve(server);
    });

    server.on('error', (err) => {
      console.error('❌ Server error:', err);
      if (err.code === 'EADDRINUSE') {
        logger.warn(`Port ${serverPort} is in use, trying port ${serverPort + 1}`);
        startServer(serverPort + 1).then(resolve).catch(reject);
      } else {
        logger.error('Server error:', err);
        reject(err);
      }
    });
  });

  // Cleanup job: Remove gallery items older than 30 days
  const cleanupGallery = async () => {
    try {
      logger.info('Running gallery cleanup job...');
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      
      const users = await User.find({});
      let totalRemoved = 0;
      
      for (const user of users) {
        const originalCount = user.gallery.length;
        user.gallery = user.gallery.filter(item => new Date(item.timestamp) >= thirtyDaysAgo);
        
        if (user.gallery.length < originalCount) {
          await user.save();
          totalRemoved += originalCount - user.gallery.length;
          logger.info(`Removed ${originalCount - user.gallery.length} old items for user ${user.walletAddress}`);
        }
      }
      
      logger.info(`Gallery cleanup complete. Removed ${totalRemoved} old items.`);
    } catch (error) {
      logger.error('Error running gallery cleanup:', error);
    }
  };

  // Run cleanup daily at midnight
  const scheduleCleanup = () => {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setHours(24, 0, 0, 0);
    const msUntilMidnight = tomorrow.getTime() - now.getTime();
    
    setTimeout(() => {
      cleanupGallery();
      // Run cleanup every 24 hours
      setInterval(cleanupGallery, 24 * 60 * 60 * 1000);
    }, msUntilMidnight);
    
    logger.info('Gallery cleanup job scheduled');
  };

  // Start the cleanup schedule
  scheduleCleanup();

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
      console.log('Process terminated');
      process.exit(0);
    });
  });

  return server;
};

// Export the app and start function
export { startServer };
export default app;

// Start server if this file is run directly
// Also start if called via serve-real-backend.js or any other entry point
if (import.meta.url === `file://${process.argv[1]}` || 
    (process.argv[1] && process.argv[1].includes('server.js')) ||
    !process.env.RAILWAY_ENVIRONMENT) {
  // Only auto-start if not being imported (Railway uses serve-real-backend.js)
  // But allow manual start for testing
  if (process.argv[1] && process.argv[1].includes('server.js')) {
    startServer().catch(error => {
      console.error('❌ Failed to start server:', error);
      process.exit(1);
    });
  }
}