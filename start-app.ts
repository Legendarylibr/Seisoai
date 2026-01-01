#!/usr/bin/env node

// Simple startup script for AI Image Generator
console.log('🚀 Starting AI Image Generator...');

// Set environment variables to prevent MongoDB issues
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-image-generator';

// Override if localhost detected
if (process.env.MONGODB_URI && process.env.MONGODB_URI.includes('localhost')) {
  console.log('⚠️ Localhost MongoDB detected - running without database');
  // Don't set MONGODB_URI to prevent connection attempts
  delete process.env.MONGODB_URI;
}

// Set production environment
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

// Start the modular backend - use dynamic import for ES modules
import('./backend/server-modular.ts').catch((error: unknown) => {
  console.error('❌ Failed to start modular backend server:', error);
  process.exit(1);
});

