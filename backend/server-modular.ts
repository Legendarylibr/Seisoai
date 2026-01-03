/**
 * AI Image Generator Backend - Modular Version
 * Main server entry point
 */
import express, { type Express, type Request, type Response, type NextFunction, type ErrorRequestHandler } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from './utils/logger.js';

// Config
import config from './config/env.js';
import { connectDatabase } from './config/database.js';

// Services
import { initializeStripe } from './services/stripe.js';
import { TTLCache } from './services/cache.js';

// Middleware
import {
  authenticateToken,
  authenticateFlexible,
  requireVerifiedAuth
} from './middleware/auth.js';
import {
  createAuthLimiter,
  createGeneralLimiter,
  createPaymentLimiter,
  createFreeImageLimiter,
  createWanStatusLimiter,
  createWanSubmitLimiter,
  createWanResultLimiter,
  createBlockchainRpcLimiter
} from './middleware/rateLimiter.js';
import {
  requireCreditsForModel,
  requireCreditsForVideo,
  requireCredits
} from './middleware/credits.js';

// Routes
import { createApiRoutes } from './routes/index';

// Models - imported to register with mongoose
import './models/User.js';
import './models/Generation.js';
import './models/GalleryItem.js';
import './models/Payment.js';
import './models/IPFreeImage.js';
import './models/GlobalFreeImage.js';

// ES module setup
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Express
const app: Express = express();

// Trust proxy for accurate IP addresses
app.set('trust proxy', 1);

// Security middleware - Helmet (configured for compatibility with in-app browsers like Instagram, Twitter, etc.)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://js.stripe.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://js.stripe.com", "https://checkout.stripe.com", "https://hooks.stripe.com", "https://static.cloudflareinsights.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:", "https://*.stripe.com"],
      connectSrc: ["'self'", "http://localhost:3001", "http://localhost:3000", "http://localhost:5173", "https://api.fal.ai", "https://api.mainnet-beta.solana.com", "https://solana-api.projectserum.com", "https://rpc.ankr.com", "https://solana-mainnet.g.alchemy.com", "https://mainnet.helius-rpc.com", "https://api.devnet.solana.com", "https://js.stripe.com", "https://api.stripe.com", "https://hooks.stripe.com", "https://checkout.stripe.com", "https://static.cloudflareinsights.com", "https:", "wss:"],
      fontSrc: ["'self'", "data:", "https://fonts.gstatic.com", "https:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'", "data:", "blob:", "https:"],
      frameSrc: ["'self'", "https://js.stripe.com", "https://checkout.stripe.com", "https://hooks.stripe.com"],
      frameAncestors: ["'self'", "https:", "http:"], // Allow embedding from any origin
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false, // Disable for in-app browser compatibility
  crossOriginResourcePolicy: { policy: "cross-origin" }, // Allow cross-origin resource loading
  hidePoweredBy: true,
  referrerPolicy: { policy: "no-referrer-when-downgrade" } // More permissive referrer policy
}));

// Compression
app.use(compression());

// CORS Configuration - Allow all origins (security handled by auth middleware)
// This ensures the app works in all browsers including in-app browsers (Instagram, Twitter, etc.)
logger.info('CORS configuration', { mode: 'permissive - all origins allowed' });

app.use(cors({
  origin: true, // Allow all origins
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH', 'HEAD'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Stripe-Signature', 'Cache-Control', 'Pragma', 'Accept', 'Origin', 'X-CSRF-Token'],
  exposedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400, // Cache preflight for 24 hours
  optionsSuccessStatus: 200
}));

// Body parsing
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files
const distPath = path.join(__dirname, '..', 'dist');
if (config.isProduction) {
  app.use(express.static(distPath, {
    maxAge: '1d',
    etag: true
  }));
  logger.info(`✅ Serving static files from ${distPath}`);
}

// Initialize caches
const processedTransactions = new TTLCache<string, unknown>(7 * 24 * 60 * 60 * 1000); // 7 days TTL

// Create rate limiters
const authRateLimiter = createAuthLimiter();
const generalRateLimiter = createGeneralLimiter();
const paymentLimiter = createPaymentLimiter();
const freeImageRateLimiter = createFreeImageLimiter();
const wanStatusLimiter = createWanStatusLimiter();
const wanSubmitLimiter = createWanSubmitLimiter();
const wanResultLimiter = createWanResultLimiter();
const blockchainRpcLimiter = createBlockchainRpcLimiter();

// Apply general rate limiting to all API routes
app.use('/api/', generalRateLimiter);

// Prepare dependency injection for routes
const routeDeps = {
  // Middleware
  authenticateToken,
  authenticateFlexible,
  requireVerifiedAuth,
  authRateLimiter,
  paymentLimiter,
  freeImageRateLimiter,
  wanStatusLimiter,
  wanSubmitLimiter,
  wanResultLimiter,
  blockchainRpcLimiter,
  requireCreditsForModel,
  requireCreditsForVideo,
  requireCredits,
  
  // Caches
  processedTransactions,
  
  // Secrets (for routes that need them directly)
  JWT_SECRET: config.JWT_SECRET,
  JWT_REFRESH_SECRET: config.JWT_REFRESH_SECRET
};

// Static routes at root level (robots.txt, favicon)
app.get('/robots.txt', (req: Request, res: Response) => {
  res.type('text/plain');
  res.send(`User-agent: *
Allow: /
Sitemap: https://seisoai.com/sitemap.xml`);
});

app.get('/favicon.ico', (req: Request, res: Response) => {
  res.redirect(301, '/1d1c7555360a737bb22bbdfc2784655f.png');
});

// API Routes
app.use('/api', createApiRoutes(routeDeps));

// Legacy checkout route at root level for backwards compatibility
// Forward /create-checkout-session to /api/stripe/checkout-session
import createStripeRoutes from './routes/stripe';
const stripeRoutes = createStripeRoutes(routeDeps);
app.post('/create-checkout-session', (req: Request, res: Response, next: NextFunction) => {
  req.url = '/checkout-session';
  stripeRoutes(req, res, next);
});

// Fallback for SPA routing (production only)
if (config.isProduction) {
  app.get('*', (req: Request, res: Response) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// Error handler
const errorHandler: ErrorRequestHandler = (err: Error & { status?: number }, req: Request, res: Response, next: NextFunction) => {
  logger.error('Unhandled error:', {
    error: err.message,
    stack: config.isDevelopment ? err.stack : undefined,
    path: req.path
  });

  res.status(err.status || 500).json({
    success: false,
    error: config.isProduction ? 'Internal server error' : err.message
  });
};

app.use(errorHandler);

// Initialize and start server
async function startServer(): Promise<void> {
  try {
    // Connect to database
    await connectDatabase();

    // Initialize Stripe
    await initializeStripe();

    // Log FAL configuration
    if (config.FAL_API_KEY) {
      logger.info('FAL API key configured');
    } else {
      logger.warn('FAL API key not configured - image generation will not work');
    }

    // Start listening
    const PORT = config.PORT;
    const HOST = config.HOST || '0.0.0.0';

    logger.info('Starting server...', { host: HOST, port: PORT });

    app.listen(PORT, HOST, () => {
      logger.info(`AI Image Generator API running on port ${PORT}`);
      logger.info(`Environment: ${config.NODE_ENV}`);
      logger.info('Server started successfully');
    });
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to start server:', { error: err.message });
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Handle uncaught errors
process.on('uncaughtException', (error: Error) => {
  console.error('UNCAUGHT EXCEPTION:', error);
  logger.error('Uncaught exception:', { error: error.message, stack: error.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason: unknown) => {
  logger.error('Unhandled rejection:', { reason });
});

// Start the server
startServer();

export default app;

