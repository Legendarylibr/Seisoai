/**
 * Database connection manager
 */
import mongoose from 'mongoose';
import config from '../config/index.js';
import logger from '../utils/logger.js';

let isConnected = false;

export async function connectDatabase(): Promise<void> {
  if (isConnected) {
    logger.info('Already connected to MongoDB');
    return;
  }

  try {
    mongoose.set('strictQuery', true);
    
    await mongoose.connect(config.mongodb.uri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    isConnected = true;
    logger.info('Connected to MongoDB successfully');

    mongoose.connection.on('error', (err) => {
      logger.error('MongoDB connection error:', { error: err.message });
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
      isConnected = false;
    });

  } catch (error) {
    const err = error as Error;
    logger.error('Failed to connect to MongoDB:', { error: err.message });
    throw error;
  }
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

