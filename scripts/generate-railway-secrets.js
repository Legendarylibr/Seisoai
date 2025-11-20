#!/usr/bin/env node
/**
 * Generate secure secrets for Railway environment variables
 * Usage: node scripts/generate-railway-secrets.js
 */

import crypto from 'crypto';

console.log('\n🔐 Generating Secure Secrets for Railway\n');
console.log('='.repeat(60));
console.log('Copy these to Railway dashboard → Variables tab:\n');

// Generate JWT_SECRET (32 bytes = 64 hex characters)
const jwtSecret = crypto.randomBytes(32).toString('hex');
console.log('JWT_SECRET=' + jwtSecret);
console.log('');

// Generate SESSION_SECRET (24 bytes = 48 hex characters)
const sessionSecret = crypto.randomBytes(24).toString('hex');
console.log('SESSION_SECRET=' + sessionSecret);
console.log('');

console.log('='.repeat(60));
console.log('\n📋 Required Environment Variables for Signup:\n');
console.log('1. MONGODB_URI - Your MongoDB connection string');
console.log('   Example: mongodb+srv://user:pass@cluster.mongodb.net/dbname');
console.log('');
console.log('2. JWT_SECRET - (generated above)');
console.log('');
console.log('3. SESSION_SECRET - (generated above)');
console.log('');
console.log('4. NODE_ENV=production');
console.log('');
console.log('💡 How to set in Railway:');
console.log('   1. Go to Railway dashboard');
console.log('   2. Select your backend service');
console.log('   3. Go to Variables tab');
console.log('   4. Click "+ New Variable"');
console.log('   5. Paste each variable name and value');
console.log('   6. Redeploy the service');
console.log('');

