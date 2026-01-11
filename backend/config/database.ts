/**
 * Database configuration and connection
 */
import mongoose, { type ConnectOptions } from 'mongoose';
import logger from '../utils/logger';
import config from './env';

// MongoDB connection options
// Memory optimization: Reduced pool size from 100 to 20
// Most apps don't need 100 connections; each connection uses ~1MB RAM
// Increase only if you see waitQueue timeout errors under load
const mongoOptions: ConnectOptions = {
  maxPoolSize: 20,         // Reduced from 100 - saves ~80MB RAM
  minPoolSize: 2,          // Reduced from 5 - faster cold starts
  serverSelectionTimeoutMS: 30000,
  socketTimeoutMS: 60000,
  maxIdleTimeMS: 30000,    // Reduced from 60000 - close idle connections faster
  connectTimeoutMS: 30000,
  heartbeatFrequencyMS: 10000,
  retryWrites: true,
  retryReads: true,
  waitQueueTimeoutMS: 15000,
  compressors: ['zlib'],   // Network compression - reduces bandwidth
  family: 4
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
 * Connect to MongoDB
 */
export async function connectDatabase(): Promise<boolean> {
  if (!config.MONGODB_URI) {
    logger.error('MONGODB_URI not provided');
    if (config.isProduction) {
      process.exit(1);
    }
    return false;
  }

  try {
    logger.info('Connecting to MongoDB...');
    await mongoose.connect(config.MONGODB_URI, mongoOptions);
    logger.info('MongoDB connected successfully');
    return true;
  } catch (error) {
    const err = error as Error;
    logger.error('MongoDB connection failed:', { error: err.message });
    if (config.isProduction) {
      process.exit(1);
    }
    return false;
  }
}

// Connection event handlers
mongoose.connection.on('error', (err: Error) => {
  logger.error('MongoDB connection error:', { error: err.message });
});

mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB disconnected');
});

mongoose.connection.on('connected', () => {
  logger.info('MongoDB connected');
});

/**
 * Close database connection gracefully
 */
export async function closeDatabase(): Promise<void> {
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.close();
    logger.info('MongoDB connection closed');
  }
}

export default { connectDatabase, closeDatabase };





