#!/usr/bin/env node
/*
  Script to set up Stripe products and prices for subscription plans
  Creates four subscription products:
  - Starter Pack: $15/month
  - Creator Pack: $25/month
  - Pro Pack: $50/month  
  - Studio Pack: $100/month

  Usage:
    node setup-stripe-products.js [--dry-run]
*/

/* eslint-disable no-console */
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// ES module setup
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env from backend.env if present at repo root
(() => {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const backendEnvPath = path.join(repoRoot, 'backend.env');
  if (fs.existsSync(backendEnvPath)) {
    try {
      dotenv.config({ path: backendEnvPath });
      console.log(`[env] Loaded environment from ${backendEnvPath}`);
    } catch (e) {
      console.warn('[env] Failed to load backend.env:', e.message);
    }
  } else if (fs.existsSync(path.join(repoRoot, '.env'))) {
    try {
      dotenv.config({ path: path.join(repoRoot, '.env') });
      console.log('[env] Loaded environment from .env');
    } catch (e) {
      console.warn('[env] Failed to load .env:', e.message);
    }
  }
})();

// Parse CLI flags
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');

async function setupStripeProducts() {
  // Check for Stripe secret key
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    console.error('❌ ERROR: STRIPE_SECRET_KEY not found in environment variables');
    console.error('   Please set STRIPE_SECRET_KEY in your .env or backend.env file');
    process.exit(1);
  }

  // Validate it's a live key
  if (!stripeSecretKey.startsWith('sk_live_')) {
    console.warn('⚠️  WARNING: STRIPE_SECRET_KEY does not start with sk_live_');
    console.warn('   This script is designed for production (live mode)');
    if (!stripeSecretKey.startsWith('sk_test_')) {
      console.error('❌ ERROR: Invalid Stripe secret key format');
      process.exit(1);
    }
  }

  let Stripe;
  try {
    Stripe = (await import('stripe')).default;
  } catch (e) {
    console.error('❌ ERROR: Failed to import Stripe. Make sure stripe is installed:');
    console.error('   npm install stripe');
    process.exit(1);
  }

  const stripe = new Stripe(stripeSecretKey);

  // Define the products to create
  const products = [
    {
      name: 'Starter Pack',
      description: 'Perfect for trying out Seiso AI',
      price: 10.00, // $10/month
      lookupKey: 'starter_pack_monthly',
      currency: 'usd',
      interval: 'month'
    },
    {
      name: 'Creator Pack',
      description: 'Great for regular creators',
      price: 20.00, // $20/month
      lookupKey: 'creator_pack_monthly',
      currency: 'usd',
      interval: 'month'
    },
    {
      name: 'Pro Pack',
      description: 'Best value for power users',
      price: 40.00, // $40/month
      lookupKey: 'pro_pack_monthly',
      currency: 'usd',
      interval: 'month'
    },
    {
      name: 'Studio Pack',
      description: 'For professional studios',
      price: 80.00, // $80/month
      lookupKey: 'studio_pack_monthly',
      currency: 'usd',
      interval: 'month'
    }
  ];

  console.log('\n🚀 Setting up Stripe subscription products...\n');

  if (isDryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n');
  }

  const results = [];

  for (const productConfig of products) {
    try {
      console.log(`📦 Processing: ${productConfig.name} ($${productConfig.price}/month)`);

      if (isDryRun) {
        console.log(`   [DRY RUN] Would create product: ${productConfig.name}`);
        console.log(`   [DRY RUN] Would create price: $${productConfig.price}/month with lookup_key: ${productConfig.lookupKey}`);
        results.push({
          name: productConfig.name,
          status: 'dry-run',
          lookupKey: productConfig.lookupKey
        });
        continue;
      }

      // Check if product already exists
      const existingProducts = await stripe.products.search({
        query: `name:'${productConfig.name}' AND active:'true'`,
        limit: 1
      });

      let product;
      if (existingProducts.data.length > 0) {
        product = existingProducts.data[0];
        console.log(`   ✓ Product already exists: ${product.id}`);
      } else {
        // Create product
        product = await stripe.products.create({
          name: productConfig.name,
          description: productConfig.description,
          type: 'service'
        });
        console.log(`   ✓ Created product: ${product.id}`);
      }

      // Check if price with lookup_key already exists
      const existingPrices = await stripe.prices.list({
        lookup_keys: [productConfig.lookupKey],
        limit: 1
      });

      let price;
      if (existingPrices.data.length > 0) {
        price = existingPrices.data[0];
        console.log(`   ✓ Price already exists: ${price.id} (lookup_key: ${productConfig.lookupKey})`);
        
        // Check if price matches
        if (price.unit_amount !== Math.round(productConfig.price * 100)) {
          console.warn(`   ⚠️  WARNING: Existing price amount ($${price.unit_amount / 100}) doesn't match expected ($${productConfig.price})`);
        }
      } else {
        // Create price
        price = await stripe.prices.create({
          product: product.id,
          unit_amount: Math.round(productConfig.price * 100), // Convert to cents
          currency: productConfig.currency,
          recurring: {
            interval: productConfig.interval
          },
          lookup_key: productConfig.lookupKey
        });
        console.log(`   ✓ Created price: ${price.id} (lookup_key: ${productConfig.lookupKey})`);
      }

      results.push({
        name: productConfig.name,
        status: 'success',
        productId: product.id,
        priceId: price.id,
        lookupKey: productConfig.lookupKey,
        amount: productConfig.price
      });

      console.log('');

    } catch (error) {
      console.error(`   ❌ Error processing ${productConfig.name}:`, error.message);
      results.push({
        name: productConfig.name,
        status: 'error',
        error: error.message
      });
    }
  }

  // Summary
  console.log('\n📊 Summary:');
  console.log('─'.repeat(60));
  results.forEach(result => {
    if (result.status === 'success') {
      console.log(`✓ ${result.name}:`);
      console.log(`    Product ID: ${result.productId}`);
      console.log(`    Price ID: ${result.priceId}`);
      console.log(`    Lookup Key: ${result.lookupKey}`);
      console.log(`    Amount: $${result.amount}/month`);
    } else if (result.status === 'dry-run') {
      console.log(`🔍 ${result.name} (dry-run):`);
      console.log(`    Lookup Key: ${result.lookupKey}`);
    } else {
      console.log(`❌ ${result.name}: ${result.error}`);
    }
    console.log('');
  });

  if (!isDryRun) {
    console.log('✅ Stripe products and prices setup complete!');
    console.log('\n💡 Next steps:');
    console.log('   1. Verify the products in your Stripe Dashboard');
    console.log('   2. The lookup keys are already configured in PricingPage.jsx');
    console.log('   3. Test the checkout flow in your application');
  } else {
    console.log('🔍 Dry run complete. Run without --dry-run to create the products.');
  }

  return results;
}

// Run the script
setupStripeProducts()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });

