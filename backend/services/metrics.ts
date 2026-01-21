/**
 * Prometheus Metrics Service
 * Exposes application metrics for monitoring and alerting
 */
import client from 'prom-client';
import { type Request, type Response, type NextFunction } from 'express';
import logger from '../utils/logger.js';

// Create a Registry
const register = new client.Registry();

// Add default metrics (CPU, memory, event loop, etc.)
client.collectDefaultMetrics({
  register,
  prefix: 'seisoai_',
  labels: { app: 'seisoai-backend' }
});

// ============================================================================
// Custom Application Metrics
// ============================================================================

// HTTP Request metrics
export const httpRequestDuration = new client.Histogram({
  name: 'seisoai_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10],
  registers: [register]
});

export const httpRequestsTotal = new client.Counter({
  name: 'seisoai_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register]
});

export const httpRequestsInFlight = new client.Gauge({
  name: 'seisoai_http_requests_in_flight',
  help: 'Number of HTTP requests currently being processed',
  registers: [register]
});

// Image generation metrics
export const imageGenerationsTotal = new client.Counter({
  name: 'seisoai_image_generations_total',
  help: 'Total number of image generation requests',
  labelNames: ['model', 'status'],
  registers: [register]
});

export const imageGenerationDuration = new client.Histogram({
  name: 'seisoai_image_generation_duration_seconds',
  help: 'Duration of image generation in seconds',
  labelNames: ['model'],
  buckets: [1, 5, 10, 30, 60, 120, 300],
  registers: [register]
});

// Video generation metrics
export const videoGenerationsTotal = new client.Counter({
  name: 'seisoai_video_generations_total',
  help: 'Total number of video generation requests',
  labelNames: ['status'],
  registers: [register]
});

// Payment metrics
export const paymentsTotal = new client.Counter({
  name: 'seisoai_payments_total',
  help: 'Total number of payment transactions',
  labelNames: ['type', 'status', 'chain'],
  registers: [register]
});

export const paymentAmountTotal = new client.Counter({
  name: 'seisoai_payment_amount_usd_total',
  help: 'Total payment amount in USD',
  labelNames: ['type', 'chain'],
  registers: [register]
});

// Credits metrics
export const creditsUsed = new client.Counter({
  name: 'seisoai_credits_used_total',
  help: 'Total credits consumed',
  labelNames: ['operation'],
  registers: [register]
});

export const creditsPurchased = new client.Counter({
  name: 'seisoai_credits_purchased_total',
  help: 'Total credits purchased',
  labelNames: ['method'],
  registers: [register]
});

// User metrics
export const activeUsers = new client.Gauge({
  name: 'seisoai_active_users',
  help: 'Number of active users (with activity in last 24h)',
  registers: [register]
});

export const totalUsers = new client.Gauge({
  name: 'seisoai_total_users',
  help: 'Total number of registered users',
  registers: [register]
});

// Circuit breaker metrics
export const circuitBreakerState = new client.Gauge({
  name: 'seisoai_circuit_breaker_state',
  help: 'Circuit breaker state (0=closed, 1=half-open, 2=open)',
  labelNames: ['name'],
  registers: [register]
});

// Rate limiting metrics
export const rateLimitHits = new client.Counter({
  name: 'seisoai_rate_limit_hits_total',
  help: 'Total number of rate limit hits',
  labelNames: ['limiter'],
  registers: [register]
});

// Database metrics
export const dbConnectionPool = new client.Gauge({
  name: 'seisoai_mongodb_connection_pool',
  help: 'MongoDB connection pool size',
  labelNames: ['state'],
  registers: [register]
});

export const dbQueryDuration = new client.Histogram({
  name: 'seisoai_mongodb_query_duration_seconds',
  help: 'MongoDB query duration in seconds',
  labelNames: ['operation', 'collection'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [register]
});

export const dbQueryErrors = new client.Counter({
  name: 'seisoai_mongodb_query_errors_total',
  help: 'Total MongoDB query errors',
  labelNames: ['operation', 'error_type'],
  registers: [register]
});

// Redis metrics
export const redisConnected = new client.Gauge({
  name: 'seisoai_redis_connected',
  help: 'Redis connection status (1=connected, 0=disconnected)',
  registers: [register]
});

export const redisCommandDuration = new client.Histogram({
  name: 'seisoai_redis_command_duration_seconds',
  help: 'Redis command duration in seconds',
  labelNames: ['command'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
  registers: [register]
});

export const redisCommandErrors = new client.Counter({
  name: 'seisoai_redis_command_errors_total',
  help: 'Total Redis command errors',
  labelNames: ['command', 'error_type'],
  registers: [register]
});

// Job queue metrics
export const jobQueueSize = new client.Gauge({
  name: 'seisoai_job_queue_size',
  help: 'Number of jobs in queue',
  labelNames: ['queue', 'state'],
  registers: [register]
});

// ============================================================================
// Middleware for HTTP metrics
// ============================================================================

/**
 * Express middleware to track HTTP request metrics
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Skip metrics endpoint itself to avoid recursion
  if (req.path === '/api/metrics') {
    next();
    return;
  }

  const startTime = Date.now();
  httpRequestsInFlight.inc();

  // Normalize route for metrics (avoid high cardinality)
  const route = normalizeRoute(req.path);

  res.on('finish', () => {
    const duration = (Date.now() - startTime) / 1000;
    const statusCode = res.statusCode.toString();
    const method = req.method;

    httpRequestDuration.observe({ method, route, status_code: statusCode }, duration);
    httpRequestsTotal.inc({ method, route, status_code: statusCode });
    httpRequestsInFlight.dec();
  });

  next();
}

/**
 * Normalize route paths to prevent high cardinality
 * Replaces dynamic segments with placeholders
 */
function normalizeRoute(path: string): string {
  return path
    // Replace UUIDs
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
    // Replace MongoDB ObjectIds
    .replace(/[0-9a-f]{24}/gi, ':id')
    // Replace numeric IDs
    .replace(/\/\d+/g, '/:id')
    // Replace wallet addresses (Ethereum)
    .replace(/0x[0-9a-fA-F]{40}/g, ':address')
    // Replace Solana addresses
    .replace(/[1-9A-HJ-NP-Za-km-z]{32,44}/g, ':address')
    // Truncate long paths
    .substring(0, 100);
}

// ============================================================================
// Metrics Route Handler
// ============================================================================

/**
 * Express route handler for /api/metrics endpoint
 */
export async function metricsHandler(_req: Request, res: Response): Promise<void> {
  try {
    res.set('Content-Type', register.contentType);
    const metrics = await register.metrics();
    res.end(metrics);
  } catch (error) {
    const err = error as Error;
    logger.error('Error generating metrics', { error: err.message });
    res.status(500).end('Error generating metrics');
  }
}

// ============================================================================
// Helper functions to update metrics
// ============================================================================

/**
 * Record an image generation
 */
export function recordImageGeneration(model: string, success: boolean, durationSeconds?: number): void {
  const status = success ? 'success' : 'failure';
  imageGenerationsTotal.inc({ model, status });
  if (durationSeconds !== undefined && success) {
    imageGenerationDuration.observe({ model }, durationSeconds);
  }
}

/**
 * Record a video generation
 */
export function recordVideoGeneration(success: boolean): void {
  const status = success ? 'success' : 'failure';
  videoGenerationsTotal.inc({ status });
}

/**
 * Record a payment
 */
export function recordPayment(type: 'crypto' | 'stripe', status: string, chain: string, amountUsd?: number): void {
  paymentsTotal.inc({ type, status, chain });
  if (amountUsd && status === 'success') {
    paymentAmountTotal.inc({ type, chain }, amountUsd);
  }
}

/**
 * Record credit usage
 */
export function recordCreditUsage(operation: string, amount: number): void {
  creditsUsed.inc({ operation }, amount);
}

/**
 * Record credit purchase
 */
export function recordCreditPurchase(method: string, amount: number): void {
  creditsPurchased.inc({ method }, amount);
}

/**
 * Update circuit breaker state
 */
export function updateCircuitBreakerState(name: string, state: 'closed' | 'half-open' | 'open'): void {
  const stateValue = state === 'closed' ? 0 : state === 'half-open' ? 1 : 2;
  circuitBreakerState.set({ name }, stateValue);
}

/**
 * Record rate limit hit
 */
export function recordRateLimitHit(limiter: string): void {
  rateLimitHits.inc({ limiter });
}

/**
 * Update user counts
 */
export function updateUserCounts(total: number, active: number): void {
  totalUsers.set(total);
  activeUsers.set(active);
}

/**
 * Update Redis connection status
 */
export function updateRedisStatus(connected: boolean): void {
  redisConnected.set(connected ? 1 : 0);
}

/**
 * Update job queue metrics
 */
export function updateJobQueueMetrics(queue: string, waiting: number, active: number, completed: number, failed: number): void {
  jobQueueSize.set({ queue, state: 'waiting' }, waiting);
  jobQueueSize.set({ queue, state: 'active' }, active);
  jobQueueSize.set({ queue, state: 'completed' }, completed);
  jobQueueSize.set({ queue, state: 'failed' }, failed);
}

/**
 * Update MongoDB connection pool metrics
 * Call this periodically to track pool usage
 */
export function updateDbConnectionPoolMetrics(): void {
  try {
    const connection = require('mongoose').connection;
    if (connection && connection.readyState === 1) {
      const pool = connection.db?.serverConfig?.pool;
      if (pool) {
        // Track active, idle, and waiting connections
        dbConnectionPool.set({ state: 'active' }, pool.currentCheckedOut || 0);
        dbConnectionPool.set({ state: 'idle' }, pool.currentAvailable || 0);
        dbConnectionPool.set({ state: 'waiting' }, pool.waitQueueLength || 0);
        dbConnectionPool.set({ state: 'total' }, (pool.currentCheckedOut || 0) + (pool.currentAvailable || 0));
      } else {
        // Fallback: use connection state
        dbConnectionPool.set({ state: 'connected' }, connection.readyState === 1 ? 1 : 0);
      }
    } else {
      dbConnectionPool.set({ state: 'disconnected' }, 1);
    }
  } catch (error) {
    // Silently fail - metrics shouldn't break the app
  }
}

/**
 * Record a MongoDB query
 */
export function recordDbQuery(operation: string, collection: string, durationSeconds: number, error?: Error): void {
  dbQueryDuration.observe({ operation, collection }, durationSeconds);
  if (error) {
    dbQueryErrors.inc({ operation, error_type: error.constructor.name });
  }
}

/**
 * Record a Redis command
 */
export function recordRedisCommand(command: string, durationSeconds: number, error?: Error): void {
  redisCommandDuration.observe({ command }, durationSeconds);
  if (error) {
    redisCommandErrors.inc({ command, error_type: error.constructor.name });
  }
}

export default {
  register,
  metricsHandler,
  metricsMiddleware,
  recordImageGeneration,
  recordVideoGeneration,
  recordPayment,
  recordCreditUsage,
  recordCreditPurchase,
  updateCircuitBreakerState,
  recordRateLimitHit,
  updateUserCounts,
  updateRedisStatus,
  updateJobQueueMetrics
};

