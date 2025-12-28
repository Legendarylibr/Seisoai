#!/usr/bin/env node
/*
  Manual script to add credits for a subscription purchase
  Usage: node manual-add-subscription-credits.js <checkout_session_id> [userId]
  
  Example: node manual-add-subscription-credits.js cs_live_xxxxx
*/

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment
const envPath = path.join(__dirname, '..', '..', 'backend.env');
dotenv.config({ path: envPath });

// Check for Stripe key
if (!process.env.STRIPE_SECRET_KEY) {
  console.error('❌ STRIPE_SECRET_KEY not found in environment');
  console.error('Make sure backend.env exists with STRIPE_SECRET_KEY');
  process.exit(1);
}

// Import Stripe
const Stripe = (await import('stripe')).default;
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Connect to MongoDB
if (!process.env.MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in environment');
  console.error('Make sure backend.env exists with MONGODB_URI');
  process.exit(1);
}
const mongoUri = process.env.MONGODB_URI;
await mongoose.connect(mongoUri);
const User = mongoose.models.User || mongoose.model('User', new mongoose.Schema({}, { strict: false }));

async function addCreditsForSession(sessionId, userId = null) {
  try {
    // Retrieve checkout session
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    
    console.log('Checkout Session:', {
      id: session.id,
      mode: session.mode,
      customer: session.customer,
      subscription: session.subscription,
      metadata: session.metadata,
      amount_total: session.amount_total
    });

    if (session.mode !== 'subscription') {
      console.error('❌ This is not a subscription checkout');
      return;
    }

    // Get user
    let user;
    if (userId) {
      user = await User.findById(userId);
    } else if (session.metadata?.userId) {
      user = await User.findById(session.metadata.userId);
    } else if (session.metadata?.email) {
      user = await User.findOne({ email: session.metadata.email.toLowerCase() });
    } else if (session.customer_email) {
      user = await User.findOne({ email: session.customer_email.toLowerCase() });
    }

    if (!user) {
      console.error('❌ User not found');
      console.log('Try providing userId as second argument');
      return;
    }

    console.log('Found user:', {
      id: user._id,
      userId: user.userId,
      email: user.email,
      currentCredits: user.credits
    });

    // Get subscription to calculate amount
    const subscriptionId = session.subscription;
    if (!subscriptionId) {
      console.error('❌ No subscription ID in session');
      return;
    }

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const amount = subscription.items.data[0]?.price?.unit_amount || session.amount_total || 0;
    const amountInDollars = amount / 100;

    console.log('Subscription:', {
      id: subscription.id,
      amount: amountInDollars,
      status: subscription.status
    });

    // Check if already processed
    const paymentId = `checkout_${session.id}`;
    const isProcessed = user.paymentHistory?.some(p => 
      p.paymentIntentId === paymentId || p.txHash === paymentId
    );

    if (isProcessed) {
      console.log('⚠️  Payment already processed');
      return;
    }

    // Calculate credits
    const baseRate = 5; // 5 credits per dollar
    let scalingMultiplier = 1.0;
    if (amountInDollars >= 80) {
      scalingMultiplier = 1.3;
    } else if (amountInDollars >= 40) {
      scalingMultiplier = 1.2;
    } else if (amountInDollars >= 20) {
      scalingMultiplier = 1.1;
    }

    const isNFTHolder = user.walletAddress && user.nftCollections?.length > 0;
    const nftMultiplier = isNFTHolder ? 1.2 : 1;
    const finalCredits = Math.floor(amountInDollars * baseRate * scalingMultiplier * nftMultiplier);

    console.log('Credit calculation:', {
      amount: amountInDollars,
      baseRate,
      scalingMultiplier,
      nftMultiplier,
      finalCredits
    });

    // Add credits
    user.credits += finalCredits;
    user.totalCreditsEarned += finalCredits;
    
    user.paymentHistory = user.paymentHistory || [];
    user.paymentHistory.push({
      txHash: paymentId,
      paymentIntentId: paymentId,
      subscriptionId: subscriptionId,
      tokenSymbol: 'USD',
      amount: amountInDollars,
      credits: finalCredits,
      chainId: 'stripe',
      walletType: 'card',
      timestamp: new Date()
    });

    await user.save();

    console.log('✅ Credits added successfully!');
    console.log('New credits:', user.credits);
    console.log('Credits added:', finalCredits);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await mongoose.disconnect();
  }
}

const sessionId = process.argv[2];
const userId = process.argv[3];

if (!sessionId) {
  console.error('Usage: node manual-add-subscription-credits.js <checkout_session_id> [userId]');
  console.error('Example: node manual-add-subscription-credits.js cs_live_xxxxx');
  process.exit(1);
}

await addCreditsForSession(sessionId, userId);

