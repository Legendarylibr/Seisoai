/**
 * Database connection manager
 */
import mongoose from 'mongoose';
import config from '../config/index.js';
import logger from '../utils/logger.js';
// Import models to ensure they're registered
import './models/DiscordUser.js';
import User, { ensureUserModel } from './models/User.js';

let isConnected = false;
let connectionPromise: Promise<void> | null = null;

export async function connectDatabase(): Promise<void> {
  if (isConnected) {
    logger.info('Already connected to MongoDB');
    return;
  }

  // If connection is in progress, wait for it
  if (connectionPromise) {
    return connectionPromise;
  }

  connectionPromise = (async () => {
    try {
      mongoose.set('strictQuery', true);
      // Increase buffer timeout to 30 seconds
      mongoose.set('bufferTimeoutMS', 30000);
      // Disable buffering commands if connection fails
      mongoose.set('bufferCommands', true);
      
      await mongoose.connect(config.mongodb.uri, {
        serverSelectionTimeoutMS: 10000, // Increased from 5000
        socketTimeoutMS: 45000,
        maxPoolSize: 10,
        minPoolSize: 1,
      });

      // Ensure User model is registered after connection
      ensureUserModel();

      isConnected = true;
      logger.info('Connected to MongoDB successfully');

      mongoose.connection.on('error', (err) => {
        logger.error('MongoDB connection error:', { error: err.message });
        isConnected = false;
      });

      mongoose.connection.on('disconnected', () => {
        logger.warn('MongoDB disconnected');
        isConnected = false;
      });

      mongoose.connection.on('reconnected', () => {
        logger.info('MongoDB reconnected');
        isConnected = true;
      });

    } catch (error) {
      const err = error as Error;
      logger.error('Failed to connect to MongoDB:', { error: err.message });
      isConnected = false;
      connectionPromise = null;
      throw error;
    }
  })();

  return connectionPromise;
}

export async function disconnectDatabase(): Promise<void> {
  if (!isConnected) return;
  
  try {
    await mongoose.disconnect();
    isConnected = false;
    logger.info('Disconnected from MongoDB');
  } catch (error) {
    const err = error as Error;
    logger.error('Error disconnecting from MongoDB:', { error: err.message });
  }
}

export { isConnected };

/**
 * Ensure database is connected before operations
 * Throws error if not connected
 */
export async function ensureConnected(): Promise<void> {
  if (!isConnected || mongoose.connection.readyState !== 1) {
    logger.warn('Database not connected, attempting to reconnect...');
    await connectDatabase();
  }
}

