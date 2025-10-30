#!/usr/bin/env node
/*
  Quick script to check a wallet's credits in the database
*/

const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

// Load env from backend.env if present at repo root
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

// Parse CLI args - wallet address is first non-flag argument
const args = process.argv.slice(2);
const uriEq = args.find(a => a.startsWith('--uri='));
let overrideUri = null;
if (uriEq) {
  overrideUri = uriEq.slice('--uri='.length);
} else {
  const uriIdx = args.indexOf('--uri');
  if (uriIdx !== -1 && args[uriIdx + 1]) {
    overrideUri = args[uriIdx + 1];
  }
}

const MONGODB_URI = overrideUri || process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI is not set. Please set it in backend.env or use --uri');
  process.exit(1);
}

// Get wallet address (first non-flag argument)
const walletAddress = args.filter(a => !a.startsWith('--') && a !== overrideUri)[0] || process.argv[2];
if (!walletAddress) {
  console.error('❌ Please provide a wallet address');
  console.log('Usage: node check-wallet-credits.js <walletAddress> [--uri <mongoUri>]');
  process.exit(1);
}

// User schema
const userSchema = new mongoose.Schema({
  walletAddress: { type: String, index: true, lowercase: true },
  credits: { type: Number, default: 0 },
  totalCreditsEarned: { type: Number, default: 0 },
  totalCreditsSpent: { type: Number, default: 0 },
  nftCollections: [{
    contractAddress: String,
    chainId: String,
    tokenIds: [String],
    lastChecked: Date,
  }],
}, { timestamps: true });

const User = mongoose.models.User || mongoose.model('User', userSchema);

async function main() {
  const normalizedAddress = walletAddress.toLowerCase();
  console.log(`🔍 Checking wallet: ${walletAddress}`);
  console.log(`   Normalized: ${normalizedAddress}\n`);

  await mongoose.connect(MONGODB_URI, {
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 8000,
  });
  console.log('✅ Connected to MongoDB\n');

  const user = await User.findOne({ walletAddress: normalizedAddress });

  if (!user) {
    console.log('❌ User not found in database');
    console.log('   This wallet has not been created yet.');
    console.log('   It will be created automatically when they connect their wallet.');
  } else {
    console.log('✅ User found!\n');
    console.log('📊 Credits Info:');
    console.log(`   Current Credits: ${user.credits || 0}`);
    console.log(`   Total Earned: ${user.totalCreditsEarned || 0}`);
    console.log(`   Total Spent: ${user.totalCreditsSpent || 0}\n`);
    
    if (user.nftCollections && user.nftCollections.length > 0) {
      console.log('🎨 NFT Collections:');
      user.nftCollections.forEach((collection, idx) => {
        console.log(`   ${idx + 1}. ${collection.name || 'Unknown'}`);
        console.log(`      Contract: ${collection.contractAddress}`);
        console.log(`      Chain: ${collection.chainId}`);
        console.log(`      Tokens: ${collection.tokenIds?.length || 0}`);
      });
    } else {
      console.log('🎨 NFT Collections: None');
    }
    
    console.log(`\n📅 Created: ${user.createdAt}`);
    console.log(`📅 Last Active: ${user.lastActive || 'Never'}`);
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('❌ Error:', err);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});

