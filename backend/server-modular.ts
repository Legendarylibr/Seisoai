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
import swaggerUi from 'swagger-ui-express';
import fs from 'fs';
import logger from './utils/logger.js';

// Config
import config from './config/env.js';
import { connectDatabase } from './config/database.js';

// Services
import { initializeStripe } from './services/stripe.js';
import { TTLCache } from './services/cache.js';
import { initializeRedis, closeRedis } from './services/redis.js';
import { initializeQueues, closeAll as closeQueues } from './services/jobQueue.js';
import { getAllCircuitStats } from './services/circuitBreaker.js';

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
import { requestIdMiddleware } from './middleware/requestId.js';
import { createValidateInput } from './middleware/validation.js';

// Routes
import { createVersionedRoutes } from './routes/versioned.js';

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
  crossOriginOpenerPolicy: { policy: "unsafe-none" }, // Explicitly allow navigation from Twitter/other apps
  crossOriginResourcePolicy: { policy: "cross-origin" }, // Allow cross-origin resource loading
  hidePoweredBy: true,
  referrerPolicy: { policy: "no-referrer-when-downgrade" }, // More permissive referrer policy
  originAgentCluster: false, // Disable for in-app browser compatibility
  xFrameOptions: false // Disable X-Frame-Options - CSP frame-ancestors handles this (ALLOWALL is not valid)
}));

// CRITICAL: Handle preflight OPTIONS requests explicitly for all routes
// This ensures Twitter/Instagram in-app browsers work on first load
app.options('*', cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH', 'HEAD'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Stripe-Signature', 'Cache-Control', 'Pragma', 'Accept', 'Origin', 'X-CSRF-Token'],
  exposedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
  optionsSuccessStatus: 200
}));

// Compression
app.use(compression());

// CORS Configuration - Use allowed origins from env
// SECURITY: In production, ALLOWED_ORIGINS should be explicitly set
const parseAllowedOrigins = (): string[] | true => {
  const originsEnv = config.ALLOWED_ORIGINS;
  
  // SECURITY WARNING: Permissive CORS in production is a security risk
  if (config.isProduction && (!originsEnv || originsEnv.trim() === '' || originsEnv === '*')) {
    logger.error('SECURITY WARNING: CORS is permissive in production! Set ALLOWED_ORIGINS environment variable.');
    logger.error('Example: ALLOWED_ORIGINS=https://yourapp.com,https://www.yourapp.com');
    // In production, still allow but log loudly - operators should fix this
  }
  
  if (!originsEnv || originsEnv.trim() === '' || originsEnv === '*') {
    // Permissive mode - ONLY use in development or when in-app browsers are required
    return true;
  }
  return originsEnv.split(',').map(o => o.trim()).filter(o => o.length > 0);
};

const allowedOrigins = parseAllowedOrigins();
const corsMode = allowedOrigins === true ? 'permissive - all origins allowed (SECURITY RISK in production)' : `restricted - ${(allowedOrigins as string[]).length} origins`;
logger.info('CORS configuration', { mode: corsMode, isProduction: config.isProduction });

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH', 'HEAD'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Stripe-Signature', 'Cache-Control', 'Pragma', 'Accept', 'Origin', 'X-CSRF-Token'],
  exposedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400, // Cache preflight for 24 hours
  optionsSuccessStatus: 200
}));

// Body parsing
// Stripe webhook needs raw body
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));
// Audio routes need larger body limit for video uploads (100MB video = ~133MB base64)
app.use('/api/audio', express.json({ limit: '150mb' }));
// Default limit for other routes
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files with in-app browser compatible headers
const distPath = path.join(__dirname, '..', 'dist');
if (config.isProduction) {
  // Add headers for HTML files to work in Twitter/Instagram in-app browsers
  app.use((req: Request, res: Response, next: NextFunction) => {
    // For HTML pages, add headers that help with in-app browsers
    if (req.path === '/' || req.path.endsWith('.html') || !req.path.includes('.')) {
      // Ensure browser doesn't block storage in in-app browsers
      res.setHeader('Permissions-Policy', 'interest-cohort=()');
    }
    next();
  });
  
  app.use(express.static(distPath, {
    maxAge: '1d',
    etag: true,
    setHeaders: (res, filePath) => {
      // For HTML files, set no-cache to ensure fresh content
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }
    }
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

// Request ID middleware for tracing
app.use(requestIdMiddleware);

// Apply input validation globally to prevent NoSQL injection and sanitize inputs
// This must come before routes but after body parsing
const validateInput = createValidateInput();
app.use('/api/', validateInput);

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

// API Documentation (Swagger UI)
const openapiPath = path.join(__dirname, 'docs', 'openapi.yaml');
if (fs.existsSync(openapiPath)) {
  // Load YAML and parse it
  import('fs').then(fsModule => {
    const yamlContent = fsModule.readFileSync(openapiPath, 'utf8');
    // Simple YAML to JSON conversion for swagger-ui
    try {
      // Use dynamic import for yaml parsing or serve raw
      app.use('/api/docs', swaggerUi.serve);
      app.get('/api/docs', swaggerUi.setup(null, {
        swaggerUrl: '/api/openapi.yaml'
      }));
      app.get('/api/openapi.yaml', (req, res) => {
        res.type('text/yaml').send(yamlContent);
      });
      logger.info('API documentation available at /api/docs');
    } catch {
      logger.warn('Failed to load OpenAPI spec');
    }
  });
}

// API Routes (versioned: /api/v1/* and /api/*)
app.use('/api', createVersionedRoutes(routeDeps));

// Circuit breaker stats endpoint
app.get('/api/circuit-stats', (req: Request, res: Response) => {
  res.json({
    success: true,
    circuits: getAllCircuitStats()
  });
});

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
    // Set headers for in-app browser compatibility
    // Note: X-Frame-Options is set to SAMEORIGIN for security; frame-ancestors in CSP handles embedding
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// Error handler with request ID
const errorHandler: ErrorRequestHandler = (err: Error & { status?: number }, req: Request, res: Response, _next: NextFunction) => {
  const requestId = req.requestId || 'unknown';
  
  logger.error('Unhandled error:', {
    requestId,
    error: err.message,
    stack: config.isDevelopment ? err.stack : undefined,
    path: req.path,
    method: req.method
  });

  res.status(err.status || 500).json({
    success: false,
    error: config.isProduction ? 'Internal server error' : err.message,
    requestId
  });
};

app.use(errorHandler);

// Initialize and start server
async function startServer(): Promise<void> {
  try {
    // Connect to database
    await connectDatabase();

    // Initialize Redis (optional - falls back to in-memory cache)
    await initializeRedis();

    // Initialize job queues (requires Redis)
    initializeQueues();

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

    logger.info('Starting server...', { host: HOST, port: PORT, apiVersion: config.API_VERSION });

    app.listen(PORT, HOST, () => {
      logger.info(`AI Image Generator API running on port ${PORT}`);
      logger.info(`Environment: ${config.NODE_ENV}`);
      logger.info(`API Version: ${config.API_VERSION}`);
      logger.info('Server started successfully');
    });
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to start server:', { error: err.message });
    process.exit(1);
  }
}

// Graceful shutdown
async function gracefulShutdown(signal: string): Promise<void> {
  logger.info(`${signal} received, shutting down gracefully`);
  
  try {
    // Close job queues
    await closeQueues();
    
    // Close Redis connection
    await closeRedis();
    
    logger.info('All connections closed successfully');
  } catch (error) {
    const err = error as Error;
    logger.error('Error during shutdown:', { error: err.message });
  }
  
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error: Error) => {
  logger.error('UNCAUGHT EXCEPTION:', { error: error.message, stack: error.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason: unknown) => {
  logger.error('Unhandled rejection:', { reason });
});

// Start the server
startServer();

export default app;

