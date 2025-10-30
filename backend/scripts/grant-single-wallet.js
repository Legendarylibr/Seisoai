#!/usr/bin/env node
/*
  Grant credits to a single wallet address
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
const walletAddress = args[0];
const creditsToGrant = args[1] ? Number(args[1]) : 3;

if (!walletAddress) {
  console.error('❌ Usage: node grant-single-wallet.js <walletAddress> [credits]');
  process.exit(1);
}

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI is not set');
  process.exit(1);
}

// User schema
const userSchema = new mongoose.Schema({
  walletAddress: { type: String, index: true, lowercase: true },
  credits: { type: Number, default: 0 },
  totalCreditsEarned: { type: Number, default: 0 },
}, { timestamps: true });

const User = mongoose.models.User || mongoose.model('User', userSchema);

async function main() {
  const normalizedAddress = walletAddress.toLowerCase();
  console.log(`🎁 Granting ${creditsToGrant} credits to: ${walletAddress}`);
  console.log(`   Normalized: ${normalizedAddress}\n`);

  await mongoose.connect(MONGODB_URI, {
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 8000,
  });
  console.log('✅ Connected to MongoDB\n');

  // Check existing user
  let user = await User.findOne({ walletAddress: normalizedAddress });
  const previousCredits = user ? user.credits : 0;

  // Grant credits
  user = await User.findOneAndUpdate(
    { walletAddress: normalizedAddress },
    {
      $setOnInsert: { walletAddress: normalizedAddress },
      $inc: { credits: creditsToGrant, totalCreditsEarned: creditsToGrant },
    },
    { upsert: true, new: true }
  );

  console.log('✅ Credits granted!\n');
  console.log(`📊 Credits Info:`);
  console.log(`   Previous: ${previousCredits}`);
  console.log(`   Added: ${creditsToGrant}`);
  console.log(`   Current: ${user.credits}`);
  console.log(`   Total Earned: ${user.totalCreditsEarned}\n`);

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('❌ Error:', err);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});

