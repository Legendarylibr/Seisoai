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
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import logger from './utils/logger.js';

// ES module setup
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

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
      mediaSrc: ["'self'"],
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

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    
    // Dynamic port handling - allow any localhost port in development
    const isLocalhost = origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:');
    const isAllowedOrigin = process.env.ALLOWED_ORIGINS 
      ? process.env.ALLOWED_ORIGINS.split(',').includes(origin)
      : false;
    
    // In production, only allow whitelisted origins
    if (process.env.NODE_ENV === 'production') {
      if (isAllowedOrigin) {
        return callback(null, true);
      }
      // Reject unauthorized origin in production
      return callback(new Error('Not allowed by CORS'));
    }
    
    // In development, allow localhost only (more secure than allowing all)
    if (process.env.NODE_ENV !== 'production') {
      if (isLocalhost) {
        return callback(null, true);
      }
      // Also allow explicitly whitelisted origins in development
      if (isAllowedOrigin) {
        return callback(null, true);
      }
      // Reject non-localhost, non-whitelisted origins even in development
      return callback(new Error('Not allowed by CORS. Development mode only allows localhost and whitelisted origins.'));
    }
    
    // Log the rejected origin for debugging
    logger.warn('CORS rejected origin', { 
      origin, 
      allowedOrigins: process.env.ALLOWED_ORIGINS,
      nodeEnv: process.env.NODE_ENV 
    });
    
    // Fallback: if we get here, reject for safety
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200
};

// Apply CORS middleware - MUST be before routes
app.use(cors(corsOptions));

// Handle preflight requests explicitly for all routes
app.options('*', (req, res) => {
  const origin = req.headers.origin;
  
  // Use same origin validation logic as corsOptions
  let allowOrigin = false;
  if (!origin) {
    allowOrigin = true; // Allow requests with no origin
  } else {
    const isLocalhost = origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:');
    const isAllowedOrigin = process.env.ALLOWED_ORIGINS 
      ? process.env.ALLOWED_ORIGINS.split(',').includes(origin)
      : false;
    
    if (process.env.NODE_ENV === 'production') {
      allowOrigin = isAllowedOrigin;
    } else {
      allowOrigin = isLocalhost || isAllowedOrigin;
    }
  }
  
  if (allowOrigin) {
    res.header('Access-Control-Allow-Origin', origin || '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Max-Age', '86400'); // Cache preflight for 24 hours
    res.sendStatus(200);
  } else {
    res.status(403).json({ error: 'Not allowed by CORS' });
  }
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
          const baseRate = 5;
          
          // Subscription scaling based on amount
          let scalingMultiplier = 1.0;
          if (amount >= 100) {
            scalingMultiplier = 1.3; // 30% bonus for $100+
          } else if (amount >= 50) {
            scalingMultiplier = 1.2; // 20% bonus for $50-99
          } else if (amount >= 25) {
            scalingMultiplier = 1.1; // 10% bonus for $25-49
          } else if (amount >= 10) {
            scalingMultiplier = 1.05; // 5% bonus for $10-24
          }
          
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
            // Retrieve the subscription to get the amount
            const subscriptionId = session.subscription;
            if (subscriptionId) {
              const subscription = await stripe.subscriptions.retrieve(subscriptionId);
              const amount = subscription.items.data[0]?.price?.unit_amount || 0;
              const amountInDollars = amount / 100;

              // Use session ID as payment identifier to prevent duplicates
              const paymentId = `checkout_${session.id}`;
              
              if (!isPaymentAlreadyProcessed(user, null, paymentId)) {
                // Calculate credits using same formula
                const baseRate = 5;
                let scalingMultiplier = 1.0;
                if (amountInDollars >= 100) {
                  scalingMultiplier = 1.3;
                } else if (amountInDollars >= 50) {
                  scalingMultiplier = 1.2;
                } else if (amountInDollars >= 25) {
                  scalingMultiplier = 1.1;
                } else if (amountInDollars >= 10) {
                  scalingMultiplier = 1.05;
                }

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
                  credits: finalCredits
                });
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
              const baseRate = 5;
              let scalingMultiplier = 1.0;
              if (amountInDollars >= 100) {
                scalingMultiplier = 1.3;
              } else if (amountInDollars >= 50) {
                scalingMultiplier = 1.2;
              } else if (amountInDollars >= 25) {
                scalingMultiplier = 1.1;
              } else if (amountInDollars >= 10) {
                scalingMultiplier = 1.05;
              }

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
                credits: finalCredits
              });
            } else {
              logger.info('Subscription invoice already processed', {
                invoiceId: invoice.id
              });
            }
          } else {
            logger.warn('Could not find user for subscription invoice', {
              invoiceId: invoice.id,
              subscriptionId: invoice.subscription,
              customerId: customerId
            });
          }
        } catch (webhookError) {
          logger.error('Error processing subscription invoice webhook:', webhookError);
        }
      }
      break;

    default:
      logger.info(`Unhandled event type ${event.type}`);
  }

  res.json({received: true});
});

// Body parsing middleware - AFTER webhook route
// Increase JSON limit for image data URIs (can be large even after optimization)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files from parent dist directory (frontend build)
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));

// Proxy Veo3 Fast Image-to-Video to bypass browser CORS
const FAL_API_KEY = process.env.FAL_API_KEY || process.env.VITE_FAL_API_KEY;

/**
 * Upload image to fal.ai storage and return URL
 * Converts data URI to buffer and uploads via fal storage API
 * Uses multipart/form-data for file upload
 * Note: This endpoint should be placed BEFORE express.json() or use a larger limit
 */
app.post('/api/veo3/upload-image', async (req, res) => {
  try {
    if (!FAL_API_KEY) {
      return res.status(500).json({ success: false, error: 'FAL_API_KEY not configured' });
    }

    const { imageDataUri } = req.body;
    
    if (!imageDataUri || !imageDataUri.startsWith('data:')) {
      return res.status(400).json({ success: false, error: 'Invalid image data URI' });
    }

    // Convert data URI to buffer
    const base64Data = imageDataUri.split(',')[1];
    const buffer = Buffer.from(base64Data, 'base64');
    
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
    // Using the fal.ai file storage endpoint
    // According to docs, we can upload files and get URLs back
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
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: errorText.substring(0, 200) };
      }
      logger.error('FAL storage upload error', { status: uploadResponse.status, error: errorData });
      return res.status(uploadResponse.status).json({ success: false, error: errorData });
    }

    const uploadData = await uploadResponse.json();
    const imageUrl = uploadData.url || uploadData.file?.url || uploadData.data?.url;
    
    if (!imageUrl) {
      logger.error('No URL in fal storage response', { response: uploadData });
      return res.status(500).json({ success: false, error: 'Failed to get image URL from upload' });
    }

    logger.info('Image uploaded to fal storage', { imageUrl, size: buffer.length });
    res.json({ success: true, imageUrl });
  } catch (error) {
    logger.error('Image upload error', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: getSafeErrorMessage(error, 'Failed to upload image') });
  }
});

app.post('/api/veo3/submit', async (req, res) => {
  try {
    if (!FAL_API_KEY) {
      return res.status(500).json({ success: false, error: 'FAL_API_KEY not configured' });
    }
    const input = req.body?.input || req.body;
    
    // If image_url is a data URI, we should have uploaded it first
    // But if it somehow got here, log it and proceed (API might handle it)
    const imageUrl = input?.image_url || '';
    const isDataUri = imageUrl.startsWith('data:');
    
    if (isDataUri) {
      logger.warn('Data URI sent to veo3/submit - consider using upload-image endpoint first', {
        imageSizeKB: (imageUrl.length / 1024).toFixed(2)
      });
    }
    
    // Log payload size for debugging
    const payload = JSON.stringify({ input });
    const payloadSizeKB = (payload.length / 1024).toFixed(2);
    const imageSizeKB = isDataUri ? (imageUrl.length / 1024).toFixed(2) : 'N/A (URL)';
    
    logger.info('Veo3 submit request', {
      payloadSizeKB,
      imageSizeKB,
      hasImage: !!imageUrl,
      isDataUri,
      promptLength: input?.prompt?.length || 0
    });
    
    const response = await fetch('https://queue.fal.run/fal-ai/veo3/fast/image-to-video', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${FAL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: payload
    });
    
    // Handle response text first to avoid JSON parse errors
    const responseText = await response.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      logger.error('Failed to parse veo3 response', { 
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
      logger.error('Veo3 API error', { 
        status: response.status, 
        data,
        responseText: responseText.substring(0, 500)
      });
      return res.status(response.status).json({ success: false, ...data });
    }
    
    res.json({ success: true, ...data });
  } catch (error) {
    logger.error('Veo3 submit proxy error', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: getSafeErrorMessage(error, 'Failed to submit video generation request') });
  }
});

app.get('/api/veo3/status/:requestId', async (req, res) => {
  try {
    if (!FAL_API_KEY) {
      return res.status(500).json({ success: false, error: 'FAL_API_KEY not configured' });
    }
    const { requestId } = req.params;
    const url = `https://queue.fal.run/fal-ai/veo3/fast/image-to-video/requests/${requestId}/status`;
    
    let response;
    try {
      response = await fetch(url, { headers: { 'Authorization': `Key ${FAL_API_KEY}` }});
    } catch (fetchError) {
      logger.error('Veo3 status proxy fetch error', { 
        requestId, 
        error: fetchError.message, 
        stack: fetchError.stack 
      });
      return res.status(500).json({ success: false, error: `Network error: ${fetchError.message}` });
    }

    let data;
    let responseText = '';
    try {
      responseText = await response.text();
      data = responseText ? JSON.parse(responseText) : {};
    } catch (parseError) {
      logger.error('Veo3 status proxy parse error', { 
        requestId,
        status: response.status,
        responseText: responseText.substring(0, 200),
        error: parseError.message 
      });
      return res.status(response.status || 500).json({ 
        success: false, 
        error: `Invalid response from Veo3 API: ${parseError.message}` 
      });
    }

    if (!response.ok) {
      // If 404, the request ID might be invalid or expired
      if (response.status === 404) {
        logger.warn('Veo3 status request not found', { 
          requestId,
          status: response.status,
          message: 'Request ID may be invalid or expired'
        });
        return res.status(404).json({ 
          success: false, 
          error: 'Request ID not found. The video generation request may have expired or does not exist.',
          ...data 
        });
      }
      
      logger.warn('Veo3 status API error', { 
        requestId,
        status: response.status, 
        data 
      });
      return res.status(response.status).json({ success: false, ...data });
    }
    
    // Validate that we have status data
    if (!data || typeof data.status === 'undefined') {
      logger.warn('Veo3 status response missing status field', { 
        requestId,
        data 
      });
    }
    
    res.json({ success: true, ...data });
  } catch (error) {
    logger.error('Veo3 status proxy error', { 
      requestId: req.params.requestId,
      error: error.message, 
      stack: error.stack 
    });
    res.status(500).json({ success: false, error: getSafeErrorMessage(error, 'Failed to check video generation status') });
  }
});

app.get('/api/veo3/result/:requestId', async (req, res) => {
  try {
    if (!FAL_API_KEY) {
      return res.status(500).json({ success: false, error: 'FAL_API_KEY not configured' });
    }
    const { requestId } = req.params;
    const url = `https://queue.fal.run/fal-ai/veo3/fast/image-to-video/requests/${requestId}/result`;
    
    let response;
    try {
      response = await fetch(url, { headers: { 'Authorization': `Key ${FAL_API_KEY}` }});
    } catch (fetchError) {
      logger.error('Veo3 result proxy fetch error', { 
        requestId, 
        error: fetchError.message, 
        stack: fetchError.stack 
      });
      return res.status(500).json({ success: false, error: `Network error: ${fetchError.message}` });
    }

    let data;
    let responseText = '';
    try {
      responseText = await response.text();
      data = responseText ? JSON.parse(responseText) : {};
    } catch (parseError) {
      logger.error('Veo3 result proxy parse error', { 
        requestId,
        status: response.status,
        responseText: responseText.substring(0, 200),
        error: parseError.message 
      });
      return res.status(response.status || 500).json({ 
        success: false, 
        error: `Invalid response from Veo3 API: ${parseError.message}` 
      });
    }

    if (!response.ok) {
      // If 404, the request ID might be invalid or expired
      if (response.status === 404) {
        logger.warn('Veo3 result request not found', { 
          requestId,
          status: response.status,
          message: 'Request ID may be invalid or expired'
        });
        return res.status(404).json({ 
          success: false, 
          error: 'Request ID not found. The video generation request may have expired or does not exist.',
          ...data 
        });
      }
      
      logger.warn('Veo3 result API error', { 
        requestId,
        status: response.status, 
        data 
      });
      return res.status(response.status).json({ success: false, ...data });
    }
    
    res.json({ success: true, ...data });
  } catch (error) {
    logger.error('Veo3 result proxy error', { 
      requestId: req.params.requestId,
      error: error.message, 
      stack: error.stack 
    });
    res.status(500).json({ success: false, error: getSafeErrorMessage(error, 'Failed to retrieve video generation result') });
  }
});

// Validate required environment variables
const requiredEnvVars = ['MONGODB_URI', 'JWT_SECRET', 'SESSION_SECRET'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

// Optional but recommended variables for full functionality
const recommendedEnvVars = [
  'ETH_PAYMENT_WALLET',
  'POLYGON_PAYMENT_WALLET', 
  'ETH_RPC_URL',
  'POLYGON_RPC_URL',
  'STRIPE_SECRET_KEY'
];
const missingRecommended = recommendedEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  logger.error('Missing required environment variables:', { missingVars });
  // Don't exit in development, just warn
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  } else {
    logger.warn('Running in development mode with missing required environment variables');
  }
}

if (missingRecommended.length > 0) {
  logger.warn('Missing recommended environment variables (some features may not work):', { 
    missingRecommended,
    note: 'Payment features and blockchain verification may be limited'
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
  mongoose.connect(process.env.MONGODB_URI, mongoOptions);
} else {
  logger.warn('MONGODB_URI not provided, running without database');
}

// Create indexes for better performance
async function createIndexes() {
  try {
    if (mongoose.connection.readyState === 1) {
      // Create indexes for frequently queried fields (only if they don't exist)
      await User.collection.createIndex({ "walletAddress": 1 }, { background: true });
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
  logger.error('MongoDB connection error', { error: err.message });
  logger.warn('MongoDB connection failed - app will continue without database');
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
    imageUrl: String,
    creditsUsed: Number,
    timestamp: { type: Date, default: Date.now }
  }],
  gallery: [{
    id: String,
    imageUrl: String,
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
    // Generate userId from email hash
    const hash = crypto.createHash('sha256').update(this.email).digest('hex').substring(0, 16);
    this.userId = `email_${hash}`;
  }
  next();
});

const User = mongoose.model('User', userSchema);

// JWT Secret - use from env or default for development
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-here-32-chars-minimum-change-in-production';

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

// Payment wallet addresses - use single EVM address for all EVM chains
const EVM_PAYMENT_ADDRESS = process.env.EVM_PAYMENT_WALLET_ADDRESS || '0xa0aE05e2766A069923B2a51011F270aCadFf023a';
const PAYMENT_WALLETS = {
  '1': EVM_PAYMENT_ADDRESS, // Ethereum
  '137': EVM_PAYMENT_ADDRESS, // Polygon
  '42161': EVM_PAYMENT_ADDRESS, // Arbitrum
  '10': EVM_PAYMENT_ADDRESS, // Optimism
  '8453': EVM_PAYMENT_ADDRESS, // Base
  'solana': process.env.SOLANA_PAYMENT_WALLET_ADDRESS || process.env.SOLANA_PAYMENT_WALLET || 'CkhFmeUNxdr86SZEPg6bLgagFkRyaDMTmFzSVL69oadA'
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

// Helper function to add credits and payment history to user
const addCreditsToUser = async (user, {
  txHash,
  tokenSymbol,
  amount,
  credits,
  chainId,
  walletType,
  timestamp = new Date(),
  paymentIntentId = null
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
  
  user.paymentHistory.push(paymentEntry);
  await user.save();
  
  return paymentEntry;
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
    
    console.log(`[VERIFY] Found ${transferLogs.length} transfer event(s)`);
    
    let validTransfer = false;
    let actualAmount = 0;

    for (const log of transferLogs) {
      try {
        // Log raw log data for debugging
        console.log(`[VERIFY] Raw log:`, {
          address: log.address,
          topics: log.topics,
          data: log.data,
          blockNumber: log.blockNumber
        });
        
        const decoded = tokenContract.interface.parseLog(log);
        const from = decoded.args[0];
        const to = decoded.args[1];
        const value = decoded.args[2];
        
        console.log(`[VERIFY] Decoded transfer: from=${from}, to=${to}, value=${value.toString()}`);
        console.log(`[VERIFY] Checking: to===${paymentWallet.toLowerCase()} && from===${walletAddress.toLowerCase()}`);

        if (to.toLowerCase() === paymentWallet.toLowerCase() && 
            from.toLowerCase() === walletAddress.toLowerCase()) {
          validTransfer = true;
          actualAmount = parseFloat(ethers.formatUnits(value, tokenConfig.decimals));
          console.log(`[VERIFY] ✅ Valid transfer found! Amount: ${actualAmount}`);
          break;
        } else {
          console.log(`[VERIFY] Transfer doesn't match - to=${to}, from=${from}`);
        }
      } catch (e) {
        console.log(`[VERIFY] Error parsing log:`, e.message);
        console.log(`[VERIFY] Error stack:`, e.stack);
        continue;
      }
    }

    if (!validTransfer) {
      console.log(`[VERIFY] ❌ No valid transfer found. Payment wallet: ${paymentWallet}`);
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
 */
app.get('/api/health', async (req, res) => {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      port: process.env.PORT || 3001,
      version: '1.0.0'
    };
    
    // Return 200 for healthy, 503 for unhealthy
    const statusCode = health.database === 'connected' || process.env.NODE_ENV !== 'production' ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (error) {
    logger.error('Health check error:', error);
    res.status(500).json({
      status: 'unhealthy',
      error: getSafeErrorMessage(error, 'Health check failed'),
      timestamp: new Date().toISOString()
    });
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

// Root health check for Railway - simple and fast
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'Seiso AI Backend',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    port: process.env.PORT || 3001
  });
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
        walletAddress: user.walletAddress || null
      }
    });

  } catch (error) {
    logger.error('Sign up error:', error);
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
      freeCredits: isHolder ? 10 : 0
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
    console.log(`\n[${chain.toUpperCase()}] Starting check for ${token} transfers...`);
    console.log(`[${chain.toUpperCase()}] Looking for ANY transfers TO: ${paymentAddress}`);
    
    const provider = getProvider(chain);
    const tokenAddress = TOKEN_ADDRESSES[chain]?.[token];
    
    if (!tokenAddress) {
      console.log(`[${chain.toUpperCase()}] ⚠️  Token ${token} not supported on this chain`);
      return null;
    }
    
    console.log(`[${chain.toUpperCase()}] Token contract: ${tokenAddress}`);
    
    const contract = new ethers.Contract(tokenAddress, USDC_ABI, provider);
    const decimals = await contract.decimals();
    console.log(`[${chain.toUpperCase()}] Token decimals: ${decimals}`);
    
    // Get current block and check recent blocks for new transfers (reduced for performance)
    const currentBlock = await provider.getBlockNumber();
    const blocksToCheck = 20; // Check last 20 blocks for better performance
    const fromBlock = Math.max(0, currentBlock - blocksToCheck);
    
    console.log(`[${chain.toUpperCase()}] Scanning blocks ${fromBlock} to ${currentBlock} (${blocksToCheck} blocks)`);
    
    // Query Transfer events TO our payment address (second parameter is recipient)
    const filter = contract.filters.Transfer(null, paymentAddress);
    console.log(`[${chain.toUpperCase()}] Filter: Transfer(from: ANY, to: ${paymentAddress})`);
    
    const events = await contract.queryFilter(filter, fromBlock, currentBlock);
    
    console.log(`[${chain.toUpperCase()}] Found ${events.length} incoming transfer(s) to payment wallet`);
    console.log(`[${chain.toUpperCase()}] Blocks scanned: ${fromBlock} to ${currentBlock}`);
    
    if (events.length === 0) {
      console.log(`[${chain.toUpperCase()}] ✗ No transfers found to payment wallet in last ${blocksToCheck} blocks`);
      console.log(`[${chain.toUpperCase()}] Payment wallet address: ${paymentAddress}`);
      console.log(`[${chain.toUpperCase()}] USDC token address: ${tokenAddress}`);
      return null;
    }
    
    // Log all found transfers for debugging
    console.log(`[${chain.toUpperCase()}] DETAILED TRANSFER LOGS:`);
    for (const event of events) {
      const amount = event.args.value;
      const from = event.args.from;
      const to = event.args.to;
      const amountFormatted = ethers.formatUnits(amount, decimals);
      console.log(`[${chain.toUpperCase()}]   Transfer #${events.indexOf(event) + 1}:`);
      console.log(`[${chain.toUpperCase()}]     From: ${from}`);
      console.log(`[${chain.toUpperCase()}]     To: ${to}`);
      console.log(`[${chain.toUpperCase()}]     Amount: ${amountFormatted} USDC`);
      console.log(`[${chain.toUpperCase()}]     TxHash: ${event.transactionHash}`);
      console.log(`[${chain.toUpperCase()}]     Block: ${event.blockNumber}`);
      console.log(`[${chain.toUpperCase()}]     ---`);
    }
    
    // Get the most recent transfer (any amount to payment wallet qualifies)
    if (events.length > 0) {
      const event = events[events.length - 1]; // Most recent event
      const amount = event.args.value;
      const from = event.args.from;
      const to = event.args.to;
      const amountFormatted = ethers.formatUnits(amount, decimals);
      
      console.log(`[${chain.toUpperCase()}]   Found transfer to payment wallet:`);
      console.log(`[${chain.toUpperCase()}]     TxHash: ${event.transactionHash}`);
      console.log(`[${chain.toUpperCase()}]     From: ${from}`);
      console.log(`[${chain.toUpperCase()}]     To: ${to}`);
      console.log(`[${chain.toUpperCase()}]     Amount: ${amountFormatted} ${token}`);
      
      const block = await event.getBlock();
      console.log(`[${chain.toUpperCase()}]     Block: ${event.blockNumber}`);
      console.log(`[${chain.toUpperCase()}]     Timestamp: ${new Date(block.timestamp * 1000).toISOString()}`);
      
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
        console.log(`[SOLANA] Using RPC endpoint: ${rpcUrl}`);
        break;
      } catch (error) {
        console.log(`[SOLANA] Failed to connect to ${rpcUrl}: ${error.message}`);
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
    
    console.log(`[SOLANA] Found ${signatures.length} recent transaction(s)`);
    
    if (signatures.length === 0) {
      console.log(`[SOLANA] ✗ No recent transactions found`);
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
        
        console.log(`[SOLANA]   Checking tx ${sig.signature}...`);
        
        // Look for SPL Token transfers in the transaction
        const instructions = tx.transaction.message.instructions;
        
        for (const instruction of instructions) {
          // Check if it's a token transfer instruction
          if (instruction.program === 'spl-token' && instruction.parsed?.type === 'transfer') {
            const info = instruction.parsed.info;
            
            console.log(`[SOLANA]     Token transfer found:`);
            console.log(`[SOLANA]       From: ${info.source}`);
            console.log(`[SOLANA]       To: ${info.destination}`);
            console.log(`[SOLANA]       Authority: ${info.authority}`);
            
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
                
                console.log(`[SOLANA]       Token account owner: ${ownerAddress}`);
                
                if (ownerAddress === paymentAddress) {
                  // Get token account info to verify it's USDC
                  const amount = info.amount / 1e6; // USDC has 6 decimals
                  
                  console.log(`[SOLANA]       Amount: ${amount} USDC`);
                  
                  // Check if amount matches (within 1% tolerance) or if no expected amount specified
                  if (expectedAmount === null || expectedAmount === undefined) {
                    console.log(`[SOLANA]       No expected amount specified - accepting any USDC transfer`);
                    console.log(`[SOLANA]     ✓ MATCH FOUND!`);
                    console.log(`[SOLANA]       TxHash: ${sig.signature}`);
                    console.log(`[SOLANA]       Timestamp: ${new Date(sig.blockTime * 1000).toISOString()}`);
                    
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
                  console.log(`[SOLANA]       Expected: ${expectedAmount} ± ${tolerance}`);
                  
                  if (amount >= expectedAmount - tolerance && amount <= expectedAmount + tolerance) {
                    console.log(`[SOLANA]     ✓ MATCH FOUND!`);
                    console.log(`[SOLANA]       TxHash: ${sig.signature}`);
                    console.log(`[SOLANA]       Timestamp: ${new Date(sig.blockTime * 1000).toISOString()}`);
                    
                    return {
                      found: true,
                      txHash: sig.signature,
                      from: info.authority,
                      amount: amount.toString(),
                      timestamp: sig.blockTime,
                      chain: 'solana',
                      token: 'USDC'
                    };
                  } else {
                    console.log(`[SOLANA]       ✗ Amount doesn't match`);
                  }
                } else {
                  console.log(`[SOLANA]       ✗ Not to our payment address`);
                }
              }
            } catch (accountError) {
              console.log(`[SOLANA]       ✗ Error checking token account: ${accountError.message}`);
            }
          }
        }
      } catch (txError) {
        console.error(`[SOLANA] ⚠️  Error parsing transaction ${sig.signature}:`, txError.message);
        continue;
      }
    }
    
    console.log(`[SOLANA] ✗ No matching payments found`);
    return null;
  } catch (error) {
    console.error('[SOLANA] ❌ Error:', error.message);
    if (error.stack) {
      console.error('[SOLANA] Stack:', error.stack);
    }
    return null;
  }
}

/**
 * Check for payment - monitors blockchain for incoming payments
 */
app.post('/api/payment/check-payment', async (req, res) => {
  try {
    const { walletAddress, expectedAmount, token = 'USDC' } = req.body;
    
    console.log('='.repeat(80));
    console.log('[PAYMENT CHECK] Starting payment check...');
    console.log('[PAYMENT CHECK] Request body:', JSON.stringify(req.body, null, 2));
    
    if (!walletAddress || !expectedAmount) {
      console.log('[ERROR] Missing required fields - walletAddress or expectedAmount');
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }
    
    const evmPaymentAddress = EVM_PAYMENT_ADDRESS;
    const solanaPaymentAddress = PAYMENT_WALLETS['solana'];
    
    console.log(`[PAYMENT CHECK] Configuration:`);
    console.log(`  - User wallet: ${walletAddress}`);
    console.log(`  - Expected amount: ${expectedAmount} ${token}`);
    console.log(`  - EVM Payment wallet: ${evmPaymentAddress}`);
    console.log(`  - Solana Payment wallet: ${solanaPaymentAddress}`);
    console.log(`[PAYMENT CHECK] Searching for payments TO payment wallet (not FROM user wallet)`);
    console.log('-'.repeat(80));
    
    // Check multiple chains in parallel (EVM + Solana)
    const evmChains = ['ethereum', 'polygon', 'arbitrum', 'optimism', 'base'];
    console.log(`[PAYMENT CHECK] Checking ${evmChains.length} EVM chains + Solana...`);
    
    const evmPromises = evmChains.map(chain => 
      Promise.race([
        checkForTokenTransfer(evmPaymentAddress, token, chain),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
      ]).catch(err => {
        console.log(`[WARN] ${chain} check failed:`, err.message);
        return null;
      })
    );
    
    // Also check Solana with its own payment address
    const solanaPromise = Promise.race([
      checkForSolanaUSDC(solanaPaymentAddress, expectedAmount),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
    ]).catch(err => {
      console.log(`[WARN] Solana check failed:`, err.message);
      return null;
    });
    
    const allPromises = [...evmPromises, solanaPromise];
    const results = await Promise.all(allPromises);
    
    console.log(`[PAYMENT CHECK] Search completed. Results:`);
    results.forEach((result, idx) => {
      const chainName = idx < evmChains.length ? evmChains[idx] : 'solana';
      if (result && result.found) {
        console.log(`  ✓ ${chainName}: PAYMENT FOUND!`);
      } else {
        console.log(`  ✗ ${chainName}: No matching payment`);
      }
    });
    
    const payment = results.find(r => r && r.found);
    
    if (payment) {
      console.log(`[SUCCESS] Payment detected on ${payment.chain}!`);
      console.log(`[SUCCESS] Payment details:`, JSON.stringify(payment, null, 2));
      
      // Get the sender's wallet address from the blockchain event (the actual person who sent USDC)
      const senderAddress = payment.from;
      
      // Process payment for the actual sender
      const user = await getOrCreateUser(senderAddress);
      
      // Middleware should have caught duplicates, but double-check for safety
      if (isPaymentAlreadyProcessed(user, payment.txHash)) {
        console.log(`[INFO] Payment ${payment.txHash} already processed for ${senderAddress}`);
        console.log('='.repeat(80));
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
          console.log(`[NFT] User ${senderAddress} is NFT holder - applying 16.67 credits/USDC rate`);
        } else {
          updatedUser = await User.findOneAndUpdate(
            { walletAddress: user.walletAddress },
            { $set: { nftCollections: [] } },
            { new: true }
          );
          isNFTHolder = false;
          console.log(`[NFT] User ${senderAddress} is not NFT holder - applying standard 6.67 credits/USDC rate`);
        }
      } catch (nftError) {
        console.warn(`[NFT] Error checking NFT holdings for ${senderAddress}, using database state:`, nftError.message);
        isNFTHolder = user.nftCollections && user.nftCollections.length > 0;
      }
      
      const creditsPerUSDC = isNFTHolder ? 16.67 : STANDARD_CREDITS_PER_USDC;
      
      // Calculate credits
      const creditsToAdd = calculateCreditsFromAmount(payment.amount, creditsPerUSDC);
      
      console.log(`[CREDIT] Adding ${creditsToAdd} credits to user ${senderAddress}`);
      console.log(`[CREDIT] Previous balance: ${updatedUser.credits} credits`);
      
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
      console.log(`[SUCCESS] New balance: ${finalUser.credits} credits`);
      console.log('='.repeat(80));
      
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
    console.log(`[INFO] No matching payments found on any chain`);
    console.log('='.repeat(80));
    res.json({
      success: true,
      paymentDetected: false,
      message: 'Payment not detected yet. Please wait for blockchain confirmation.'
    });
    
  } catch (error) {
    console.error('[ERROR] Check payment error:', error);
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

    console.log('💰 [PAYMENT CREDIT] Starting immediate credit...');
    console.log('💰 [PAYMENT CREDIT] Request:', { txHash, walletAddress, tokenSymbol, amount, chainId, walletType });

    if (!txHash || !walletAddress || !amount) {
      console.log('💰 [PAYMENT CREDIT] Missing fields');
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }

    // Middleware should have caught duplicates, but double-check for safety
    const user = await getOrCreateUser(walletAddress);
    
    if (isPaymentAlreadyProcessed(user, txHash)) {
      console.log('💰 [PAYMENT CREDIT] Already processed');
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
        console.log('💰 [PAYMENT CREDIT] ✅ NFT HOLDER DETECTED - applying 16.67 credits/USDC rate (NFT holder discount)');
      } else {
        updatedUser = await User.findOneAndUpdate(
          { walletAddress: user.walletAddress },
          { $set: { nftCollections: [] } },
          { new: true }
        );
        isNFTHolder = false;
        console.log('💰 [PAYMENT CREDIT] ❌ Not NFT holder - applying standard 6.67 credits/USDC rate');
      }
    } catch (nftError) {
      console.warn('💰 [PAYMENT CREDIT] ⚠️ Error checking NFT holdings, using database state:', nftError.message);
      isNFTHolder = user.nftCollections && user.nftCollections.length > 0;
      if (isNFTHolder) {
        console.log('💰 [PAYMENT CREDIT] Using cached NFT holder status - applying 16.67 credits/USDC rate');
      }
    }

    const creditsPerUSDC = isNFTHolder ? 16.67 : STANDARD_CREDITS_PER_USDC;
    
    // Credit immediately based on signature (no verification)
    const creditsToAdd = calculateCreditsFromAmount(amount, creditsPerUSDC);
    
    console.log('💰 [PAYMENT CREDIT] Calculating credits', {
      walletAddress: updatedUser.walletAddress,
      walletType: walletType || 'evm',
      amount: parseFloat(amount),
      creditsPerUSDC: creditsPerUSDC,
      isNFTHolder: isNFTHolder,
      creditsToAdd,
      expectedCredits: parseFloat(amount) * creditsPerUSDC
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
    console.log('💰 [PAYMENT CREDIT] Credits added successfully', {
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
    console.error('💰 [PAYMENT CREDIT] Error:', error);
    logger.error('Payment credit error:', error);
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

    console.log('💰 [PAYMENT VERIFY] Starting verification...');
    console.log('💰 [PAYMENT VERIFY] Request:', { txHash, walletAddress, tokenSymbol, amount, chainId, walletType });

    if (!txHash || !walletAddress || !tokenSymbol || !amount || !chainId || !walletType) {
      console.log('💰 [PAYMENT VERIFY] Missing fields');
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }

    // Middleware should have caught duplicates, but double-check for safety
    const user = await getOrCreateUser(walletAddress);
    
    if (isPaymentAlreadyProcessed(user, txHash)) {
      console.log('💰 [PAYMENT VERIFY] Already processed');
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
        console.log('💰 [PAYMENT VERIFY] User is NFT holder - applying 16.67 credits/USDC rate');
      } else {
        updatedUser = await User.findOneAndUpdate(
          { walletAddress: user.walletAddress },
          { $set: { nftCollections: [] } },
          { new: true }
        );
        isNFTHolder = false;
        console.log('💰 [PAYMENT VERIFY] User is not NFT holder - applying standard 6.67 credits/USDC rate');
      }
    } catch (nftError) {
      console.warn('💰 [PAYMENT VERIFY] Error checking NFT holdings, using database state:', nftError.message);
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
      console.log('💰 [PAYMENT VERIFY] Calling verifyEVMPayment...');
      verification = await verifyEVMPayment(txHash, walletAddress, tokenSymbol, amount, chainId);
      console.log('💰 [PAYMENT VERIFY] Verification result:', verification);
      
      // Recalculate credits based on NFT holder status if verification succeeded
      if (verification.success && verification.actualAmount) {
        verification.credits = calculateCreditsFromAmount(verification.actualAmount, creditsPerUSDC);
        console.log('💰 [PAYMENT VERIFY] Recalculated credits for NFT holder:', {
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

    // Calculate credits using same formula as frontend (50 credits for $15 base rate with scaling)
    const amount = paymentIntent.amount / 100; // Convert from cents
    
    // Base rate: 50 credits for $15 = 3.333 credits per dollar
    const baseRate = 50 / 15; // 3.333 credits per dollar
    
    // Subscription scaling based on amount (monthly recurring)
    let scalingMultiplier = 1.0;
    if (amount >= 100) {
      scalingMultiplier = 1.3; // 30% bonus for $100+ (4.33 credits/dollar)
    } else if (amount >= 50) {
      scalingMultiplier = 1.2; // 20% bonus for $50-99 (4 credits/dollar)
    } else if (amount >= 25) {
      scalingMultiplier = 1.1; // 10% bonus for $25-49 (3.67 credits/dollar)
    }
    // $15: 3.333 credits/dollar (no bonus) = 50 credits
    
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
    const baseUrl = process.env.FRONTEND_URL || 
                   (req.headers.origin || `http://${req.headers.host}`);

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
        userId: user._id.toString(),
        walletAddress: user.walletAddress ? user.walletAddress.toLowerCase() : '',
        email: user.email || '',
      },
      subscription_data: {
        metadata: {
          userId: user._id.toString(),
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
        
        // Check if user is NFT holder for pricing
        const isNFTHolder = user.nftCollections && user.nftCollections.length > 0;
        const creditsPerUSDC = isNFTHolder ? 16.67 : STANDARD_CREDITS_PER_USDC;
        
        // Calculate credits
        const creditsToAdd = calculateCreditsFromAmount(quickPayment.amount, creditsPerUSDC);
        
        // Add credits using helper function
        await addCreditsToUser(user, {
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
      
      // Calculate credits
      const creditsToAdd = calculateCreditsFromAmount(quickPayment.amount);
      
      // Add credits using helper function
      await addCreditsToUser(user, {
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
    console.log('📥 [GENERATION ADD] Request received:', {
      body: req.body,
      walletAddress: req.body?.walletAddress,
      hasImageUrl: !!req.body?.imageUrl,
      creditsUsed: req.body?.creditsUsed
    });

    const { 
      walletAddress, 
      prompt, 
      style, 
      imageUrl, 
      creditsUsed 
    } = req.body;

    if (!walletAddress || !imageUrl) {
      console.error('❌ [GENERATION ADD] Missing required fields:', { walletAddress: !!walletAddress, imageUrl: !!imageUrl });
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: walletAddress and imageUrl are required'
      });
    }

    // Normalize wallet address to match database storage
    const isSolanaAddress = !walletAddress.startsWith('0x');
    const normalizedWalletAddress = isSolanaAddress ? walletAddress : walletAddress.toLowerCase();
    
    console.log('🔍 [GENERATION ADD] Getting user:', {
      originalWalletAddress: walletAddress,
      normalizedWalletAddress: normalizedWalletAddress,
      isSolana: isSolanaAddress
    });
    
    const user = await getOrCreateUser(normalizedWalletAddress);
    console.log('👤 [GENERATION ADD] User found:', {
      walletAddress: user.walletAddress,
      credits: user.credits,
      totalCreditsEarned: user.totalCreditsEarned,
      totalCreditsSpent: user.totalCreditsSpent,
      matchesNormalized: user.walletAddress === normalizedWalletAddress
    });
    
    // Check credits directly - credits is the spendable balance
    // totalCreditsEarned is a lifetime total for tracking, not for spending
    const availableCredits = user.credits || 0;
    const creditsToDeduct = creditsUsed || 1; // Default to 1 credit if not specified
    
    logger.debug('Checking credits for generation', {
      walletAddress: normalizedWalletAddress,
      credits: user.credits,
      totalCreditsEarned: user.totalCreditsEarned,
      availableCredits,
      creditsToDeduct
    });
    
    // Check if user has enough credits
    if (availableCredits < creditsToDeduct) {
      logger.warn('Insufficient credits for generation', {
        walletAddress: normalizedWalletAddress,
        availableCredits,
        creditsToDeduct,
        totalCreditsEarned: user.totalCreditsEarned
      });
      return res.status(400).json({
        success: false,
        error: `Insufficient credits. You have ${availableCredits} credits but need ${creditsToDeduct}`
      });
    }

    // Deduct credits and add generation in a SINGLE atomic operation to prevent conflicts
    const previousCredits = user.credits || 0;
    const previousTotalSpent = user.totalCreditsSpent || 0;
    
    console.log('💰 [GENERATION ADD] Before deduction:', {
      previousCredits,
      previousTotalSpent,
      creditsToDeduct,
      availableCredits,
      userWalletAddress: user.walletAddress
    });
    
    // Create generation object
    const generationId = `gen_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const generation = {
      id: generationId,
      prompt: prompt || 'No prompt',
      style: style || 'No Style',
      imageUrl,
      creditsUsed: creditsToDeduct,
      timestamp: new Date()
    };
    
    // Use atomic update to do BOTH credit deduction AND add generation in one operation
    // This prevents race conditions and ensures credits are always deducted
    // DO NOT call user.save() after this - it would overwrite the atomic update!
    console.log('🔧 [GENERATION ADD] Executing atomic update with:', {
      walletAddress: normalizedWalletAddress,
      creditsToDeduct,
      hasGeneration: !!generation,
      updateOperation: {
        $inc: { credits: -creditsToDeduct, totalCreditsSpent: creditsToDeduct },
        $push: { generationHistory: generation, gallery: generation }
      }
    });
    
    const updateResult = await User.findOneAndUpdate(
      { walletAddress: normalizedWalletAddress },
      {
        $inc: { 
          credits: -creditsToDeduct,
          totalCreditsSpent: creditsToDeduct
        },
        $push: {
          generationHistory: generation,
          gallery: generation
        }
      },
      { new: true }
    );
    
    console.log('🔧 [GENERATION ADD] Atomic update result:', {
      found: !!updateResult,
      returnedCredits: updateResult?.credits,
      returnedTotalSpent: updateResult?.totalCreditsSpent,
      generationHistoryLength: updateResult?.generationHistory?.length,
      galleryLength: updateResult?.gallery?.length
    });
    
    if (!updateResult) {
      console.error('❌ [GENERATION ADD] Failed to update user - user not found:', normalizedWalletAddress);
      // Try to find the user to see if it exists
      const checkUser = await User.findOne({ walletAddress: normalizedWalletAddress });
      console.error('❌ [GENERATION ADD] User check:', {
        exists: !!checkUser,
        foundWalletAddress: checkUser?.walletAddress,
        searchedFor: normalizedWalletAddress,
        match: checkUser?.walletAddress === normalizedWalletAddress
      });
      throw new Error(`Failed to update user credits. User ${normalizedWalletAddress} not found in database.`);
    }
    
    // Ensure credits don't go negative (shouldn't happen due to availableCredits check, but safety)
    if (updateResult.credits < 0) {
      console.warn('⚠️ [GENERATION ADD] Credits went negative, correcting to 0');
      await User.findOneAndUpdate(
        { walletAddress: normalizedWalletAddress },
        { $set: { credits: 0 } },
        { new: true }
      );
      updateResult.credits = 0;
    }
    
    console.log('✅ [GENERATION ADD] Atomic update completed:', {
      newCredits: updateResult.credits,
      newTotalSpent: updateResult.totalCreditsSpent,
      generationId,
      previousCredits,
      creditsDeducted: creditsToDeduct
    });
    
    // Refetch to verify everything saved correctly
    const savedUser = await User.findOne({ walletAddress: normalizedWalletAddress });
    console.log('✅ [GENERATION ADD] Verified saved credits:', {
      savedCredits: savedUser?.credits,
      savedTotalSpent: savedUser?.totalCreditsSpent,
      generationHistoryCount: savedUser?.generationHistory?.length,
      galleryCount: savedUser?.gallery?.length,
      matchExpected: savedUser?.credits === updateResult.credits,
      creditsActuallyDeducted: previousCredits - (savedUser?.credits || 0)
    });
    
    // Use updateResult for response
    const finalCredits = updateResult.credits;
    
    logger.info('Generation added to history and credits deducted', {
      walletAddress: walletAddress.toLowerCase(),
      generationId,
      creditsUsed: creditsToDeduct,
      previousCredits,
      newCredits: finalCredits,
      savedCredits: savedUser?.credits,
      totalCreditsSpent: updateResult.totalCreditsSpent,
      creditsActuallyDeducted: previousCredits - finalCredits
    });
    
    res.json({
      success: true,
      generationId,
      remainingCredits: finalCredits,
      creditsDeducted: creditsToDeduct,
      previousCredits: previousCredits,
      message: `Generation added to history. ${creditsToDeduct} credit(s) deducted. Remaining: ${finalCredits} credits.`
    });
  } catch (error) {
    console.error('❌ [GENERATION ADD] ERROR:', error);
    console.error('❌ [GENERATION ADD] Error stack:', error.stack);
    logger.error('Error adding generation:', error);
    res.status(500).json({ success: false, error: getSafeErrorMessage(error, 'Failed to add generation') });
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
app.get('/api/gallery/:walletAddress', async (req, res) => {
  try {
    const { walletAddress } = req.params;
    const { page = 1, limit = 20 } = req.query;
    
    const user = await getOrCreateUser(walletAddress);
    
    // Filter gallery to last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentGallery = user.gallery.filter(item => 
      new Date(item.timestamp) >= thirtyDaysAgo
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


// Global error handler
app.use((error, req, res, next) => {
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
  
  const server = app.listen(serverPort, '0.0.0.0', () => {
    logger.info(`AI Image Generator API running on port ${serverPort}`);
    logger.info(`MongoDB connected: ${mongoose.connection.readyState === 1 ? 'Yes' : 'No'}`);
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`✅ Server started successfully on port ${serverPort}`);
    console.log(`🌐 Health check: http://localhost:${serverPort}/api/health`);
  });

  server.on('error', (err) => {
    console.error('❌ Server error:', err);
    if (err.code === 'EADDRINUSE') {
      logger.warn(`Port ${serverPort} is in use, trying port ${serverPort + 1}`);
      startServer(serverPort + 1);
    } else {
      logger.error('Server error:', err);
      process.exit(1);
    }
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
if (process.argv[1] && process.argv[1].includes('server.js')) {
  startServer();
}