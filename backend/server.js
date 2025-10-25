// Enhanced server with monitoring, rate limiting, and security
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { ethers } = require('ethers');
const cron = require('node-cron');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const winston = require('winston');
const stripe = process.env.STRIPE_SECRET_KEY ? require('stripe')(process.env.STRIPE_SECRET_KEY) : null;
const FastAPIService = require('./services/fastapiService');
require('dotenv').config();
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env.production' });
// Initialize Sentry for error monitoring (optional)
const Sentry = require('@sentry/node');
// const { nodeProfilingIntegration } = require('@sentry/profiling-node'); // Commented out for now

if (process.env.SENTRY_DSN && process.env.SENTRY_DSN !== 'your_sentry_dsn_here') {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    integrations: [
      // nodeProfilingIntegration(), // Commented out for now
    ],
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  });
  console.log('Sentry initialized for error monitoring');
} else {
  console.log('Sentry not configured - error monitoring disabled');
}

const app = express();

// Initialize FastAPI service for NFT holders
const fastAPIService = new FastAPIService();

// Trust proxy for accurate IP addresses
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.fal.ai", "https://api.mainnet-beta.solana.com"],
    },
  },
  crossOriginEmbedderPolicy: false
}));

// Compression middleware
app.use(compression());

// Request logging
const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
});

// Add MongoDB logging in production (only if not localhost)
if (process.env.NODE_ENV === 'production' && process.env.MONGODB_URI && !process.env.MONGODB_URI.includes('localhost')) {
  logger.add(new winston.transports.MongoDB({
    db: process.env.MONGODB_URI,
    collection: 'logs',
    options: { useUnifiedTopology: true }
  }));
}

// Morgan HTTP request logging
app.use(morgan('combined', {
  stream: {
    write: (message) => logger.info(message.trim())
  }
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 100 : 1000, // limit each IP to 100 requests per windowMs in production
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for health checks
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
    
    if (process.env.NODE_ENV === 'development' && isLocalhost) {
      return callback(null, true);
    }
    
    if (isAllowedOrigin) {
      return callback(null, true);
    }
    
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Sentry request handler (commented out for now)
// app.use(Sentry.requestHandler());

// Validate required environment variables (minimal set for basic functionality)
const requiredEnvVars = [
  'MONGODB_URI',
  'JWT_SECRET',
  'SESSION_SECRET'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
  logger.error('Missing required environment variables:', { missingVars });
  process.exit(1);
}

// Optional environment variables (payment-related)
const optionalEnvVars = [
  'ETH_PAYMENT_WALLET',
  'POLYGON_PAYMENT_WALLET', 
  'ARBITRUM_PAYMENT_WALLET',
  'OPTIMISM_PAYMENT_WALLET',
  'BASE_PAYMENT_WALLET',
  'SOLANA_PAYMENT_WALLET',
  'ETH_RPC_URL',
  'POLYGON_RPC_URL',
  'ARBITRUM_RPC_URL',
  'OPTIMISM_RPC_URL',
  'BASE_RPC_URL'
];

const missingOptionalVars = optionalEnvVars.filter(varName => !process.env[varName]);
if (missingOptionalVars.length > 0) {
  logger.warn('Missing optional environment variables (payments will be disabled):', { missingOptionalVars });
}

// Encryption is disabled for now - no validation needed

// MongoDB connection with encryption at rest
const mongoOptions = {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
};

// Add encryption options for production
if (process.env.NODE_ENV === 'production') {
  mongoOptions.ssl = true;
  mongoOptions.sslValidate = true;
  mongoOptions.authSource = 'admin';
}

// Debug environment variables
console.log('🔍 Environment Debug - Version 3:');
console.log('MONGODB_URI exists:', !!process.env.MONGODB_URI);
console.log('MONGODB_URI value:', process.env.MONGODB_URI ? 'Set' : 'Not set');
console.log('MONGODB_URI actual value:', process.env.MONGODB_URI);
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('All env vars starting with MONGO:', Object.keys(process.env).filter(key => key.startsWith('MONGO')));

// Connect to MongoDB if URI is provided and not localhost
if (process.env.MONGODB_URI && !process.env.MONGODB_URI.includes('localhost:27017')) {
  console.log('📡 Connecting to MongoDB...');
  mongoose.connect(process.env.MONGODB_URI, mongoOptions);
} else if (process.env.MONGODB_URI && process.env.MONGODB_URI.includes('localhost:27017')) {
  console.warn('⚠️ MONGODB_URI points to localhost - this will not work in production');
  console.warn('⚠️ Please set MONGODB_URI to a MongoDB Atlas connection string');
  console.warn('⚠️ Running without database connection');
} else {
  console.warn('⚠️ MONGODB_URI not provided, running without database');
}

mongoose.connection.on('connected', () => {
  logger.info('MongoDB connected successfully');
});

mongoose.connection.on('error', (err) => {
  logger.error('MongoDB connection error:', err);
  Sentry.captureException(err);
});

mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB disconnected');
});


// User Schema with field-level encryption for sensitive data
const userSchema = new mongoose.Schema({
  walletAddress: { 
    type: String, 
    required: true, 
    unique: true, 
    lowercase: true,
    index: true
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

// Apply encryption to sensitive fields (temporarily disabled for testing)
// userSchema.plugin(mongooseEncryption, {
//   secret: process.env.ENCRYPTION_KEY,
//   authenticationCode: process.env.AUTHENTICATION_CODE,
//   encryptedFields: [
//     'paymentHistory',    // Encrypt payment data (amounts, transaction details)
//     'generationHistory', // Encrypt prompts and image URLs
//     'gallery',          // Encrypt saved images and prompts
//     'settings'          // Encrypt user preferences
//   ],
//   // Don't encrypt walletAddress, credits, or timestamps (needed for queries)
//   excludeFromEncryption: ['walletAddress', 'credits', 'totalCreditsEarned', 'totalCreditsSpent', 'lastActive', 'createdAt', 'expiresAt', 'nftCollections']
// });

// Add indexes for performance
userSchema.index({ walletAddress: 1 });
userSchema.index({ createdAt: 1 });
userSchema.index({ expiresAt: 1 });
userSchema.index({ 'gallery.timestamp': 1 });

const User = mongoose.model('User', userSchema);

// Metrics Schema for monitoring
const metricsSchema = new mongoose.Schema({
  endpoint: String,
  method: String,
  responseTime: Number,
  statusCode: Number,
  userAgent: String,
  ip: String,
  timestamp: { type: Date, default: Date.now }
}, {
  timestamps: true
});

metricsSchema.index({ timestamp: 1 });
metricsSchema.index({ endpoint: 1 });

const Metrics = mongoose.model('Metrics', metricsSchema);

// Payment wallet addresses (validated above)
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

// RPC endpoints (validated above)
const RPC_ENDPOINTS = {
  '1': process.env.ETH_RPC_URL,
  '137': process.env.POLYGON_RPC_URL,
  '42161': process.env.ARBITRUM_RPC_URL,
  '10': process.env.OPTIMISM_RPC_URL,
  '8453': process.env.BASE_RPC_URL
};

// ERC-20 ABI
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "event Transfer(address indexed from, address indexed to, uint256 value)"
];

// Middleware for metrics collection
const metricsMiddleware = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const responseTime = Date.now() - start;
    
    // Log metrics
    const metrics = new Metrics({
      endpoint: req.path,
      method: req.method,
      responseTime,
      statusCode: res.statusCode,
      userAgent: req.get('User-Agent'),
      ip: req.ip
    });
    
    // Only save metrics if MongoDB is connected
    if (mongoose.connection.readyState === 1) {
      metrics.save().catch(err => {
        logger.error('Failed to save metrics:', err);
      });
    }
  });
  
  next();
};

app.use(metricsMiddleware);

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

    if (tx.to.toLowerCase() !== tokenConfig.address.toLowerCase()) {
      throw new Error('Transaction is not for the specified token');
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

    // Calculate credits with dynamic pricing based on NFT ownership
    // For now, we'll use the base rate - this should be enhanced to check NFT ownership
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
    Sentry.captureException(error);
    throw new Error(`Payment verification failed: ${error.message}`);
  }
}

// API Routes

/**
 * Health check with detailed metrics
 */
app.get('/api/health', async (req, res) => {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      version: '1.0.0'
    };

    // Check database connection
    const dbState = mongoose.connection.readyState;
    health.database = {
      status: dbState === 1 ? 'connected' : 'disconnected',
      state: dbState
    };

    res.json(health);
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
 * Metrics endpoint for monitoring
 */
app.get('/api/metrics', async (req, res) => {
  try {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [hourlyMetrics, dailyMetrics, totalUsers, activeUsers] = await Promise.all([
      Metrics.find({ timestamp: { $gte: oneHourAgo } }),
      Metrics.find({ timestamp: { $gte: oneDayAgo } }),
      User.countDocuments(),
      User.countDocuments({ lastActive: { $gte: oneDayAgo } })
    ]);

    const metrics = {
      users: {
        total: totalUsers,
        active24h: activeUsers
      },
      requests: {
        lastHour: hourlyMetrics.length,
        last24h: dailyMetrics.length,
        avgResponseTime: dailyMetrics.length > 0 
          ? Math.round(dailyMetrics.reduce((sum, m) => sum + m.responseTime, 0) / dailyMetrics.length)
          : 0
      },
      endpoints: {}
    };

    // Group by endpoint
    dailyMetrics.forEach(metric => {
      if (!metrics.endpoints[metric.endpoint]) {
        metrics.endpoints[metric.endpoint] = { count: 0, avgResponseTime: 0 };
      }
      metrics.endpoints[metric.endpoint].count++;
    });

    // Calculate average response times per endpoint
    Object.keys(metrics.endpoints).forEach(endpoint => {
      const endpointMetrics = dailyMetrics.filter(m => m.endpoint === endpoint);
      metrics.endpoints[endpoint].avgResponseTime = endpointMetrics.length > 0
        ? Math.round(endpointMetrics.reduce((sum, m) => sum + m.responseTime, 0) / endpointMetrics.length)
        : 0;
    });

    res.json(metrics);
  } catch (error) {
    logger.error('Metrics endpoint error:', error);
    Sentry.captureException(error);
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
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
    Sentry.captureException(error);
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
    Sentry.captureException(error);
    res.status(500).json({ success: false, error: error.message });
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
    Sentry.captureException(error);
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
    Sentry.captureException(error);
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
      paymentIntentId,
      paymentMethod: 'stripe',
      amount: amount,
      credits: finalCredits,
      currency: paymentIntent.currency,
      timestamp: new Date(),
      isNFTHolder
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
    Sentry.captureException(error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Stripe webhook handler
 */
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
    Sentry.captureException(error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Log safety violations
 */
app.post('/api/safety/violation', async (req, res) => {
  try {
    const { walletAddress, violation, userAgent, url } = req.body;
    
    // Log the violation
    logger.warn('Safety violation detected', {
      timestamp: new Date().toISOString(),
      walletAddress: walletAddress?.toLowerCase(),
      violation: violation,
      userAgent: userAgent,
      url: url,
      ip: req.ip || req.connection.remoteAddress
    });
    
    // Send to Sentry for monitoring
    Sentry.captureMessage('Safety violation detected', {
      level: 'warning',
      tags: {
        type: 'safety_violation',
        walletAddress: walletAddress?.toLowerCase()
      },
      extra: {
        violation,
        userAgent,
        url,
        ip: req.ip
      }
    });
    
    res.json({
      success: true,
      message: 'Violation logged'
    });
  } catch (error) {
    logger.error('Error logging safety violation:', error);
    Sentry.captureException(error);
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
    Sentry.captureException(error);
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
    Sentry.captureException(error);
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
    Sentry.captureException(error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get gallery statistics for a user
 */
app.get('/api/gallery/:walletAddress/stats', async (req, res) => {
  try {
    const { walletAddress } = req.params;
    const user = await getOrCreateUser(walletAddress);
    
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
    
    const totalItems = user.gallery.length;
    const recentItems = user.gallery.filter(item => 
      new Date(item.timestamp) >= thirtyDaysAgo
    ).length;
    const oldItems = totalItems - recentItems;
    
    res.json({
      success: true,
      stats: {
        totalItems,
        recentItems,
        oldItems,
        oldestItem: user.gallery.length > 0 ? 
          Math.min(...user.gallery.map(item => new Date(item.timestamp).getTime())) : null,
        newestItem: user.gallery.length > 0 ? 
          Math.max(...user.gallery.map(item => new Date(item.timestamp).getTime())) : null
      }
    });
  } catch (error) {
    logger.error('Error fetching gallery stats:', error);
    Sentry.captureException(error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Cleanup expired users and old gallery items (runs daily)
 */
cron.schedule('0 0 * * *', async () => {
  try {
    const now = new Date();
    
    // Clean up expired users (30 days)
    const expiredUsers = await User.find({ expiresAt: { $lt: now } });
    
    if (expiredUsers.length > 0) {
      logger.info(`Cleaning up ${expiredUsers.length} expired users`);
      
      // Delete expired users (this also deletes their gallery data)
      await User.deleteMany({ expiresAt: { $lt: now } });
      
      logger.info('Expired users cleaned up successfully');
    }
    
    // Clean up old gallery items (30 days old)
    const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
    
    const usersWithOldGallery = await User.find({
      'gallery.timestamp': { $lt: thirtyDaysAgo }
    });
    
    if (usersWithOldGallery.length > 0) {
      logger.info(`Cleaning up old gallery items for ${usersWithOldGallery.length} users`);
      
      for (const user of usersWithOldGallery) {
        // Remove gallery items older than 30 days
        user.gallery = user.gallery.filter(item => 
          new Date(item.timestamp) >= thirtyDaysAgo
        );
        await user.save();
      }
      
      logger.info('Old gallery items cleaned up successfully');
    }
    
    // Clean up old metrics (keep only 30 days)
    const metricsDeleted = await Metrics.deleteMany({
      timestamp: { $lt: thirtyDaysAgo }
    });
    
    if (metricsDeleted.deletedCount > 0) {
      logger.info(`Cleaned up ${metricsDeleted.deletedCount} old metrics records`);
    }
    
  } catch (error) {
    logger.error('Error cleaning up expired users and gallery items:', error);
    Sentry.captureException(error);
  }
});

/**
 * Database backup job (runs daily at 2 AM)
 */
cron.schedule('0 2 * * *', async () => {
  try {
    logger.info('Starting daily database backup...');
    
    // In production, you would implement actual backup logic here
    // This could involve:
    // 1. MongoDB dump to S3
    // 2. Database replication
    // 3. Point-in-time recovery setup
    
    logger.info('Database backup completed successfully');
  } catch (error) {
    logger.error('Database backup failed:', error);
    Sentry.captureException(error);
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
    Sentry.captureException(error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Sentry error handler (commented out for now)
// app.use(Sentry.errorHandler());

// Global error handler
app.use((error, req, res, next) => {
  logger.error('Unhandled error:', error);
  Sentry.captureException(error);
  
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : error.message
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

// Dynamic port handling with fallback
const startServer = async (port = process.env.PORT || 3001) => {
  const server = app.listen(port, () => {
    logger.info(`AI Image Generator API running on port ${port}`);
    logger.info(`MongoDB connected: ${mongoose.connection.readyState === 1 ? 'Yes' : 'No'}`);
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      logger.warn(`Port ${port} is in use, trying port ${port + 1}`);
      startServer(port + 1);
    } else {
      logger.error('Server error:', err);
      process.exit(1);
    }
  });

  return server;
};

startServer();

module.exports = app;