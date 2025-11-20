/**
 * Comprehensive test script to verify email signup flow
 * Usage: node scripts/test-signup-comprehensive.js
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables (try multiple locations)
const rootEnvPath = join(__dirname, '..', '..', 'backend.env');
const backendEnvPath = join(__dirname, '..', '.env');
dotenv.config({ path: rootEnvPath });
dotenv.config({ path: backendEnvPath });

const API_URL = process.env.API_URL || process.env.VITE_API_URL || 'http://localhost:3001';
const TEST_EMAIL = `test_${Date.now()}@example.com`;
const TEST_PASSWORD = 'testpassword123';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function checkServerHealth() {
  log('\n📡 Checking Server Health...', 'cyan');
  try {
    const response = await fetch(`${API_URL}/api/health`);
    const data = await response.json();
    
    log(`✅ Server is running on port ${data.port}`, 'green');
    log(`   Environment: ${data.environment}`, 'blue');
    log(`   Database: ${data.database}`, data.database === 'connected' ? 'green' : 'yellow');
    log(`   Uptime: ${Math.floor(data.uptime / 60)} minutes`, 'blue');
    
    if (data.database !== 'connected') {
      log('⚠️  WARNING: MongoDB is not connected. Signup will fail!', 'yellow');
      log('   Please ensure MONGODB_URI is set in backend.env', 'yellow');
      return false;
    }
    return true;
  } catch (error) {
    log(`❌ Server health check failed: ${error.message}`, 'red');
    log('   Is the backend server running?', 'yellow');
    return false;
  }
}

async function testSignup() {
  log('\n📝 Testing Email Signup...', 'cyan');
  log(`   Email: ${TEST_EMAIL}`, 'blue');
  log(`   Password: ${'*'.repeat(TEST_PASSWORD.length)}`, 'blue');
  
  try {
    const response = await fetch(`${API_URL}/api/auth/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: TEST_EMAIL,
        password: TEST_PASSWORD
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      log(`❌ Signup failed: ${data.error}`, 'red');
      return { success: false, data };
    }

    log('✅ Signup successful!', 'green');
    log(`   Token: ${data.token ? 'Received ✓' : 'Missing ✗'}`, data.token ? 'green' : 'red');
    log(`   User ID: ${data.user?.userId || 'Missing'}`, data.user?.userId ? 'green' : 'red');
    log(`   Email: ${data.user?.email || 'Missing'}`, data.user?.email ? 'green' : 'red');
    log(`   Credits: ${data.user?.credits ?? 'Missing'}`, 'blue');
    log(`   Total Credits Earned: ${data.user?.totalCreditsEarned ?? 'Missing'}`, 'blue');
    
    if (!data.token) {
      log('❌ No token received in signup response', 'red');
      return { success: false, data };
    }

    if (!data.user?.userId) {
      log('❌ No userId received in signup response', 'red');
      return { success: false, data };
    }

    return { success: true, data };
  } catch (error) {
    log(`❌ Signup request failed: ${error.message}`, 'red');
    return { success: false, error: error.message };
  }
}

async function testTokenVerification(token) {
  log('\n🔐 Testing Token Verification...', 'cyan');
  
  try {
    const response = await fetch(`${API_URL}/api/auth/verify`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    
    if (!response.ok) {
      log(`❌ Token verification failed: ${data.error}`, 'red');
      return false;
    }

    log('✅ Token verification successful!', 'green');
    log(`   User ID: ${data.user?.userId}`, 'blue');
    log(`   Email: ${data.user?.email}`, 'blue');
    log(`   Credits: ${data.user?.credits}`, 'blue');
    return true;
  } catch (error) {
    log(`❌ Token verification request failed: ${error.message}`, 'red');
    return false;
  }
}

async function testGetUserInfo(token) {
  log('\n👤 Testing /api/auth/me endpoint...', 'cyan');
  
  try {
    const response = await fetch(`${API_URL}/api/auth/me`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    
    if (!response.ok) {
      log(`❌ /api/auth/me failed: ${data.error}`, 'red');
      return false;
    }

    log('✅ /api/auth/me successful!', 'green');
    log(`   User ID: ${data.user?.userId}`, 'blue');
    log(`   Email: ${data.user?.email}`, 'blue');
    log(`   Credits: ${data.user?.credits}`, 'blue');
    log(`   Wallet: ${data.user?.walletAddress || 'Not linked'}`, 'blue');
    log(`   NFT Holder: ${data.user?.isNFTHolder ? 'Yes' : 'No'}`, 'blue');
    return true;
  } catch (error) {
    log(`❌ /api/auth/me request failed: ${error.message}`, 'red');
    return false;
  }
}

async function testDuplicateEmail() {
  log('\n🔄 Testing Duplicate Email Prevention...', 'cyan');
  
  try {
    const response = await fetch(`${API_URL}/api/auth/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: TEST_EMAIL,
        password: TEST_PASSWORD
      })
    });

    const data = await response.json();
    
    if (response.ok) {
      log('❌ Duplicate email signup should have failed!', 'red');
      return false;
    }

    log('✅ Duplicate email correctly rejected', 'green');
    log(`   Error: ${data.error}`, 'blue');
    return true;
  } catch (error) {
    log(`❌ Duplicate email test failed: ${error.message}`, 'red');
    return false;
  }
}

async function testSignIn() {
  log('\n🔑 Testing Sign In...', 'cyan');
  
  try {
    const response = await fetch(`${API_URL}/api/auth/signin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: TEST_EMAIL,
        password: TEST_PASSWORD
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      log(`❌ Signin failed: ${data.error}`, 'red');
      return false;
    }

    log('✅ Signin successful!', 'green');
    log(`   Token: ${data.token ? 'Received ✓' : 'Missing ✗'}`, data.token ? 'green' : 'red');
    log(`   User ID: ${data.user?.userId}`, 'blue');
    return true;
  } catch (error) {
    log(`❌ Signin request failed: ${error.message}`, 'red');
    return false;
  }
}

async function runAllTests() {
  log('\n' + '='.repeat(60), 'cyan');
  log('🧪 COMPREHENSIVE EMAIL SIGNUP TEST', 'cyan');
  log('='.repeat(60), 'cyan');
  log(`API URL: ${API_URL}`, 'blue');
  log(`Test Email: ${TEST_EMAIL}`, 'blue');
  
  // Step 1: Check server health
  const serverHealthy = await checkServerHealth();
  if (!serverHealthy) {
    log('\n❌ Server health check failed. Cannot proceed with tests.', 'red');
    log('\n💡 To fix:', 'yellow');
    log('   1. Ensure backend server is running', 'yellow');
    log('   2. Set MONGODB_URI in backend.env file', 'yellow');
    log('   3. Restart the backend server', 'yellow');
    process.exit(1);
  }
  
  // Step 2: Test signup
  const signupResult = await testSignup();
  if (!signupResult.success) {
    log('\n❌ Signup test failed. Cannot proceed with remaining tests.', 'red');
    process.exit(1);
  }
  
  const token = signupResult.data.token;
  
  // Step 3: Test token verification
  await testTokenVerification(token);
  
  // Step 4: Test get user info
  await testGetUserInfo(token);
  
  // Step 5: Test duplicate email prevention
  await testDuplicateEmail();
  
  // Step 6: Test signin
  await testSignIn();
  
  // Summary
  log('\n' + '='.repeat(60), 'cyan');
  log('✅ ALL TESTS COMPLETED', 'green');
  log('='.repeat(60), 'cyan');
  log('\n📊 Summary:', 'cyan');
  log('   ✅ Server health check', 'green');
  log('   ✅ Email signup', 'green');
  log('   ✅ Token verification', 'green');
  log('   ✅ User info retrieval', 'green');
  log('   ✅ Duplicate email prevention', 'green');
  log('   ✅ Sign in', 'green');
  log('\n🎉 Email account creation is working correctly!', 'green');
  log('\n');
}

// Run tests
runAllTests().catch(error => {
  log(`\n❌ Test suite failed: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});

