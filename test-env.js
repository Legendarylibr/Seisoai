#!/usr/bin/env node

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.PORT = '3001';
process.env.MONGODB_URI = 'mongodb://localhost:27017/test';
process.env.JWT_SECRET = 'test-jwt-secret-key-32-chars-minimum';
process.env.SESSION_SECRET = 'test-session-secret-key-32-chars-minimum';

console.log('🧪 Test environment configured');
console.log('  - NODE_ENV:', process.env.NODE_ENV);
console.log('  - PORT:', process.env.PORT);
console.log('  - MONGODB_URI:', process.env.MONGODB_URI ? 'set' : 'not set');
console.log('  - JWT_SECRET:', process.env.JWT_SECRET ? 'set' : 'not set');
console.log('  - SESSION_SECRET:', process.env.SESSION_SECRET ? 'set' : 'not set');

// Now run the deployment test
import('./test-deployment.js');
