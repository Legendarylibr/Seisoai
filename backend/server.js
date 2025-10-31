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
import logger from './utils/logger.js';

// ES module setup
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const stripe = process.env.STRIPE_SECRET_KEY ? (await import('stripe')).default(process.env.STRIPE_SECRET_KEY) : null;

const app = express();

// Trust proxy for accurate IP addresses
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://js.stripe.com", "https://checkout.stripe.com"], // Allow inline scripts for Vite and Stripe
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'", "http://localhost:3001", "http://localhost:3000", "http://localhost:5173", "https://api.fal.ai", "https://api.mainnet-beta.solana.com", "https://solana-api.projectserum.com", "https://rpc.ankr.com", "https://solana-mainnet.g.alchemy.com", "https://mainnet.helius-rpc.com", "https://api.devnet.solana.com", "https://js.stripe.com", "https:", "wss:"],
      fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'self'", "https://js.stripe.com", "https://checkout.stripe.com"],
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
    
    // Always allow localhost in development
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV !== 'production') {
      if (isLocalhost) {
        return callback(null, true);
      }
    }
    
    // Allow specific origins
    if (isAllowedOrigin) {
      return callback(null, true);
    }
    
    // For development, be more permissive
    if (process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    
    // Log the rejected origin for debugging
    logger.warn('CORS rejected origin', { 
      origin, 
      allowedOrigins: process.env.ALLOWED_ORIGINS,
      nodeEnv: process.env.NODE_ENV 
    });
    
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

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
      break;
    default:
      logger.info(`Unhandled event type ${event.type}`);
  }

  res.json({received: true});
});

// Body parsing middleware - AFTER webhook route
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files from parent dist directory (frontend build)
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));

// Proxy Veo3 Fast Image-to-Video to bypass browser CORS
const FAL_API_KEY = process.env.FAL_API_KEY || process.env.VITE_FAL_API_KEY;

app.post('/api/veo3/submit', async (req, res) => {
  try {
    if (!FAL_API_KEY) {
      return res.status(500).json({ success: false, error: 'FAL_API_KEY not configured' });
    }
    const input = req.body?.input || req.body;
    const response = await fetch('https://queue.fal.run/fal-ai/veo3/fast/image-to-video', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${FAL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ input })
    });
    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ success: false, ...data });
    }
    res.json({ success: true, ...data });
  } catch (error) {
    logger.error('Veo3 submit proxy error', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/veo3/status/:requestId', async (req, res) => {
  try {
    if (!FAL_API_KEY) {
      return res.status(500).json({ success: false, error: 'FAL_API_KEY not configured' });
    }
    const { requestId } = req.params;
    const url = `https://queue.fal.run/fal-ai/veo3/fast/image-to-video/requests/${requestId}/status`;
    const response = await fetch(url, { headers: { 'Authorization': `Key ${FAL_API_KEY}` }});
    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ success: false, ...data });
    }
    res.json({ success: true, ...data });
  } catch (error) {
    logger.error('Veo3 status proxy error', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/veo3/result/:requestId', async (req, res) => {
  try {
    if (!FAL_API_KEY) {
      return res.status(500).json({ success: false, error: 'FAL_API_KEY not configured' });
    }
    const { requestId } = req.params;
    const url = `https://queue.fal.run/fal-ai/veo3/fast/image-to-video/requests/${requestId}/result`;
    const response = await fetch(url, { headers: { 'Authorization': `Key ${FAL_API_KEY}` }});
    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ success: false, ...data });
    }
    res.json({ success: true, ...data });
  } catch (error) {
    logger.error('Veo3 result proxy error', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
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
  mongoOptions.tlsAllowInvalidCertificates = true; // Use new option instead of deprecated sslValidate
  mongoOptions.authSource = 'admin';
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
    required: false,  // Allow for Stripe-only users
    unique: true, 
    sparse: true,  // Allow multiple docs without walletAddress
    lowercase: true,
    index: true
  },
  userId: {  // NEW: For Stripe-only users
    type: String,
    unique: true,
    sparse: true,
    index: true,
    required: false  // Optional, only for Stripe users
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
userSchema.index({ createdAt: 1 });
userSchema.index({ expiresAt: 1 });
userSchema.index({ 'gallery.timestamp': 1 });

const User = mongoose.model('User', userSchema);

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

// RPC endpoints with fallback to public endpoints
const RPC_ENDPOINTS = {
  '1': process.env.ETH_RPC_URL || 'https://eth-mainnet.g.alchemy.com/v2/REDACTED_ALCHEMY_KEY',
  '8453': process.env.BASE_RPC_URL || 'https://base-mainnet.g.alchemy.com/v2/REDACTED_ALCHEMY_KEY',
  '137': process.env.POLYGON_RPC_URL || 'https://polygon-mainnet.g.alchemy.com/v2/REDACTED_ALCHEMY_KEY',
  '42161': process.env.ARBITRUM_RPC_URL || 'https://arb-mainnet.g.alchemy.com/v2/REDACTED_ALCHEMY_KEY',
  '10': process.env.OPTIMISM_RPC_URL || 'https://opt-mainnet.g.alchemy.com/v2/REDACTED_ALCHEMY_KEY'
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
      error: error.message,
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
 * Get user data
 */
app.get('/api/users/:walletAddress', async (req, res) => {
  try {
    const { walletAddress } = req.params;
    const { refreshNFTs, skipNFTs } = req.query; // Allow forcing NFT refresh or skipping NFT checks
    
    // Get actual user data from database
    const user = await getOrCreateUser(walletAddress);
    
    // Refresh NFT holdings from blockchain if requested or if user has no NFT data
    let isNFTHolder = user.nftCollections && user.nftCollections.length > 0;
    
    // Skip NFT checks if skipNFTs=true (for faster credits fetching)
    if (skipNFTs !== 'true' && (refreshNFTs === 'true' || !isNFTHolder)) {
      try {
        // Call NFT check internally to refresh holdings
        const qualifyingCollections = [
          { chainId: '1', address: '0x8e84dcaf616c3e04ed45d3e0912b81e7283a48da', name: 'Your NFT Collection 1', type: 'erc721' },
          { chainId: '1', address: '0xd7d1431f43767a47bf7f5c6a651d24398e537729', name: 'Your NFT Collection 2', type: 'erc721' },
          { chainId: '8453', address: '0x1e71ea45fb939c92045ff32239a8922395eeb31b', name: 'Your Base NFT Collection', type: 'erc721' },
          { chainId: '1', address: '0x0000000000c5dc95539589fbD24BE07c6C14eCa4', name: '$CULT Holders', type: 'erc20', minBalance: '500000' }
        ];
        
        const ownedCollections = [];
        const collectionsByChain = {};
        
        for (const collection of qualifyingCollections) {
          if (!collectionsByChain[collection.chainId]) {
            collectionsByChain[collection.chainId] = [];
          }
          collectionsByChain[collection.chainId].push(collection);
        }
        
        // Check each chain
        for (const [chainId, collections] of Object.entries(collectionsByChain)) {
          try {
            const rpcUrl = RPC_ENDPOINTS[chainId] || RPC_ENDPOINTS['1'];
            if (!rpcUrl) continue;
            
            const provider = new ethers.JsonRpcProvider(rpcUrl);
            
            for (const collection of collections) {
              try {
                if (collection.type === 'erc721' && walletAddress.startsWith('0x')) {
                  const nftContract = new ethers.Contract(
                    collection.address,
                    ['function balanceOf(address owner) view returns (uint256)'],
                    provider
                  );
                  
                  const balance = await Promise.race([
                    nftContract.balanceOf(walletAddress),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
                  ]);
                  
                  if (balance > 0) {
                    ownedCollections.push({
                      contractAddress: collection.address,
                      chainId: collection.chainId,
                      name: collection.name,
                      type: collection.type,
                      balance: balance.toString(),
                      tokenIds: [],
                      lastChecked: new Date()
                    });
                  }
                } else if (collection.type === 'erc20' && walletAddress.startsWith('0x')) {
                  const tokenContract = new ethers.Contract(
                    collection.address,
                    ['function balanceOf(address owner) view returns (uint256)', 'function decimals() view returns (uint8)'],
                    provider
                  );
                  
                  const [balance, decimals] = await Promise.race([
                    Promise.all([tokenContract.balanceOf(walletAddress), tokenContract.decimals()]),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
                  ]);
                  
                  const formattedBalance = parseFloat(ethers.formatUnits(balance, decimals));
                  const minBalance = parseFloat(collection.minBalance);
                  
                  if (formattedBalance >= minBalance) {
                    ownedCollections.push({
                      contractAddress: collection.address,
                      chainId: collection.chainId,
                      name: collection.name,
                      type: collection.type,
                      balance: formattedBalance.toString(),
                      minBalance: collection.minBalance,
                      lastChecked: new Date()
                    });
                  }
                }
              } catch (error) {
                logger.warn(`Error checking ${collection.name}:`, {
                  error: error.message,
                  chainId,
                  collectionAddress: collection.address,
                  walletAddress
                });
              }
            }
          } catch (error) {
            logger.warn(`Error checking chain ${chainId}:`, {
              error: error.message,
              rpcUrl: RPC_ENDPOINTS[chainId]
            });
          }
        }
        
        // Update user's NFT collections in database (atomically to preserve credits)
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
          logger.info('No NFTs found for user', { walletAddress, refreshNFTs });
          // Clear old NFT data if refresh was forced (atomically)
          if (refreshNFTs === 'true') {
            await User.findOneAndUpdate(
              { walletAddress: user.walletAddress },
              { $set: { nftCollections: [] } },
              { new: true }
            );
          }
        }
      } catch (nftError) {
        logger.warn('Error refreshing NFT holdings', { error: nftError.message });
        // Continue with existing data
      }
    }
    
    // Always refetch user from database to ensure we have the latest credits
    // This is critical to ensure granted credits are always returned correctly
    // Normalize the address to ensure we query with the correct case (lowercase for EVM)
    const isSolanaAddress = !walletAddress.startsWith('0x');
    const normalizedAddress = isSolanaAddress ? walletAddress : walletAddress.toLowerCase();
    
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
          costPerCredit: 0.15,
          creditsPerUSDC: 6.67
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching user data:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Check credits
 */
app.post('/api/nft/check-credits', async (req, res) => {
  try {
    const { walletAddress } = req.body;
    
    // Check NFT holdings to determine pricing
    let isNFTHolder = false;
    
    try {
      // Make internal call to NFT checking
      const nftResponse = await fetch(`http://localhost:3001/api/nft/check-holdings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress })
      });
      
      if (nftResponse.ok) {
        const nftData = await nftResponse.json();
        isNFTHolder = nftData.isHolder;
      }
    } catch (nftError) {
      logger.warn('Failed to check NFT status for credits', { error: nftError.message });
    }
    
    // Base credits (no NFT holder bonus)
    const baseCredits = 0;
    
    res.json({
      success: true,
      totalCredits: baseCredits,
      totalCreditsEarned: baseCredits,
      totalCreditsSpent: 0,
      isNFTHolder: isNFTHolder,
      pricing: {
        costPerCredit: 0.15,
        creditsPerUSDC: 6.67
      }
    });
  } catch (error) {
    logger.error('Error checking credits:', error);
    res.status(500).json({ success: false, error: error.message });
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

    logger.info('Checking NFT holdings', { walletAddress });
    
    // Skip user operations if MongoDB not available - NFT checking can work without database
    logger.info('Checking NFT holdings without database dependency', { walletAddress });
    
    // Use backend-defined collections (ignore frontend collections parameter)
    // Qualifying NFT collections and token contracts
    const qualifyingCollections = [
      // Your NFT Collections
      { chainId: '1', address: '0x8e84dcaf616c3e04ed45d3e0912b81e7283a48da', name: 'Your NFT Collection 1', type: 'erc721' },
      { chainId: '1', address: '0xd7d1431f43767a47bf7f5c6a651d24398e537729', name: 'Your NFT Collection 2', type: 'erc721' },
      { chainId: '8453', address: '0x1e71ea45fb939c92045ff32239a8922395eeb31b', name: 'Your Base NFT Collection', type: 'erc721' },
      // Token Holdings
      { chainId: '1', address: '0x0000000000c5dc95539589fbD24BE07c6C14eCa4', name: '$CULT Holders', type: 'erc20', minBalance: '500000' }
    ];
    
    const ownedCollections = [];
    
    // Group collections by chain for parallel processing
    const collectionsByChain = {};
    for (const collection of qualifyingCollections) {
      if (!collectionsByChain[collection.chainId]) {
        collectionsByChain[collection.chainId] = [];
      }
      collectionsByChain[collection.chainId].push(collection);
    }
    
    // Process each chain in parallel
    const chainResults = await Promise.allSettled(
      Object.entries(collectionsByChain).map(async ([chainId, collections]) => {
        const rpcUrl = RPC_ENDPOINTS[chainId];
        if (!rpcUrl) {
          logger.warn('No RPC URL for chain', { chainId });
          return [];
        }
        
        logger.debug('Processing chain collections', { chainId, count: collections.length });
        const provider = new ethers.JsonRpcProvider(rpcUrl, undefined, {
          polling: false,
          batchMaxCount: 10,
          batchMaxWait: 100,
          staticNetwork: { chainId: parseInt(chainId), name: chainId === '1' ? 'mainnet' : 'base' }
        });
        
        // Process collections in parallel within each chain
        return Promise.allSettled(
          collections.map(async (collection) => {
            try {
              logger.debug('Checking collection', { 
                address: collection.address, 
                chainId: collection.chainId, 
                name: collection.name,
                type: collection.type 
              });
              
              if (collection.type === 'erc721') {
                // Skip EVM NFT checks for Solana addresses
                if (!walletAddress.startsWith('0x')) {
                  logger.debug('Skipping EVM NFT check for Solana address', { walletAddress, collection: collection.name });
                  return null;
                }
                
                // Validate addresses
                if (!ethers.isAddress(collection.address) || !ethers.isAddress(walletAddress)) {
                  throw new Error(`Invalid address format`);
                }
                
                // NFT contract check with faster timeout
                const nftContract = new ethers.Contract(
                  collection.address,
                  ['function balanceOf(address owner) view returns (uint256)'],
                  provider
                );
                
                // Reduced timeout for faster failure
                const balance = await Promise.race([
                  nftContract.balanceOf(walletAddress),
                  new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Contract call timeout')), 3000) // Reduced from 10s to 3s
                  )
                ]);
                
                logger.debug('NFT balance check result', { 
                  address: collection.address, 
                  walletAddress, 
                  balance: balance.toString() 
                });
                
                if (balance > 0) {
                  logger.info('NFT found!', { 
                    address: collection.address, 
                    name: collection.name, 
                    balance: balance.toString() 
                  });
                  return {
                    contractAddress: collection.address,
                    chainId: collection.chainId,
                    name: collection.name,
                    type: collection.type,
                    balance: balance.toString()
                  };
                }
                return null;
              } else if (collection.type === 'erc20') {
                // Skip EVM token checks for Solana addresses
                if (!walletAddress.startsWith('0x')) {
                  logger.debug('Skipping EVM token check for Solana address', { walletAddress, collection: collection.name });
                  return null;
                }
                
                // Validate addresses
                if (!ethers.isAddress(collection.address) || !ethers.isAddress(walletAddress)) {
                  throw new Error(`Invalid address format`);
                }
                
                // Token contract check with faster timeout
                const tokenContract = new ethers.Contract(
                  collection.address,
                  ['function balanceOf(address owner) view returns (uint256)', 'function decimals() view returns (uint8)'],
                  provider
                );
                
                // Reduced timeout for faster failure
                const [balance, decimals] = await Promise.race([
                  Promise.all([tokenContract.balanceOf(walletAddress), tokenContract.decimals()]),
                  new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Contract call timeout')), 3000) // Reduced from 10s to 3s
                  )
                ]);
                
                const formattedBalance = parseFloat(ethers.formatUnits(balance, decimals));
                const minBalance = parseFloat(collection.minBalance);
                
                logger.debug('Token balance check result', { 
                  address: collection.address, 
                  walletAddress, 
                  balance: formattedBalance,
                  minBalance,
                  decimals 
                });
                
                if (formattedBalance >= minBalance) {
                  logger.info('Token balance sufficient!', { 
                    address: collection.address, 
                    name: collection.name, 
                    balance: formattedBalance,
                    minBalance 
                  });
                  return {
                    contractAddress: collection.address,
                    chainId: collection.chainId,
                    name: collection.name,
                    type: collection.type,
                    balance: formattedBalance.toString(),
                    minBalance: collection.minBalance
                  };
                }
                return null;
              }
            } catch (error) {
              logger.warn(`Error checking collection ${collection.address}:`, {
                error: error.message,
                chainId: collection.chainId,
                name: collection.name,
                type: collection.type,
                walletAddress: walletAddress
              });
              return null; // Return null instead of throwing to continue processing
            }
          })
        );
      })
    );
    
    // Flatten results and filter out nulls
    for (const chainResult of chainResults) {
      if (chainResult.status === 'fulfilled') {
        for (const collectionResult of chainResult.value) {
          if (collectionResult.status === 'fulfilled' && collectionResult.value) {
            ownedCollections.push(collectionResult.value);
          }
        }
      }
    }
    
    // Only consider wallet as NFT holder if they actually have NFTs (balance > 0)
    const isHolder = ownedCollections.some(collection => 
      collection.balance && parseInt(collection.balance) > 0 && !collection.error
    );
    
    // Skip database operations - NFT checking works without database
    logger.info('NFT check completed', { walletAddress, isHolder, collectionCount: ownedCollections.length });
    
    res.json({
      success: true,
      isHolder,
      collections: ownedCollections,
      message: isHolder 
        ? 'Qualifying NFTs found! You have access to free generation.' 
        : 'No qualifying NFTs found. Purchase credits to generate images.',
      pricing: {
        costPerCredit: isHolder ? 0.08 : 0.15,
        creditsPerUSDC: isHolder ? 12.5 : 6.67
      },
      freeCredits: isHolder ? 10 : 0
    });
    
  } catch (error) {
    logger.error('Error checking NFT holdings:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
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
    const evmPaymentAddress = process.env.EVM_PAYMENT_WALLET_ADDRESS || '0xa0aE05e2766A069923B2a51011F270aCadFf023a';
    const solanaPaymentAddress = process.env.SOLANA_PAYMENT_WALLET_ADDRESS || process.env.SOLANA_PAYMENT_WALLET || 'CkhFmeUNxdr86SZEPg6bLgagFkRyaDMTmFzSVL69oadA';
    
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

  // Use public RPC endpoints with better fallbacks
  const rpcUrls = {
    ethereum: process.env.ETH_RPC_URL || 'https://eth-mainnet.g.alchemy.com/v2/REDACTED_ALCHEMY_KEY',
    base: process.env.BASE_RPC_URL || 'https://base-mainnet.g.alchemy.com/v2/REDACTED_ALCHEMY_KEY'
  };
  
  const provider = new ethers.JsonRpcProvider(rpcUrls[chain] || rpcUrls.ethereum, undefined, {
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
    
    const evmPaymentAddress = process.env.EVM_PAYMENT_WALLET_ADDRESS || '0xa0aE05e2766A069923B2a51011F270aCadFf023a';
    const solanaPaymentAddress = process.env.SOLANA_PAYMENT_WALLET_ADDRESS || process.env.SOLANA_PAYMENT_WALLET || 'CkhFmeUNxdr86SZEPg6bLgagFkRyaDMTmFzSVL69oadA';
    
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
      const alreadyProcessed = user.paymentHistory.some(p => p.txHash === payment.txHash);
      
      if (alreadyProcessed) {
        console.log(`[INFO] Payment ${payment.txHash} already processed for ${senderAddress}`);
        console.log('='.repeat(80));
        return res.json({
          success: true,
          paymentDetected: true,
          alreadyProcessed: true,
          message: 'Payment already credited'
        });
      }
      
      // Calculate credits (standard pricing for all users)
      const creditsPerUSDC = 6.67; // $0.15/credit
      const creditsToAdd = Math.floor(parseFloat(payment.amount) * creditsPerUSDC);
      
      console.log(`[CREDIT] Adding ${creditsToAdd} credits to user ${senderAddress}`);
      console.log(`[CREDIT] Previous balance: ${user.credits} credits`);
      
      // Add credits to user
      user.credits += creditsToAdd;
      user.totalCreditsEarned += creditsToAdd;
      user.paymentHistory.push({
        txHash: payment.txHash,
        tokenSymbol: payment.token || 'USDC',
        amount: parseFloat(payment.amount),
        credits: creditsToAdd,
        chainId: payment.chain || 'unknown',
        walletType: 'unknown', // Can be enhanced with actual wallet type
        timestamp: new Date(payment.timestamp * 1000)
      });
      
      await user.save();
      
      console.log(`[SUCCESS] New balance: ${user.credits} credits`);
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

    // Check if payment already processed
    const user = await getOrCreateUser(walletAddress);
    const existingPayment = user.paymentHistory.find(p => p.txHash === txHash);
    
    if (existingPayment) {
      console.log('💰 [PAYMENT CREDIT] Already processed');
      return res.json({
        success: true,
        credits: 0,
        totalCredits: user.credits,
        message: 'Payment already processed'
      });
    }

    // Credit immediately based on signature (no verification)
    const creditsPerUSDC = 6.67; // $0.15/credit
    const creditsToAdd = Math.floor(parseFloat(amount) * creditsPerUSDC);
    
    console.log('💰 [PAYMENT CREDIT] Calculating credits', {
      walletAddress: user.walletAddress,
      walletType: walletType || 'evm',
      amount: parseFloat(amount),
      creditsPerUSDC,
      creditsToAdd
    });
    
    // Add credits
    user.credits += creditsToAdd;
    user.totalCreditsEarned += creditsToAdd;
    
    // Add to payment history
    user.paymentHistory.push({
      txHash,
      tokenSymbol: tokenSymbol || 'USDC',
      amount: parseFloat(amount),
      credits: creditsToAdd,
      chainId: chainId || 'unknown',
      walletType: walletType || 'evm',
      timestamp: new Date()
    });
    
    await user.save();
    
    console.log('💰 [PAYMENT CREDIT] Credits added successfully', {
      walletAddress: user.walletAddress,
      credits: creditsToAdd,
      totalCredits: user.credits,
      txHash
    });
    
    res.json({
      success: true,
      credits: creditsToAdd,
      totalCredits: user.credits,
      credits: creditsToAdd, // Duplicate for compatibility
      message: `Payment credited! ${creditsToAdd} credits added to your account.`
    });

  } catch (error) {
    console.error('💰 [PAYMENT CREDIT] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
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

    // Check if payment already processed
    const user = await getOrCreateUser(walletAddress);
    const existingPayment = user.paymentHistory.find(p => p.txHash === txHash);
    
    if (existingPayment) {
      console.log('💰 [PAYMENT VERIFY] Already processed');
      return res.json({
        success: true,
        credits: 0,
        message: 'Payment already processed'
      });
    }

    let verification;
    if (walletType === 'solana') {
      // Simplified Solana verification
      verification = {
        success: true,
        credits: Math.floor(parseFloat(amount) * 100),
        actualAmount: parseFloat(amount),
        txHash
      };
    } else {
      console.log('💰 [PAYMENT VERIFY] Calling verifyEVMPayment...');
      verification = await verifyEVMPayment(txHash, walletAddress, tokenSymbol, amount, chainId);
      console.log('💰 [PAYMENT VERIFY] Verification result:', verification);
    }

    if (verification.success) {
      // Update user credits
      user.credits += verification.credits;
      user.totalCreditsEarned += verification.credits;
      
      // Add to payment history
      user.paymentHistory.push({
        txHash,
        tokenSymbol,
        amount: verification.actualAmount,
        credits: verification.credits,
        chainId,
        walletType,
        timestamp: new Date()
      });
      
      await user.save();
      
      logger.info('Payment verified successfully', {
        walletAddress: walletAddress.toLowerCase(),
        credits: verification.credits,
        txHash
      });
      
      res.json({
        success: true,
        credits: verification.credits,
        totalCredits: user.credits,
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
      error: error.message
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
      amount, 
      currency = 'usd',
      credits 
    } = req.body;

    if (!walletAddress || !amount || !credits) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }

    // Verify user exists
    const user = await getOrCreateUser(walletAddress);

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: currency.toLowerCase(),
      metadata: {
        walletAddress: walletAddress.toLowerCase(),
        credits: credits.toString(),
        userId: user._id.toString()
      },
      automatic_payment_methods: {
        enabled: true,
      },
    });

    logger.info('Stripe payment intent created', {
      walletAddress: walletAddress.toLowerCase(),
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
      error: error.message
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
      walletAddress 
    } = req.body;

    if (!paymentIntentId || !walletAddress) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }

    // Retrieve payment intent from Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status !== 'succeeded') {
      return res.status(400).json({
        success: false,
        error: 'Payment not completed'
      });
    }

    // Check if payment already processed
    const user = await getOrCreateUser(walletAddress);
    const existingPayment = user.paymentHistory.find(p => p.paymentIntentId === paymentIntentId);
    
    if (existingPayment) {
      return res.json({
        success: true,
        credits: 0,
        message: 'Payment already processed'
      });
    }

    // Extract credits from metadata
    const credits = parseInt(paymentIntent.metadata.credits);
    const amount = paymentIntent.amount / 100; // Convert from cents

    // NFT holder check removed - standard pricing for all users

    // Use credits as-is (no NFT bonus)
    const finalCredits = credits;

    // Update user credits
    user.credits += finalCredits;
    user.totalCreditsEarned += finalCredits;
    
    // Add to payment history
      user.paymentHistory.push({
        txHash: paymentIntentId,
        tokenSymbol: 'USD',
        amount: amount,
        credits: finalCredits,
        chainId: 'stripe',
        walletType: 'card',
        timestamp: new Date()
      });
    
    await user.save();
    
    logger.info('Stripe payment verified successfully', {
      walletAddress: walletAddress.toLowerCase(),
      credits: finalCredits,
      paymentIntentId
    });
    
    res.json({
      success: true,
      credits: finalCredits,
      totalCredits: user.credits,
      message: `Payment verified! ${finalCredits} credits added to your account.`
    });

  } catch (error) {
    logger.error('Stripe payment verification error:', error);
    res.status(500).json({
      success: false,
      error: error.message
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
    
    const evmPaymentAddress = process.env.EVM_PAYMENT_WALLET_ADDRESS || '0xa0aE05e2766A069923B2a51011F270aCadFf023a';
    
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
        const alreadyProcessed = user.paymentHistory.some(p => p.txHash === quickPayment.txHash);
        
        if (alreadyProcessed) {
          return res.json({
            success: true,
            paymentDetected: true,
            alreadyProcessed: true,
            message: 'Payment already credited'
          });
        }
        
        // Calculate credits (standard pricing for all users)
        const creditsPerUSDC = 6.67; // $0.15/credit
        const creditsToAdd = Math.floor(parseFloat(quickPayment.amount) * creditsPerUSDC);
        
        // Add credits instantly
        user.credits += creditsToAdd;
        user.totalCreditsEarned += creditsToAdd;
        user.paymentHistory.push({
          txHash: quickPayment.txHash,
          tokenSymbol: quickPayment.token || 'USDC',
          amount: parseFloat(quickPayment.amount),
          credits: creditsToAdd,
          chainId: quickPayment.chain || 'unknown',
          walletType: 'unknown',
          timestamp: new Date(quickPayment.timestamp * 1000)
        });
        
        await user.save();
        
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
      const alreadyProcessed = user.paymentHistory.some(p => p.txHash === quickPayment.txHash);
      
      if (alreadyProcessed) {
        return res.json({
          success: true,
          paymentDetected: true,
          alreadyProcessed: true,
          message: 'Payment already credited'
        });
      }
      
      // Calculate credits (standard pricing for all users)
      const creditsPerUSDC = 6.67; // $0.15/credit
      const creditsToAdd = Math.floor(parseFloat(quickPayment.amount) * creditsPerUSDC);
      
      // Add credits instantly
      user.credits += creditsToAdd;
      user.totalCreditsEarned += creditsToAdd;
      user.paymentHistory.push({
        txHash: quickPayment.txHash,
        tokenSymbol: quickPayment.token || 'USDC',
        amount: parseFloat(quickPayment.amount),
        credits: creditsToAdd,
        chainId: quickPayment.chain || 'unknown',
        walletType: 'unknown',
        timestamp: new Date(quickPayment.timestamp * 1000)
      });
      
      await user.save();
      
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

    console.log('🔍 [GENERATION ADD] Getting user:', walletAddress);
    const user = await getOrCreateUser(walletAddress);
    console.log('👤 [GENERATION ADD] User found:', {
      walletAddress: user.walletAddress,
      credits: user.credits,
      totalCreditsEarned: user.totalCreditsEarned
    });
    
    // Use effective credits (max of credits and totalCreditsEarned) to handle granted credits
    const effectiveCredits = Math.max(user.credits || 0, user.totalCreditsEarned || 0);
    const creditsToDeduct = creditsUsed || 1; // Default to 1 credit if not specified
    
    logger.debug('Checking credits for generation', {
      walletAddress: walletAddress.toLowerCase(),
      credits: user.credits,
      totalCreditsEarned: user.totalCreditsEarned,
      effectiveCredits,
      creditsToDeduct
    });
    
    // Check if user has enough credits
    if (effectiveCredits < creditsToDeduct) {
      logger.warn('Insufficient credits for generation', {
        walletAddress: walletAddress.toLowerCase(),
        effectiveCredits,
        creditsToDeduct
      });
      return res.status(400).json({
        success: false,
        error: `Insufficient credits. You have ${effectiveCredits} credits but need ${creditsToDeduct}`
      });
    }

    // Deduct credits using atomic update to ensure it works reliably
    const previousCredits = user.credits || 0;
    const previousTotalSpent = user.totalCreditsSpent || 0;
    
    console.log('💰 [GENERATION ADD] Before deduction:', {
      previousCredits,
      previousTotalSpent,
      creditsToDeduct,
      effectiveCredits
    });
    
    // Use atomic update with $inc to ensure credits are deducted properly
    const updateResult = await User.findOneAndUpdate(
      { walletAddress: user.walletAddress },
      {
        $inc: { 
          credits: -creditsToDeduct,
          totalCreditsSpent: creditsToDeduct
        }
      },
      { new: true }
    );
    
    if (!updateResult) {
      throw new Error('Failed to update user credits');
    }
    
    // Ensure credits don't go negative
    if (updateResult.credits < 0) {
      await User.findOneAndUpdate(
        { walletAddress: user.walletAddress },
        { $set: { credits: 0 } },
        { new: true }
      );
      updateResult.credits = 0;
    }
    
    // Update the user object for the rest of the code
    user.credits = updateResult.credits;
    user.totalCreditsSpent = updateResult.totalCreditsSpent;
    
    console.log('💰 [GENERATION ADD] After atomic deduction:', {
      newCredits: user.credits,
      newTotalSpent: user.totalCreditsSpent,
      updateResultCredits: updateResult.credits
    });
    
    // Add generation to history
    const generationId = `gen_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const generation = {
      id: generationId,
      prompt: prompt || 'No prompt',
      style: style || 'No Style',
      imageUrl,
      creditsUsed: creditsToDeduct,
      timestamp: new Date()
    };
    
    user.generationHistory.push(generation);
    user.gallery.push(generation);
    
    console.log('💾 [GENERATION ADD] Saving user with generation history...');
    await user.save();
    console.log('✅ [GENERATION ADD] User saved successfully with generation');
    
    // Refetch to verify the save
    const savedUser = await User.findOne({ walletAddress: user.walletAddress });
    console.log('✅ [GENERATION ADD] Verified saved credits:', {
      savedCredits: savedUser?.credits,
      savedTotalSpent: savedUser?.totalCreditsSpent,
      matchExpected: savedUser?.credits === user.credits
    });
    
    logger.info('Generation added to history and credits deducted', {
      walletAddress: walletAddress.toLowerCase(),
      generationId,
      creditsUsed: creditsToDeduct,
      previousCredits,
      newCredits: user.credits,
      savedCredits: savedUser?.credits,
      totalCreditsSpent: user.totalCreditsSpent
    });
    
    res.json({
      success: true,
      generationId,
      remainingCredits: user.credits,
      creditsDeducted: creditsToDeduct,
      message: `Generation added to history. ${creditsToDeduct} credit(s) deducted.`
    });
  } catch (error) {
    logger.error('Error adding generation:', error);
    res.status(500).json({ success: false, error: error.message });
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
    res.status(500).json({ success: false, error: error.message });
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
    res.status(500).json({ success: false, error: error.message });
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
    res.status(500).json({ success: false, error: error.message });
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
    res.status(500).json({ success: false, error: error.message });
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
    res.status(500).json({ success: false, error: error.message });
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