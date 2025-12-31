/**
 * Database configuration and connection
 */
import mongoose from 'mongoose';
import logger from '../utils/logger.js';
import config from './env.js';

// MongoDB connection options
const mongoOptions = {
  maxPoolSize: 100,
  minPoolSize: 5,
  serverSelectionTimeoutMS: 30000,
  socketTimeoutMS: 60000,
  maxIdleTimeMS: 60000,
  connectTimeoutMS: 30000,
  heartbeatFrequencyMS: 10000,
  retryWrites: true,
  retryReads: true,
  waitQueueTimeoutMS: 15000,
  compressors: ['zlib'],
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
export async function connectDatabase() {
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
    logger.error('MongoDB connection failed:', { error: error.message });
    if (config.isProduction) {
      process.exit(1);
    }
    return false;
  }
}

// Connection event handlers
mongoose.connection.on('error', (err) => {
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
export async function closeDatabase() {
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.close();
    logger.info('MongoDB connection closed');
  }
}

export default { connectDatabase, closeDatabase };



