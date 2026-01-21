/**
 * Database configuration and connection
 * Enhanced with automatic reconnection, exponential backoff, and stability improvements
 */
import mongoose, { type ConnectOptions } from 'mongoose';
import logger from '../utils/logger';
import config from './env';

// Connection state tracking
let isConnecting = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const BASE_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 60000;
let reconnectTimer: NodeJS.Timeout | null = null;
let healthCheckInterval: NodeJS.Timeout | null = null;

// MongoDB connection options - optimized for stability and scaling
// Calculate optimal pool size based on environment
// Formula: (maxPoolSize per instance) * (number of instances) should not exceed MongoDB connection limit
const getOptimalPoolSize = (): number => {
  // Allow override via environment variable
  const envPoolSize = process.env.MONGODB_MAX_POOL_SIZE;
  if (envPoolSize) {
    return parseInt(envPoolSize, 10);
  }
  
  // Production: Higher pool size for better throughput
  // Each connection uses ~1-2MB RAM, so 50 connections = ~100MB per instance
  // With 3 instances, that's 150 connections total (well below typical MongoDB Atlas M10 limit of 350)
  if (config.isProduction) {
    return 50;  // Increased from 20 for better scaling
  }
  
  // Development: Lower pool size
  return 10;
};

const mongoOptions: ConnectOptions = {
  // Connection pool settings - optimized for scaling
  maxPoolSize: getOptimalPoolSize(),
  minPoolSize: config.isProduction ? 5 : 2,  // Higher min pool for production to reduce connection churn
  
  // Timeout settings - increased for unstable networks
  serverSelectionTimeoutMS: 45000,   // Increased from 30s - more time for DNS resolution
  socketTimeoutMS: 90000,            // Increased from 60s - handle slow queries
  maxIdleTimeMS: 60000,              // Increased to reduce reconnection churn
  connectTimeoutMS: 45000,           // Increased for slow connections
  
  // Heartbeat and monitoring
  heartbeatFrequencyMS: 10000,       // Check connection every 10s
  
  // Retry settings
  retryWrites: true,
  retryReads: true,
  waitQueueTimeoutMS: 30000,         // Increased from 15s
  
  // Network optimizations
  compressors: ['zlib'],             // Reduce bandwidth
  family: 4,                         // Force IPv4 - more stable DNS
  
  // DNS workaround for SRV issues
  directConnection: false,           // Use SRV by default
};

// Add SSL for production
if (config.isProduction) {
  mongoOptions.ssl = true;
  mongoOptions.tlsAllowInvalidCertificates = false;
  mongoOptions.authSource = 'admin';
  mongoOptions.w = 'majority';
}

// Global mongoose settings
mongoose.set('bufferCommands', true);
mongoose.set('autoIndex', !config.isProduction);

/**
 * Calculate exponential backoff delay
 */
function getReconnectDelay(): number {
  const delay = Math.min(
    BASE_RECONNECT_DELAY_MS * Math.pow(2, reconnectAttempts),
    MAX_RECONNECT_DELAY_MS
  );
  // Add jitter (±20%) to prevent thundering herd
  const jitter = delay * 0.2 * (Math.random() - 0.5);
  return Math.round(delay + jitter);
}

/**
 * Attempt to reconnect with exponential backoff
 */
async function attemptReconnect(): Promise<void> {
  if (isConnecting) {
    logger.debug('Reconnection already in progress, skipping');
    return;
  }

  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    logger.error('Max reconnection attempts reached. Manual intervention required.', {
      attempts: reconnectAttempts,
      maxAttempts: MAX_RECONNECT_ATTEMPTS
    });
    return;
  }

  isConnecting = true;
  reconnectAttempts++;
  const delay = getReconnectDelay();

  logger.info(`Attempting MongoDB reconnection`, {
    attempt: reconnectAttempts,
    maxAttempts: MAX_RECONNECT_ATTEMPTS,
    delayMs: delay
  });

  try {
    // Clear any existing connection
    if (mongoose.connection.readyState !== 0) {
      try {
        await mongoose.connection.close();
      } catch (closeError) {
        // Ignore close errors during reconnection
      }
    }

    await mongoose.connect(config.MONGODB_URI!, mongoOptions);
    logger.info('MongoDB reconnected successfully');
    reconnectAttempts = 0; // Reset on successful connection
  } catch (error) {
    const err = error as Error;
    logger.error('MongoDB reconnection failed:', { 
      error: err.message,
      attempt: reconnectAttempts,
      nextRetryMs: getReconnectDelay()
    });
    
    // Schedule next retry
    scheduleReconnect();
  } finally {
    isConnecting = false;
  }
}

/**
 * Schedule a reconnection attempt
 */
function scheduleReconnect(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
  }

  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    return;
  }

  const delay = getReconnectDelay();
  reconnectTimer = setTimeout(() => attemptReconnect(), delay);
}

/**
 * Connect to MongoDB with enhanced stability
 */
export async function connectDatabase(): Promise<boolean> {
  if (!config.MONGODB_URI) {
    logger.error('MONGODB_URI not provided');
    if (config.isProduction) {
      process.exit(1);
    }
    return false;
  }

  // If already connected, return true
  if (mongoose.connection.readyState === 1) {
    logger.debug('MongoDB already connected');
    return true;
  }

  if (isConnecting) {
    logger.debug('Connection already in progress');
    return false;
  }

  isConnecting = true;

  try {
    logger.info('Connecting to MongoDB...');
    
    // Try connection with standard SRV first
    try {
      await mongoose.connect(config.MONGODB_URI, mongoOptions);
    } catch (srvError) {
      const err = srvError as Error;
      
      // If SRV fails due to DNS issues, try with modified options
      if (err.message.includes('querySrv') || err.message.includes('ETIMEOUT') || err.message.includes('ENOTFOUND')) {
        logger.warn('SRV DNS resolution failed, retrying with extended timeout...', {
          error: err.message
        });
        
        // Retry with even longer timeouts for DNS issues
        const extendedOptions: ConnectOptions = {
          ...mongoOptions,
          serverSelectionTimeoutMS: 60000,
          connectTimeoutMS: 60000,
        };
        
        await mongoose.connect(config.MONGODB_URI, extendedOptions);
      } else {
        throw srvError;
      }
    }
    
    logger.info('MongoDB connected successfully');
    reconnectAttempts = 0;
    
    // Start health check interval
    startHealthCheck();
    
    return true;
  } catch (error) {
    const err = error as Error;
    logger.error('MongoDB connection failed:', { error: err.message });
    
    if (config.isProduction) {
      // In production, schedule reconnection instead of exiting
      logger.info('Scheduling reconnection attempt...');
      scheduleReconnect();
      // Don't exit - let the app start and retry
    }
    
    return false;
  } finally {
    isConnecting = false;
  }
}

/**
 * Start periodic health check for connection stability
 */
function startHealthCheck(): void {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
  }

  // Check connection health every 30 seconds
  healthCheckInterval = setInterval(async () => {
    try {
      if (mongoose.connection.readyState !== 1) {
        logger.warn('Health check: MongoDB not connected, triggering reconnection');
        scheduleReconnect();
        // Update metrics
        try {
          const { updateDbConnectionPoolMetrics } = await import('../services/metrics.js');
          updateDbConnectionPoolMetrics();
        } catch {
          // Ignore metrics errors
        }
        return;
      }

      // Ping the database to verify connection is alive
      const start = Date.now();
      await mongoose.connection.db?.admin().ping();
      const latency = Date.now() - start;

      if (latency > 5000) {
        logger.warn('Health check: High MongoDB latency detected', { latencyMs: latency });
      } else {
        logger.debug('Health check: MongoDB connection healthy', { latencyMs: latency });
      }

      // Update connection pool metrics
      try {
        const { updateDbConnectionPoolMetrics } = await import('../services/metrics.js');
        updateDbConnectionPoolMetrics();
      } catch {
        // Ignore metrics errors - don't break health checks
      }
    } catch (error) {
      const err = error as Error;
      logger.error('Health check failed:', { error: err.message });
      scheduleReconnect();
    }
  }, 30000);
}

/**
 * Stop health check interval
 */
function stopHealthCheck(): void {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
  }
}

// Connection event handlers with automatic reconnection
mongoose.connection.on('error', (err: Error) => {
  logger.error('MongoDB connection error:', { error: err.message });
  // Don't immediately reconnect on error - the disconnect event will handle it
});

mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB disconnected');
  
  // Only attempt reconnect if we're not already closing
  if (!isConnecting && mongoose.connection.readyState !== 0) {
    logger.info('Scheduling automatic reconnection...');
    scheduleReconnect();
  }
});

mongoose.connection.on('connected', () => {
  logger.info('MongoDB connected');
  reconnectAttempts = 0; // Reset counter on successful connection
});

mongoose.connection.on('reconnected', () => {
  logger.info('MongoDB reconnected');
  reconnectAttempts = 0;
});

/**
 * Get current connection status
 */
export function getConnectionStatus(): {
  state: string;
  isConnected: boolean;
  reconnectAttempts: number;
} {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  const stateIndex = mongoose.connection.readyState;
  
  return {
    state: states[stateIndex] || 'unknown',
    isConnected: stateIndex === 1,
    reconnectAttempts
  };
}

/**
 * Close database connection gracefully
 */
export async function closeDatabase(): Promise<void> {
  // Stop health check
  stopHealthCheck();
  
  // Clear reconnection timer
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.close();
    logger.info('MongoDB connection closed');
  }
}

export default { connectDatabase, closeDatabase, getConnectionStatus };





