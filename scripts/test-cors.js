#!/usr/bin/env node

/**
 * CORS Testing Script
 * Tests if allowed origins are being properly validated
 */

import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
const envPath = path.join(__dirname, '..', 'backend.env');
dotenv.config({ path: envPath });

const API_URL = process.env.API_URL || `http://localhost:${process.env.PORT || 3001}`;
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : [];

console.log('🔍 CORS Validation Test\n');
console.log('='.repeat(60));
console.log(`API URL: ${API_URL}`);
console.log(`ALLOWED_ORIGINS: ${ALLOWED_ORIGINS.length > 0 ? ALLOWED_ORIGINS.join(', ') : 'NOT SET (allows any origin)'}`);
console.log('='.repeat(60));
console.log('');

// Test origins
const testOrigins = [
  { origin: 'http://localhost:5173', expected: 'allowed (localhost)' },
  { origin: 'http://127.0.0.1:3000', expected: 'allowed (localhost)' },
  { origin: 'https://example.com', expected: ALLOWED_ORIGINS.length === 0 ? 'allowed (permissive mode)' : 'rejected (not in list)' },
  ...(ALLOWED_ORIGINS.length > 0 ? ALLOWED_ORIGINS.map(origin => ({
    origin,
    expected: 'allowed (in list)'
  })) : []),
  ...(ALLOWED_ORIGINS.length > 0 ? [{
    origin: 'https://malicious-site.com',
    expected: 'rejected (not in list)'
  }] : [])
];

async function testCORS(origin, expectedResult) {
  let passed = false;
  
  try {
    console.log(`Testing origin: ${origin}`);
    console.log(`  Expected: ${expectedResult}`);
    
    const response = await axios.get(`${API_URL}/api/cors-info`, {
      headers: {
        'Origin': origin
      },
      validateStatus: () => true // Don't throw on any status
    });
    
    if (response.status === 200) {
      const data = response.data;
      const wasAllowed = data.currentRequest.wouldBeAllowed.includes('yes');
      const expectedAllowed = expectedResult.includes('allowed');
      
      if (wasAllowed === expectedAllowed) {
        console.log(`  ✅ PASS: Origin was ${wasAllowed ? 'allowed' : 'rejected'} as expected`);
        console.log(`     Details: ${data.currentRequest.wouldBeAllowed}`);
        passed = true;
      } else {
        console.log(`  ❌ FAIL: Expected ${expectedResult} but got ${data.currentRequest.wouldBeAllowed}`);
        passed = false;
      }
      
      // Show validation details
      if (data.currentRequest.validationDetails) {
        const details = data.currentRequest.validationDetails;
        console.log(`     - isLocalhost: ${details.isLocalhost}`);
        console.log(`     - isAllowedOrigin: ${details.isAllowedOrigin}`);
        console.log(`     - checkedAgainst: ${details.checkedAgainst.length} origins`);
      }
    } else {
      // If we expected rejection and got non-200, that's actually good
      const expectedRejected = expectedResult.includes('rejected');
      if (expectedRejected && response.status === 403) {
        console.log(`  ✅ PASS: Origin was rejected as expected (status ${response.status})`);
        passed = true;
      } else {
        console.log(`  ❌ FAIL: Request failed with status ${response.status}`);
        passed = false;
      }
      if (response.data) {
        console.log(`     Error: ${response.data.error || JSON.stringify(response.data)}`);
      }
    }
  } catch (error) {
    if (error.response) {
      // CORS error - request was blocked
      const expectedRejected = expectedResult.includes('rejected');
      if (expectedRejected) {
        console.log(`  ✅ PASS: Origin was rejected (CORS blocked)`);
        console.log(`     Status: ${error.response.status}`);
        passed = true;
      } else {
        console.log(`  ❌ FAIL: Origin was rejected but expected to be allowed`);
        passed = false;
      }
      console.log(`     Error: ${error.response.data?.error || 'CORS error'}`);
    } else {
      console.log(`  ❌ FAIL: Request error - ${error.message}`);
      passed = false;
    }
  }
  console.log('');
  return passed;
}

async function runTests() {
  console.log('Running CORS validation tests...\n');
  
  // First, check if server is running
  try {
    const healthCheck = await axios.get(`${API_URL}/api/health`, {
      validateStatus: () => true
    });
    
    if (healthCheck.status !== 200) {
      console.log('❌ Server is not responding correctly');
      console.log(`   Status: ${healthCheck.status}`);
      process.exit(1);
    }
    
    console.log('✅ Server is running\n');
  } catch (error) {
    console.log('❌ Cannot connect to server');
    console.log(`   Error: ${error.message}`);
    console.log(`   Make sure the server is running at ${API_URL}`);
    process.exit(1);
  }
  
  // Get CORS info first
  try {
    const corsInfo = await axios.get(`${API_URL}/api/cors-info`);
    console.log('Current CORS Configuration:');
    console.log(`  Mode: ${corsInfo.data.allowedOrigins.mode}`);
    console.log(`  Allowed Origins Count: ${corsInfo.data.allowedOrigins.count}`);
    if (corsInfo.data.allowedOrigins.parsed.length > 0) {
      console.log(`  Allowed Origins: ${corsInfo.data.allowedOrigins.parsed.join(', ')}`);
    }
    console.log('');
  } catch (error) {
    console.log('⚠️  Could not fetch CORS info');
    console.log('');
  }
  
  // Run tests
  let passed = 0;
  let failed = 0;
  
  for (const test of testOrigins) {
    const result = await testCORS(test.origin, test.expected);
    if (result) {
      passed++;
    } else {
      failed++;
    }
  }
  
  console.log('='.repeat(60));
  console.log('Test Summary:');
  console.log(`  Total tests: ${testOrigins.length}`);
  console.log(`  ✅ Passed: ${passed}`);
  console.log(`  ❌ Failed: ${failed}`);
  console.log('='.repeat(60));
  
  if (failed > 0) {
    console.log('\n⚠️  Some tests failed. Check the output above for details.');
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed! CORS validation is working correctly.');
    process.exit(0);
  }
}

// Run the tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

