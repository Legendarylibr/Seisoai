/**
 * Graceful Shutdown Service
 * Enterprise-grade connection draining and cleanup
 * 
 * Features:
 * - HTTP connection draining
 * - Database connection cleanup
 * - Redis connection cleanup
 * - In-flight request tracking
 * - Configurable shutdown timeout
 */
import type { Server } from 'http';
import mongoose from 'mongoose';
import { closeAll as closeQueues } from './jobQueue.js';
import { closeRedis as disconnectRedis } from './redis.js';
import logger from '../utils/logger.js';

// Configuration
const SHUTDOWN_TIMEOUT_MS = parseInt(process.env.SHUTDOWN_TIMEOUT_MS || '30000', 10);
const DRAIN_TIMEOUT_MS = parseInt(process.env.DRAIN_TIMEOUT_MS || '10000', 10);

// Track in-flight requests
let inFlightRequests = 0;
let isShuttingDown = false;

/**
 * Increment in-flight request counter
 * Call this at the start of each request
 */
export function trackRequest(): void {
  if (!isShuttingDown) {
    inFlightRequests++;
  }
}

/**
 * Decrement in-flight request counter
 * Call this when a request completes
 */
export function untrackRequest(): void {
  inFlightRequests = Math.max(0, inFlightRequests - 1);
}

/**
 * Get current in-flight request count
 */
export function getInFlightCount(): number {
  return inFlightRequests;
}

/**
 * Check if shutdown is in progress
 */
export function isShutdownInProgress(): boolean {
  return isShuttingDown;
}

/**
 * Wait for in-flight requests to complete
 */
async function drainConnections(): Promise<void> {
  const startTime = Date.now();
  
  while (inFlightRequests > 0) {
    if (Date.now() - startTime > DRAIN_TIMEOUT_MS) {
      logger.warn('Drain timeout exceeded, forcing shutdown', {
        remainingRequests: inFlightRequests,
      });
      break;
    }
    
    logger.info('Waiting for in-flight requests', {
      count: inFlightRequests,
      elapsed: Date.now() - startTime,
    });
    
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

/**
 * Close all database connections
 */
async function closeDatabaseConnections(): Promise<void> {
  try {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
      logger.info('MongoDB connection closed');
    }
  } catch (error) {
    logger.error('Error closing MongoDB connection', {
      error: (error as Error).message,
    });
  }
}

/**
 * Close Redis connections
 */
async function closeRedisConnections(): Promise<void> {
  try {
    await disconnectRedis();
    logger.info('Redis connection closed');
  } catch (error) {
    logger.error('Error closing Redis connection', {
      error: (error as Error).message,
    });
  }
}

/**
 * Close job queues
 */
async function closeJobQueues(): Promise<void> {
  try {
    await closeQueues();
    logger.info('Job queues closed');
  } catch (error) {
    logger.error('Error closing job queues', {
      error: (error as Error).message,
    });
  }
}

/**
 * Perform graceful shutdown
 */
async function performShutdown(server: Server, signal: string): Promise<void> {
  logger.info('Initiating graceful shutdown', { signal });
  isShuttingDown = true;
  
  // Set a hard timeout for the entire shutdown process
  const forceExitTimeout = setTimeout(() => {
    logger.error('Shutdown timeout exceeded, forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  
  try {
    // Step 1: Stop accepting new connections
    logger.info('Stopping HTTP server...');
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    logger.info('HTTP server stopped');
    
    // Step 2: Wait for in-flight requests to complete
    logger.info('Draining connections...');
    await drainConnections();
    logger.info('Connections drained');
    
    // Step 3: Close all external connections in parallel
    logger.info('Closing external connections...');
    await Promise.allSettled([
      closeDatabaseConnections(),
      closeRedisConnections(),
      closeJobQueues(),
    ]);
    logger.info('External connections closed');
    
    // Clear the force exit timeout
    clearTimeout(forceExitTimeout);
    
    logger.info('Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', {
      error: (error as Error).message,
    });
    clearTimeout(forceExitTimeout);
    process.exit(1);
  }
}

/**
 * Setup graceful shutdown handlers
 * Call this once after creating the HTTP server
 */
export function setupGracefulShutdown(server: Server): void {
  // Handle termination signals
  const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT', 'SIGUSR2'];
  
  signals.forEach(signal => {
    process.on(signal, () => {
      if (isShuttingDown) {
        logger.warn('Shutdown already in progress, ignoring signal', { signal });
        return;
      }
      performShutdown(server, signal);
    });
  });
  
  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', {
      error: error.message,
      stack: error.stack,
    });
    
    if (!isShuttingDown) {
      performShutdown(server, 'uncaughtException');
    }
  });
  
  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, _promise) => {
    logger.error('Unhandled rejection', {
      reason: String(reason),
    });
  });
  
  logger.info('Graceful shutdown handlers registered');
}

/**
 * Create request tracking middleware
 */
export function requestTrackingMiddleware() {
  return (_req: unknown, res: { on: (event: string, callback: () => void) => void; status?: (code: number) => { json: (body: unknown) => void } }, next: () => void) => {
    if (isShuttingDown && res.status) {
      // Return 503 if shutting down
      res.status(503).json({
        success: false,
        error: 'Server is shutting down',
      });
      return;
    }
    
    trackRequest();
    
    res.on('finish', untrackRequest);
    res.on('close', untrackRequest);
    
    next();
  };
}

export default {
  setupGracefulShutdown,
  requestTrackingMiddleware,
  trackRequest,
  untrackRequest,
  getInFlightCount,
  isShutdownInProgress,
};
