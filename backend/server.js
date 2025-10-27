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

// Simple logging
const logger = {
  info: (msg, meta) => console.log(`[INFO] ${msg}`, meta || ''),
  error: (msg, meta) => console.error(`[ERROR] ${msg}`, meta || ''),
  warn: (msg, meta) => console.warn(`[WARN] ${msg}`, meta || ''),
  debug: (msg, meta) => console.log(`[DEBUG] ${msg}`, meta || '')
};

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
    // Skip rate limiting for health checks and instant-check (has its own limiter)
    return req.path === '/api/health' || req.path === '/api/payment/instant-check';
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
    console.log('CORS rejected origin:', origin);
    console.log('Allowed origins:', process.env.ALLOWED_ORIGINS);
    console.log('NODE_ENV:', process.env.NODE_ENV);
    
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
  console.log('📡 Connecting to MongoDB...');
  mongoose.connect(process.env.MONGODB_URI, mongoOptions);
} else {
  console.warn('⚠️ MONGODB_URI not provided, running without database');
}

mongoose.connection.on('connected', () => {
  logger.info('MongoDB connected successfully');
});

mongoose.connection.on('error', (err) => {
  logger.error('MongoDB connection error:', err);
  console.log('⚠️ MongoDB connection failed - app will continue without database');
});

mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB disconnected');
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  if (err.message && err.message.includes('querySrv ENOTFOUND')) {
    console.log('⚠️ MongoDB DNS error - continuing without database');
    return;
  }
  logger.error('Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  if (reason && reason.message && reason.message.includes('querySrv ENOTFOUND')) {
    console.log('⚠️ MongoDB DNS error - continuing without database');
    return;
  }
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
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

// Payment wallet addresses
const PAYMENT_WALLETS = {
  '1': process.env.ETH_PAYMENT_WALLET,
  '137': process.env.POLYGON_PAYMENT_WALLET,
  '42161': process.env.ARBITRUM_PAYMENT_WALLET,
  '10': process.env.OPTIMISM_PAYMENT_WALLET,
  '8453': process.env.BASE_PAYMENT_WALLET,
  'solana': process.env.SOLANA_PAYMENT_WALLET
};

// Token configurations
const TOKEN_CONFIGS = {
  '1': {
    'USDC': { address: '0xA0b86a33E6441b8C4C8C0C4C0C4C0C4C0C4C0C4C', decimals: 6, creditRate: 1 },
    'USDT': { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6, creditRate: 1 },
    'DAI': { address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', decimals: 18, creditRate: 1 },
    'WETH': { address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals: 18, creditRate: 2000 }
  },
  '137': {
    'USDC': { address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', decimals: 6, creditRate: 1 },
    'USDT': { address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6, creditRate: 1 },
    'WMATIC': { address: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', decimals: 18, creditRate: 1.5 }
  },
  '42161': {
    'USDC': { address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6, creditRate: 1 },
    'USDT': { address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', decimals: 6, creditRate: 1 }
  },
  '10': {
    'USDC': { address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', decimals: 6, creditRate: 1 }
  },
  '8453': {
    'USDC': { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6, creditRate: 1 }
  }
};

// RPC endpoints with reliable public endpoints
const RPC_ENDPOINTS = {
  '1': process.env.ETH_RPC_URL || 'https://ethereum.publicnode.com',
  '137': process.env.POLYGON_RPC_URL || 'https://polygon.publicnode.com',
  '42161': process.env.ARBITRUM_RPC_URL || 'https://arbitrum.publicnode.com',
  '10': process.env.OPTIMISM_RPC_URL || 'https://optimism.publicnode.com',
  '8453': process.env.BASE_RPC_URL || 'https://base.publicnode.com'
};

// ERC-20 ABI
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "event Transfer(address indexed from, address indexed to, uint256 value)"
];

/**
 * Get or create user
 */
async function getOrCreateUser(walletAddress) {
  let user = await User.findOne({ walletAddress: walletAddress.toLowerCase() });
  
  if (!user) {
    user = new User({
      walletAddress: walletAddress.toLowerCase(),
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
    logger.info('New user created', { walletAddress: walletAddress.toLowerCase() });
  } else {
    // Update last active
    user.lastActive = new Date();
    await user.save();
  }
  
  return user;
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
    if (!paymentWallet) {
      throw new Error(`Payment wallet not configured for chain ${chainId}`);
    }

    if (tx.from.toLowerCase() !== walletAddress.toLowerCase()) {
      throw new Error('Transaction sender does not match wallet address');
    }

    // Parse transfer logs
    const tokenContract = new ethers.Contract(tokenConfig.address, ERC20_ABI, provider);
    const transferTopic = ethers.id('Transfer(address,address,uint256)');
    const transferLogs = receipt.logs.filter(log => log.topics[0] === transferTopic);
    
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
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (!validTransfer) {
      throw new Error('No valid transfer found to payment wallet');
    }

    const expectedAmount = parseFloat(amount);
    const tolerance = 0.001;
    if (Math.abs(actualAmount - expectedAmount) > tolerance) {
      throw new Error(`Amount mismatch. Expected: ${expectedAmount}, Actual: ${actualAmount}`);
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
    const user = await getOrCreateUser(walletAddress);
    
    res.json({
      success: true,
      user: {
        walletAddress: user.walletAddress,
        credits: user.credits,
        totalCreditsEarned: user.totalCreditsEarned,
        totalCreditsSpent: user.totalCreditsSpent,
        nftCollections: user.nftCollections,
        paymentHistory: user.paymentHistory,
        generationHistory: user.generationHistory.slice(-10), // Last 10 generations
        gallery: user.gallery,
        settings: user.settings,
        lastActive: user.lastActive
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
    const user = await getOrCreateUser(walletAddress);
    
    res.json({
      success: true,
      totalCredits: user.credits,
      totalCreditsEarned: user.totalCreditsEarned,
      totalCreditsSpent: user.totalCreditsSpent
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

    // TODO: Implement actual blockchain NFT verification
    // For now, return mock data. In production, you should:
    // 1. Use ethers.js to query NFT contract balanceOf()
    // 2. Check against a list of qualifying collections
    // 3. Cache results to avoid repeated blockchain calls
    
    logger.info('Checking NFT holdings', { walletAddress });
    
    // Mock implementation - replace with real verification
    const isHolder = false; // Set to true for testing
    const ownedCollections = [];
    
    // Example of how to check (commented out):
    // for (const collection of collections || []) {
    //   const rpcUrl = RPC_ENDPOINTS[collection.chainId];
    //   if (!rpcUrl) continue;
    //   
    //   const provider = new ethers.JsonRpcProvider(rpcUrl);
    //   const nftContract = new ethers.Contract(
    //     collection.address,
    //     ['function balanceOf(address owner) view returns (uint256)'],
    //     provider
    //   );
    //   
    //   const balance = await nftContract.balanceOf(walletAddress);
    //   if (balance > 0) {
    //     ownedCollections.push(collection);
    //   }
    // }
    
    res.json({
      success: true,
      isHolder,
      collections: ownedCollections,
      message: isHolder 
        ? 'Qualifying NFTs found! You have access to free generation.' 
        : 'No qualifying NFTs found. Purchase credits to generate images.'
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
    const solanaPaymentAddress = process.env.SOLANA_PAYMENT_WALLET_ADDRESS || 'CkhFmeUNxdr86SZEPg6bLgagFkRyaDMTmFzSVL69oadA';
    
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

// Token addresses for different chains
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
    USDC: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
    USDT: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9'
  },
  optimism: {
    USDC: '0x7F5c764cBc14f9669B88837ca1490cCa17c31607',
    USDT: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58'
  },
  base: {
    USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    USDT: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb'
  }
};

// Get provider for chain using public RPC endpoints
function getProvider(chain = 'ethereum') {
  // Use public RPC endpoints as fallback to avoid rate limiting
  const rpcUrls = {
    ethereum: process.env.ETHEREUM_RPC_URL || 'https://rpc.ankr.com/eth',
    polygon: process.env.POLYGON_RPC_URL || 'https://rpc.ankr.com/polygon',
    arbitrum: process.env.ARBITRUM_RPC_URL || 'https://rpc.ankr.com/arbitrum',
    optimism: process.env.OPTIMISM_RPC_URL || 'https://rpc.ankr.com/optimism',
    base: process.env.BASE_RPC_URL || 'https://rpc.ankr.com/base'
  };
  
  return new ethers.JsonRpcProvider(rpcUrls[chain] || rpcUrls.ethereum);
}

/**
 * Check for recent USDC/USDT transfers to payment address
 */
async function checkForTokenTransfer(paymentAddress, expectedAmount, token = 'USDC', chain = 'ethereum') {
  try {
    console.log(`\n[${chain.toUpperCase()}] Starting check for ${token} transfers...`);
    console.log(`[${chain.toUpperCase()}] Looking for transfers TO: ${paymentAddress}`);
    console.log(`[${chain.toUpperCase()}] Expected amount: ${expectedAmount} ${token}`);
    
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
    
    // Get current block and check last 10 blocks to avoid free tier limitations
    const currentBlock = await provider.getBlockNumber();
    const blocksToCheck = 10; // Reduced to avoid free tier limitations
    const fromBlock = currentBlock - blocksToCheck;
    
    console.log(`[${chain.toUpperCase()}] Scanning blocks ${fromBlock} to ${currentBlock} (${blocksToCheck} blocks)`);
    
    // Query Transfer events TO our payment address (second parameter is recipient)
    const filter = contract.filters.Transfer(null, paymentAddress);
    console.log(`[${chain.toUpperCase()}] Filter: Transfer(from: ANY, to: ${paymentAddress})`);
    
    const events = await contract.queryFilter(filter, fromBlock, currentBlock);
    
    console.log(`[${chain.toUpperCase()}] Found ${events.length} incoming transfer(s) to payment wallet`);
    
    if (events.length === 0) {
      console.log(`[${chain.toUpperCase()}] ✗ No transfers found to payment wallet in last ${blocksToCheck} blocks`);
      return null;
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
async function checkForSolanaUSDC(paymentAddress, expectedAmount) {
  try {
    console.log(`\n[SOLANA] Starting check for USDC transfers...`);
    console.log(`[SOLANA] Looking for transfers TO: ${paymentAddress}`);
    console.log(`[SOLANA] Expected amount: ${expectedAmount} USDC`);
    
    // Use multiple RPC endpoints for better reliability
    const rpcUrls = [
      process.env.SOLANA_RPC_URL,
      'https://api.mainnet-beta.solana.com',
      'https://api.devnet.solana.com', // Devnet as fallback
      'https://solana-mainnet.g.alchemy.com/v2/demo', // Alchemy demo endpoint
      'https://rpc.ankr.com/solana' // Ankr (may require API key)
    ].filter(Boolean);
    
    let connection;
    let lastError;
    
    // Try each RPC endpoint until one works
    for (const rpcUrl of rpcUrls) {
      try {
        connection = new Connection(rpcUrl, 'confirmed');
        // Test the connection
        await connection.getLatestBlockhash();
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
    
    // Get recent signatures for the payment address
    const signatures = await connection.getSignaturesForAddress(paymentPubkey, { limit: 50 });
    
    console.log(`[SOLANA] Found ${signatures.length} recent transaction(s)`);
    
    if (signatures.length === 0) {
      console.log(`[SOLANA] ✗ No recent transactions found`);
      return null;
    }
    
    // Check each transaction for USDC transfers
    for (const sig of signatures) {
      try {
        const tx = await connection.getParsedTransaction(sig.signature, {
          maxSupportedTransactionVersion: 0
        });
        
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
            if (info.destination === paymentAddress) {
              // Get token account info to verify it's USDC
              const amount = info.amount / 1e6; // USDC has 6 decimals
              
              console.log(`[SOLANA]       Amount: ${amount} USDC`);
              
              // Check if amount matches (within 1% tolerance)
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
    const solanaPaymentAddress = process.env.SOLANA_PAYMENT_WALLET_ADDRESS || 'CkhFmeUNxdr86SZEPg6bLgagFkRyaDMTmFzSVL69oadA';
    
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
        checkForTokenTransfer(evmPaymentAddress, expectedAmount, token, chain),
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
      
      // Calculate credits based on NFT holder status
      const isNFTHolder = user.nftCollections && user.nftCollections.length > 0;
      const creditsPerUSDC = isNFTHolder ? 10 : 6.67; // NFT holders get better rate
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
 * Verify payment
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

    if (!txHash || !walletAddress || !tokenSymbol || !amount || !chainId || !walletType) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }

    // Check if payment already processed
    const user = await getOrCreateUser(walletAddress);
    const existingPayment = user.paymentHistory.find(p => p.txHash === txHash);
    
    if (existingPayment) {
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
      verification = await verifyEVMPayment(txHash, walletAddress, tokenSymbol, amount, chainId);
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

    // Check for NFT holdings to apply discounts
    let isNFTHolder = false;
    try {
      // This would integrate with your existing NFT checking logic
      // For now, we'll set it to false, but you can enhance this
      isNFTHolder = false;
    } catch (error) {
      logger.warn('Error checking NFT holdings for Stripe payment:', error);
    }

    // Apply NFT discount if applicable
    const finalCredits = isNFTHolder ? Math.floor(credits * 1.2) : credits; // 20% bonus for NFT holders

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
      paymentIntentId,
      isNFTHolder
    });
    
    res.json({
      success: true,
      credits: finalCredits,
      totalCredits: user.credits,
      message: `Payment verified! ${finalCredits} credits added to your account.`,
      isNFTHolder
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
    const { walletAddress, chainId } = req.body;
    const token = 'USDC';
    
    console.log(`[INSTANT CHECK] Starting instant payment check for ${walletAddress || 'any wallet'} on chain ${chainId}`);
    
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
      const quickPromises = [Promise.race([
        checkForTokenTransfer(evmPaymentAddress, '1', token, chainName),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
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
        
        // Calculate credits based on NFT holder status
        const isNFTHolder = user.nftCollections && user.nftCollections.length > 0;
        const creditsPerUSDC = isNFTHolder ? 10 : 6.67;
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
        checkForTokenTransfer(evmPaymentAddress, '1', token, chain),
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
      
      // Calculate credits based on NFT holder status
      const isNFTHolder = user.nftCollections && user.nftCollections.length > 0;
      const creditsPerUSDC = isNFTHolder ? 10 : 6.67;
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
    const { 
      walletAddress, 
      prompt, 
      style, 
      imageUrl, 
      creditsUsed 
    } = req.body;

    const user = await getOrCreateUser(walletAddress);
    
    // Check if user has enough credits
    if (user.credits < creditsUsed) {
      return res.status(400).json({
        success: false,
        error: 'Insufficient credits'
      });
    }

    // Deduct credits
    user.credits -= creditsUsed;
    user.totalCreditsSpent += creditsUsed;
    
    // Add generation to history
    const generationId = `gen_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const generation = {
      id: generationId,
      prompt,
      style,
      imageUrl,
      creditsUsed,
      timestamp: new Date()
    };
    
    user.generationHistory.push(generation);
    user.gallery.push(generation);
    
    await user.save();
    
    logger.info('Generation added to history', {
      walletAddress: walletAddress.toLowerCase(),
      generationId,
      creditsUsed
    });
    
    res.json({
      success: true,
      generationId,
      remainingCredits: user.credits,
      message: 'Generation added to history'
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
 * Get user gallery
 */
app.get('/api/gallery/:walletAddress', async (req, res) => {
  try {
    const { walletAddress } = req.params;
    const { page = 1, limit = 20 } = req.query;
    
    const user = await getOrCreateUser(walletAddress);
    
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    
    const gallery = user.gallery
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(startIndex, endIndex);
    
    res.json({
      success: true,
      gallery,
      total: user.gallery.length,
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
 * Get gallery statistics
 */
app.get('/api/gallery/:walletAddress/stats', async (req, res) => {
  try {
    const { walletAddress } = req.params;
    const user = await getOrCreateUser(walletAddress);
    
    const stats = {
      totalImages: user.gallery.length,
      totalCreditsUsed: user.gallery.reduce((sum, item) => sum + (item.creditsUsed || 0), 0),
      recentImages: user.gallery.filter(img => 
        new Date(img.timestamp) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      ).length
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

/**
 * Admin endpoint to add credits to a user
 */
app.post('/api/admin/add-credits', async (req, res) => {
  try {
    const { walletAddress, credits, reason = 'Admin credit addition' } = req.body;
    
    if (!walletAddress || !credits || credits <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid wallet address or credits amount'
      });
    }
    
    const user = await getOrCreateUser(walletAddress);
    
    // Add credits
    user.credits += credits;
    user.totalCreditsEarned += credits;
    
    // Add to payment history as admin addition
    user.paymentHistory.push({
      txHash: `admin_${Date.now()}`,
      tokenSymbol: 'ADMIN',
      amount: 0,
      credits: credits,
      chainId: 'admin',
      walletType: 'admin',
      timestamp: new Date()
    });
    
    await user.save();
    
    logger.info('Admin credits added', {
      walletAddress: walletAddress.toLowerCase(),
      credits,
      reason
    });
    
    res.json({
      success: true,
      message: `Successfully added ${credits} credits to ${walletAddress}`,
      newBalance: user.credits,
      totalCreditsEarned: user.totalCreditsEarned
    });
  } catch (error) {
    logger.error('Error adding credits:', error);
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

// ============================================
// STRIPE-ONLY USER SYSTEM (NEW - DOESN'T AFFECT EXISTING FUNCTIONALITY)
// ============================================

/**
 * Create or get Stripe-only user (no wallet required)
 */
app.post('/api/users/stripe/create', async (req, res) => {
  try {
    const { userId, email } = req.body;
    
    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId is required' });
    }

    // Create a dummy wallet address for Stripe users to maintain schema compatibility
    const dummyWalletAddress = `stripe_${userId}`.toLowerCase();
    
    let user = await User.findOne({ 
      $or: [
        { userId: userId },
        { walletAddress: dummyWalletAddress }
      ]
    });
    
    if (!user) {
      user = new User({
        walletAddress: dummyWalletAddress,
        userId: userId,
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
      logger.info('Stripe-only user created', { userId });
    }
    
    res.json({
      success: true,
      user: {
        userId: user.userId,
        credits: user.credits,
        walletAddress: user.walletAddress
      }
    });
  } catch (error) {
    logger.error('Error creating Stripe user:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get Stripe-only user by userId
 */
app.get('/api/users/stripe/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findOne({ userId });
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    res.json({
      success: true,
      user: {
        userId: user.userId,
        credits: user.credits,
        totalCreditsEarned: user.totalCreditsEarned,
        totalCreditsSpent: user.totalCreditsSpent,
        gallery: user.gallery,
        settings: user.settings
      }
    });
  } catch (error) {
    logger.error('Error fetching Stripe user:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Stripe-only payment intent creation
 */
app.post('/api/stripe/create-payment-intent-guest', async (req, res) => {
  try {
    if (!stripe) {
      return res.status(400).json({
        success: false,
        error: 'Stripe payment is not configured'
      });
    }

    const { userId, amount, currency = 'usd' } = req.body;

    if (!userId || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: userId and amount'
      });
    }

    // Calculate credits (same rate as regular users: 1 USD = 6.67 credits)
    const credits = Math.floor(parseFloat(amount) * 6.67);

    // Create or get user
    const dummyWalletAddress = `stripe_${userId}`.toLowerCase();
    let user = await User.findOne({ userId });

    if (!user) {
      user = new User({
        walletAddress: dummyWalletAddress,
        userId: userId,
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

    // Create Stripe payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(parseFloat(amount) * 100), // Convert to cents
      currency: currency.toLowerCase(),
      metadata: {
        userId: userId,
        credits: credits.toString(),
        type: 'stripe_guest'
      }
    });

    res.json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    });
  } catch (error) {
    logger.error('Error creating Stripe payment intent (guest):', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Verify Stripe guest payment
 */
app.post('/api/stripe/verify-guest-payment', async (req, res) => {
  try {
    if (!stripe) {
      return res.status(400).json({
        success: false,
        error: 'Stripe payment is not configured'
      });
    }

    const { paymentIntentId, userId } = req.body;

    if (!paymentIntentId || !userId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status !== 'succeeded') {
      return res.status(400).json({
        success: false,
        error: 'Payment not completed'
      });
    }

    const user = await User.findOne({ userId });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Check if already processed
    const existingPayment = user.paymentHistory.find(p => p.txHash === paymentIntentId);
    
    if (existingPayment) {
      return res.json({
        success: true,
        credits: 0,
        message: 'Payment already processed'
      });
    }

    const credits = parseInt(paymentIntent.metadata.credits);
    const amount = paymentIntent.amount / 100;

    // Update user credits
    user.credits += credits;
    user.totalCreditsEarned += credits;
    
    // Add to payment history
    user.paymentHistory.push({
      txHash: paymentIntentId,
      tokenSymbol: 'USD',
      amount: amount,
      credits: credits,
      chainId: 'stripe',
      walletType: 'card_guest',
      timestamp: new Date()
    });
    
    await user.save();

    res.json({
      success: true,
      credits,
      totalCredits: user.credits,
      message: `Payment verified! ${credits} credits added to your account.`
    });
  } catch (error) {
    logger.error('Error verifying guest payment:', error);
    res.status(500).json({ success: false, error: error.message });
  }
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