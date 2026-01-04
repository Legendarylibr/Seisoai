#!/usr/bin/env node

// Real Full-Stack Server with Database (Modular Version)
console.log('🚀 Starting Seiso AI Server (Modular Backend)...');

// Set environment variables
process.env.NODE_ENV = process.env.NODE_ENV || 'production';
process.env.PORT = process.env.PORT || '3001';

// Set MongoDB URI if not provided (for development)
if (!process.env.MONGODB_URI) {
  console.log('⚠️ MONGODB_URI not set - using localhost MongoDB');
  process.env.MONGODB_URI = 'mongodb://localhost:27017/seiso-ai';
}

// Set required environment variables for backend
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'your-super-secret-jwt-key-here-32-chars-minimum';
  console.log('⚠️ JWT_SECRET not set - using default (NOT SECURE FOR PRODUCTION)');
}

if (!process.env.SESSION_SECRET) {
  process.env.SESSION_SECRET = 'your-session-secret-here-32-chars-minimum';
  console.log('⚠️ SESSION_SECRET not set - using default (NOT SECURE FOR PRODUCTION)');
}

console.log('Environment variables:');
console.log('  PORT:', process.env.PORT);
console.log('  NODE_ENV:', process.env.NODE_ENV);
console.log('  MONGODB_URI:', process.env.MONGODB_URI ? 'Set ✓' : 'Not set');

// Import the modular backend server (auto-starts on import)
import('./backend/server-modular.ts')
  .then(() => {
    console.log('✅ Modular backend server started successfully');
  })
  .catch((error: unknown) => {
    const err = error as Error;
    console.error('❌ Failed to start modular backend server:', err.message);
    console.error('Stack:', err.stack);
    process.exit(1);
  });


