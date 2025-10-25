#!/usr/bin/env node

// Test script to verify deployment configuration
console.log('🧪 Testing deployment configuration...');

// Test 1: Check if start-app.js can be imported
try {
  console.log('✅ Testing start-app.js import...');
  await import('./start-app.js');
  console.log('✅ start-app.js loads successfully');
} catch (error) {
  console.error('❌ start-app.js import failed:', error.message);
  process.exit(1);
}

// Test 2: Check if backend server can be imported
try {
  console.log('✅ Testing backend server import...');
  const { default: app } = await import('./backend/server.js');
  console.log('✅ Backend server loads successfully');
} catch (error) {
  console.error('❌ Backend server import failed:', error.message);
  process.exit(1);
}

// Test 3: Check environment variables
console.log('✅ Environment check:');
console.log('  - NODE_ENV:', process.env.NODE_ENV || 'not set');
console.log('  - PORT:', process.env.PORT || 'not set');
console.log('  - MONGODB_URI:', process.env.MONGODB_URI ? 'set' : 'not set');

console.log('🎉 All deployment tests passed!');
