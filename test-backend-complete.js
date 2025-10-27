#!/usr/bin/env node

/**
 * Complete Backend Functionality Test
 * Tests all endpoints to ensure nothing broke
 */

const https = require('https');
const http = require('http');

const API_URL = process.env.API_URL || 'https://seisoai.com';

// Test helper
function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_URL);
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = (url.protocol === 'https:' ? https : http).request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, body });
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

// Test suite
async function runTests() {
  console.log('🧪 Testing Backend Functionality...\n');
  console.log(`Target: ${API_URL}\n`);

  let passed = 0;
  let failed = 0;

  const test = (name, fn) => {
    return async () => {
      try {
        process.stdout.write(`Testing: ${name}... `);
        await fn();
        console.log('✅ PASS');
        passed++;
      } catch (error) {
        console.log(`❌ FAIL: ${error.message}`);
        failed++;
      }
    };
  };

  // ========== EXISTING FUNCTIONALITY TESTS ==========

  // Test 1: Health check
  await test('Health Check', async () => {
    const res = await makeRequest('GET', '/api/health');
    if (!res.body.status || res.body.status !== 'healthy') {
      throw new Error('Health check failed');
    }
  })();

  // Test 2: Get user data (with wallet)
  const testWallet = '0x1234567890123456789012345678901234567890';
  await test('Get User Data (Wallet)', async () => {
    const res = await makeRequest('GET', `/api/users/${testWallet}`);
    if (!res.body.success) throw new Error('Failed to get user');
    if (!res.body.user) throw new Error('User data missing');
  })();

  // Test 3: Create payment address
  await test('Get Payment Address', async () => {
    const res = await makeRequest('POST', '/api/payment/get-address', {
      chainId: '1',
      tokenSymbol: 'USDC'
    });
    if (!res.body.success) throw new Error('Failed to get payment address');
  })();

  // Test 4: Check payment (should not find anything)
  await test('Check Payment (No payment)', async () => {
    const res = await makeRequest('POST', '/api/payment/check-payment', {
      walletAddress: testWallet,
      expectedAmount: '1',
      token: 'USDC',
      chainId: '1'
    });
    if (!res.body.success) throw new Error('Payment check failed');
  })();

  // Test 5: NFT check holdings
  await test('NFT Check Holdings', async () => {
    const res = await makeRequest('POST', '/api/nft/check-holdings', {
      walletAddress: testWallet,
      collections: []
    });
    if (!res.body.hasOwnProperty('success')) throw new Error('NFT check response invalid');
  })();

  // Test 6: NFT check credits
  await test('NFT Check Credits', async () => {
    const res = await makeRequest('POST', '/api/nft/check-credits', {
      walletAddress: testWallet
    });
    if (!res.body.success) throw new Error('Credit check failed');
  })();

  // Test 7: Gallery endpoint
  await test('Get Gallery', async () => {
    const res = await makeRequest('GET', `/api/gallery/${testWallet}`);
    if (!res.body.success) throw new Error('Gallery fetch failed');
  })();

  // Test 8: Gallery stats
  await test('Gallery Stats', async () => {
    const res = await makeRequest('GET', `/api/gallery/${testWallet}/stats`);
    if (!res.body.success) throw new Error('Gallery stats failed');
  })();

  // Test 9: Get user settings
  await test('Update User Settings', async () => {
    const res = await makeRequest('PUT', `/api/users/${testWallet}/settings`, {
      settings: { preferredStyle: 'photorealistic' }
    });
    if (!res.body.success) throw new Error('Settings update failed');
  })();

  // Test 10: Add generation
  await test('Add Generation', async () => {
    const res = await makeRequest('POST', '/api/generations/add', {
      walletAddress: testWallet,
      prompt: 'test prompt',
      style: 'photorealistic',
      imageUrl: 'https://example.com/image.jpg',
      creditsUsed: 10
    });
    if (!res.body.success) throw new Error('Generation add failed');
  })();

  // Test 11: Delete generation
  await test('Delete Generation', async () => {
    // Get a generation ID first
    const galleryRes = await makeRequest('GET', `/api/gallery/${testWallet}`);
    if (galleryRes.body.gallery && galleryRes.body.gallery.length > 0) {
      const genId = galleryRes.body.gallery[0].id;
      const res = await makeRequest('DELETE', `/api/gallery/${testWallet}/${genId}`);
      if (!res.body.success) throw new Error('Generation delete failed');
    }
  })();

  // ========== NEW STRIPE-ONLY FUNCTIONALITY TESTS ==========

  // Test 12: Create Stripe user
  const testUserId = `test_${Date.now()}`;
  await test('Create Stripe User', async () => {
    const res = await makeRequest('POST', '/api/users/stripe/create', {
      userId: testUserId
    });
    if (!res.body.success) throw new Error('Stripe user creation failed');
  })();

  // Test 13: Get Stripe user
  await test('Get Stripe User', async () => {
    const res = await makeRequest('GET', `/api/users/stripe/${testUserId}`);
    if (!res.body.success) throw new Error('Stripe user fetch failed');
    if (!res.body.user) throw new Error('Stripe user data missing');
  })();

  // Test 14: Create Stripe guest payment intent
  await test('Create Stripe Guest Payment Intent', async () => {
    const res = await makeRequest('POST', '/api/stripe/create-payment-intent-guest', {
      userId: testUserId,
      amount: '10.00',
      currency: 'usd'
    });
    if (!res.body.success) {
      // If Stripe not configured, that's okay for this test
      if (res.body.error && res.body.error.includes('not configured')) {
        console.log('(Stripe not configured)');
        return;
      }
      throw new Error('Stripe payment intent creation failed');
    }
  })();

  // Test 15: Verify Stripe guest payment (will fail since no real payment)
  await test('Verify Stripe Guest Payment (Expected to fail)', async () => {
    const res = await makeRequest('POST', '/api/stripe/verify-guest-payment', {
      paymentIntentId: 'test',
      userId: testUserId
    });
    // This should fail because payment doesn't exist
    if (res.body.success) throw new Error('Should have failed but succeeded');
  })();

  // ========== SUMMARY ==========

  console.log('\n' + '='.repeat(50));
  console.log(`\n✅ Tests Passed: ${passed}`);
  console.log(`❌ Tests Failed: ${failed}`);
  console.log(`📊 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%\n`);

  if (failed === 0) {
    console.log('🎉 All backend tests passed! Existing functionality intact!');
    process.exit(0);
  } else {
    console.log('⚠️  Some tests failed. Check logs above.');
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  console.error('Test runner error:', error);
  process.exit(1);
});

