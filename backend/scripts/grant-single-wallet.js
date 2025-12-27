#!/usr/bin/env node
/*
  Grant credits to a single wallet address or email
  Usage: 
    node grant-single-wallet.js <walletAddress> [credits]
    node grant-single-wallet.js --email <email> [credits]
*/

const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

// Load env
(() => {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const backendEnvPath = path.join(repoRoot, 'backend.env');
  if (fs.existsSync(backendEnvPath)) {
    try {
      require('dotenv').config({ path: backendEnvPath });
      console.log(`[env] Loaded environment from ${backendEnvPath}`);
    } catch (e) {
      console.warn('[env] Failed to load backend.env:', e.message);
    }
  }
})();

const args = process.argv.slice(2);
let walletAddress = null;
let email = null;
let creditsToGrant = 3;

// Parse arguments
if (args[0] === '--email' && args[1]) {
  email = args[1].toLowerCase();
  creditsToGrant = args[2] ? Number(args[2]) : 3;
} else {
  walletAddress = args[0];
  creditsToGrant = args[1] ? Number(args[1]) : 3;
}

if (!walletAddress && !email) {
  console.error('❌ Usage: node grant-single-wallet.js <walletAddress> [credits]');
  console.error('   OR: node grant-single-wallet.js --email <email> [credits]');
  process.exit(1);
}

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI is not set');
  process.exit(1);
}

// User schema (matches backend schema)
const userSchema = new mongoose.Schema({
  walletAddress: { 
    type: String, 
    required: false,
    unique: true, 
    sparse: true,
    index: true
  },
  email: {
    type: String,
    required: false,
    unique: true,
    sparse: true,
    lowercase: true,
    index: true
  },
  credits: { type: Number, default: 0 },
  totalCreditsEarned: { type: Number, default: 0 },
  totalCreditsSpent: { type: Number, default: 0 },
}, { timestamps: true, strict: false });

const User = mongoose.models.User || mongoose.model('User', userSchema);

async function main() {
  let query = {};
  let identifier = '';
  let normalizedIdentifier = '';

  if (walletAddress) {
    const isSolanaAddress = !walletAddress.startsWith('0x');
    const normalizedAddress = isSolanaAddress ? walletAddress : walletAddress.toLowerCase();
    query.walletAddress = normalizedAddress;
    identifier = walletAddress;
    normalizedIdentifier = normalizedAddress;
  } else if (email) {
    const normalizedEmail = email.toLowerCase();
    query.email = normalizedEmail;
    identifier = email;
    normalizedIdentifier = normalizedEmail;
  }

  console.log(`🎁 Granting ${creditsToGrant} credits to: ${identifier}`);
  console.log(`   Normalized: ${normalizedIdentifier}\n`);

  await mongoose.connect(MONGODB_URI, {
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 8000,
  });
  console.log('✅ Connected to MongoDB\n');

  // Check existing user
  let user = await User.findOne(query);
  const previousCredits = user ? user.credits : 0;

  // Build update object
  const updateFields = {
    $inc: { credits: creditsToGrant, totalCreditsEarned: creditsToGrant },
  };

  // Add $setOnInsert for new users
  if (walletAddress) {
    const isSolanaAddress = !walletAddress.startsWith('0x');
    const normalizedAddress = isSolanaAddress ? walletAddress : walletAddress.toLowerCase();
    updateFields.$setOnInsert = { walletAddress: normalizedAddress };
  } else if (email) {
    updateFields.$setOnInsert = { email: email.toLowerCase() };
  }

  // Grant credits
  user = await User.findOneAndUpdate(
    query,
    updateFields,
    { upsert: true, new: true }
  );

  console.log('✅ Credits granted!\n');
  console.log(`📊 Credits Info:`);
  console.log(`   Previous: ${previousCredits}`);
  console.log(`   Added: ${creditsToGrant}`);
  console.log(`   Current: ${user.credits}`);
  console.log(`   Total Earned: ${user.totalCreditsEarned}`);
  if (user.email) console.log(`   Email: ${user.email}`);
  if (user.walletAddress) console.log(`   Wallet: ${user.walletAddress}`);
  console.log('');

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('❌ Error:', err);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});

