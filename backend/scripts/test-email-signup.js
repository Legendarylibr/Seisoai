/**
 * Test script to verify email account creation is working
 * Usage: node scripts/test-email-signup.js
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env') });

const API_URL = process.env.API_URL || 'http://localhost:3001';
const TEST_EMAIL = `test_${Date.now()}@example.com`;
const TEST_PASSWORD = 'testpassword123';

async function testEmailSignup() {
  console.log('🧪 Testing Email Account Creation...\n');
  console.log(`API URL: ${API_URL}`);
  console.log(`Test Email: ${TEST_EMAIL}\n`);

  try {
    // Test 1: Sign up
    console.log('1️⃣ Testing signup...');
    const signupResponse = await fetch(`${API_URL}/api/auth/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: TEST_EMAIL,
        password: TEST_PASSWORD
      })
    });

    const signupData = await signupResponse.json();
    
    if (!signupResponse.ok) {
      console.error('❌ Signup failed:', signupData);
      process.exit(1);
    }

    console.log('✅ Signup successful!');
    console.log('   Token received:', signupData.token ? 'Yes' : 'No');
    console.log('   User ID:', signupData.user?.userId);
    console.log('   Email:', signupData.user?.email);
    console.log('   Credits:', signupData.user?.credits);
    console.log('');

    if (!signupData.token) {
      console.error('❌ No token received in signup response');
      process.exit(1);
    }

    if (!signupData.user?.userId) {
      console.error('❌ No userId received in signup response');
      process.exit(1);
    }

    // Test 2: Verify token
    console.log('2️⃣ Testing token verification...');
    const verifyResponse = await fetch(`${API_URL}/api/auth/verify`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${signupData.token}`,
        'Content-Type': 'application/json'
      }
    });

    const verifyData = await verifyResponse.json();
    
    if (!verifyResponse.ok) {
      console.error('❌ Token verification failed:', verifyData);
      process.exit(1);
    }

    console.log('✅ Token verification successful!');
    console.log('   User ID:', verifyData.user?.userId);
    console.log('   Email:', verifyData.user?.email);
    console.log('');

    // Test 3: Get user info (/api/auth/me)
    console.log('3️⃣ Testing /api/auth/me endpoint...');
    const meResponse = await fetch(`${API_URL}/api/auth/me`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${signupData.token}`,
        'Content-Type': 'application/json'
      }
    });

    const meData = await meResponse.json();
    
    if (!meResponse.ok) {
      console.error('❌ /api/auth/me failed:', meData);
      process.exit(1);
    }

    console.log('✅ /api/auth/me successful!');
    console.log('   User ID:', meData.user?.userId);
    console.log('   Email:', meData.user?.email);
    console.log('   Credits:', meData.user?.credits);
    console.log('');

    // Test 4: Try to sign up again with same email (should fail)
    console.log('4️⃣ Testing duplicate email prevention...');
    const duplicateResponse = await fetch(`${API_URL}/api/auth/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: TEST_EMAIL,
        password: TEST_PASSWORD
      })
    });

    const duplicateData = await duplicateResponse.json();
    
    if (duplicateResponse.ok) {
      console.error('❌ Duplicate email signup should have failed!');
      process.exit(1);
    }

    console.log('✅ Duplicate email correctly rejected');
    console.log('   Error:', duplicateData.error);
    console.log('');

    // Test 5: Sign in with created account
    console.log('5️⃣ Testing signin with created account...');
    const signinResponse = await fetch(`${API_URL}/api/auth/signin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: TEST_EMAIL,
        password: TEST_PASSWORD
      })
    });

    const signinData = await signinResponse.json();
    
    if (!signinResponse.ok) {
      console.error('❌ Signin failed:', signinData);
      process.exit(1);
    }

    console.log('✅ Signin successful!');
    console.log('   Token received:', signinData.token ? 'Yes' : 'No');
    console.log('   User ID:', signinData.user?.userId);
    console.log('');

    console.log('🎉 All tests passed! Email account creation is working correctly.\n');
    process.exit(0);

  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

testEmailSignup();

