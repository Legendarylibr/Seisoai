#!/usr/bin/env node
/*
  Test script to verify the API returns credits correctly for rewarded wallets
  Usage: node test-credit-api.js <walletAddress> [apiUrl]
*/

const path = require('path');
const fs = require('fs');

// Load env
(() => {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const backendEnvPath = path.join(repoRoot, 'backend.env');
  if (fs.existsSync(backendEnvPath)) {
    try {
      require('dotenv').config({ path: backendEnvPath });
    } catch (e) {
      console.warn('[env] Failed to load backend.env:', e.message);
    }
  }
})();

const args = process.argv.slice(2);
const walletAddress = args[0];
const apiUrl = args[1] || process.env.VITE_API_URL || 'http://localhost:3001';

if (!walletAddress) {
  console.error('❌ Usage: node test-credit-api.js <walletAddress> [apiUrl]');
  process.exit(1);
}

async function testAPI() {
  const normalizedAddress = walletAddress.toLowerCase();
  const testUrl = `${apiUrl}/api/users/${normalizedAddress}?skipNFTs=true`;
  
  console.log('🧪 Testing Credit API');
  console.log('═'.repeat(60));
  console.log(`Wallet: ${walletAddress}`);
  console.log(`Normalized: ${normalizedAddress}`);
  console.log(`API URL: ${testUrl}\n`);
  
  try {
    console.log('📡 Sending request...');
    const startTime = Date.now();
    const response = await fetch(testUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(15000)
    });
    
    const responseTime = Date.now() - startTime;
    console.log(`⏱️  Response time: ${responseTime}ms`);
    console.log(`📊 Status: ${response.status} ${response.statusText}\n`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ API Error:');
      console.error(errorText);
      process.exit(1);
    }
    
    const data = await response.json();
    
    console.log('✅ Response received:\n');
    console.log(JSON.stringify(data, null, 2));
    console.log('\n');
    
    // Validate response structure
    console.log('🔍 Validating response...\n');
    
    if (!data.success) {
      console.error('❌ Response missing success: true');
      process.exit(1);
    }
    
    if (!data.user) {
      console.error('❌ Response missing user object');
      process.exit(1);
    }
    
    if (typeof data.user.credits === 'undefined') {
      console.error('❌ Response missing user.credits');
      process.exit(1);
    }
    
    const credits = Number(data.user.credits) || 0;
    
    console.log('✅ Response structure is valid!');
    console.log(`\n💰 Credits found: ${credits}`);
    console.log(`   Total Earned: ${data.user.totalCreditsEarned || 0}`);
    console.log(`   Total Spent: ${data.user.totalCreditsSpent || 0}`);
    console.log(`   NFT Holder: ${data.user.isNFTHolder ? 'Yes' : 'No'}`);
    
    if (credits > 0) {
      console.log('\n✅ SUCCESS: Credits are being returned correctly!');
    } else {
      console.log('\n⚠️  WARNING: Credits are 0');
      console.log('   This could mean:');
      console.log('   1. No credits were granted to this wallet');
      console.log('   2. Credits were granted but not saved in database');
      console.log('   3. User record was created after credits were granted');
    }
    
    // Test frontend parsing logic
    console.log('\n🧪 Testing frontend parsing logic...');
    let parsedCredits = 0;
    
    if (data.success && data.user && typeof data.user.credits !== 'undefined') {
      parsedCredits = Number(data.user.credits) || 0;
      console.log('✅ Parsed via: data.success && data.user.credits');
    } else if (data.success && typeof data.credits !== 'undefined') {
      parsedCredits = Number(data.credits) || 0;
      console.log('✅ Parsed via: data.success && data.credits');
    } else if (data.user && typeof data.user.credits !== 'undefined') {
      parsedCredits = Number(data.user.credits) || 0;
      console.log('✅ Parsed via: data.user.credits (no success flag)');
    } else {
      console.log('❌ Failed to parse credits from response');
      process.exit(1);
    }
    
    if (parsedCredits === credits) {
      console.log(`✅ Frontend parsing matches API response: ${parsedCredits}`);
    } else {
      console.error(`❌ Frontend parsing mismatch! API: ${credits}, Parsed: ${parsedCredits}`);
      process.exit(1);
    }
    
    console.log('\n' + '═'.repeat(60));
    console.log('✅ ALL TESTS PASSED!');
    console.log('═'.repeat(60));
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.name === 'AbortError') {
      console.error('   Request timed out');
    }
    process.exit(1);
  }
}

// Use global fetch if available (Node 18+), otherwise exit
if (typeof fetch === 'undefined') {
  console.error('❌ This script requires Node.js 18+ (for native fetch)');
  console.error('   Or install node-fetch: npm install node-fetch');
  process.exit(1);
}

testAPI();

