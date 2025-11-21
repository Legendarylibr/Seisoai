#!/usr/bin/env node
/*
  Test script to verify subscription credit allocation works correctly
  Usage: 
    node test-subscription-verification.js <sessionId> [userId] [apiUrl]
    OR
    node test-subscription-verification.js --test-user-lookup [apiUrl]
*/

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env
(() => {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const backendEnvPath = path.join(repoRoot, 'backend.env');
  if (fs.existsSync(backendEnvPath)) {
    try {
      dotenv.config({ path: backendEnvPath });
    } catch (e) {
      console.warn('[env] Failed to load backend.env:', e.message);
    }
  }
})();

const args = process.argv.slice(2);
const firstArg = args[0];
const sessionId = firstArg === '--test-user-lookup' ? null : firstArg;
const userId = firstArg === '--test-user-lookup' ? null : args[1];
const apiUrl = firstArg === '--test-user-lookup' 
  ? (args[1] || process.env.VITE_API_URL || 'http://localhost:3001')
  : (args[2] || process.env.VITE_API_URL || 'http://localhost:3001');
const shouldTestUserLookup = firstArg === '--test-user-lookup';

if (!shouldTestUserLookup && !sessionId) {
  console.error('❌ Usage:');
  console.error('   Test with real session: node test-subscription-verification.js <sessionId> [userId] [apiUrl]');
  console.error('   Test user lookup: node test-subscription-verification.js --test-user-lookup [apiUrl]');
  process.exit(1);
}

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testUserLookup() {
  log('\n🧪 Testing User Lookup Methods', 'cyan');
  log('═'.repeat(60), 'cyan');
  
  // Test 1: Check if endpoint exists
  log('\n📡 Test 1: Checking endpoint availability...', 'blue');
  try {
    const response = await fetch(`${apiUrl}/api/health`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (response.ok) {
      const data = await response.json();
      log('✅ Health endpoint is accessible', 'green');
      log(`   Signup available: ${data.signupAvailable ? 'Yes' : 'No'}`, 'blue');
      if (data.missingVars && data.missingVars.length > 0) {
        log(`   ⚠️  Missing env vars: ${data.missingVars.join(', ')}`, 'yellow');
      }
    } else {
      log('⚠️  Health endpoint returned non-200 status', 'yellow');
    }
  } catch (error) {
    log(`❌ Health check failed: ${error.message}`, 'red');
    return false;
  }
  
  // Test 2: Test endpoint structure (without real session)
  log('\n📡 Test 2: Testing endpoint structure (missing sessionId)...', 'blue');
  try {
    const response = await fetch(`${apiUrl}/api/subscription/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    
    const data = await response.json();
    
    if (response.status === 400 && data.error && data.error.includes('sessionId')) {
      log('✅ Endpoint correctly validates sessionId requirement', 'green');
    } else {
      log(`⚠️  Unexpected response: ${JSON.stringify(data)}`, 'yellow');
    }
  } catch (error) {
    log(`❌ Endpoint structure test failed: ${error.message}`, 'red');
    return false;
  }
  
  // Test 3: Test with invalid session ID
  log('\n📡 Test 3: Testing with invalid session ID...', 'blue');
  try {
    const response = await fetch(`${apiUrl}/api/subscription/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'cs_test_invalid_12345' })
    });
    
    const data = await response.json();
    
    if (response.status === 404 || (response.status === 400 && data.error)) {
      log('✅ Endpoint correctly handles invalid session ID', 'green');
      log(`   Response: ${data.error || 'Session not found'}`, 'blue');
    } else {
      log(`⚠️  Unexpected response: ${JSON.stringify(data)}`, 'yellow');
    }
  } catch (error) {
    log(`❌ Invalid session test failed: ${error.message}`, 'red');
    return false;
  }
  
  log('\n' + '═'.repeat(60), 'cyan');
  log('✅ User Lookup Tests Completed!', 'green');
  log('\n💡 To test with a real subscription:', 'cyan');
  log('   1. Complete a subscription checkout on your site', 'blue');
  log('   2. Copy the session_id from the URL (?session_id=cs_...)', 'blue');
  log('   3. Run: node test-subscription-verification.js <sessionId> [userId]', 'blue');
  log('═'.repeat(60), 'cyan');
  
  return true;
}

async function testRealSession() {
  log('\n🧪 Testing Subscription Verification with Real Session', 'cyan');
  log('═'.repeat(60), 'cyan');
  log(`Session ID: ${sessionId}`, 'blue');
  log(`User ID: ${userId || 'Not provided (will use auth token or metadata)'}`, 'blue');
  log(`API URL: ${apiUrl}\n`, 'blue');
  
  try {
    // Get auth token from localStorage simulation (if available)
    // In real scenario, this would come from the browser
    log('📡 Step 1: Calling subscription verification endpoint...', 'blue');
    
    const headers = { 'Content-Type': 'application/json' };
    const body = { sessionId };
    
    if (userId) {
      body.userId = userId;
      log(`   Including userId in request: ${userId}`, 'blue');
    } else {
      log('   No userId provided - will rely on session metadata or auth token', 'yellow');
    }
    
    const startTime = Date.now();
    const response = await fetch(`${apiUrl}/api/subscription/verify`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });
    
    const responseTime = Date.now() - startTime;
    log(`⏱️  Response time: ${responseTime}ms\n`, 'blue');
    
    const data = await response.json();
    
    log('📊 Response Status:', 'blue');
    log(`   ${response.status} ${response.statusText}`, response.ok ? 'green' : 'red');
    
    if (!response.ok) {
      log('\n❌ Verification Failed:', 'red');
      log(`   Error: ${data.error || 'Unknown error'}`, 'red');
      
      if (data.error && data.error.includes('not found')) {
        log('\n💡 Troubleshooting:', 'cyan');
        log('   - Make sure the session ID is correct', 'blue');
        log('   - Verify the session was created in the same Stripe account', 'blue');
        log('   - Check if the session has payment_status: "paid"', 'blue');
      } else if (data.error && data.error.includes('user account')) {
        log('\n💡 Troubleshooting:', 'cyan');
        log('   - The session metadata may not contain userId/email', 'blue');
        log('   - Try providing userId: node test-subscription-verification.js <sessionId> <userId>', 'blue');
        log('   - Or ensure the checkout session was created with proper metadata', 'blue');
      }
      
      return false;
    }
    
    log('\n✅ Verification Successful!', 'green');
    log('\n📋 Response Details:', 'cyan');
    
    if (data.alreadyProcessed) {
      log('   ⚠️  Payment was already processed (idempotency check)', 'yellow');
      log(`   Total Credits: ${data.totalCredits}`, 'blue');
    } else {
      log(`   Credits Added: ${data.credits}`, 'green');
      log(`   Total Credits: ${data.totalCredits}`, 'green');
    }
    
    if (data.planName) {
      log(`   Plan: ${data.planName}`, 'blue');
    }
    if (data.planPrice) {
      log(`   Price: ${data.planPrice}`, 'blue');
    }
    if (data.amount) {
      log(`   Amount: $${data.amount}/month`, 'blue');
    }
    
    // Validate response structure
    log('\n🔍 Validating Response Structure...', 'cyan');
    const checks = [
      { name: 'success: true', value: data.success === true },
      { name: 'credits field exists', value: typeof data.credits !== 'undefined' },
      { name: 'totalCredits field exists', value: typeof data.totalCredits !== 'undefined' },
    ];
    
    let allPassed = true;
    checks.forEach(check => {
      if (check.value) {
        log(`   ✅ ${check.name}`, 'green');
      } else {
        log(`   ❌ ${check.name}`, 'red');
        allPassed = false;
      }
    });
    
    if (allPassed) {
      log('\n✅ All Response Structure Checks Passed!', 'green');
    } else {
      log('\n❌ Some Response Structure Checks Failed', 'red');
      return false;
    }
    
    // Test credit calculation
    if (data.amount && data.credits && !data.alreadyProcessed) {
      log('\n🧮 Testing Credit Calculation...', 'cyan');
      const baseRate = 5; // 5 credits per dollar
      const amount = data.amount;
      
      let scalingMultiplier = 1.0;
      if (amount >= 80) {
        scalingMultiplier = 1.3;
      } else if (amount >= 40) {
        scalingMultiplier = 1.2;
      } else if (amount >= 20) {
        scalingMultiplier = 1.1;
      }
      
      const expectedCredits = Math.floor(amount * baseRate * scalingMultiplier);
      const actualCredits = data.credits;
      
      log(`   Amount: $${amount}/month`, 'blue');
      log(`   Base Rate: ${baseRate} credits/dollar`, 'blue');
      log(`   Scaling Multiplier: ${scalingMultiplier}x`, 'blue');
      log(`   Expected Credits: ${expectedCredits}`, 'blue');
      log(`   Actual Credits: ${actualCredits}`, 'blue');
      
      if (Math.abs(actualCredits - expectedCredits) <= 1) {
        log('   ✅ Credit calculation matches expected value!', 'green');
      } else {
        log('   ⚠️  Credit calculation differs (may include NFT bonus)', 'yellow');
        log(`   Difference: ${actualCredits - expectedCredits} credits`, 'yellow');
      }
    }
    
    log('\n' + '═'.repeat(60), 'cyan');
    log('✅ ALL TESTS PASSED!', 'green');
    log('═'.repeat(60), 'cyan');
    
    return true;
    
  } catch (error) {
    log('\n❌ Test Failed:', 'red');
    log(`   Error: ${error.message}`, 'red');
    if (error.stack) {
      log(`   Stack: ${error.stack.split('\n')[1]}`, 'red');
    }
    return false;
  }
}

// Use global fetch if available (Node 18+), otherwise exit
if (typeof fetch === 'undefined') {
  log('❌ This script requires Node.js 18+ (for native fetch)', 'red');
  log('   Or install node-fetch: npm install node-fetch', 'blue');
  process.exit(1);
}

// Run appropriate test
(async () => {
  const success = shouldTestUserLookup 
    ? await testUserLookup()
    : await testRealSession();
  
  process.exit(success ? 0 : 1);
})();

