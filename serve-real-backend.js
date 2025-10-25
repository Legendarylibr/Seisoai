#!/usr/bin/env node

// Real Full-Stack Server with Database
console.log('🚀 Starting Real Full-Stack Seiso AI Server...');

// Set environment variables
process.env.NODE_ENV = process.env.NODE_ENV || 'production';
process.env.PORT = process.env.PORT || 3001;

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
console.log('PORT:', process.env.PORT);
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('MONGODB_URI:', process.env.MONGODB_URI ? 'Set' : 'Not set');

// Import and start the real backend server
import('./backend/server.js').then(({ startServer }) => {
  console.log('✅ Backend server imported successfully');
  startServer();
}).catch(error => {
  console.error('❌ Failed to start backend server:', error);
  process.exit(1);
});
