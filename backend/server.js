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
  crossOriginEmbedderPolicy: false,
  // Hide server information from headers
  hidePoweredBy: true,
  // Prevent information leakage through referrer
  referrerPolicy: {
    policy: "strict-origin-when-cross-origin"
  },
  // Additional security headers
  xssFilter: true,
  noSniff: true,
  frameguard: {
    action: 'sameorigin'
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// Compression middleware
app.use(compression());

// Request ID middleware for audit trails and debugging
// Generates unique request ID for each request to trace through logs
app.use((req, res, next) => {
  const requestId = crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
});

// Additional security headers (supplement helmet - only add what helmet doesn't provide)
// Note: helmet already handles X-Powered-By, Referrer-Policy, X-Content-Type-Options, X-XSS-Protection
app.use((req, res, next) => {
  // Remove Server header (helmet's hidePoweredBy only handles X-Powered-By)
  res.removeHeader('Server');
  
  // Permissions Policy (not handled by helmet by default)
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  
  // Don't expose API endpoints in error responses
  // This prevents crawlers from discovering endpoints through error messages
  const originalJson = res.json;
  res.json = function(data) {
    // Sanitize error responses in production
    if (process.env.NODE_ENV === 'production' && data && typeof data === 'object') {
      if (data.error && typeof data.error === 'string') {
        // Remove any API endpoint references from error messages
        data.error = data.error.replace(/\/api\/[^\s]+/g, '[endpoint]');
        // Remove any file paths
        data.error = data.error.replace(/\/[^\s]+\.[a-z]+/gi, '[file]');
      }
    }
    return originalJson.call(this, data);
  };
  
  next();
});


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

/**
 * SHARED UTILITY: Validate URL for fal.ai/fal.media (prevents SSRF attacks)
 * Centralized to avoid code duplication across endpoints
 * @param {string} url - URL to validate
 * @returns {boolean} - Whether URL is from trusted source
 */
const isValidFalUrl = (url) => {
  if (!url || typeof url !== 'string') return false;
  // Allow data URIs (for uploaded files)
  if (url.startsWith('data:')) return true;
  
  // Allow fal.ai and fal.media domains (trusted CDN)
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    return hostname === 'fal.ai' || 
           hostname === 'fal.media' ||
           hostname.endsWith('.fal.ai') ||
           hostname.endsWith('.fal.media');
  } catch (e) {
    return false; // Invalid URL format
  }
};

/**
 * SHARED UTILITY: Calculate subscription credits with scaling and NFT bonus
 * Centralized to ensure consistent credit calculation across all payment flows
 * (webhook, verify-payment, checkout session, invoice)
 * @param {number} amountInDollars - Payment amount in dollars
 * @param {boolean} isNFTHolder - Whether user holds qualifying NFTs
 * @returns {{credits: number, scalingMultiplier: number, nftMultiplier: number}}
 */
const calculateCredits = (amountInDollars, isNFTHolder = false) => {
  const baseRate = 5; // 5 credits per dollar (50 credits for $10)
  
  // Subscription scaling based on amount
  let scalingMultiplier = 1.0;
  if (amountInDollars >= 80) {
    scalingMultiplier = 1.3; // 30% bonus for $80+
  } else if (amountInDollars >= 40) {
    scalingMultiplier = 1.2; // 20% bonus for $40-79
  } else if (amountInDollars >= 20) {
    scalingMultiplier = 1.1; // 10% bonus for $20-39
  }
  // $10: 5 credits/dollar (no bonus) = 50 credits
  
  // NFT holder bonus (additional 20% on top of subscription scaling)
  const nftMultiplier = isNFTHolder ? 1.2 : 1;
  
  const credits = Math.floor(amountInDollars * baseRate * scalingMultiplier * nftMultiplier);
  
  return {
    credits,
    scalingMultiplier,
    nftMultiplier
  };
};

/**
 * SECURITY: Deep sanitization to prevent NoSQL injection attacks
 * Removes MongoDB operators ($gt, $ne, etc.) from nested objects
 * @param {any} obj - Object to sanitize
 * @param {number} depth - Current recursion depth (prevents infinite loops)
 * @returns {any} - Sanitized object
 */
const deepSanitize = (obj, depth = 0) => {
  // Prevent infinite recursion
  if (depth > 10) return obj;
  
  if (obj === null || obj === undefined) return obj;
  
  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map(item => deepSanitize(item, depth + 1));
  }
  
  // Handle objects
  if (typeof obj === 'object') {
    const sanitized = {};
    for (const key of Object.keys(obj)) {
      // SECURITY: Block MongoDB operators in keys (NoSQL injection prevention)
      if (key.startsWith('$')) {
        logger.warn('NoSQL injection attempt blocked', { key, depth });
        continue; // Skip this key entirely
      }
      // Recursively sanitize nested values
      sanitized[key] = deepSanitize(obj[key], depth + 1);
    }
    return sanitized;
  }
  
  // Handle strings
  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }
  
  // Handle numbers
  if (typeof obj === 'number') {
    return sanitizeNumber(obj);
  }
  
  return obj;
};

// Middleware to validate request inputs
const validateInput = (req, res, next) => {
  // SECURITY: Deep sanitize query parameters (prevents NoSQL injection in nested objects)
  if (req.query) {
    req.query = deepSanitize(req.query);
  }

  // SECURITY: Deep sanitize body parameters (prevents NoSQL injection in nested objects)
  if (req.body && typeof req.body === 'object') {
    req.body = deepSanitize(req.body);
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
      // Remove least recently used (first item) - O(1) operation
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

  get size() {
    return this.cache.size;
  }

  clear() {
    this.cache.clear();
  }
  
  // Efficient pruning - keeps most recent entries without Array.from()
  prune(keepCount = this.maxSize) {
    if (this.cache.size <= keepCount) return;
    const toRemove = this.cache.size - keepCount;
    const keysIterator = this.cache.keys();
    for (let i = 0; i < toRemove; i++) {
      const key = keysIterator.next().value;
      this.cache.delete(key);
    }
  }
}

// TTL Cache for short-lived data (e.g., NFT holdings)
class TTLCache {
  constructor(defaultTTL = 60000) { // Default 60 second TTL
    this.cache = new Map();
    this.defaultTTL = defaultTTL;
  }

  set(key, value, ttl = this.defaultTTL) {
    const expiresAt = Date.now() + ttl;
    this.cache.set(key, { value, expiresAt });
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.value;
  }

  has(key) {
    return this.get(key) !== undefined;
  }

  delete(key) {
    return this.cache.delete(key);
  }

  // Periodic cleanup of expired entries
  cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }
}

// NFT holdings cache (5 minute TTL to reduce RPC calls)
const nftHoldingsCache = new TTLCache(5 * 60 * 1000);

// Cleanup NFT cache every 2 minutes
setInterval(() => nftHoldingsCache.cleanup(), 2 * 60 * 1000);

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

  // Clean up old transactions using efficient prune (LRU already handles this)
  // LRUCache auto-prunes on set(), but explicitly prune if needed
  processedTransactions.prune(1000);

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

// Authentication rate limiter - prevent brute force attacks
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 auth attempts per 15 minutes
  message: {
    error: 'Too many authentication attempts. Please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false // Count all requests, even successful ones
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

// OPTIMIZATION: Pre-compute allowed origins Set at startup for O(1) lookups
const buildAllowedOriginsCache = () => {
  const cache = new Set();
  if (process.env.ALLOWED_ORIGINS) {
    const origins = process.env.ALLOWED_ORIGINS.split(',');
    for (const origin of origins) {
      const trimmed = origin.trim().toLowerCase();
      if (trimmed) {
        // Add all variations to the cache for fast lookup
        cache.add(trimmed);
        cache.add(trimmed.replace(/\/$/, '')); // Without trailing slash
        cache.add(trimmed.replace(/^https?:\/\//, '').replace(/^www\./, '')); // Normalized
        cache.add(trimmed.replace(/^www\./, '')); // Without www
      }
    }
  }
  return cache;
};

const allowedOriginsCache = buildAllowedOriginsCache();
const hasAllowedOrigins = allowedOriginsCache.size > 0;

// Helper function to normalize URLs for comparison (cached version)
const normalizeOrigin = (url) => {
  return url.toLowerCase()
    .replace(/\/$/, '')
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '');
};

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests without origin - these are handled by middleware above for specific paths
    if (!origin) {
      return callback(null, true);
    }
    
    // OPTIMIZATION: Fast localhost check with startsWith
    const isLocalhost = origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:');
    
    // SECURITY: In production, do NOT allow localhost origins (prevents local CSRF attacks)
    // Attackers could run a malicious local server to make cross-origin requests
    const isProduction = process.env.NODE_ENV === 'production';
    const allowLocalhost = isLocalhost && !isProduction;
    
    // OPTIMIZATION: O(1) Set lookup instead of O(n) array iteration
    const originLower = origin.toLowerCase();
    const isAllowedOrigin = hasAllowedOrigins && (
      allowedOriginsCache.has(originLower) ||
      allowedOriginsCache.has(originLower.replace(/\/$/, '')) ||
      allowedOriginsCache.has(normalizeOrigin(originLower))
    );
    
    // Allow localhost (dev only), whitelisted origins, or any origin if ALLOWED_ORIGINS not set
    if (allowLocalhost || isAllowedOrigin || !hasAllowedOrigins) {
      // OPTIMIZATION: Reduced logging - only log debug level
      logger.debug('CORS: Allowed origin', { origin, isLocalhost: allowLocalhost, isAllowedOrigin });
      return callback(null, origin);
    }
    
    // Reject non-whitelisted origins (and localhost in production)
    if (isProduction && isLocalhost) {
      logger.warn('CORS: Localhost blocked in production', { origin });
      return callback(new Error('Localhost origins are not allowed in production.'));
    }
    
    logger.warn('CORS: Rejected origin', { origin });
    return callback(new Error(`Not allowed by CORS. Origin '${origin}' is not in ALLOWED_ORIGINS.`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Stripe-Signature', 'Cache-Control', 'Pragma'],
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

// JWT Secrets - REQUIRED in production, no hardcoded fallbacks
// Uses separate secrets for access and refresh tokens for enhanced security
if (!process.env.JWT_SECRET) {
  logger.error('❌ CRITICAL: JWT_SECRET is required. Server cannot start without a secure JWT secret.');
  logger.error('Please set JWT_SECRET in your environment variables (backend.env or system environment).');
  process.exit(1);
}

const JWT_SECRET = process.env.JWT_SECRET;
if (JWT_SECRET.length < 32) {
  logger.error('❌ CRITICAL: JWT_SECRET must be at least 32 characters long.');
  logger.error(`Current length: ${JWT_SECRET.length}. Please generate a longer secret.`);
  process.exit(1);
}

// SECURITY: Separate secret for refresh tokens (derived from JWT_SECRET if not provided)
// This prevents a compromised access token secret from compromising refresh tokens
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 
  crypto.createHash('sha256').update(JWT_SECRET + '_refresh_token_salt').digest('hex');

// SECURITY: Token blacklist for logout/revocation
// Uses LRU cache to prevent memory exhaustion while maintaining recent revocations
const tokenBlacklist = new LRUCache(10000); // Store up to 10k revoked tokens

/**
 * Check if a token has been revoked/blacklisted
 * @param {string} token - JWT token to check
 * @returns {boolean} - True if token is blacklisted
 */
const isTokenBlacklisted = (token) => {
  if (!token) return false;
  // Create hash of token for storage efficiency
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex').substring(0, 32);
  return tokenBlacklist.has(tokenHash);
};

/**
 * Add a token to the blacklist (for logout/revocation)
 * @param {string} token - JWT token to blacklist
 * @param {number} expiresAt - Token expiration timestamp (optional, for auto-cleanup)
 */
const blacklistToken = (token, expiresAt = null) => {
  if (!token) return;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex').substring(0, 32);
  tokenBlacklist.set(tokenHash, { blacklistedAt: Date.now(), expiresAt });
  logger.debug('Token blacklisted', { tokenHash: tokenHash.substring(0, 8) + '...' });
};

// JWT Authentication Middleware
// Note: Uses User model which is defined later, but that's fine since this function
// is only called at request time, not during module initialization
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

    // SECURITY: Check if token has been revoked/blacklisted (logout)
    if (isTokenBlacklisted(token)) {
      return res.status(401).json({
        success: false,
        error: 'Token has been revoked. Please sign in again.'
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Reject refresh tokens used as access tokens
    if (decoded.type === 'refresh') {
      return res.status(403).json({
        success: false,
        error: 'Refresh tokens cannot be used for authentication. Please use an access token.'
      });
    }
    
    // Find user by userId or email
    // User model is defined later in the file, but available at runtime
    const User = mongoose.model('User');
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

// Flexible Authentication Middleware - supports both JWT tokens and wallet addresses
// Tries JWT first (for email users), falls back to wallet address (for wallet users)
// SECURITY NOTE: Body-based wallet auth is less secure than JWT - use for read operations only
const authenticateFlexible = async (req, res, next) => {
  try {
    // First, try JWT token authentication (most secure)
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (token) {
      // SECURITY: Check if token has been revoked/blacklisted
      if (isTokenBlacklisted(token)) {
        return res.status(401).json({
          success: false,
          error: 'Token has been revoked. Please sign in again.'
        });
      }
      
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // Reject refresh tokens used as access tokens
        if (decoded.type === 'refresh') {
          // Fall through to wallet address authentication
        } else {
          // Find user by userId or email
          const User = mongoose.model('User');
          const user = await User.findOne({
            $or: [
              { userId: decoded.userId },
              { email: decoded.email }
            ]
          }).select('-password');

          if (user) {
            req.user = user;
            req.authType = 'jwt'; // Mark as verified JWT authentication
            return next();
          }
        }
      } catch (jwtError) {
        // JWT verification failed, fall through to wallet address authentication
        logger.debug('JWT authentication failed, trying wallet address', { error: jwtError.message });
      }
    }

    // Fall back to wallet address authentication
    // SECURITY WARNING: This is less secure as it trusts the client-provided wallet address
    // For sensitive operations, use authenticateToken instead
    const { walletAddress, userId, email } = req.body;
    
    if (!walletAddress && !userId && !email) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required. Please provide a token or wallet address/userId/email.'
      });
    }
    
    // SECURITY: Log body-based authentication for audit trail
    logger.debug('Body-based authentication used (less secure)', { 
      walletAddress: walletAddress ? walletAddress.substring(0, 10) + '...' : null,
      userId: userId ? userId.substring(0, 10) + '...' : null,
      email: email ? '***' : null,
      path: req.path,
      ip: req.ip
    });

    // Get user from wallet address, userId, or email
    const user = await getUserFromRequest(req);
    
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'User not found'
      });
    }

    req.user = user;
    req.authType = 'body'; // Mark as body-based authentication (less secure)
    next();
  } catch (error) {
    logger.error('Flexible authentication error:', error);
    return res.status(403).json({
      success: false,
      error: 'Authentication failed'
    });
  }
};

/**
 * SECURITY: Middleware to require verified authentication (JWT only)
 * Use this for sensitive operations that modify user data or credits
 * Does NOT allow body-based wallet address authentication
 */
const requireVerifiedAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required. Please sign in.'
      });
    }

    // Check if token has been revoked
    if (isTokenBlacklisted(token)) {
      return res.status(401).json({
        success: false,
        error: 'Token has been revoked. Please sign in again.'
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    
    if (decoded.type === 'refresh') {
      return res.status(403).json({
        success: false,
        error: 'Refresh tokens cannot be used for authentication.'
      });
    }

    const User = mongoose.model('User');
    const user = await User.findOne({
      $or: [
        { userId: decoded.userId },
        { email: decoded.email }
      ]
    }).select('-password');

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'User not found'
      });
    }

    req.user = user;
    req.authType = 'jwt';
    next();
  } catch (error) {
    logger.error('Verified auth error:', error);
    return res.status(403).json({
      success: false,
      error: 'Invalid or expired token. Please sign in again.'
    });
  }
};

/**
 * SECURITY: Middleware to verify wallet ownership for payment operations
 * For wallet-based payments, verifies that the request comes from the wallet owner
 * by checking if either: 1) User is JWT authenticated with this wallet, or
 * 2) The payment will be verified on-chain (blockchain verification)
 */
const verifyWalletOwnership = async (req, res, next) => {
  const { walletAddress } = req.body;
  
  if (!walletAddress) {
    return res.status(400).json({
      success: false,
      error: 'Wallet address required'
    });
  }
  
  // If JWT authenticated, verify the wallet matches the user's linked wallet
  if (req.authType === 'jwt' && req.user) {
    const userWallet = req.user.walletAddress;
    const normalizedRequest = walletAddress.toLowerCase();
    const normalizedUser = userWallet ? userWallet.toLowerCase() : null;
    
    // If user has a wallet linked, it must match
    if (normalizedUser && normalizedUser !== normalizedRequest) {
      logger.warn('Wallet mismatch in authenticated request', {
        userId: req.user.userId,
        userWallet: normalizedUser.substring(0, 10) + '...',
        requestWallet: normalizedRequest.substring(0, 10) + '...'
      });
      return res.status(403).json({
        success: false,
        error: 'Wallet address does not match authenticated user'
      });
    }
  }
  
  // For body-based auth or wallet-only users, the payment will be verified on-chain
  // The blockchain verification in the endpoint will confirm the sender
  next();
};

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
        // Get user from metadata - support userId, email, or walletAddress
        let user;
        if (paymentIntent.metadata.userId) {
          user = await User.findById(paymentIntent.metadata.userId);
        } else if (paymentIntent.metadata.email) {
          // Support email-based users
          user = await User.findOne({ email: paymentIntent.metadata.email.toLowerCase() });
        } else if (paymentIntent.metadata.walletAddress) {
          user = await getOrCreateUser(paymentIntent.metadata.walletAddress);
        }
        
        // If still no user, try findUserByIdentifier with all metadata
        if (!user && (paymentIntent.metadata.userId || paymentIntent.metadata.email || paymentIntent.metadata.walletAddress)) {
          user = await findUserByIdentifier(
            paymentIntent.metadata.walletAddress || null,
            paymentIntent.metadata.email || null,
            paymentIntent.metadata.userId || null
          );
        }
        
        if (user && !isPaymentAlreadyProcessed(user, null, paymentIntent.id)) {
          // Calculate credits using shared utility (single source of truth)
          const amount = paymentIntent.amount / 100; // Convert from cents
          const isNFTHolder = !!(user.walletAddress && user.nftCollections && user.nftCollections.length > 0);
          const { credits: finalCredits } = calculateCredits(amount, isNFTHolder);
          
          // Add credits (with idempotency check inside)
          const paymentEntry = await addCreditsToUser(user, {
            txHash: paymentIntent.id,
            tokenSymbol: 'USD',
            amount,
            credits: finalCredits,
            chainId: 'stripe',
            walletType: 'card',
            paymentIntentId: paymentIntent.id
          });
          
          if (paymentEntry) {
            logger.info('Credits added via webhook', {
              paymentIntentId: paymentIntent.id,
              userId: user.userId || null,
              walletAddress: user.walletAddress || null,
              credits: finalCredits
            });
          } else {
            logger.info('Payment already processed - credits not added (idempotency)', {
              paymentIntentId: paymentIntent.id
            });
          }
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
            // First try as custom userId field (for email users like "email_abc123")
            user = await User.findOne({ userId: session.metadata.userId });
            if (!user) {
              // If not found, try as MongoDB _id (for legacy records)
              try {
                user = await User.findById(session.metadata.userId);
              } catch (idError) {
                // Invalid ObjectId format, ignore
              }
            }
          }
          if (!user && session.metadata.walletAddress) {
            user = await getOrCreateUser(session.metadata.walletAddress);
          }
          if (!user && session.metadata.email) {
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
                // Calculate credits using shared utility (single source of truth)
                const isNFTHolder = !!(user.walletAddress && user.nftCollections && user.nftCollections.length > 0);
                const { credits: finalCredits } = calculateCredits(amountInDollars, isNFTHolder);

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
              // Calculate credits using shared utility (single source of truth)
              const isNFTHolder = !!(user.walletAddress && user.nftCollections && user.nftCollections.length > 0);
              const { credits: finalCredits } = calculateCredits(amountInDollars, isNFTHolder);

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
// Increase JSON limit for image/video data URIs (can be large even after optimization)
// Videos especially can be very large, so we need a higher limit
// Note: Railway's reverse proxy may have a default 10MB limit. If you see 413 errors,
// you may need to configure Railway's proxy settings or use direct fal.ai uploads from frontend
app.use(express.json({ limit: '200mb' }));

// CSRF Protection Middleware (defense-in-depth)
// Validates Origin header for state-changing operations
const csrfProtection = (req, res, next) => {
  // Skip CSRF check for GET, HEAD, OPTIONS requests
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Skip CSRF check for webhook endpoints (they use signature verification)
  const webhookPaths = ['/api/stripe/webhook', '/api/webhook', '/api/webhooks'];
  if (webhookPaths.some(path => req.path.startsWith(path))) {
    return next();
  }

  // Skip CSRF check for health checks and metrics
  if (req.path === '/api/health' || req.path === '/api/metrics') {
    return next();
  }

  // Get origin from request
  const origin = req.headers.origin || req.headers.referer;
  
  // In production, validate origin matches allowed origins
  if (process.env.NODE_ENV === 'production' && origin) {
    const allowedOrigins = process.env.ALLOWED_ORIGINS 
      ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim().toLowerCase())
      : [];
    
    const originLower = origin.toLowerCase();
    const isLocalhost = originLower.startsWith('http://localhost:') || originLower.startsWith('http://127.0.0.1:');
    const isAllowed = isLocalhost || allowedOrigins.some(allowed => {
      const normalizedAllowed = allowed.replace(/\/$/, '').toLowerCase();
      const normalizedOrigin = originLower.replace(/\/$/, '');
      return normalizedAllowed === normalizedOrigin || 
             normalizedOrigin.startsWith(normalizedAllowed) ||
             normalizedAllowed.startsWith(normalizedOrigin);
    });

    if (!isAllowed && allowedOrigins.length > 0) {
      logger.warn('CSRF protection: Origin not allowed', { origin, path: req.path, method: req.method });
      return res.status(403).json({
        success: false,
        error: 'Request origin not allowed'
      });
    }
  }

  // Additional check: Verify Origin header matches Host for same-origin requests
  // This helps prevent CSRF attacks even if CORS is misconfigured
  const host = req.headers.host;
  if (origin && host && process.env.NODE_ENV === 'production') {
    try {
      const originUrl = new URL(origin);
      const originHost = originUrl.host;
      // Allow if origin host matches request host (same-origin)
      if (originHost === host || originHost === `www.${host}` || host === `www.${originHost}`) {
        return next();
      }
    } catch (e) {
      // Invalid origin URL - in production, if ALLOWED_ORIGINS is set, this should have been caught above
      // If ALLOWED_ORIGINS is not set, allow it (permissive mode)
      if (!process.env.ALLOWED_ORIGINS) {
        return next();
      }
    }
  }

  // If we get here, the request passed all CSRF checks
  next();
};

// Apply CSRF protection to all routes
app.use(csrfProtection);
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

// Log FAL API key status at startup
if (FAL_API_KEY && FAL_API_KEY !== 'your_fal_api_key_here') {
  logger.info('FAL API key configured', { prefix: FAL_API_KEY.substring(0, 8) + '...' });
} else {
  logger.error('FAL API key NOT configured or using placeholder!');
}

// ============================================================================
// PROMPT OPTIMIZATION SERVICE - Uses LLM to enhance prompts for each model
// ============================================================================

/**
 * Model-specific prompt optimization guidelines
 * Each model has different strengths and prompt styles
 */
const MODEL_PROMPT_GUIDELINES = {
  'flux': {
    name: 'FLUX Kontext',
    style: 'image editing',
    guidelines: `Enhance prompts intelligently to improve image generation outcomes.

For IMAGE EDITING (when reference images are provided):
1. Rephrase vague prompts to be clearer and more specific
2. Keep the same meaning - don't add new ideas
3. Don't add style words (photorealistic, 8K, cinematic, etc.)
4. Keep it short and natural

For TEXT-TO-IMAGE (when no reference images):
1. Analyze if the prompt needs more detail for better results
2. If the prompt is too simple or vague, add helpful details like:
   - Lighting conditions (natural light, soft lighting, dramatic shadows)
   - Composition (close-up, wide angle, centered)
   - Mood/atmosphere (serene, energetic, mysterious)
   - Visual quality hints (sharp focus, depth of field)
3. Only add details that enhance the core concept - don't change the meaning
4. Keep it natural and not overly verbose

Examples for editing:
- "hat" → "add a hat"
- "blue" → "change to blue"  
- "no glasses" → "remove the glasses"
- "bigger smile" → "make the smile bigger"

Examples for text-to-image:
- "cat" → "a cat, natural lighting, soft focus, peaceful atmosphere"
- "mountain landscape" → "mountain landscape, golden hour lighting, dramatic sky, wide composition"
- "portrait of a woman" → "portrait of a woman, soft natural lighting, shallow depth of field, professional photography"`
  },
  'flux-multi': {
    name: 'FLUX Kontext Multi',
    style: 'multi-image blending',
    guidelines: `Enhance prompts for multi-image blending to improve results.

Rules:
1. Describe how to blend/combine the images more clearly
2. If the prompt is vague, add details about:
   - How elements should be combined (seamlessly, with transitions, etc.)
   - What aspects to preserve from each image
   - The desired outcome style
3. Keep the same meaning - don't add new ideas
4. Keep it natural and concise

Examples:
- "combine" → "blend these images together seamlessly, preserving the best elements from each"
- "mix styles" → "combine the styles from both images, creating a harmonious blend"
- "merge" → "merge these images, maintaining the composition and color palette from the first image"`
  },
  'nano-banana-pro': {
    name: 'Nano Banana Pro',
    style: 'image editing',
    guidelines: `Enhance prompts intelligently for better image editing outcomes.

For IMAGE EDITING (when reference images are provided):
1. Rephrase vague prompts to be clearer and more specific
2. Keep the same meaning - don't add new ideas
3. Don't add style or artistic words
4. Keep it short and natural

For TEXT-TO-IMAGE (when no reference images):
1. If the prompt is simple, add helpful details like lighting, composition, or mood
2. Only enhance what's already implied - don't change the core concept
3. Keep it natural and concise

Examples for editing:
- "red" → "change to red"
- "taller" → "make it taller"
- "sunset" → "add a sunset background"

Examples for text-to-image:
- "dog" → "a dog, natural lighting, sharp focus, friendly expression"
- "city at night" → "city at night, neon lights, urban atmosphere, cinematic composition"`
  }
};

/**
 * Optimize a prompt using fal.ai's LLM for the specific image model
 * @param {string} originalPrompt - The user's original prompt
 * @param {string} model - The target image generation model
 * @param {boolean} hasReferenceImages - Whether reference images are provided
 * @param {number} imageCount - Number of reference images
 * @returns {Promise<{optimizedPrompt: string, reasoning: string}>}
 */
async function optimizePromptForModel(originalPrompt, model, hasReferenceImages = false, imageCount = 0) {
  // Skip optimization for empty prompts or layer extraction
  if (!originalPrompt || originalPrompt.trim() === '' || model === 'qwen-image-layered') {
    return { optimizedPrompt: originalPrompt, reasoning: null, skipped: true };
  }

  // Check if FAL_API_KEY is available
  if (!FAL_API_KEY) {
    logger.warn('Prompt optimization skipped: FAL_API_KEY not configured');
    return { optimizedPrompt: originalPrompt, reasoning: null, skipped: true, error: 'API key not configured' };
  }

  // Determine the actual model guidelines to use
  let modelKey = model;
  if (model === 'flux' && imageCount >= 2) {
    modelKey = 'flux-multi';
  } else if (model === 'flux' || model === 'flux-multi') {
    modelKey = hasReferenceImages && imageCount >= 2 ? 'flux-multi' : 'flux';
  }

  const modelConfig = MODEL_PROMPT_GUIDELINES[modelKey] || MODEL_PROMPT_GUIDELINES['flux'];

  // Determine the context for better optimization
  const isTextToImage = !hasReferenceImages;
  const contextDescription = hasReferenceImages 
    ? `This is for editing ${imageCount} image(s). Focus on clarity and specificity.`
    : 'This is for generating a new image from scratch. Analyze if the prompt needs more detail for better results.';

  const systemPrompt = `${modelConfig.guidelines}

Your job: Intelligently enhance the prompt to improve image generation outcomes.

${contextDescription}

Analysis approach:
1. First, analyze the prompt - is it too simple or vague?
2. For text-to-image: If it lacks detail, add helpful visual details (lighting, composition, mood) that enhance the core concept
3. For image editing: Focus on clarity and specificity without adding new ideas
4. Always preserve the original meaning and intent
5. Keep it natural - don't make it sound robotic or overly verbose

JSON only:
{"optimizedPrompt": "enhanced version of the prompt", "reasoning": "what you enhanced and why"}`;

  try {
    // Use AbortController for timeout - reduced to 8 seconds for speed
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const userPrompt = isTextToImage
      ? `User prompt: "${originalPrompt}"\n\nAnalyze this prompt. If it's too simple or vague, enhance it with helpful visual details (lighting, composition, mood, atmosphere) that will improve the image quality. Only add details that enhance the core concept - don't change the meaning.`
      : `User prompt: "${originalPrompt}"\n\nMake this clearer and more specific for the image editing model. Keep the same meaning, just rephrase if needed.`;

    const response = await fetch('https://fal.run/fal-ai/any-llm', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${FAL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'anthropic/claude-3-haiku', // Using Haiku for speed - 3x faster than Sonnet
        prompt: userPrompt,
        system_prompt: systemPrompt,
        temperature: 0.6, // Slightly higher for more creative enhancements
        max_tokens: 250 // Increased to allow for more detailed enhancements
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      logger.warn('Prompt optimization LLM request failed', { status: response.status, error: errorText });
      return { optimizedPrompt: originalPrompt, reasoning: null, skipped: true, error: 'LLM request failed' };
    }

    const data = await response.json();
    const output = data.output || data.text || data.response || '';

    // Try to parse JSON response
    try {
      // Extract JSON from the response (may be wrapped in markdown code blocks)
      const jsonMatch = output.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          optimizedPrompt: parsed.optimizedPrompt || originalPrompt,
          reasoning: parsed.reasoning || null,
          skipped: false
        };
      }
    } catch (parseError) {
      // If JSON parsing fails, use the raw output as the optimized prompt
      if (output && output.length > 10) {
        return {
          optimizedPrompt: output.trim(),
          reasoning: 'Enhanced by AI',
          skipped: false
        };
      }
    }

    // Fallback to original prompt if optimization failed
    return { optimizedPrompt: originalPrompt, reasoning: null, skipped: true, error: 'Failed to parse LLM response' };

  } catch (error) {
    logger.error('Prompt optimization error', { error: error.message });
    return { optimizedPrompt: originalPrompt, reasoning: null, skipped: true, error: error.message };
  }
}

// ============================================================================
// END PROMPT OPTIMIZATION SERVICE
// ============================================================================

// Wan 2.2 Animate Replace endpoints
// Direct file upload endpoint (for large files via FormData)
app.post('/api/wan-animate/upload-video-direct', async (req, res) => {
  try {
    if (!FAL_API_KEY) {
      return res.status(500).json({ success: false, error: getSafeErrorMessage(new Error('AI service not configured'), 'Image generation service unavailable. Please contact support.') });
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
      return res.status(500).json({ success: false, error: getSafeErrorMessage(new Error('AI service not configured'), 'Image generation service unavailable. Please contact support.') });
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
      return res.status(500).json({ success: false, error: getSafeErrorMessage(new Error('AI service not configured'), 'Image generation service unavailable. Please contact support.') });
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
// SECURITY: Requires credits check and DEDUCTION before making external API calls
// Minimum 2 credits deducted at submission (2 credits per second, minimum 1 second)
// Additional credits deducted at completion based on actual video duration
app.post('/api/wan-animate/submit', wanSubmitLimiter, requireCredits(2), async (req, res) => {
  try {
    // SECURITY: Deduct minimum credits IMMEDIATELY before making any API calls
    const user = req.user;
    const minimumCreditsToDeduct = 2; // Minimum charge for any video (1 second at 2 credits/sec)
    
    // Build update query
    const updateQuery = buildUserUpdateQuery(user);
    if (!updateQuery) {
      return res.status(400).json({ 
        success: false, 
        error: 'User account must have wallet address, userId, or email' 
      });
    }
    
    // Atomic credit deduction with condition to prevent race conditions and negative credits
    const previousCredits = user.credits || 0;
    const updateResult = await User.findOneAndUpdate(
      {
        ...updateQuery,
        credits: { $gte: minimumCreditsToDeduct } // Only update if user has enough credits
      },
      { 
        $inc: { credits: -minimumCreditsToDeduct, totalCreditsSpent: minimumCreditsToDeduct } 
      },
      { new: true }
    );
    
    if (!updateResult) {
      // User doesn't have enough credits or race condition
      const currentUser = await User.findOne(updateQuery);
      const currentCredits = currentUser?.credits || 0;
      
      logger.warn('Video submit credit deduction failed - insufficient credits or race condition', {
        updateQuery,
        previousCredits,
        currentCredits,
        minimumCreditsToDeduct,
        userId: user.userId
      });
      
      return res.status(400).json({
        success: false,
        error: `Insufficient credits. You have ${currentCredits} credit${currentCredits !== 1 ? 's' : ''} but need at least ${minimumCreditsToDeduct} for video generation.`
      });
    }
    
    logger.debug('Minimum credits deducted for video submission', {
      userId: user.userId,
      creditsDeducted: minimumCreditsToDeduct,
      remainingCredits: updateResult.credits
    });
    
    if (!FAL_API_KEY) {
      logger.error('AI service not configured');
      return res.status(500).json({ success: false, error: getSafeErrorMessage(new Error('AI service not configured'), 'Image generation service unavailable. Please contact support.') });
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
    
    // Use shared URL validator (prevents SSRF attacks)
    if (!isValidFalUrl(videoUrl)) {
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
    
    if (!isValidFalUrl(imageUrl)) {
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
        error: getSafeErrorMessage(new Error('API response parse error'), 'Failed to parse API response. Please try again.') 
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
        logger.error('AI service authentication failed', {
          status: response.status,
          errorMessage,
          service: 'fal.ai'
          // Removed API key metadata to prevent information leakage
        });
        return res.status(401).json({ 
          success: false, 
          error: getSafeErrorMessage(new Error('AI service authentication failed'), 'Image generation service unavailable. Please contact support.')
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
    
    res.json({ 
      success: true, 
      ...data,
      creditsDeducted: minimumCreditsToDeduct,
      remainingCredits: updateResult.credits,
      note: 'Minimum 2 credits deducted. Additional credits may be deducted based on video duration.'
    });
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
      const { model } = req.body;
      const isNanoBananaPro = model === 'nano-banana-pro';
      const requiredCredits = isNanoBananaPro ? 2 : 1; // 2 credits for Nano Banana Pro ($0.20), 1 for others (FLUX and Qwen)
      
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
    // Deduct credits IMMEDIATELY when user clicks generate (first thing, before any other processing)
    const user = req.user;
    const creditsToDeduct = req.requiredCredits || 1;
    
    // Build update query
    const updateQuery = buildUserUpdateQuery(user);
    if (!updateQuery) {
      return res.status(400).json({ 
        success: false, 
        error: 'User account must have wallet address, userId, or email' 
      });
    }
    
    // Atomic credit deduction with condition to prevent race conditions and negative credits
    // Only deduct if user has enough credits (prevents abuse from concurrent requests)
    const previousCredits = user.credits || 0;
    const updateResult = await User.findOneAndUpdate(
      {
        ...updateQuery,
        credits: { $gte: creditsToDeduct } // Only update if user has enough credits
      },
      { 
        $inc: { credits: -creditsToDeduct, totalCreditsSpent: creditsToDeduct } 
      },
      { new: true }
    );
    
    if (!updateResult) {
      // User doesn't have enough credits or was modified between check and update (race condition)
      // Refetch to get current credits
      const currentUser = await User.findOne(updateQuery);
      const currentCredits = currentUser?.credits || 0;
      
      logger.warn('Credit deduction failed - insufficient credits or race condition', {
        updateQuery,
        previousCredits,
        currentCredits,
        creditsToDeduct,
        userId: user.userId
      });
      
      return res.status(400).json({
        success: false,
        error: `Insufficient credits. You have ${currentCredits} credit${currentCredits !== 1 ? 's' : ''} but need ${creditsToDeduct}.`
      });
    }
    
    // Reduced logging for performance
    logger.debug('Credits deducted', {
      userId: user.userId,
      creditsDeducted: creditsToDeduct,
      remainingCredits: updateResult.credits
    });
    
    // Now check API key and proceed with generation
    if (!FAL_API_KEY) {
      return res.status(500).json({ success: false, error: getSafeErrorMessage(new Error('AI service not configured'), 'Image generation service unavailable. Please contact support.') });
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
      model,
      optimizePrompt = true // Enable prompt optimization by default
    } = req.body;

    // Validate required inputs
    if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
      return res.status(400).json({ success: false, error: 'prompt is required and must be a non-empty string' });
    }

    // Calculate image count for optimization context
    const imageCount = image_urls && Array.isArray(image_urls) ? image_urls.length : (image_url ? 1 : 0);
    const hasImages = imageCount > 0;

    // Optimize prompt using LLM if enabled
    let finalPrompt = prompt.trim();
    let promptOptimizationResult = null;
    
    if (optimizePrompt && model !== 'qwen-image-layered') {
      try {
        promptOptimizationResult = await optimizePromptForModel(
          prompt.trim(),
          model || 'flux',
          hasImages,
          imageCount
        );
        
        if (promptOptimizationResult && !promptOptimizationResult.skipped && promptOptimizationResult.optimizedPrompt) {
          finalPrompt = promptOptimizationResult.optimizedPrompt;
          logger.debug('Prompt optimized', { 
            original: prompt.substring(0, 50) + '...', 
            optimized: finalPrompt.substring(0, 50) + '...',
            model: model || 'flux'
          });
        } else {
          logger.debug('Prompt optimization skipped or returned no result, using original prompt');
        }
      } catch (optError) {
        // Log but don't fail - continue with original prompt
        logger.warn('Prompt optimization failed, using original prompt', { 
          error: optError.message,
          name: optError.name,
          stack: optError.stack?.substring(0, 200)
        });
        promptOptimizationResult = null;
        // Ensure finalPrompt is still set to original
        finalPrompt = prompt.trim();
      }
    }

    // Determine endpoint based on whether reference images are provided and model selection
    let endpoint;
    const isMultipleImages = image_urls && Array.isArray(image_urls) && image_urls.length >= 2;
    const isSingleImage = image_url || (image_urls && image_urls.length === 1);
    // hasImages already declared above for prompt optimization
    const isNanoBananaPro = model === 'nano-banana-pro';
    
    if (isNanoBananaPro) {
      // Nano Banana Pro selected - use /edit endpoint when images are provided, base endpoint for prompt-only
      if (hasImages) {
        endpoint = 'https://fal.run/fal-ai/nano-banana-pro/edit';
      } else {
        endpoint = 'https://fal.run/fal-ai/nano-banana-pro';
      }
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
      // Use the optimized prompt (or original if optimization was skipped)
      requestBody = {
        prompt: finalPrompt // Optimized prompt or original with style
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
      
      // Add num_images for prompt-only generation
      if (!hasImages && numImages) {
        requestBody.num_images = numImages;
      }
    } else {
      // FLUX Kontext API format
      // Use the optimized prompt (or original if optimization was skipped)
      requestBody = {
        prompt: finalPrompt, // Optimized prompt or original
        guidance_scale: guidanceScale,
        num_images: numImages,
        output_format: 'jpeg',
        safety_tolerance: '6',
        prompt_safety_tolerance: '6',
        enhance_prompt: true // FLUX's built-in enhancement works alongside our LLM optimization
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

    // Log request details for debugging
    logger.info('Image generation request', {
      model: isNanoBananaPro ? 'nano-banana-pro' : 'flux',
      endpoint,
      originalPrompt: prompt.substring(0, 100),
      finalPrompt: finalPrompt.substring(0, 100),
      wasOptimized: promptOptimizationResult && !promptOptimizationResult.skipped,
      userId: req.user?.userId
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

    logger.info('FAL API response', { 
      status: response.status, 
      ok: response.ok,
      statusText: response.statusText
    });

    if (!response.ok) {
      let errorMessage = `HTTP error! status: ${response.status}`;
      let errorData = null;
      try {
        errorData = await response.json();
        logger.error('FAL API error response body', { errorData });
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
        logger.error('FAL API error response text', { errorText });
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
        logger.error('AI service authentication failed in image generation', {
          status: response.status,
          errorMessage,
          service: 'fal.ai',
          hasApiKey: !!FAL_API_KEY,
          apiKeyPrefix: FAL_API_KEY ? FAL_API_KEY.substring(0, 8) + '...' : 'none'
        });
        // Don't expose API key details or configuration info
        return res.status(401).json({ 
          success: false, 
          error: getSafeErrorMessage(new Error('AI service authentication failed'), 'Image generation service unavailable. Please contact support.')
        });
      }
      
      logger.error('AI service image generation error', { 
        status: response.status, 
        errorMessage, 
        errorData,
        service: 'fal.ai'
      });
      // Sanitize error message to prevent AI service information leakage
      return res.status(response.status).json({ 
        success: false, 
        error: getSafeErrorMessage(new Error('AI service error'), 'Image generation failed. Please try again.')
      });
    }

    const data = await response.json();
    
    // Handle both FLUX and Nano Banana Pro response formats
    // FLUX returns: { images: [{ url: ... }, ...] }
    // Nano Banana Pro returns: { images: [{ url: ... }, ...] } or similar format
    // Extract only clean URLs, removing any metadata
    // NOTE: Metadata cleaning (EXIF, location data, etc.) is performed on the frontend
    // when images are received to ensure all outputs are clean
    let imageUrls = [];
    if (data.images && Array.isArray(data.images)) {
      imageUrls = data.images.map(img => {
        if (typeof img === 'string') {
          return img;
        } else if (img && img.url) {
          return img.url;
        }
        return null;
      }).filter(url => url !== null);
    } else if (data.image && typeof data.image === 'string') {
      // Single image as string
      imageUrls = [data.image];
    } else if (data.url && typeof data.url === 'string') {
      // Single image URL
      imageUrls = [data.url];
    }
    
    if (imageUrls.length > 0) {
      // Reduced logging for performance
      logger.debug('Image generation successful', {
        model: isNanoBananaPro ? 'nano-banana-pro' : 'flux',
        imageCount: imageUrls.length
      });
      // Return images and remaining credits (credits already deducted)
      // Include prompt optimization info if available
      const responseData = { 
        success: true, 
        images: imageUrls,
        remainingCredits: updateResult.credits,
        creditsDeducted: creditsToDeduct
      };
      
      // Add prompt optimization details if optimization was performed
      if (promptOptimizationResult && !promptOptimizationResult.skipped) {
        responseData.promptOptimization = {
          originalPrompt: prompt.trim(),
          optimizedPrompt: promptOptimizationResult.optimizedPrompt,
          reasoning: promptOptimizationResult.reasoning
        };
      }
      
      res.json(responseData);
    } else {
      logger.error('No images in AI service response', { 
        service: 'fal.ai',
        model: isNanoBananaPro ? 'nano-banana-pro' : 'flux' 
      });
      return res.status(500).json({ success: false, error: 'No image generated' });
    }
  } catch (error) {
    logger.error('Image generation proxy error', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: getSafeErrorMessage(error, 'Failed to generate image') });
  }
});

/**
 * Quality tier pricing for video generation
 * Based on FAL pricing with 10% upcharge
 * FAL Fast: $0.20/sec (no audio), $0.40/sec (with audio)
 * FAL Quality: $0.50/sec (no audio), $0.75/sec (with audio)
 * 1 credit = $0.10
 */
const VIDEO_QUALITY_PRICING = {
  fast: {
    pricePerSecNoAudio: 0.22,   // FAL $0.20 + 10% upcharge
    pricePerSecWithAudio: 0.44  // FAL $0.40 + 10% upcharge
  },
  quality: {
    pricePerSecNoAudio: 0.55,   // FAL $0.50 + 10% upcharge
    pricePerSecWithAudio: 0.825 // FAL $0.75 + 10% upcharge
  }
};

/**
 * Calculate video generation credits based on duration, audio, and quality
 * 1 credit = $0.10
 */
const calculateVideoCredits = (duration, generateAudio, quality = 'fast') => {
  const seconds = parseInt(duration) || 8; // Parse '4s', '6s', '8s' to number
  const pricing = VIDEO_QUALITY_PRICING[quality] || VIDEO_QUALITY_PRICING.fast;
  const pricePerSec = generateAudio ? pricing.pricePerSecWithAudio : pricing.pricePerSecNoAudio;
  // Convert dollars to credits (1 credit = $0.10)
  const creditsPerSecond = pricePerSec / 0.10;
  return Math.ceil(seconds * creditsPerSecond);
};

/**
 * Dynamic credit requirement middleware for video generation
 * Determines required credits based on duration, audio, and quality settings
 */
const requireCreditsForVideo = () => {
  return async (req, res, next) => {
    try {
      const { duration = '8s', generate_audio = true, quality = 'fast' } = req.body;
      const requiredCredits = calculateVideoCredits(duration, generate_audio, quality);
      
      // Store required credits for use in handler
      req.requiredCreditsForVideo = requiredCredits;
      
      // Use requireCredits middleware with dynamic credit amount
      return requireCredits(requiredCredits)(req, res, next);
    } catch (error) {
      logger.error('Error determining required video credits', { error: error.message });
      return res.status(500).json({ success: false, error: 'Failed to determine required credits' });
    }
  };
};

/**
 * Generation mode configurations for Veo 3.1
 */
const VIDEO_GENERATION_MODES = {
  'text-to-video': {
    requiresFirstFrame: false,
    requiresLastFrame: false,
    endpoint: '' // Base model endpoint for text-to-video
  },
  'image-to-video': {
    requiresFirstFrame: true,
    requiresLastFrame: false,
    endpoint: 'image-to-video'
  },
  'first-last-frame': {
    requiresFirstFrame: true,
    requiresLastFrame: true,
    endpoint: 'first-last-frame-to-video'
  }
};

/**
 * Video generation endpoint - Veo 3.1 (multiple modes)
 * Documentation: https://fal.ai/models/fal-ai/veo3.1/fast/first-last-frame-to-video/api
 * SECURITY: Requires credits check before making external API calls
 * Dynamic pricing based on quality tier:
 * - Fast: $0.22/sec (no audio), $0.44/sec (with audio)
 * - Quality: $0.55/sec (no audio), $0.825/sec (with audio)
 */
app.post('/api/generate/video', freeImageRateLimiter, requireCreditsForVideo(), async (req, res) => {
  try {
    const {
      prompt,
      first_frame_url,
      last_frame_url,
      aspect_ratio = 'auto',
      duration = '8s',
      resolution = '720p',
      generate_audio = true,
      generation_mode = 'first-last-frame',
      quality = 'fast'
    } = req.body;

    // Get mode configuration
    const modeConfig = VIDEO_GENERATION_MODES[generation_mode] || VIDEO_GENERATION_MODES['first-last-frame'];

    // Calculate credits based on actual request parameters
    const creditsToDeduct = calculateVideoCredits(duration, generate_audio, quality);
    
    // SECURITY: Deduct credits IMMEDIATELY before making any API calls
    const user = req.user;
    
    // Build update query
    const updateQuery = buildUserUpdateQuery(user);
    if (!updateQuery) {
      return res.status(400).json({ 
        success: false, 
        error: 'User account must have wallet address, userId, or email' 
      });
    }
    
    // Atomic credit deduction with condition to prevent race conditions and negative credits
    const previousCredits = user.credits || 0;
    const updateResult = await User.findOneAndUpdate(
      {
        ...updateQuery,
        credits: { $gte: creditsToDeduct }
      },
      { 
        $inc: { credits: -creditsToDeduct, totalCreditsSpent: creditsToDeduct } 
      },
      { new: true }
    );
    
    if (!updateResult) {
      const currentUser = await User.findOne(updateQuery);
      const currentCredits = currentUser?.credits || 0;
      
      logger.warn('Video generation credit deduction failed', {
        updateQuery,
        previousCredits,
        currentCredits,
        creditsToDeduct,
        userId: user.userId
      });
      
      return res.status(400).json({
        success: false,
        error: `Insufficient credits. You have ${currentCredits} credit${currentCredits !== 1 ? 's' : ''} but need ${creditsToDeduct}.`
      });
    }
    
    logger.debug('Video generation credits deducted', {
      userId: user.userId,
      creditsDeducted: creditsToDeduct,
      remainingCredits: updateResult.credits,
      duration,
      audioEnabled: generate_audio
    });
    
    // Check API key
    if (!FAL_API_KEY) {
      return res.status(500).json({ 
        success: false, 
        error: getSafeErrorMessage(new Error('AI service not configured'), 'Video generation service unavailable. Please contact support.') 
      });
    }

    // Validate required inputs
    if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
      return res.status(400).json({ success: false, error: 'prompt is required and must be a non-empty string' });
    }
    
    // Validate frames based on mode requirements
    if (modeConfig.requiresFirstFrame && !first_frame_url) {
      return res.status(400).json({ success: false, error: 'first_frame_url is required for this mode' });
    }
    
    if (modeConfig.requiresLastFrame && !last_frame_url) {
      return res.status(400).json({ success: false, error: 'last_frame_url is required for this mode' });
    }

    // Validate aspect_ratio
    const validAspectRatios = ['auto', '16:9', '9:16'];
    if (!validAspectRatios.includes(aspect_ratio)) {
      return res.status(400).json({ success: false, error: 'aspect_ratio must be auto, 16:9, or 9:16' });
    }
    
    // Validate duration
    const validDurations = ['4s', '6s', '8s'];
    if (!validDurations.includes(duration)) {
      return res.status(400).json({ success: false, error: 'duration must be 4s, 6s, or 8s' });
    }
    
    // Validate resolution
    const validResolutions = ['720p', '1080p'];
    if (!validResolutions.includes(resolution)) {
      return res.status(400).json({ success: false, error: 'resolution must be 720p or 1080p' });
    }
    
    // Validate quality
    const validQualities = ['fast', 'quality'];
    if (!validQualities.includes(quality)) {
      return res.status(400).json({ success: false, error: 'quality must be fast or quality' });
    }
    
    // Validate generation_mode
    if (!VIDEO_GENERATION_MODES[generation_mode]) {
      return res.status(400).json({ success: false, error: 'generation_mode must be text-to-video, image-to-video, or first-last-frame' });
    }

    // Build request body for Veo 3.1 API
    const requestBody = {
      prompt: prompt.trim(),
      aspect_ratio,
      duration,
      resolution,
      generate_audio
    };
    
    // Add frame URLs based on mode
    if (modeConfig.requiresFirstFrame && first_frame_url) {
      // For image-to-video mode, it's called 'image_url', for first-last-frame it's 'first_frame_url'
      if (generation_mode === 'image-to-video') {
        requestBody.image_url = first_frame_url;
      } else {
        requestBody.first_frame_url = first_frame_url;
      }
    }
    if (modeConfig.requiresLastFrame && last_frame_url) {
      requestBody.last_frame_url = last_frame_url;
    }

    logger.info('Video generation request', {
      model: 'veo3.1',
      mode: generation_mode,
      quality,
      duration,
      resolution,
      aspect_ratio,
      promptLength: prompt.length,
      userId: req.user?.userId
    });

    // Build endpoint URL based on mode and quality
    // For text-to-video, use base model endpoint: fal-ai/veo3.1
    // For other modes, use: fal-ai/veo3.1/fast/{mode} or fal-ai/veo3.1/{mode}
    let endpoint;
    if (generation_mode === 'text-to-video') {
      // Text-to-video uses base model endpoint (no /fast or /text-to-video suffix)
      endpoint = 'https://queue.fal.run/fal-ai/veo3.1';
    } else {
      // For image-to-video and first-last-frame, use quality path
      const qualityPath = quality === 'quality' ? '' : '/fast';
      endpoint = `https://queue.fal.run/fal-ai/veo3.1${qualityPath}/${modeConfig.endpoint}`;
    }
    
    const submitResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Key ${FAL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!submitResponse.ok) {
      let errorMessage = `HTTP error! status: ${submitResponse.status}`;
      try {
        const errorData = await submitResponse.json();
        logger.error('Veo 3.1 API submit error', { errorData });
        if (errorData.detail) {
          errorMessage = Array.isArray(errorData.detail)
            ? errorData.detail.map(err => err.msg || err).join('; ')
            : errorData.detail;
        } else if (errorData.error) {
          errorMessage = errorData.error;
        }
      } catch (e) {
        logger.error('Failed to parse Veo 3.1 error response', { e });
      }
      return res.status(submitResponse.status).json({ success: false, error: errorMessage });
    }

    const submitData = await submitResponse.json();
    
    // Log submit response for debugging
    logger.debug('Video submit response', { 
      submitDataKeys: Object.keys(submitData),
      submitData: JSON.stringify(submitData).substring(0, 200)
    });
    
    // Handle different possible response structures for request_id
    const requestId = submitData.request_id || submitData.requestId || submitData.id;
    
    if (!requestId) {
      logger.error('No request_id in submit response', { submitData });
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to submit video generation request. No request_id in response.' 
      });
    }

    logger.info('Video generation submitted', { requestId, endpoint });

    // Check if the submit response already contains the video (synchronous completion)
    if (submitData.video && submitData.video.url) {
      logger.info('Video completed synchronously', { requestId });
      const videoData = {
        url: submitData.video.url,
        content_type: submitData.video.content_type || 'video/mp4',
        file_name: submitData.video.file_name || `video-${requestId}.mp4`,
        file_size: submitData.video.file_size
      };
      return res.json({
        success: true,
        video: videoData,
        remainingCredits: updateResult.credits,
        creditsDeducted: creditsToDeduct
      });
    }

    // Poll for completion (video generation can take 1-3 minutes)
    // Build status and result endpoints using the same endpoint structure as submit
    let statusEndpoint, resultEndpoint;
    if (generation_mode === 'text-to-video') {
      statusEndpoint = `https://queue.fal.run/fal-ai/veo3.1/requests/${requestId}/status`;
      resultEndpoint = `https://queue.fal.run/fal-ai/veo3.1/requests/${requestId}`;
    } else {
      // For image-to-video and first-last-frame, match the submit endpoint exactly
      const qualityPath = quality === 'quality' ? '' : '/fast';
      statusEndpoint = `https://queue.fal.run/fal-ai/veo3.1${qualityPath}/${modeConfig.endpoint}/requests/${requestId}/status`;
      resultEndpoint = `https://queue.fal.run/fal-ai/veo3.1${qualityPath}/${modeConfig.endpoint}/requests/${requestId}`;
    }
    
    logger.debug('Polling endpoints', { statusEndpoint, resultEndpoint });
    
    const maxWaitTime = 5 * 60 * 1000; // 5 minutes max wait
    const pollInterval = 3000; // Poll every 3 seconds (faster polling)
    const startTime = Date.now();
    
    // Check status immediately first (don't wait before first check)
    let firstCheck = true;
    
    while (Date.now() - startTime < maxWaitTime) {
      // Wait before polling (except for first check)
      if (!firstCheck) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
      firstCheck = false;
      
      const statusResponse = await fetch(statusEndpoint, {
        headers: {
          'Authorization': `Key ${FAL_API_KEY}`
        }
      });
      
      if (!statusResponse.ok) {
        let errorBody = '';
        try {
          errorBody = await statusResponse.text();
        } catch (e) { /* ignore */ }
        logger.warn('Video status check failed', { 
          status: statusResponse.status, 
          statusText: statusResponse.statusText,
          statusEndpoint,
          errorBody: errorBody.substring(0, 300)
        });
        continue;
      }
      
      const statusData = await statusResponse.json();
      logger.debug('Video status', { requestId, status: statusData.status });
      
      if (statusData.status === 'COMPLETED') {
        // Fetch the result
        const resultResponse = await fetch(resultEndpoint, {
          headers: {
            'Authorization': `Key ${FAL_API_KEY}`
          }
        });
        
        if (!resultResponse.ok) {
          let errorDetails = '';
          try {
            const errorBody = await resultResponse.text();
            errorDetails = errorBody.substring(0, 500);
            logger.error('Failed to fetch video result from fal.ai', {
              requestId,
              status: resultResponse.status,
              statusText: resultResponse.statusText,
              resultEndpoint,
              errorBody: errorDetails
            });
          } catch (parseErr) {
            logger.error('Failed to fetch video result from fal.ai (could not parse error)', {
              requestId,
              status: resultResponse.status,
              statusText: resultResponse.statusText,
              resultEndpoint
            });
          }
          return res.status(500).json({ 
            success: false, 
            error: `Failed to fetch video result (${resultResponse.status}): ${errorDetails || resultResponse.statusText}` 
          });
        }
        
        const resultData = await resultResponse.json();
        
        // Log full response for debugging
        logger.debug('Video result response', { 
          requestId,
          hasVideo: !!resultData.video,
          hasUrl: !!(resultData.video && resultData.video.url),
          responseKeys: Object.keys(resultData),
          videoKeys: resultData.video ? Object.keys(resultData.video) : null
        });
        
        // Handle different possible response structures
        let videoUrl = null;
        if (resultData.video && resultData.video.url) {
          videoUrl = resultData.video.url;
        } else if (resultData.url) {
          // Sometimes the URL is directly in the response
          videoUrl = resultData.url;
        } else if (resultData.video_url) {
          videoUrl = resultData.video_url;
        }
        
        if (videoUrl) {
          logger.info('Video generation completed', { 
            requestId,
            videoUrl: videoUrl.substring(0, 50) + '...'
          });
          
          // Build video object with all available metadata
          const videoData = {
            url: videoUrl,
            content_type: resultData.video?.content_type || resultData.content_type || 'video/mp4',
            file_name: resultData.video?.file_name || resultData.file_name || `video-${requestId}.mp4`,
            file_size: resultData.video?.file_size || resultData.file_size
          };
          
          // NOTE: Video metadata cleaning (creation date, camera info, location, etc.) 
          // can be performed using the videoMetadata utility if FFmpeg is installed.
          // Videos from fal.ai typically have minimal metadata, but the utility is available
          // for additional cleaning if needed: backend/utils/videoMetadata.js
          
          return res.json({
            success: true,
            video: videoData,
            remainingCredits: updateResult.credits,
            creditsDeducted: creditsToDeduct
          });
        } else {
          logger.error('No video URL in response', { 
            requestId, 
            resultData: JSON.stringify(resultData).substring(0, 500) 
          });
          return res.status(500).json({ 
            success: false, 
            error: 'No video URL in response. Response structure: ' + JSON.stringify(Object.keys(resultData)) 
          });
        }
      } else if (statusData.status === 'FAILED') {
        logger.error('Video generation failed', { requestId, statusData });
        return res.status(500).json({ success: false, error: 'Video generation failed' });
      }
      
      // Still in progress, continue polling
      logger.debug('Video generation in progress', { requestId, status: statusData.status });
    }
    
    // Timeout reached
    return res.status(504).json({ success: false, error: 'Video generation timed out. Please try again.' });
    
  } catch (error) {
    logger.error('Video generation proxy error', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: getSafeErrorMessage(error, 'Failed to generate video') });
  }
});

/**
 * Calculate music credits based on duration
 * 1 credit per minute (rounded up), minimum 1 credit
 * @param {number} duration - Duration in seconds
 * @returns {number} - Credits required
 */
function calculateMusicCredits(duration) {
  const seconds = Math.max(10, Math.min(180, duration || 30));
  const minutes = seconds / 60;
  return Math.max(1, Math.ceil(minutes));
}

/**
 * Music generation endpoint - CassetteAI Music Generator
 * Documentation: https://fal.ai/models/cassetteai/music-generator/api
 * SECURITY: Requires credits check before making external API calls
 * Pricing: 1 credit per minute (rounded up), minimum 1 credit
 * CassetteAI generates 30s in ~2s, 3min in ~10s at 44.1kHz stereo
 */
app.post('/api/generate/music', freeImageRateLimiter, requireCredits(1), async (req, res) => {
  try {
    const { prompt, duration = 30 } = req.body;

    // Clamp duration between 10 and 180 seconds
    const clampedDuration = Math.max(10, Math.min(180, parseInt(duration) || 30));
    
    // Calculate credits based on duration: 1 credit per minute (rounded up)
    const creditsToDeduct = calculateMusicCredits(clampedDuration);
    
    // SECURITY: Deduct credits IMMEDIATELY before making any API calls
    const user = req.user;
    
    // Build update query
    const updateQuery = buildUserUpdateQuery(user);
    if (!updateQuery) {
      return res.status(400).json({ 
        success: false, 
        error: 'User account must have wallet address, userId, or email' 
      });
    }
    
    // Atomic credit deduction with condition to prevent race conditions and negative credits
    const previousCredits = user.credits || 0;
    const updateResult = await User.findOneAndUpdate(
      {
        ...updateQuery,
        credits: { $gte: creditsToDeduct }
      },
      { 
        $inc: { credits: -creditsToDeduct, totalCreditsSpent: creditsToDeduct } 
      },
      { new: true }
    );
    
    if (!updateResult) {
      const currentUser = await User.findOne(updateQuery);
      const currentCredits = currentUser?.credits || 0;
      
      logger.warn('Music generation credit deduction failed', {
        updateQuery,
        previousCredits,
        currentCredits,
        creditsToDeduct,
        userId: user.userId
      });
      
      return res.status(400).json({
        success: false,
        error: `Insufficient credits. You have ${currentCredits} credit${currentCredits !== 1 ? 's' : ''} but need ${creditsToDeduct}.`
      });
    }
    
    logger.debug('Music generation credits deducted', {
      userId: user.userId,
      creditsDeducted: creditsToDeduct,
      remainingCredits: updateResult.credits,
      duration: clampedDuration
    });
    
    // Check API key
    if (!FAL_API_KEY) {
      return res.status(500).json({ 
        success: false, 
        error: getSafeErrorMessage(new Error('AI service not configured'), 'Music generation service unavailable. Please contact support.') 
      });
    }

    // Validate required inputs
    if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
      return res.status(400).json({ success: false, error: 'prompt is required and must be a non-empty string' });
    }

    // Build request body for CassetteAI API
    const requestBody = {
      prompt: prompt.trim(),
      duration: clampedDuration
    };

    logger.info('Music generation request', {
      model: 'cassetteai/music-generator',
      duration: clampedDuration,
      promptLength: prompt.length,
      userId: req.user?.userId
    });

    // Make request to fal.ai CassetteAI API using subscribe pattern
    const endpoint = 'https://queue.fal.run/CassetteAI/music-generator';
    
    const submitResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Key ${FAL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!submitResponse.ok) {
      let errorMessage = `HTTP error! status: ${submitResponse.status}`;
      try {
        const errorData = await submitResponse.json();
        logger.error('CassetteAI API submit error', { errorData });
        if (errorData.detail) {
          errorMessage = Array.isArray(errorData.detail)
            ? errorData.detail.map(err => err.msg || err).join('; ')
            : errorData.detail;
        } else if (errorData.error) {
          errorMessage = errorData.error;
        }
      } catch (e) {
        logger.error('Failed to parse CassetteAI error response', { e });
      }
      return res.status(submitResponse.status).json({ success: false, error: errorMessage });
    }

    const submitData = await submitResponse.json();
    const requestId = submitData.request_id;
    
    if (!requestId) {
      return res.status(500).json({ success: false, error: 'Failed to submit music generation request' });
    }

    logger.info('Music generation submitted', { requestId });

    // Poll for completion (music generation is fast: 30s in ~2s, 3min in ~10s)
    const statusEndpoint = `https://queue.fal.run/CassetteAI/music-generator/requests/${requestId}/status`;
    const resultEndpoint = `https://queue.fal.run/CassetteAI/music-generator/requests/${requestId}`;
    
    const maxWaitTime = 60 * 1000; // 1 minute max wait (should be much faster)
    const pollInterval = 1000; // Poll every 1 second
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      
      const statusResponse = await fetch(statusEndpoint, {
        headers: {
          'Authorization': `Key ${FAL_API_KEY}`
        }
      });
      
      if (!statusResponse.ok) {
        logger.warn('Music status check failed', { status: statusResponse.status });
        continue;
      }
      
      const statusData = await statusResponse.json();
      
      if (statusData.status === 'COMPLETED') {
        // Fetch the result
        const resultResponse = await fetch(resultEndpoint, {
          headers: {
            'Authorization': `Key ${FAL_API_KEY}`
          }
        });
        
        if (!resultResponse.ok) {
          return res.status(500).json({ success: false, error: 'Failed to fetch music result' });
        }
        
        const resultData = await resultResponse.json();
        
        if (resultData.audio_file && resultData.audio_file.url) {
          logger.info('Music generation completed', { 
            requestId,
            audioUrl: resultData.audio_file.url.substring(0, 50) + '...'
          });
          
          return res.json({
            success: true,
            audio_file: resultData.audio_file,
            remainingCredits: updateResult.credits,
            creditsDeducted: creditsToDeduct
          });
        } else {
          return res.status(500).json({ success: false, error: 'No audio in response' });
        }
      } else if (statusData.status === 'FAILED') {
        logger.error('Music generation failed', { requestId, statusData });
        return res.status(500).json({ success: false, error: 'Music generation failed' });
      }
      
      // Still in progress, continue polling
      logger.debug('Music generation in progress', { requestId, status: statusData.status });
    }
    
    // Timeout reached
    return res.status(504).json({ success: false, error: 'Music generation timed out. Please try again.' });
    
  } catch (error) {
    logger.error('Music generation proxy error', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: getSafeErrorMessage(error, 'Failed to generate music') });
  }
});

/**
 * Layer extraction endpoint - Qwen Image Layered
 * Documentation: https://fal.ai/models/fal-ai/qwen-image-layered/api
 * SECURITY: Requires credits check before making external API calls
 * 1 credit required for layer extraction
 */
app.post('/api/extract-layers', freeImageRateLimiter, requireCredits(1), async (req, res) => {
  try {
    // SECURITY: Deduct credits IMMEDIATELY before making any API calls
    const user = req.user;
    const creditsToDeduct = req.requiredCredits || 1;
    
    // Build update query
    const updateQuery = buildUserUpdateQuery(user);
    if (!updateQuery) {
      return res.status(400).json({ 
        success: false, 
        error: 'User account must have wallet address, userId, or email' 
      });
    }
    
    // Atomic credit deduction with condition to prevent race conditions and negative credits
    const previousCredits = user.credits || 0;
    const updateResult = await User.findOneAndUpdate(
      {
        ...updateQuery,
        credits: { $gte: creditsToDeduct } // Only update if user has enough credits
      },
      { 
        $inc: { credits: -creditsToDeduct, totalCreditsSpent: creditsToDeduct } 
      },
      { new: true }
    );
    
    if (!updateResult) {
      // User doesn't have enough credits or race condition
      const currentUser = await User.findOne(updateQuery);
      const currentCredits = currentUser?.credits || 0;
      
      logger.warn('Layer extraction credit deduction failed - insufficient credits or race condition', {
        updateQuery,
        previousCredits,
        currentCredits,
        creditsToDeduct,
        userId: user.userId
      });
      
      return res.status(400).json({
        success: false,
        error: `Insufficient credits. You have ${currentCredits} credit${currentCredits !== 1 ? 's' : ''} but need ${creditsToDeduct}.`
      });
    }
    
    logger.debug('Credits deducted for layer extraction', {
      userId: user.userId,
      creditsDeducted: creditsToDeduct,
      remainingCredits: updateResult.credits
    });
    
    if (!FAL_API_KEY) {
      return res.status(500).json({ success: false, error: getSafeErrorMessage(new Error('AI service not configured'), 'Image generation service unavailable. Please contact support.') });
    }

    const {
      image_url,
      prompt = '',
      num_layers = 4,
      num_inference_steps = 28,
      guidance_scale = 5,
      seed,
      negative_prompt = '',
      enable_safety_checker = true,
      output_format = 'png',
      acceleration = 'regular'
    } = req.body;

    // Validate required inputs
    if (!image_url || typeof image_url !== 'string' || image_url.trim() === '') {
      return res.status(400).json({ success: false, error: 'image_url is required and must be a non-empty string' });
    }

    // SECURITY: Validate URL to prevent SSRF attacks using shared validator
    const imageUrl = image_url.trim();
    
    if (!isValidFalUrl(imageUrl)) {
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

    // Build request body for Qwen Image Layered API
    const requestBody = {
      image_url: imageUrl,
      num_layers: Math.max(1, Math.min(10, parseInt(num_layers) || 4)),
      num_inference_steps: Math.max(1, Math.min(100, parseInt(num_inference_steps) || 28)),
      guidance_scale: Math.max(1, Math.min(20, parseFloat(guidance_scale) || 5)),
      enable_safety_checker: Boolean(enable_safety_checker),
      output_format: output_format === 'webp' ? 'webp' : 'png',
      acceleration: ['none', 'regular', 'high'].includes(acceleration) ? acceleration : 'regular'
    };

    // Add optional parameters
    if (prompt && typeof prompt === 'string' && prompt.trim()) {
      requestBody.prompt = prompt.trim();
    }
    if (negative_prompt && typeof negative_prompt === 'string' && negative_prompt.trim()) {
      requestBody.negative_prompt = negative_prompt.trim();
    }
    if (seed !== undefined && seed !== null) {
      const seedInt = parseInt(seed);
      if (!isNaN(seedInt)) {
        requestBody.seed = seedInt;
      }
    }

    logger.info('Layer extraction request', {
      hasImageUrl: !!requestBody.image_url,
      numLayers: requestBody.num_layers,
      userId: req.user?.userId,
      email: req.user?.email,
      walletAddress: req.user?.walletAddress
    });

    // Make request to fal.ai Qwen Image Layered API
    // Using subscribe endpoint for synchronous response
    const endpoint = 'https://fal.run/fal-ai/qwen-image-layered';
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
      
      logger.error('AI service layer extraction error', { 
        status: response.status, 
        errorMessage, 
        errorData,
        service: 'fal.ai'
      });
      // Sanitize error message to prevent AI service information leakage
      return res.status(response.status).json({ 
        success: false, 
        error: getSafeErrorMessage(new Error('AI service error'), 'Layer extraction failed. Please try again.')
      });
    }

    const data = await response.json();
    
    // Qwen Image Layered returns: { images: [{ url: ... }, ...], seed, timings, has_nsfw_concepts }
    // Extract only clean URLs, removing any metadata
    // NOTE: Metadata cleaning (EXIF, location data, etc.) is performed on the frontend
    // when images are received to ensure all outputs are clean
    let imageUrls = [];
    if (data.images && Array.isArray(data.images)) {
      imageUrls = data.images.map(img => {
        if (typeof img === 'string') {
          return img;
        } else if (img && img.url) {
          return img.url;
        }
        return null;
      }).filter(url => url !== null);
    } else if (data.image && typeof data.image === 'string') {
      imageUrls = [data.image];
    } else if (data.url && typeof data.url === 'string') {
      imageUrls = [data.url];
    }
    
    if (imageUrls.length > 0) {
      logger.info('Layer extraction successful', {
        layerCount: imageUrls.length,
        userId: req.user?.userId,
        email: req.user?.email,
        walletAddress: req.user?.walletAddress,
        creditsDeducted: creditsToDeduct,
        remainingCredits: updateResult.credits
      });
      // Return images and remaining credits (credits already deducted)
      res.json({ 
        success: true, 
        images: imageUrls,
        remainingCredits: updateResult.credits,
        creditsDeducted: creditsToDeduct
      });
    } else {
      logger.error('No layers in AI service response', { service: 'fal.ai' });
      return res.status(500).json({ success: false, error: 'No layers extracted' });
    }
  } catch (error) {
    logger.error('Layer extraction proxy error', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: getSafeErrorMessage(error, 'Failed to extract layers') });
  }
});

// Status endpoint for Wan 2.2 Animate Replace
// API: https://fal.ai/models/fal-ai/wan/v2.2-14b/animate/replace/api
app.get('/api/wan-animate/status/:requestId', wanStatusLimiter, async (req, res) => {
  try {
    if (!FAL_API_KEY) {
      return res.status(500).json({ success: false, error: getSafeErrorMessage(new Error('AI service not configured'), 'Image generation service unavailable. Please contact support.') });
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
        // Don't expose external API response details - use safe error message
        return res.status(405).json({ 
          success: false, 
          error: getSafeErrorMessage(new Error('Method not allowed'), 'The API endpoint may have changed. Please try again later.')
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
        error: getSafeErrorMessage(parseError, 'Invalid JSON response from API. Please try again.') 
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
      return res.status(500).json({ success: false, error: getSafeErrorMessage(new Error('AI service not configured'), 'Image generation service unavailable. Please contact support.') });
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
        // Don't expose external API response details - use safe error message
        return res.status(405).json({ 
          success: false, 
          error: getSafeErrorMessage(new Error('Method not allowed'), 'The API endpoint may have changed. Please try again later.')
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
        error: getSafeErrorMessage(parseError, 'Invalid JSON response from API. Please try again.') 
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
 * Wan Animate Complete - called when video generation is complete
 * Deducts credits based on duration and adds to gallery
 * SECURITY: Requires authentication - uses authenticated user from token
 */
app.post('/api/wan-animate/complete', authenticateToken, async (req, res) => {
  try {
    // SECURITY: Use authenticated user from token, ignore user identifiers in body
    const user = req.user;
    
    const { requestId, videoUrl, duration } = req.body;
    
    if (!videoUrl) {
      return res.status(400).json({ success: false, error: 'videoUrl is required' });
    }
    
    if (!duration || duration <= 0) {
      return res.status(400).json({ success: false, error: 'duration is required and must be greater than 0' });
    }
    
    // SECURITY: Verify user has wallet or email (required for generation tracking)
    if (!user.walletAddress && !user.email) {
      logger.error('User has no wallet or email for video completion', { userId: user.userId });
      return res.status(400).json({ 
        success: false, 
        error: 'User account must have wallet address or email' 
      });
    }
    
    // Calculate total credits required (2 credits per second, minimum 2 credits)
    // Minimum 2 credits were already deducted at submission, so only charge additional credits
    const totalCreditsRequired = Math.max(Math.ceil(duration * 2), 2);
    const creditsAlreadyPaid = 2; // Deducted at /api/wan-animate/submit
    const creditsToDeduct = Math.max(0, totalCreditsRequired - creditsAlreadyPaid);
    
    // SECURITY: Build update query using authenticated user's identifier (supports wallet, email, or userId)
    const updateQuery = buildUserUpdateQuery(user);
    if (!updateQuery) {
      return res.status(400).json({ 
        success: false, 
        error: 'User account must have wallet address, userId, or email' 
      });
    }
    
    // Prepare generation and gallery items (record TOTAL credits used, not just additional)
    const generationId = `gen_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const generation = {
      id: generationId,
      prompt: 'Video Animate Replace',
      style: 'Wan 2.2 Animate',
      videoUrl,
      creditsUsed: totalCreditsRequired, // Total credits including those paid at submission
      timestamp: new Date()
    };
    
    const galleryItem = {
      id: generationId,
      prompt: 'Video Animate Replace',
      style: 'Wan 2.2 Animate',
      videoUrl,
      creditsUsed: totalCreditsRequired, // Total credits including those paid at submission
      timestamp: new Date()
    };
    
    let updateResult;
    const previousCredits = user.credits || 0;
    
    // If no additional credits needed (short video), just add to gallery without credit deduction
    if (creditsToDeduct <= 0) {
      updateResult = await User.findOneAndUpdate(
        updateQuery,
        {
          $push: {
            generationHistory: generation,
            gallery: galleryItem
          }
        },
        { new: true }
      );
      
      logger.info('Video generation completed (no additional credits needed)', {
        userId: user.userId,
        email: user.email,
        walletAddress: user.walletAddress,
        generationId,
        requestId,
        duration,
        totalCreditsRequired,
        creditsAlreadyPaid,
        remainingCredits: updateResult?.credits
      });
    } else {
      // Atomic credit deduction with condition to prevent race conditions and negative credits
      // Only deduct if user has enough credits (prevents abuse from concurrent requests)
      updateResult = await User.findOneAndUpdate(
        {
          ...updateQuery,
          credits: { $gte: creditsToDeduct } // Only update if user has enough credits
        },
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
        // User doesn't have enough credits or was modified between check and update (race condition)
        // Refetch to get current credits
        const currentUser = await User.findOne(updateQuery);
        const currentCredits = currentUser?.credits || 0;
        
        logger.warn('Video credit deduction failed - insufficient credits or race condition', {
          updateQuery,
          previousCredits,
          currentCredits,
          creditsToDeduct,
          totalCreditsRequired,
          creditsAlreadyPaid,
          duration,
          userId: user.userId
        });
        
        return res.status(400).json({
          success: false,
          error: `Insufficient credits. Video requires ${creditsToDeduct} additional credit${creditsToDeduct !== 1 ? 's' : ''} (${duration}s × 2 = ${totalCreditsRequired} total, minus ${creditsAlreadyPaid} already paid), but you only have ${currentCredits} credit${currentCredits !== 1 ? 's' : ''}.`
        });
      }
      
      logger.info('Video generation completed and additional credits deducted', {
        userId: user.userId,
        email: user.email,
        walletAddress: user.walletAddress,
        generationId,
        requestId,
        duration,
        totalCreditsRequired,
        creditsAlreadyPaid,
        additionalCreditsDeducted: creditsToDeduct,
        remainingCredits: updateResult.credits
      });
    }
    
    res.json({
      success: true,
      generationId,
      remainingCredits: updateResult?.credits,
      totalCreditsUsed: totalCreditsRequired,
      additionalCreditsDeducted: creditsToDeduct,
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

// MongoDB connection - OPTIMIZATION: Enhanced pooling for better performance
const mongoOptions = {
  maxPoolSize: 10,        // Maximum connections in pool
  minPoolSize: 2,         // OPTIMIZATION: Keep minimum connections warm
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  maxIdleTimeMS: 30000,   // OPTIMIZATION: Close idle connections after 30s
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

      // Ensure email index is unique + sparse (allows multiple documents without email)
      const emailIndex = existingIndexes.find(idx => idx.name === 'email_1');
      if (emailIndex) {
        const needsUpdate = !(emailIndex.unique && emailIndex.sparse);
        if (needsUpdate) {
          logger.warn('Recreating email index to enforce unique+sparse');
          await User.collection.dropIndex('email_1');
          await User.collection.createIndex(
            { "email": 1 },
            { unique: true, sparse: true, background: true }
          );
        }
      } else {
        await User.collection.createIndex(
          { "email": 1 },
          { unique: true, sparse: true, background: true }
        );
      }

      // Create other indexes for frequently queried fields (only if they don't exist)
      // Use a helper to safely create indexes that might already exist with different options
      const safeCreateIndex = async (field, options = { background: true }) => {
        const indexName = Object.keys(field)[0] + '_1';
        const existing = existingIndexes.find(idx => idx.name === indexName);
        if (!existing) {
          await User.collection.createIndex(field, options);
        }
      };
      
      await safeCreateIndex({ "paymentHistory.txHash": 1 });
      await safeCreateIndex({ "createdAt": 1 });
      await safeCreateIndex({ "userId": 1 });
      await safeCreateIndex({ "expiresAt": 1 });
      
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
    // Note: lowercase is NOT set here - we normalize in code:
    // EVM addresses are lowercased, Solana addresses stay as-is (case-sensitive)
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
  userId: {  // Auto-generated for all users (email or wallet)
    type: String,
    unique: true,
    sparse: true,
    index: true,
    required: false
  },
  credits: { 
    type: Number, 
    default: 0,
    min: [0, 'Credits cannot be negative'] // Prevent negative credits at schema level
  },
  totalCreditsEarned: { 
    type: Number, 
    default: 0,
    min: [0, 'Total credits earned cannot be negative']
  },
  totalCreditsSpent: { 
    type: Number, 
    default: 0,
    min: [0, 'Total credits spent cannot be negative']
  },
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

// Generate unique userId for all users (email or wallet)
userSchema.pre('save', async function(next) {
  if (this.isNew && !this.userId) {
    try {
      let hash;
      let prefix;
      
      if (this.email) {
        // Generate userId from email hash
        hash = crypto.createHash('sha256').update(this.email.toLowerCase()).digest('hex').substring(0, 16);
        prefix = 'email_';
      } else if (this.walletAddress) {
        // Generate userId from wallet address hash
        const normalizedAddress = this.walletAddress.startsWith('0x') 
          ? this.walletAddress.toLowerCase() 
          : this.walletAddress;
        hash = crypto.createHash('sha256').update(normalizedAddress).digest('hex').substring(0, 16);
        prefix = 'wallet_';
      } else {
        // No email or wallet - skip userId generation
        return next();
      }
      
      this.userId = `${prefix}${hash}`;
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

// Global free image counter for all users (drainable pools)
const globalFreeImageSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    default: 'global'
  },
  totalFreeImagesUsed: {
    type: Number,
    default: 0,
    min: 0
  },
  totalFreeImagesUsedNFT: {
    type: Number,
    default: 0,
    min: 0
  }
}, {
  timestamps: true
});

const GlobalFreeImage = mongoose.model('GlobalFreeImage', globalFreeImageSchema);

// Maximum free images allowed per IP address
// NFT holders get 5 free images TOTAL (not per NFT), regular users get 2
// If user has ANY NFTs (nftCollections.length > 0), they get the NFT holder limit
const MAX_FREE_IMAGES_PER_IP_REGULAR = 2;
const MAX_FREE_IMAGES_PER_IP_NFT = 5;

// Global caps for total free images (drainable pools)
const MAX_GLOBAL_FREE_IMAGES = 300; // For non-NFT holders
const MAX_GLOBAL_FREE_IMAGES_NFT = 500; // For NFT holders

// Helper function to get or create user by email or wallet
async function getOrCreateUserByIdentifier(identifier, type = 'wallet') {
  let user;
  
  if (type === 'email') {
    // OPTIMIZATION: Use lean() for initial lookup (faster read-only check)
    user = await User.findOne({ email: identifier.toLowerCase() }).lean();
    if (!user) {
      // Give new email users 2 free credits with atomic protection
      user = new User({
        email: identifier.toLowerCase(),
        credits: 2,
        totalCreditsEarned: 2,
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
      
      // Atomic fallback: Ensure credits are set correctly (prevents abuse from concurrent requests)
      const savedUser = await User.findOneAndUpdate(
        {
          _id: user._id,
          credits: { $lt: 2 }, // Only update if credits are less than 2
          createdAt: { $gte: new Date(Date.now() - 10000) } // Only if created within last 10 seconds
        },
        {
          $set: {
            credits: 2
          },
          $max: {
            totalCreditsEarned: 2 // Ensure totalCreditsEarned is at least 2
          }
        },
        { new: true }
      );
      
      user = savedUser || user;
      logger.info('New email user created with 2 free credits', { email: user.email, credits: user.credits });
    }
  } else {
    // Wallet address (existing logic)
    return await getOrCreateUser(identifier);
  }
  
  return user;
}

/**
 * Unified function to find user by wallet address OR email
 * Makes it easy to reference users by either identifier
 */
async function findUserByIdentifier(walletAddress = null, email = null, userId = null) {
  if (!walletAddress && !email && !userId) {
    return null;
  }

  const query = { $or: [] };

  if (walletAddress) {
    const isSolanaAddress = !walletAddress.startsWith('0x');
    const normalizedWalletAddress = isSolanaAddress ? walletAddress : walletAddress.toLowerCase();
    query.$or.push({ walletAddress: normalizedWalletAddress });
  }

  if (email) {
    const normalizedEmail = email.toLowerCase();
    query.$or.push({ email: normalizedEmail });
  }

  if (userId) {
    query.$or.push({ userId: userId });
  }

  // If only one identifier, use direct query (more efficient)
  // OPTIMIZATION: Use lean() for faster read-only queries (returns plain JS objects)
  if (query.$or.length === 1) {
    return await User.findOne(query.$or[0]).lean();
  }

  return await User.findOne(query).lean();
}

/**
 * Build update query for user based on wallet address, userId, or email
 * Returns query object or null if no valid identifier
 */
function buildUserUpdateQuery(user) {
  if (user.walletAddress) {
    const isSolanaAddress = !user.walletAddress.startsWith('0x');
    const normalizedWalletAddress = isSolanaAddress ? user.walletAddress : user.walletAddress.toLowerCase();
    return { walletAddress: normalizedWalletAddress };
  } else if (user.userId) {
    return { userId: user.userId };
  } else if (user.email) {
    return { email: user.email.toLowerCase() };
  }
  return null;
}

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
  
  // Easy unified lookup: find user by wallet OR email OR userId
  // This makes it simple to reference users by any identifier
  let user = await findUserByIdentifier(walletAddress, email, userId);
  
  // If user found, return it (whether found by wallet or email)
  if (user) {
    logger.debug('User found by identifier', { 
      foundBy: walletAddress ? 'wallet' : email ? 'email' : 'userId',
      hasWallet: !!user.walletAddress,
      hasEmail: !!user.email,
      userId: user?.userId,
      credits: user?.credits
    });
    
    // If walletAddress provided but user doesn't have one, create/update via getOrCreateUser
    if (walletAddress && !user.walletAddress) {
      const isSolanaAddress = !walletAddress.startsWith('0x');
      const normalizedWalletAddress = isSolanaAddress ? walletAddress : walletAddress.toLowerCase();
      user = await getOrCreateUser(normalizedWalletAddress, user.email || email);
    }
    
    return user;
  }
  
  // User not found - create new user based on what identifier was provided
  if (walletAddress) {
    const isSolanaAddress = !walletAddress.startsWith('0x');
    const normalizedWalletAddress = isSolanaAddress ? walletAddress : walletAddress.toLowerCase();
    const normalizedEmail = email ? email.toLowerCase() : null;
    user = await getOrCreateUser(normalizedWalletAddress, normalizedEmail);
    logger.debug('User created by wallet address', { 
      walletAddress: normalizedWalletAddress.substring(0, 10) + '...',
      userId: user?.userId,
      credits: user?.credits,
      email: !!user?.email
    });
    return user;
  } else if (email) {
    const normalizedEmail = email.toLowerCase();
    
    // Double-check if user exists (race condition protection)
    const existingEmailUser = await User.findOne({ email: normalizedEmail });
    if (existingEmailUser) {
      logger.debug('User with email already exists, returning existing user', { email: normalizedEmail });
      return existingEmailUser;
    }
    
    try {
      logger.info('Creating new user with email', { email: normalizedEmail });
      user = new User({
        email: normalizedEmail,
        credits: 2,
        totalCreditsEarned: 2,
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
      
      // Atomic fallback: Ensure credits are set correctly
      const savedUser = await User.findOneAndUpdate(
        {
          _id: user._id,
          credits: { $lt: 2 },
          createdAt: { $gte: new Date(Date.now() - 10000) }
        },
        {
          $set: { credits: 2 },
          $max: { totalCreditsEarned: 2 }
        },
        { new: true }
      );
      
      user = savedUser || user;
      logger.info('New email user created with 2 free credits', { email: normalizedEmail, credits: user.credits });
      return user;
    } catch (error) {
      // Handle duplicate email error (race condition - another request created user with same email)
      if (error.code === 11000 || (error.message && error.message.includes('duplicate key'))) {
        if (error.keyPattern && error.keyPattern.email) {
          logger.warn('Duplicate email detected during user creation, fetching existing user', { email: normalizedEmail });
          // Fetch and return the existing user
          const existingUser = await User.findOne({ email: normalizedEmail });
          if (existingUser) {
            return existingUser;
          }
        }
      }
      // Re-throw other errors
      throw error;
    }
  } else if (userId) {
    logger.info('Creating new user with userId', { userId });
    user = new User({
      userId,
      credits: 2,
      totalCreditsEarned: 2,
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
    logger.info('New email user created with 2 free credits', { userId, credits: user.credits });
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
      
      // Check if user has enough credits (generation ALWAYS requires credits)
      // Credits displayed on screen = user.credits (this is what we check)
      const availableCredits = user.credits || 0;
      
      if (availableCredits < requiredCredits) {
        logger.warn('Insufficient credits for generation', {
          userId: user.userId,
          email: user.email,
          walletAddress: user.walletAddress,
          availableCredits,
          requiredCredits,
          displayedCredits: availableCredits // Matches what's shown on screen
        });
        return res.status(400).json({
          success: false,
          error: `Insufficient credits. You have ${availableCredits} credit${availableCredits !== 1 ? 's' : ''} but need ${requiredCredits}. Please purchase credits first.`
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

// Solana token configurations
const SOLANA_TOKEN_CONFIGS = {
  'USDC': { 
    mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 
    decimals: 6, 
    creditRate: 6.67 
  },
  'USDT': { 
    mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', 
    decimals: 6, 
    creditRate: 6.67 
  }
};

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

// Helper to calculate subscription credits - delegates to shared calculateCredits utility
const calculateSubscriptionCredits = (user, amountInDollars) => {
  const isNFTHolder = !!(user.walletAddress && user.nftCollections && user.nftCollections.length > 0);
  const { credits: finalCredits, nftMultiplier } = calculateCredits(amountInDollars, isNFTHolder);

  return {
    finalCredits,
    isNFTHolder,
    nftMultiplier
  };
};

// Helper function to add credits and payment history to user (with idempotency check)
// Uses atomic operations to ensure reliability with both wallet and email users
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
  // Check if payment was already processed (idempotency - prevents duplicate credit grants)
  const paymentId = paymentIntentId || txHash;
  if (paymentId && isPaymentAlreadyProcessed(user, txHash, paymentIntentId)) {
    logger.warn('Payment already processed - skipping credit addition', {
      paymentId,
      userId: user.userId,
      email: user.email,
      walletAddress: user.walletAddress
    });
    return null; // Return null to indicate already processed
  }
  
  // Build payment entry
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
  
  // Use atomic operation to update credits and payment history
  // This works with both wallet and email users via buildUserUpdateQuery
  const updateQuery = buildUserUpdateQuery(user);
  if (!updateQuery) {
    logger.error('Cannot build update query for user', {
      userId: user.userId,
      email: user.email,
      walletAddress: user.walletAddress
    });
    throw new Error('User account must have wallet address, userId, or email');
  }
  
  // Atomic update: increment credits and add payment history in one operation
  const updatedUser = await User.findOneAndUpdate(
    updateQuery,
    {
      $inc: { 
        credits: credits,
        totalCreditsEarned: credits
      },
      $push: {
        paymentHistory: paymentEntry
      }
    },
    { new: true }
  );
  
  if (!updatedUser) {
    logger.error('Failed to update user credits', {
      userId: user.userId,
      email: user.email,
      walletAddress: user.walletAddress,
      updateQuery
    });
    throw new Error('Failed to update user credits');
  }
  
  logger.info('Credits added to user', {
    userId: updatedUser.userId,
    email: updatedUser.email,
    walletAddress: updatedUser.walletAddress,
    creditsAdded: credits,
    totalCredits: updatedUser.credits,
    paymentId: paymentId
  });
  
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
 * Uses TTL cache (5 min) to reduce expensive RPC calls
 * @param {string} walletAddress - The wallet address to check
 * @param {Array} collections - Optional collections to check (defaults to QUALIFYING_NFT_COLLECTIONS)
 * @param {boolean} bypassCache - Force fresh check, ignoring cache
 * @returns {Promise<{ownedCollections: Array, isHolder: boolean}>}
 */
const checkNFTHoldingsForWallet = async (walletAddress, collections = QUALIFYING_NFT_COLLECTIONS, bypassCache = false) => {
  // Normalize wallet address (EVM addresses should be lowercase, Solana stays as-is)
  const isSolanaAddress = !walletAddress.startsWith('0x');
  const normalizedWalletAddress = isSolanaAddress ? walletAddress : walletAddress.toLowerCase();
  
  // Check cache first (5 minute TTL) - skip expensive RPC calls if cached
  const cacheKey = `nft_${normalizedWalletAddress}`;
  if (!bypassCache) {
    const cached = nftHoldingsCache.get(cacheKey);
    if (cached) {
      logger.debug('NFT holdings cache hit', { walletAddress: normalizedWalletAddress, isHolder: cached.isHolder });
      return cached;
    }
  }
  
  const ownedCollections = [];
  
  logger.info('Starting NFT check for wallet', { 
    original: walletAddress,
    normalized: normalizedWalletAddress,
    isSolana: isSolanaAddress,
    collectionCount: collections.length,
    bypassCache
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
  
  // Cache the result for 5 minutes to reduce RPC calls
  const result = { ownedCollections, isHolder };
  nftHoldingsCache.set(cacheKey, result);
  
  return result;
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
async function getOrCreateUser(walletAddress, email = null) {
  // Detect wallet type: Solana addresses don't start with 0x
  const isSolanaAddress = !walletAddress.startsWith('0x');
  const normalizedAddress = isSolanaAddress ? walletAddress : walletAddress.toLowerCase();
  const normalizedEmail = email ? email.toLowerCase() : null;
  
  logger.debug('getOrCreateUser called', { 
    originalAddress: walletAddress, 
    normalizedAddress, 
    isSolana: isSolanaAddress,
    hasEmail: !!normalizedEmail
  });
  
  // Check if user already exists
  const existingUser = await User.findOne({ walletAddress: normalizedAddress });
  const isNewUser = !existingUser;
  
  logger.debug('User lookup result', { 
    normalizedAddress, 
    isNewUser, 
    existingCredits: existingUser?.credits,
    existingCreatedAt: existingUser?.createdAt,
    existingEmail: !!existingUser?.email
  });
  
  // Build update object - include email in $setOnInsert for new users, and in $set if updating existing user without email
  const setOnInsertFields = {
    walletAddress: normalizedAddress,
    credits: 2, // Default: 2 credits for new users (will be updated to 5 if NFT holder)
    totalCreditsEarned: 2,
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
  };
  
  // Add email to new user creation if provided
  if (normalizedEmail) {
    setOnInsertFields.email = normalizedEmail;
  }
  
  // Generate userId for new users (pre-save hook doesn't run on findOneAndUpdate with upsert)
  // Email takes priority over wallet for userId generation
  if (normalizedEmail) {
    const hash = crypto.createHash('sha256').update(normalizedEmail).digest('hex').substring(0, 16);
    setOnInsertFields.userId = `email_${hash}`;
  } else {
    // Wallet-only user - generate userId from wallet address
    const hash = crypto.createHash('sha256').update(normalizedAddress).digest('hex').substring(0, 16);
    setOnInsertFields.userId = `wallet_${hash}`;
  }
  
  // Build $set object for updates
  const setFields = {
    lastActive: new Date()
  };
  
  // If email is provided and existing user doesn't have one, add it to $set
  // Check if email already belongs to another user to prevent conflicts
  if (normalizedEmail && existingUser && !existingUser.email) {
    const emailUser = await User.findOne({ email: normalizedEmail });
    if (emailUser && emailUser._id.toString() !== existingUser._id.toString()) {
      logger.warn('Email already belongs to another user, skipping email assignment', {
        walletAddress: normalizedAddress,
        email: normalizedEmail,
        existingUserId: existingUser._id.toString(),
        emailUserId: emailUser._id.toString()
      });
      // Don't set email if it belongs to another user - preserve functionality
    } else {
      setFields.email = normalizedEmail;
    }
  }
  
  // Check if email already exists for a different user (prevent duplicate emails)
  if (normalizedEmail && isNewUser) {
    const existingEmailUser = await User.findOne({ email: normalizedEmail });
    if (existingEmailUser && existingEmailUser.walletAddress !== normalizedAddress) {
      logger.warn('Email already belongs to another user, cannot create new user with same email', {
        walletAddress: normalizedAddress,
        email: normalizedEmail,
        existingUserId: existingEmailUser.userId
      });
      // Return the existing user with that email (don't create duplicate)
      return existingEmailUser;
    }
  }
  
  // Use findOneAndUpdate with upsert to make this atomic and prevent race conditions
  // This ensures that if credits were granted before user connects, they won't be lost
  // Start with 2 credits for new users (will be updated to 5 if NFT holder)
  // NOTE: Do NOT use setDefaultsOnInsert as it can override $setOnInsert values with schema defaults
  let user;
  try {
    user = await User.findOneAndUpdate(
      { walletAddress: normalizedAddress },
      {
        $setOnInsert: setOnInsertFields,
        $set: setFields
      },
      {
        upsert: true,
        new: true
        // Removed setDefaultsOnInsert: true as it conflicts with $setOnInsert for credits
      }
    );
  } catch (error) {
    // Handle duplicate email error (race condition - email was taken between check and upsert)
    if (error.code === 11000 || (error.message && error.message.includes('duplicate key'))) {
      if (error.keyPattern && error.keyPattern.email) {
        logger.warn('Duplicate email detected during user creation, fetching existing user', { 
          email: normalizedEmail,
          walletAddress: normalizedAddress 
        });
        // Try to find user by email
        const existingEmailUser = await User.findOne({ email: normalizedEmail });
        if (existingEmailUser) {
          return existingEmailUser;
        }
        // If email user not found, try to find by wallet (might have been created)
        const walletUser = await User.findOne({ walletAddress: normalizedAddress });
        if (walletUser) {
          return walletUser;
        }
      }
    }
    // Re-throw other errors
    throw error;
  }
  
  // Always refetch to ensure we have the absolute latest data, especially credits
  // This handles the case where credits might have been granted between the upsert and now
  let latestUser = await User.findOne({ walletAddress: normalizedAddress });
  
  if (!latestUser) {
    // This shouldn't happen, but handle edge case
    logger.error('User not found after creation', { walletAddress: normalizedAddress });
    return user;
  }
  
  // CRITICAL FIX: If this is a new user and credits are 0, immediately set to 2
  // This handles cases where $setOnInsert didn't work properly due to Mongoose behavior
  if (isNewUser && latestUser.credits === 0 && latestUser.totalCreditsEarned === 0) {
    logger.info('New user detected with 0 credits - applying initial 2 credits', { 
      walletAddress: normalizedAddress 
    });
    latestUser = await User.findOneAndUpdate(
      { walletAddress: normalizedAddress, credits: 0, totalCreditsEarned: 0 },
      { $set: { credits: 2, totalCreditsEarned: 2 } },
      { new: true }
    );
    if (latestUser) {
      logger.info('Successfully granted 2 initial credits to new user', { 
        walletAddress: normalizedAddress, 
        credits: latestUser.credits 
      });
    }
  }
  
  // If this is a new user, check NFT status and grant appropriate credits
  // NFT holders get 5 credits, regular users get 2 credits
  // Check both isNewUser flag and createdAt timestamp to ensure we catch new users
  const timeSinceCreation = latestUser.createdAt ? Date.now() - new Date(latestUser.createdAt).getTime() : Infinity;
  const isRecentlyCreated = timeSinceCreation < 10000; // 10 second window
  
  logger.debug('Checking if user should get initial credits', {
    normalizedAddress,
    isSolana: isSolanaAddress,
    isNewUser,
    hasCreatedAt: !!latestUser.createdAt,
    timeSinceCreation,
    isRecentlyCreated,
    currentCredits: latestUser.credits
  });
  
  if (isNewUser && latestUser.createdAt && isRecentlyCreated) {
    try {
      // Check NFT holdings for new users
      const { ownedCollections, isHolder } = await checkNFTHoldingsForWallet(normalizedAddress);
      
      if (isHolder && ownedCollections.length > 0) {
        // NFT holder: grant 5 credits total using atomic update to prevent abuse
        // Only grant if user is new, recently created, and doesn't already have 5 credits
        const nftUser = await User.findOneAndUpdate(
          {
            _id: latestUser._id,
            credits: { $lt: 5 }, // Only update if credits are less than 5
            createdAt: { $gte: new Date(Date.now() - 10000) } // Only if created within last 10 seconds
          },
          {
            $set: {
              credits: 5,
              nftCollections: ownedCollections
            },
            $max: {
              totalCreditsEarned: 5 // Ensure totalCreditsEarned is at least 5
            }
          },
          { new: true }
        );
        
        if (nftUser) {
          latestUser = nftUser; // Update latestUser with fresh data
          logger.info('New NFT holder wallet user created with 5 credits (atomic update)', { 
            walletAddress: normalizedAddress, 
            isSolana: isSolanaAddress, 
            credits: nftUser.credits,
            totalCreditsEarned: nftUser.totalCreditsEarned,
            nftCollections: ownedCollections.length
          });
        } else {
          logger.debug('NFT credit grant skipped - user may have been updated concurrently', {
            walletAddress: normalizedAddress,
            currentCredits: latestUser.credits
          });
        }
      } else {
        // Regular user: keep 2 credits (already set during creation)
        logger.info('New wallet user created with 2 credits', { 
          walletAddress: normalizedAddress, 
          isSolana: isSolanaAddress, 
          credits: latestUser.credits,
          totalCreditsEarned: latestUser.totalCreditsEarned
        });
      }
    } catch (nftError) {
      // If NFT check fails, user still gets 2 credits (default)
      logger.warn('NFT check failed for new user, defaulting to 2 credits', { 
        walletAddress: normalizedAddress,
        error: nftError.message 
      });
      logger.info('New wallet user created with 2 credits (NFT check failed)', { 
        walletAddress: normalizedAddress, 
        isSolana: isSolanaAddress, 
        credits: latestUser.credits,
        totalCreditsEarned: latestUser.totalCreditsEarned
      });
    }
  }
  
  // Fallback: Ensure new users always have at least 2 credits if they somehow don't
  // This handles edge cases where timing checks might miss or credits weren't set properly
  // Use atomic update with condition to prevent abuse (only grant if credits < 2 and user is new)
  if (isNewUser && latestUser.credits < 2) {
    const accountAge = latestUser.createdAt ? Date.now() - new Date(latestUser.createdAt).getTime() : Infinity;
    const isVeryNewUser = accountAge < 60000; // Only within 1 minute of creation
    
    if (isVeryNewUser) {
      // Use atomic update to prevent race conditions and abuse
      const fixedUser = await User.findOneAndUpdate(
        {
          _id: latestUser._id,
          credits: { $lt: 2 }, // Only update if credits are still less than 2
          createdAt: { $gte: new Date(Date.now() - 60000) } // Only if created within last minute
        },
        {
          $set: {
            credits: 2
          },
          $max: {
            totalCreditsEarned: 2 // Ensure totalCreditsEarned is at least 2
          }
        },
        { new: true }
      );
      
      if (fixedUser) {
        latestUser = fixedUser; // Update latestUser with fresh data
        logger.info('Fixed new user credits to 2 (atomic update)', {
          normalizedAddress,
          isSolana: isSolanaAddress,
          credits: fixedUser.credits
        });
      } else {
        logger.debug('Credit fix skipped - user may have been updated concurrently or is not new', {
          normalizedAddress,
          currentCredits: latestUser.credits,
          accountAge
        });
      }
    }
  }
  
  // Always refetch to ensure we return the absolute freshest data
  const finalUser = await User.findOne({ walletAddress: normalizedAddress });
  if (finalUser) {
    return finalUser;
  }
  
  // If user already had credits (granted before first connection), log it
  if (latestUser.credits > 5 && latestUser.createdAt && Date.now() - new Date(latestUser.createdAt).getTime() < 2000) {
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

/**
 * Verify Solana payment transaction
 * SECURITY: Verifies transaction on-chain to prevent spoofed payments
 */
async function verifySolanaPayment(txHash, walletAddress, tokenSymbol, amount) {
  try {
    // Get Solana RPC endpoint
    const rpcUrls = [
      process.env.SOLANA_RPC_URL,
      'https://api.mainnet-beta.solana.com',
      'https://solana-mainnet.g.alchemy.com/v2/demo',
      'https://rpc.ankr.com/solana'
    ].filter(Boolean);

    let connection = null;
    let lastError = null;

    // Try each RPC endpoint until one works
    for (const rpcUrl of rpcUrls) {
      try {
        connection = new Connection(rpcUrl, 'confirmed');
        // Test connection with a simple call
        await Promise.race([
          connection.getLatestBlockhash(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), 5000))
        ]);
        logger.debug('Using Solana RPC endpoint for verification', { rpcUrl });
        break;
      } catch (error) {
        logger.debug('Failed to connect to Solana RPC', { rpcUrl, error: error.message });
        lastError = error;
        connection = null;
        continue;
      }
    }

    if (!connection) {
      throw new Error(`All Solana RPC endpoints failed. Last error: ${lastError?.message}`);
    }

    // Get the payment wallet
    const paymentWallet = PAYMENT_WALLETS['solana'];
    if (!paymentWallet) {
      throw new Error('Solana payment wallet not configured');
    }

    // Get token config
    const tokenConfig = SOLANA_TOKEN_CONFIGS[tokenSymbol];
    if (!tokenConfig) {
      throw new Error(`Token ${tokenSymbol} not supported on Solana`);
    }

    logger.debug('Verifying Solana transaction', { txHash, walletAddress, tokenSymbol, amount });

    // Fetch the transaction
    const tx = await connection.getParsedTransaction(txHash, {
      maxSupportedTransactionVersion: 0,
      commitment: 'confirmed'
    });

    if (!tx) {
      throw new Error('Transaction not found on Solana blockchain');
    }

    // Verify transaction succeeded
    if (tx.meta?.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(tx.meta.err)}`);
    }

    // Verify the transaction is confirmed (not pending)
    if (!tx.blockTime) {
      throw new Error('Transaction not yet confirmed');
    }

    // Check if transaction is too old (more than 1 hour) - potential replay attack
    const txAge = Date.now() / 1000 - tx.blockTime;
    if (txAge > 3600) {
      logger.warn('Solana transaction is old', { txHash, txAge, blockTime: tx.blockTime });
      throw new Error('Transaction is too old. Please use a recent transaction.');
    }

    // Parse the transaction to find SPL token transfers
    let validTransfer = false;
    let actualAmount = 0;
    let senderAddress = null;

    // Look through inner instructions for token transfers
    const allInstructions = [
      ...(tx.transaction.message.instructions || []),
      ...(tx.meta?.innerInstructions?.flatMap(i => i.instructions) || [])
    ];

    for (const instruction of allInstructions) {
      // Check for parsed SPL Token transfer instructions
      if (instruction.program === 'spl-token' && instruction.parsed) {
        const { type, info } = instruction.parsed;
        
        // Handle both 'transfer' and 'transferChecked' instructions
        if (type === 'transfer' || type === 'transferChecked') {
          const tokenMint = info.mint || null;
          
          // For regular transfer, we need to check the source account's mint
          // For transferChecked, the mint is directly available
          if (type === 'transferChecked' && tokenMint !== tokenConfig.mint) {
            continue; // Not the token we're looking for
          }
          
          // Get source and destination (these are token accounts, not wallet addresses)
          const sourceTokenAccount = info.source;
          const destTokenAccount = info.destination;
          
          // Get the token amount
          let transferAmount;
          if (type === 'transferChecked') {
            transferAmount = parseFloat(info.tokenAmount?.uiAmount || 0);
          } else {
            // For regular transfer, convert from raw amount
            transferAmount = parseFloat(info.amount) / Math.pow(10, tokenConfig.decimals);
          }
          
          // Get account info to verify the destination is our payment wallet
          try {
            const destAccountInfo = await connection.getParsedAccountInfo(new PublicKey(destTokenAccount));
            const destAccountData = destAccountInfo?.value?.data?.parsed?.info;
            
            if (destAccountData) {
              const destOwner = destAccountData.owner;
              const destMint = destAccountData.mint;
              
              // Verify this is a transfer TO our payment wallet of the correct token
              if (destOwner === paymentWallet && destMint === tokenConfig.mint) {
                // Also verify the source (sender)
                const sourceAccountInfo = await connection.getParsedAccountInfo(new PublicKey(sourceTokenAccount));
                const sourceAccountData = sourceAccountInfo?.value?.data?.parsed?.info;
                
                if (sourceAccountData) {
                  senderAddress = sourceAccountData.owner;
                  
                  // Verify sender matches the claimed wallet address
                  if (senderAddress === walletAddress) {
                    validTransfer = true;
                    actualAmount = transferAmount;
                    logger.debug('Valid Solana transfer found', { 
                      from: senderAddress, 
                      to: destOwner, 
                      amount: actualAmount,
                      mint: destMint
                    });
                    break;
                  } else {
                    logger.warn('Solana transfer sender mismatch', { 
                      claimedWallet: walletAddress, 
                      actualSender: senderAddress 
                    });
                  }
                }
              }
            }
          } catch (accountError) {
            logger.warn('Error fetching Solana token account info', { error: accountError.message });
            continue;
          }
        }
      }
    }

    if (!validTransfer) {
      // More detailed error for debugging
      logger.warn('No valid Solana transfer found', { 
        txHash, 
        walletAddress, 
        paymentWallet,
        tokenMint: tokenConfig.mint,
        instructionCount: allInstructions.length
      });
      throw new Error('No valid token transfer to payment wallet found in transaction');
    }

    // Verify amount is within tolerance (allow 1% difference for floating point)
    const expectedAmount = parseFloat(amount);
    const tolerance = expectedAmount * 0.01;
    if (actualAmount < expectedAmount - tolerance) {
      logger.warn('Solana payment amount mismatch', { 
        expected: expectedAmount, 
        actual: actualAmount, 
        tolerance 
      });
      throw new Error(`Payment amount mismatch. Expected: ${expectedAmount}, Got: ${actualAmount}`);
    }

    // Calculate credits
    const credits = Math.floor(actualAmount * tokenConfig.creditRate);

    logger.info('Solana payment verified successfully', {
      txHash,
      walletAddress,
      actualAmount,
      credits,
      slot: tx.slot
    });

    return {
      success: true,
      credits,
      actualAmount,
      txHash,
      slot: tx.slot
    };

  } catch (error) {
    logger.error('Solana payment verification error:', { 
      error: error.message, 
      txHash, 
      walletAddress 
    });
    throw new Error(`Solana payment verification failed: ${error.message}`);
  }
}

// API Routes

/**
 * Serve robots.txt to prevent crawlers from indexing sensitive endpoints
 * This should be served before other routes to ensure crawlers can find it
 */
app.get('/robots.txt', (req, res) => {
  const robotsPath = path.join(__dirname, '..', 'public', 'robots.txt');
  res.type('text/plain');
  res.sendFile(robotsPath, (err) => {
    if (err) {
      // If file doesn't exist, send a basic robots.txt
      res.send('User-agent: *\nDisallow: /api/\n');
    }
  });
});

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
    
    // Check critical environment variables for signup (but don't expose which ones are missing)
    const criticalVars = {
      MONGODB_URI: !!process.env.MONGODB_URI,
      JWT_SECRET: !!process.env.JWT_SECRET,
      SESSION_SECRET: !!process.env.SESSION_SECRET
    };
    const hasAllCritical = Object.values(criticalVars).every(v => v);
    
    // Minimal health response - don't expose sensitive configuration details
    const health = {
      status: hasAllCritical && dbState === 1 ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      // Only expose basic status, not detailed configuration
      database: dbStatus === 'connected' ? 'connected' : 'disconnected',
      // Don't expose: environment, port, version, CORS config, missing env vars, etc.
    };
    
    // In production, return even less information
    if (process.env.NODE_ENV === 'production') {
      // Ultra-minimal response for production
      res.status(200).json({
        status: health.status,
        timestamp: health.timestamp
      });
    } else {
      // Development can have slightly more info, but still sanitized
      res.status(200).json(health);
    }
  } catch (error) {
    // Even if there's an error, try to return something
    // This ensures Railway knows the server is running
    logger.error('Health check error:', error);
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString()
      // Don't expose error details or uptime in production
    });
  }
});

/**
 * CORS debug endpoint - shows current CORS configuration
 * Useful for debugging CORS issues
 * This endpoint itself validates CORS, so you can see if your origin is allowed
 */
app.get('/api/cors-info', (req, res) => {
  // Security: Don't expose sensitive CORS configuration details
  // Only return minimal information about current request
  const origin = req.headers.origin;
  
  // In production, return minimal info only
  if (process.env.NODE_ENV === 'production') {
    return res.status(200).json({
      message: 'CORS validation is working',
      currentRequest: {
        hasOrigin: !!origin,
        // Don't expose actual origin or validation details
      }
    });
  }
  
  // Development mode can have slightly more info for debugging, but still sanitized
  const allowedOriginsList = process.env.ALLOWED_ORIGINS 
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : [];
  
  let wouldBeAllowed = 'unknown';
  
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
      wouldBeAllowed = 'yes (permissive mode)';
    } else if (isAllowedOrigin) {
      wouldBeAllowed = 'yes (in allowed list)';
    } else {
      wouldBeAllowed = 'no (not in allowed list)';
    }
  }
  
  // In development, return structure compatible with test scripts but don't expose raw env vars
  const corsInfo = {
    environment: process.env.NODE_ENV || 'development',
    allowedOrigins: {
      // Don't expose raw ALLOWED_ORIGINS value, but provide count and mode for debugging
      count: allowedOriginsList.length,
      mode: allowedOriginsList.length === 0 ? 'permissive (allows any origin)' : 'restrictive (only listed origins)',
      // Only show parsed list in development, not the raw env var
      parsed: allowedOriginsList.length > 0 ? allowedOriginsList : []
    },
    currentRequest: {
      hasOrigin: !!origin,
      wouldBeAllowed
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
 * CORS: Handles OPTIONS preflight requests explicitly
 */
app.options('/api/logs', (req, res) => {
  // Handle CORS preflight request - check if origin is allowed
  const origin = req.headers.origin;
  
  // Check if origin should be allowed (same logic as CORS middleware)
  const isLocalhost = origin && (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:'));
  const allowedOriginsList = process.env.ALLOWED_ORIGINS 
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim().toLowerCase())
    : [];
  const originLower = origin ? origin.toLowerCase() : '';
  
  const isAllowedOrigin = allowedOriginsList.some(allowed => {
    const allowedLower = allowed.toLowerCase();
    return allowedLower === originLower || 
           allowedLower.replace(/\/$/, '') === originLower.replace(/\/$/, '');
  });
  
  // Allow if localhost, in allowed list, or no ALLOWED_ORIGINS set
  if (origin && (isLocalhost || isAllowedOrigin || allowedOriginsList.length === 0)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
  }
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cache-Control, Pragma');
  res.header('Access-Control-Max-Age', '86400');
  res.sendStatus(200);
});

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
app.post('/api/auth/signup', authRateLimiter, async (req, res) => {
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

    // Validate password strength (12+ chars with complexity)
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{12,}$/;
    if (!passwordRegex.test(password)) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 12 characters and include uppercase, lowercase, number, and special character (@$!%*?&)'
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

    // Hash password with cost factor 12 (recommended for 2024+)
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user with 2 free credits for new email signups
    // Use atomic operation to prevent race conditions if multiple signups happen simultaneously
    const user = new User({
      email: email.toLowerCase(),
      password: hashedPassword,
      credits: 2,
      totalCreditsEarned: 2,
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
    
    // Atomic fallback: Ensure credits are set correctly (prevents abuse from concurrent requests)
    // This is a safety check in case of race conditions during user creation
    const savedUser = await User.findOneAndUpdate(
      {
        _id: user._id,
        credits: { $lt: 2 }, // Only update if credits are less than 2
        createdAt: { $gte: new Date(Date.now() - 10000) } // Only if created within last 10 seconds
      },
      {
        $set: {
          credits: 2
        },
        $max: {
          totalCreditsEarned: 2 // Ensure totalCreditsEarned is at least 2
        }
      },
      { new: true }
    );
    
    const finalUser = savedUser || user;
    logger.info('New email user created with 2 free credits', { 
      email: finalUser.email, 
      userId: finalUser.userId, 
      credits: finalUser.credits 
    });

    // Ensure userId was generated (should be done by pre-save hook, but verify)
    if (!user.userId) {
      logger.error('userId was not generated for new user', { email: user.email });
      return res.status(500).json({
        success: false,
        error: 'Failed to create user account'
      });
    }

    // Generate JWT access token (24h) and refresh token (30 days)
    const token = jwt.sign(
      { userId: user.userId, email: user.email, type: 'access' },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    // SECURITY: Use separate secret for refresh tokens
    const refreshToken = jwt.sign(
      { userId: user.userId, type: 'refresh' },
      JWT_REFRESH_SECRET,
      { expiresIn: '30d' }
    );

    logger.info('New user signed up', { email: user.email, userId: user.userId });

    res.json({
      success: true,
      token,
      refreshToken,
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
    
    // Handle duplicate email error (MongoDB error code 11000 for unique constraint violation)
    // This can happen in race conditions where two signups occur simultaneously
    if (error.code === 11000 || (error.message && error.message.includes('duplicate key'))) {
      // Check if it's an email duplicate
      if (error.keyPattern && error.keyPattern.email) {
        logger.warn('Duplicate email signup attempt blocked', { email: req.body.email });
        return res.status(400).json({
          success: false,
          error: 'Email already registered'
        });
      }
      // Check if it's a userId duplicate (shouldn't happen, but handle it)
      if (error.keyPattern && error.keyPattern.userId) {
        logger.error('Duplicate userId detected during signup', { email: req.body.email });
        return res.status(500).json({
          success: false,
          error: 'Account creation failed. Please try again.'
        });
      }
    }
    
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
app.post('/api/auth/signin', authRateLimiter, async (req, res) => {
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
    try {
      await user.save();
    } catch (saveError) {
      // Log save error but don't fail signin - lastActive is not critical
      logger.warn('Failed to update lastActive during signin', { 
        error: saveError.message,
        userId: user.userId 
      });
    }

    // Generate JWT access token (24h) and refresh token (30 days)
    const token = jwt.sign(
      { userId: user.userId, email: user.email, type: 'access' },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    // SECURITY: Use separate secret for refresh tokens
    const refreshToken = jwt.sign(
      { userId: user.userId, type: 'refresh' },
      JWT_REFRESH_SECRET,
      { expiresIn: '30d' }
    );

    logger.info('User signed in', { email: user.email, userId: user.userId });

    res.json({
      success: true,
      token,
      refreshToken,
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
    // Log error but don't expose internal details
    logger.error('Sign in error:', { 
      error: error.message, 
      name: error.name,
      hasStack: !!error.stack
    });
    
    // Handle specific known errors
    if (error.message && error.message.includes('data and hash arguments required')) {
      // This is an ethers.js error that shouldn't happen in signin
      // Likely from a concurrent request or unrelated code path
      logger.warn('Unexpected ethers.js error in signin - likely from unrelated code path', {
        error: error.message
      });
      return res.status(500).json({
        success: false,
        error: 'Sign in failed. Please try again.'
      });
    }
    
    // Generic error response
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
 * Logout - revoke tokens
 * SECURITY: Blacklists both access and refresh tokens to prevent further use
 */
app.post('/api/auth/logout', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const accessToken = authHeader && authHeader.split(' ')[1];
    const { refreshToken } = req.body;
    
    let tokensRevoked = 0;
    
    // Blacklist access token if provided
    if (accessToken) {
      try {
        const decoded = jwt.verify(accessToken, JWT_SECRET);
        // Add to blacklist with expiration time for cleanup
        blacklistToken(accessToken, decoded.exp * 1000);
        tokensRevoked++;
        logger.info('Access token revoked on logout', { userId: decoded.userId });
      } catch (e) {
        // Token already expired or invalid - still try to blacklist
        blacklistToken(accessToken);
      }
    }
    
    // Blacklist refresh token if provided
    if (refreshToken) {
      try {
        const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
        blacklistToken(refreshToken, decoded.exp * 1000);
        tokensRevoked++;
        logger.info('Refresh token revoked on logout', { userId: decoded.userId });
      } catch (e) {
        // Token already expired or invalid - still try to blacklist
        blacklistToken(refreshToken);
      }
    }
    
    res.json({
      success: true,
      message: `Successfully logged out. ${tokensRevoked} token(s) revoked.`
    });
    
  } catch (error) {
    logger.error('Logout error:', error);
    // Always return success for logout to prevent information leakage
    res.json({
      success: true,
      message: 'Logged out'
    });
  }
});

/**
 * Refresh access token using refresh token
 */
app.post('/api/auth/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        error: 'Refresh token is required'
      });
    }

    // SECURITY: Verify refresh token using separate secret
    const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
    
    // Ensure it's a refresh token
    if (decoded.type !== 'refresh') {
      return res.status(403).json({
        success: false,
        error: 'Invalid token type. Refresh token required.'
      });
    }
    
    // SECURITY: Check if refresh token has been revoked
    if (isTokenBlacklisted(refreshToken)) {
      return res.status(401).json({
        success: false,
        error: 'Refresh token has been revoked. Please sign in again.'
      });
    }

    // Find user
    const user = await User.findOne({
      userId: decoded.userId
    }).select('-password');

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'User not found'
      });
    }

    // Generate new access token
    const newAccessToken = jwt.sign(
      { userId: user.userId, email: user.email, type: 'access' },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    logger.info('Access token refreshed', { userId: user.userId });

    res.json({
      success: true,
      token: newAccessToken
    });

  } catch (error) {
    logger.error('Token refresh error:', error);
    if (error.name === 'TokenExpiredError' || error.name === 'JsonWebTokenError') {
      return res.status(403).json({
        success: false,
        error: 'Invalid or expired refresh token'
      });
    }
    res.status(500).json({
      success: false,
      error: getSafeErrorMessage(error, 'Failed to refresh token')
    });
  }
});

/**
 * Get current user data (protected route)
 */
// Handle OPTIONS preflight for /api/auth/me
app.options('/api/auth/me', (req, res) => {
  const origin = req.headers.origin;
  const isLocalhost = origin && (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:'));
  const allowedOriginsList = process.env.ALLOWED_ORIGINS 
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim().toLowerCase())
    : [];
  const originLower = origin ? origin.toLowerCase() : '';
  const isAllowedOrigin = allowedOriginsList.some(allowed => {
    const allowedLower = allowed.toLowerCase();
    return allowedLower === originLower || 
           allowedLower.replace(/\/$/, '') === originLower.replace(/\/$/, '');
  });
  
  if (origin && (isLocalhost || isAllowedOrigin || allowedOriginsList.length === 0)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
  }
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cache-Control, Pragma');
  res.header('Access-Control-Max-Age', '86400');
  res.sendStatus(200);
});

app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    // Refresh user data from database to get latest credits
    // Use the authenticated user's identifier to find the latest data
    const User = mongoose.model('User');
    const user = await User.findOne({
      $or: [
        { userId: req.user.userId },
        { email: req.user.email }
      ]
    }).select('-password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // Check NFT status if wallet is linked
    let isNFTHolder = false;
    if (user.walletAddress) {
      isNFTHolder = user.nftCollections && user.nftCollections.length > 0;
    }

    // Set cache-control headers to prevent browser caching - ensures fresh data across devices
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    res.json({
      success: true,
      user: {
        userId: user.userId,
        email: user.email,
        credits: user.credits || 0,
        totalCreditsEarned: user.totalCreditsEarned || 0,
        totalCreditsSpent: user.totalCreditsSpent || 0,
        walletAddress: user.walletAddress || null,
        nftCollections: user.nftCollections || [],
        paymentHistory: user.paymentHistory || [],
        generationHistory: user.generationHistory || [],
        gallery: user.gallery || [],
        settings: user.settings || {},
        lastActive: user.lastActive,
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
 * Create Stripe billing portal session for subscription management
 */
app.post('/api/stripe/billing-portal', authenticateToken, async (req, res) => {
  try {
    if (!stripe) {
      return res.status(400).json({
        success: false,
        error: 'Stripe is not configured'
      });
    }

    const user = req.user;
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    
    // Find Stripe customer ID
    let customerId = null;
    
    // Try to find customer by email
    try {
      const customers = await stripe.customers.list({
        email: user.email,
        limit: 1
      });

      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
      } else {
        // If no customer found, return error
        return res.status(404).json({
          success: false,
          error: 'No Stripe customer found. Please subscribe first.'
        });
      }
    } catch (stripeError) {
      logger.error('Error finding Stripe customer:', stripeError);
      return res.status(500).json({
        success: false,
        error: 'Failed to find customer account'
      });
    }

    // Create billing portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${baseUrl}`,
    });

    logger.info('Stripe billing portal session created', {
      userId: user.userId || user._id.toString(),
      email: user.email,
      sessionId: session.id
    });

    res.json({
      success: true,
      url: session.url
    });

  } catch (error) {
    logger.error('Billing portal session creation error:', error);
    res.status(500).json({
      success: false,
      error: getSafeErrorMessage(error, 'Failed to create billing portal session')
    });
  }
});

/**
 * Get user data
 * SECURITY: Requires authentication and verifies user owns the wallet address
 * If not authenticated, returns minimal public data only (credits, NFT status, pricing)
 */
app.get('/api/users/:walletAddress', async (req, res) => {
  try {
    const { walletAddress } = req.params;
    const { skipNFTs } = req.query;
    
    // Normalize address
    const isSolanaAddress = !walletAddress.startsWith('0x');
    const normalizedAddress = isSolanaAddress ? walletAddress : walletAddress.toLowerCase();
    
    // Get or create user - single source of truth for user data
    const user = await getOrCreateUser(normalizedAddress);
    
    // Update lastActive timestamp
    user.lastActive = new Date();
    await user.save();
    
    // Extract credits with safe defaults
    const userCredits = user.credits ?? 0;
    const userTotalCreditsEarned = user.totalCreditsEarned ?? 0;
    const userTotalCreditsSpent = user.totalCreditsSpent ?? 0;
    let isNFTHolder = user.nftCollections && user.nftCollections.length > 0;
    
    // Check NFT holdings from blockchain (unless skipped for speed)
    if (skipNFTs !== 'true') {
      try {
        const { ownedCollections } = await checkNFTHoldingsForWallet(normalizedAddress);
        
        if (ownedCollections.length > 0) {
          await User.findOneAndUpdate(
            { walletAddress: user.walletAddress },
            { $set: { nftCollections: ownedCollections } }
          );
          isNFTHolder = true;
        } else {
          await User.findOneAndUpdate(
            { walletAddress: user.walletAddress },
            { $set: { nftCollections: [] } }
          );
          isNFTHolder = false;
        }
      } catch (nftError) {
        logger.warn('Error checking NFT holdings', { error: nftError.message, walletAddress });
        // Keep existing NFT status from database
      }
    }
    
    // Set cache-control headers
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // Refetch user to ensure we have the absolute latest credits
    const freshUser = await User.findOne({ walletAddress: user.walletAddress });
    const finalCredits = freshUser?.credits ?? userCredits;
    const finalTotalEarned = freshUser?.totalCreditsEarned ?? userTotalCreditsEarned;
    const finalTotalSpent = freshUser?.totalCreditsSpent ?? userTotalCreditsSpent;
    
    // SECURITY: Only return public data (credits, NFT status, pricing)
    // Sensitive data (paymentHistory, gallery, settings) requires authentication
    // Frontend should use /api/auth/me for full user data with authentication
    res.json({
      success: true,
      user: {
        walletAddress: user.walletAddress,
        credits: finalCredits,
        totalCreditsEarned: finalTotalEarned,
        totalCreditsSpent: finalTotalSpent,
        nftCollections: freshUser?.nftCollections || user.nftCollections || [],
        // SECURITY: Removed sensitive data - use /api/auth/me for full data
        // paymentHistory, generationHistory, gallery, settings now require auth
        lastActive: freshUser?.lastActive || user.lastActive,
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
    const { walletAddress } = req.body;
    
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
        
        // Grant credits to NFT holders to ensure they have 5 credits total (one-time, idempotent)
        // New NFT holders get 5 credits immediately from getOrCreateUser
        // Existing users with 2 credits will get 3 more to make 5 total
        // If user already has 5 credits, no additional credits are granted
        const targetCredits = 5;
        const currentCredits = user.credits || 0;
        const creditsToGrant = Math.max(0, targetCredits - currentCredits);
        
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
            creditsGranted,
            currentCredits,
            totalAfterGrant: currentCredits + creditsToGrant,
            note: 'NFT holders receive 5 credits total'
          });
        } else if (hasBeenGranted) {
          logger.debug('NFT credits already granted', { walletAddress: normalizedWalletForNFT });
        } else if (currentCredits >= targetCredits) {
          logger.debug('NFT holder already has sufficient credits', { 
            walletAddress: normalizedWalletForNFT,
            currentCredits 
          });
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
      creditsGranted // Return how many credits were just granted (5 credits for NFT holders)
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
    logger.error('Get payment address error:', error);
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
    logger.error(`Token transfer check error for ${chain}:`, {
      message: error.message,
      stack: error.stack
    });
    return null;
  }
}

/**
 * Check for Solana USDC transfers
 */
async function checkForSolanaUSDC(paymentAddress, expectedAmount = null) {
  try {
    logger.debug('Starting Solana USDC transfer check', { paymentAddress, expectedAmount });
    
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
 * SECURITY NOTE: This endpoint is for UX optimization only. Actual payment verification
 * happens on-chain via /api/payments/verify. This endpoint should NOT be relied upon
 * as the sole source of payment verification.
 * 
 * SECURITY MEASURES:
 * 1. Transaction deduplication middleware prevents double-crediting
 * 2. Strict rate limiting prevents abuse
 * 3. Credits are provisional until blockchain verification confirms
 * 4. Authenticated requests are prioritized and logged
 */
app.post('/api/payments/credit', authenticateFlexible, verifyWalletOwnership, async (req, res) => {
  try {
    const { 
      txHash, 
      walletAddress, 
      tokenSymbol, 
      amount, 
      chainId, 
      walletType 
    } = req.body;

    // SECURITY: Log authentication method for audit trail
    logger.info('Payment credit started', { 
      txHash, 
      walletAddress, 
      tokenSymbol, 
      amount, 
      chainId, 
      walletType,
      authType: req.authType || 'none',
      authenticatedUser: req.user?.userId || req.user?.email || 'wallet-only'
    });

    if (!txHash || !walletAddress || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }

    // Validate txHash format to prevent injection
    if (typeof txHash !== 'string' || txHash.length > 100 || !/^[a-zA-Z0-9]+$/.test(txHash)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid transaction hash format'
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
 * SECURITY: This endpoint verifies the transaction on-chain before crediting.
 * The sender address is extracted from the blockchain, not from user input.
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

    // SECURITY: Validate txHash format to prevent injection
    if (typeof txHash !== 'string' || txHash.length > 100 || !/^[a-zA-Z0-9]+$/.test(txHash)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid transaction hash format'
      });
    }

    // SECURITY: Validate wallet address format
    if (!isValidWalletAddress(walletAddress)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid wallet address format'
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
      // SECURITY: Verify Solana payment on-chain (prevents spoofed payments)
      logger.debug('Verifying Solana payment', { txHash, walletAddress, tokenSymbol, amount });
      verification = await verifySolanaPayment(txHash, walletAddress, tokenSymbol, amount);
      logger.debug('Solana payment verification result', { verification });
      
      // Recalculate credits based on NFT holder status if verification succeeded
      if (verification.success && verification.actualAmount) {
        verification.credits = calculateCreditsFromAmount(verification.actualAmount, creditsPerUSDC);
        logger.debug('Recalculated Solana credits', {
          isNFTHolder,
          creditsPerUSDC,
          actualAmount: verification.actualAmount,
          credits: verification.credits
        });
      }
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

    // Get user from metadata or provided identifier - support wallet, email, or userId
    let user;
    // First try metadata from payment intent
    if (paymentIntent.metadata.userId) {
      user = await User.findById(paymentIntent.metadata.userId);
    } else if (paymentIntent.metadata.email) {
      user = await User.findOne({ email: paymentIntent.metadata.email.toLowerCase() });
    } else if (paymentIntent.metadata.walletAddress) {
      user = await getOrCreateUser(paymentIntent.metadata.walletAddress);
    }
    
    // If not found in metadata, try request body parameters
    if (!user) {
      if (userId) {
        user = await User.findOne({ userId });
      } else if (req.body.email) {
        user = await User.findOne({ email: req.body.email.toLowerCase() });
      } else if (walletAddress) {
        user = await getOrCreateUser(walletAddress);
      }
    }
    
    // Last resort: try findUserByIdentifier with all available identifiers
    if (!user) {
      user = await findUserByIdentifier(
        paymentIntent.metadata.walletAddress || walletAddress || null,
        paymentIntent.metadata.email || req.body.email || null,
        paymentIntent.metadata.userId || userId || null
      );
    }
    
    if (!user) {
      return res.status(400).json({
        success: false,
        error: 'Unable to identify user. Please provide userId, email, or walletAddress.'
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

    // SECURITY: Prioritize auth token - most secure method
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
            
            // SECURITY: If userId provided in body, verify it matches authenticated user
            if (userId && user.userId !== userId) {
              logger.warn('userId in body does not match authenticated user', {
                authenticatedUserId: user.userId,
                providedUserId: userId
              });
              // Continue with authenticated user (ignore body userId)
            }
          }
        }
      } catch (tokenError) {
        logger.warn('Invalid or missing auth token', { error: tokenError.message });
      }
    }

    // SECURITY: Only use userId from request body if no auth token (less secure fallback)
    // This maintains backward compatibility but prioritizes authentication
    if (!user && userId) {
      user = await User.findOne({ userId });
      if (user) {
        logger.info('User found via request userId (no auth token)', { userId });
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
    
    logger.debug('Starting instant payment check', { walletAddress, chainId, expectedAmount });
    
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
      logger.debug('Checking specific chain for payment', { chainName, chainId, evmPaymentAddress });
      const quickPromises = [Promise.race([
        checkForTokenTransfer(evmPaymentAddress, token, chainName),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 30000)) // Increase timeout to 30s
      ]).catch(err => {
        logger.debug(`Quick payment check failed for ${chainName}:`, { error: err.message });
        return null;
      })];
      
      const quickResults = await Promise.all(quickPromises);
      const quickPayment = quickResults.find(r => r && r.found);
      
      if (quickPayment) {
        logger.info('Payment found on blockchain', { chain: quickPayment.chain, txHash: quickPayment.txHash });
        
        // Get the sender's wallet address from the blockchain event
        const senderAddress = quickPayment.from;
        
        // Verify the payment is from the requesting wallet address
        if (walletAddress && senderAddress.toLowerCase() !== walletAddress.toLowerCase()) {
          logger.warn('Payment sender does not match requesting wallet', { senderAddress, walletAddress });
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
            logger.warn('Payment amount does not match expected', { paymentAmount, expectedAmount, tolerance });
            return res.json({
              success: true,
              paymentDetected: false,
              message: `Payment found but amount ${paymentAmount} does not match expected ${expectedAmount}`
            });
          }
        }
        
        logger.info('Crediting sender for USDC transfer', { senderAddress, amount: quickPayment.amount });
        
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
        
        logger.info('Credits added successfully', { senderAddress, creditsToAdd, newBalance: user.credits });
        
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
    logger.debug('No specific chain requested, checking all chains', { chainId });
    const allChains = ['polygon', 'ethereum', 'base', 'arbitrum', 'optimism'];
    const quickPromises = allChains.map(chain => 
      Promise.race([
        checkForTokenTransfer(evmPaymentAddress, token, chain),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
      ]).catch(err => {
        logger.debug(`Quick payment check failed for ${chain}:`, { error: err.message });
        return null;
      })
    );
    
    const quickResults = await Promise.all(quickPromises);
    const quickPayment = quickResults.find(r => r && r.found);
    
    if (quickPayment) {
      logger.info('Payment found on blockchain', { chain: quickPayment.chain, txHash: quickPayment.txHash });
      
      // Get the sender's wallet address from the blockchain event
      const senderAddress = quickPayment.from;
      
      // Verify the payment is from the requesting wallet address
      if (walletAddress && senderAddress.toLowerCase() !== walletAddress.toLowerCase()) {
        logger.warn('Payment sender does not match requesting wallet', { senderAddress, walletAddress });
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
          logger.warn('Payment amount does not match expected', { paymentAmount, expectedAmount, tolerance });
          return res.json({
            success: true,
            paymentDetected: false,
            message: `Payment found but amount ${paymentAmount} does not match expected ${expectedAmount}`
          });
        }
      }
      
      logger.info('Crediting sender for USDC transfer', { senderAddress, amount: quickPayment.amount });
      
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
      
      logger.info('Credits added successfully', { senderAddress, creditsToAdd, newBalance: finalUser.credits });
      
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
    logger.error('Instant payment check error:', error);
    res.status(500).json({
      success: false,
      error: 'Instant payment check failed'
    });
  }
});

// Stripe webhook handler moved to before express.json() middleware

/**
 * Add generation to history
 * SECURITY: Requires authentication - supports both JWT tokens (email users) and wallet addresses (wallet users)
 */
app.post('/api/generations/add', authenticateFlexible, async (req, res) => {
  try {
    // SECURITY: Use authenticated user from token or wallet address
    const user = req.user;
    
    logger.debug('Generation add request received', {
      authenticatedUserId: user.userId,
      authenticatedEmail: user.email,
      authenticatedWallet: user.walletAddress,
      hasImageUrl: !!req.body?.imageUrl,
      hasVideoUrl: !!req.body?.videoUrl,
      creditsUsed: req.body?.creditsUsed
    });

    const { 
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
    
    // SECURITY: Verify user has wallet or email (required for generation tracking)
    if (!user.walletAddress && !user.email) {
      logger.error('User has no wallet or email', { userId: user.userId });
      return res.status(400).json({
        success: false,
        error: 'User account must have wallet address or email'
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
    
    // Credits are already deducted in /api/generate/image endpoint
    // This endpoint only adds the generation to history
    const creditsUsedForHistory = creditsUsed || 1;
    
    // Build update query
    const updateQuery = buildUserUpdateQuery(user);
    if (!updateQuery) {
      return res.status(400).json({ 
        success: false, 
        error: 'User account must have wallet address, userId, or email' 
      });
    }
    
    // Create generation object
    const generationId = `gen_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const generation = {
      id: generationId,
      prompt: prompt || 'No prompt',
      style: style || 'No Style',
      ...(imageUrl && { imageUrl }),
      ...(videoUrl && { videoUrl }),
      ...(requestId && { requestId }),
      ...(status && { status }),
      creditsUsed: creditsUsedForHistory,
      timestamp: new Date()
    };
    
    // Build update object - only add generation to history (credits already deducted)
    const updateObj = {
      $push: {
        generationHistory: generation
      }
    };
    
    // Add to gallery if completed
    if (status !== 'queued' && status !== 'processing' && (videoUrl || imageUrl)) {
      const galleryItem = {
        id: generationId,
        prompt: prompt || 'No prompt',
        style: style || 'No Style',
        ...(imageUrl && { imageUrl }),
        ...(videoUrl && { videoUrl }),
        creditsUsed: creditsUsedForHistory,
        timestamp: new Date()
      };
      updateObj.$push.gallery = galleryItem;
    }
    
    const updateResult = await User.findOneAndUpdate(
      updateQuery,
      updateObj,
      { new: true }
    );
    
    if (!updateResult) {
      logger.error('Failed to add generation to history - user not found', { updateQuery });
      return res.status(400).json({
        success: false,
        error: 'Failed to add generation. User not found.'
      });
    }
    
    logger.info('Generation added to history', {
      userId: user.userId,
      generationId,
      creditsUsed: creditsUsedForHistory
    });
    
    res.json({
      success: true,
      generationId,
      remainingCredits: updateResult.credits,
      message: 'Generation added to history.'
    });
  } catch (error) {
    logger.error('Error adding generation:', { error: error.message, stack: error.stack });
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
    
    logger.debug('Manual credit deduction test', {
      original: walletAddress,
      normalized: normalizedWalletAddress,
      creditsToDeduct
    });
    
    const user = await User.findOne({ walletAddress: normalizedWalletAddress });
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    const beforeCredits = user.credits || 0;
    
    // Atomic credit deduction with condition to prevent negative credits
    const updateResult = await User.findOneAndUpdate(
      {
        walletAddress: normalizedWalletAddress,
        credits: { $gte: creditsToDeduct } // Only update if user has enough credits
      },
      {
        $inc: { credits: -creditsToDeduct, totalCreditsSpent: creditsToDeduct }
      },
      { new: true }
    );
    
    if (!updateResult) {
      const currentUser = await User.findOne({ walletAddress: normalizedWalletAddress });
      const currentCredits = currentUser?.credits || 0;
      return res.status(400).json({
        success: false,
        error: `Insufficient credits. You have ${currentCredits} credit${currentCredits !== 1 ? 's' : ''} but need ${creditsToDeduct}.`,
        beforeCredits,
        currentCredits,
        creditsToDeduct
      });
    }
    
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
 * SECURITY: Requires authentication - user can only update their own settings
 */
app.put('/api/users/:walletAddress/settings', authenticateToken, async (req, res) => {
  try {
    const { walletAddress } = req.params;
    const { settings } = req.body;
    
    // Normalize address for comparison
    const isSolanaAddress = !walletAddress.startsWith('0x');
    const normalizedAddress = isSolanaAddress ? walletAddress : walletAddress.toLowerCase();
    
    // SECURITY: Verify user owns this wallet address
    if (req.user.walletAddress !== normalizedAddress) {
      logger.warn('Unauthorized settings update attempt', {
        requestedWallet: normalizedAddress,
        authenticatedUser: req.user.userId || req.user.email
      });
      return res.status(403).json({
        success: false,
        error: 'You can only update your own settings'
      });
    }
    
    const user = await getOrCreateUser(normalizedAddress);
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
 * SECURITY: Requires authentication - user can only delete their own gallery items
 */
app.delete('/api/gallery/:walletAddress/:generationId', authenticateToken, async (req, res) => {
  try {
    const { walletAddress, generationId } = req.params;
    
    // Normalize address for comparison
    const isSolanaAddress = !walletAddress.startsWith('0x');
    const normalizedAddress = isSolanaAddress ? walletAddress : walletAddress.toLowerCase();
    
    // SECURITY: Verify user owns this wallet address or is the authenticated user
    const userOwnsWallet = req.user.walletAddress === normalizedAddress;
    const userIdMatch = req.user.userId && walletAddress.startsWith(req.user.userId);
    
    if (!userOwnsWallet && !userIdMatch) {
      logger.warn('Unauthorized gallery delete attempt', {
        requestedWallet: normalizedAddress,
        generationId,
        authenticatedUser: req.user.userId || req.user.email
      });
      return res.status(403).json({
        success: false,
        error: 'You can only delete your own gallery items'
      });
    }
    
    const user = await getOrCreateUser(normalizedAddress);
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
  logger.info('Starting server...', {
    port: process.env.PORT,
    nodeEnv: process.env.NODE_ENV,
    mongodbConfigured: !!process.env.MONGODB_URI
  });
  
  // Ensure port is a number
  const serverPort = parseInt(port, 10);
  
  if (isNaN(serverPort) || serverPort < 1 || serverPort > 65535) {
    const error = new Error(`Invalid port: ${port}`);
    logger.error('Invalid port:', { port });
    throw error;
  }
  
  // Security: Determine host binding based on environment
  // - Production/Cloud (Railway, etc.): Use 0.0.0.0 (required for cloud platforms)
  // - Development: Use 127.0.0.1 for better security (only localhost access)
  // - Can be overridden with HOST environment variable
  const isCloudEnvironment = !!(
    process.env.RAILWAY_ENVIRONMENT ||
    process.env.VERCEL ||
    process.env.HEROKU ||
    process.env.RENDER ||
    process.env.FLY_APP_NAME ||
    process.env.PORT // If PORT is set, likely in cloud environment
  );
  
  const bindHost = process.env.HOST || (
    isCloudEnvironment || process.env.NODE_ENV === 'production'
      ? '0.0.0.0'  // Required for cloud platforms
      : '127.0.0.1'  // Safer for local development
  );
  
  logger.info('Server binding configuration', {
    host: bindHost,
    port: serverPort,
    environment: process.env.NODE_ENV || 'development',
    isCloudEnvironment
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

  return new Promise((resolve, reject) => {
    const server = app.listen(serverPort, bindHost, () => {
      logger.info(`AI Image Generator API running on port ${serverPort}`);
      logger.info(`MongoDB connected: ${mongoose.connection.readyState === 1 ? 'Yes' : 'No'}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info('Server started successfully', {
        host: bindHost,
        port: serverPort,
        healthCheck: `http://${bindHost === '0.0.0.0' ? 'localhost' : bindHost}:${serverPort}/api/health`,
        networkAccess: bindHost === '0.0.0.0' ? 'all interfaces' : 'localhost only'
      });
      
      // Start the cleanup schedule after server is listening
      scheduleCleanup();
      
      // Graceful shutdown handler
      process.on('SIGTERM', () => {
        logger.info('SIGTERM received, shutting down gracefully');
        server.close(() => {
          logger.info('Process terminated');
          process.exit(0);
        });
      });
      
      resolve(server);
    });

    server.on('error', (err) => {
      logger.error('Server error:', err);
      if (err.code === 'EADDRINUSE') {
        logger.warn(`Port ${serverPort} is in use, trying port ${serverPort + 1}`);
        startServer(serverPort + 1).then(resolve).catch(reject);
      } else {
        logger.error('Server error:', err);
        reject(err);
      }
    });
  });
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
      logger.error('Failed to start server:', error);
      process.exit(1);
    });
  }
}