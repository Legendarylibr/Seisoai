#!/usr/bin/env node

// Real Full-Stack Server with Database (Modular Version)
console.log('🚀 Starting Seiso AI Server (Modular Backend)...');

// Set environment variables
process.env.NODE_ENV = process.env.NODE_ENV || 'production';
process.env.PORT = process.env.PORT || '3001';

const isProduction = process.env.NODE_ENV === 'production';

// Validate required environment variables in production
if (isProduction) {
  const requiredVars = ['MONGODB_URI', 'JWT_SECRET', 'ENCRYPTION_KEY'];
  const missing = requiredVars.filter(v => !process.env[v]);
  if (missing.length > 0) {
    console.error('❌ FATAL: Missing required environment variables in production:', missing.join(', '));
    console.error('Please set these in your Railway/deployment platform.');
    process.exit(1);
  }
} else {
  // Development fallbacks only
  if (!process.env.MONGODB_URI) {
    console.log('⚠️ MONGODB_URI not set - using localhost MongoDB (dev only)');
    process.env.MONGODB_URI = 'mongodb://localhost:27017/seiso-ai';
  }
  
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = 'dev-only-insecure-jwt-secret-do-not-use-in-prod';
    console.log('⚠️ JWT_SECRET not set - using insecure default (dev only)');
  }
  
  if (!process.env.SESSION_SECRET) {
    process.env.SESSION_SECRET = 'dev-only-insecure-session-secret-do-not-use';
    console.log('⚠️ SESSION_SECRET not set - using insecure default (dev only)');
  }
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





