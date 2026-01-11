#!/usr/bin/env node
/*
  Manual script to add credits for a subscription purchase
  Usage: tsx manual-add-subscription-credits.ts <checkout_session_id> [userId]
  
  Example: tsx manual-add-subscription-credits.ts cs_live_xxxxx
  
  NOTE: Uses encryption-aware email lookup to support encrypted email fields.
*/

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import crypto from 'crypto';
import Stripe from 'stripe';

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

// Initialize Stripe
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

/**
 * Build robust email lookup query with multiple fallback methods
 * This ensures users can be found regardless of ENCRYPTION_KEY configuration
 */
function buildEmailLookupConditions(email: string): Array<Record<string, string>> {
  const normalized = email.toLowerCase().trim();
  
  // Try to create HMAC hash if encryption key is available
  let emailHash: string;
  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (encryptionKey && encryptionKey.length === 64) {
    const key = Buffer.from(encryptionKey, 'hex');
    emailHash = crypto.createHmac('sha256', key).update(normalized).digest('hex');
  } else {
    emailHash = crypto.createHash('sha256').update(normalized).digest('hex');
  }
  
  const emailHashPlain = crypto.createHash('sha256').update(normalized).digest('hex');
  
  return [
    { emailHash },                    // Primary: HMAC hash (with encryption key)
    { emailHashPlain },               // Fallback: plain SHA-256 hash
    { emailLookup: normalized },      // Fallback: plain email lookup field
    { email: normalized }             // Legacy: direct email match
  ];
}

/**
 * Find user by email with encryption-aware lookup
 */
async function findUserByEmail(email: string): Promise<any> {
  const emailConditions = buildEmailLookupConditions(email);
  return await User.findOne({ $or: emailConditions });
}

async function addCreditsForSession(sessionId: string, userId: string | null = null): Promise<void> {
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

    // Get user with encryption-aware email lookup
    let user: any;
    if (userId) {
      user = await User.findById(userId);
    } else if (session.metadata?.userId) {
      user = await User.findById(session.metadata.userId);
    } else if (session.metadata?.email) {
      // Use encryption-aware email lookup
      user = await findUserByEmail(session.metadata.email as string);
    } else if (session.customer_email) {
      // Use encryption-aware email lookup
      user = await findUserByEmail(session.customer_email);
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
    if (!subscriptionId || typeof subscriptionId !== 'string') {
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
    const isProcessed = user.paymentHistory?.some((p: any) => 
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

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await mongoose.disconnect();
  }
}

const sessionId = process.argv[2];
const userId = process.argv[3] || null;

if (!sessionId) {
  console.error('Usage: tsx manual-add-subscription-credits.ts <checkout_session_id> [userId]');
  console.error('Example: tsx manual-add-subscription-credits.ts cs_live_xxxxx');
  process.exit(1);
}

await addCreditsForSession(sessionId, userId);





