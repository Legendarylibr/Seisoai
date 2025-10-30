#!/usr/bin/env node
/*
  One-off script: Grant 2 credits per ETH NFT (counts multiples) to all users.
  - Filters NFTs by chainId === '1' (Ethereum mainnet)
  - Adds 2 credits per tokenId across all ETH collections per user
  - Supports --dry-run to preview without writing
  - Uses MONGODB_URI from environment (load ../backend.env automatically if present)
*/

/* eslint-disable no-console */
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
  } else if (fs.existsSync(path.join(repoRoot, '.env'))) {
    try {
      require('dotenv').config({ path: path.join(repoRoot, '.env') });
      console.log('[env] Loaded environment from .env');
    } catch (e) {
      console.warn('[env] Failed to load .env:', e.message);
    }
  }
})();

// Parse CLI flags
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
  console.error('❌ MONGODB_URI is not set. Please set it in backend.env or your environment.');
  process.exit(1);
}

const isDryRun = process.argv.includes('--dry-run');

// Minimal User schema for this script
const userSchema = new mongoose.Schema({
  walletAddress: { type: String, index: true, lowercase: true },
  credits: { type: Number, default: 0 },
  totalCreditsEarned: { type: Number, default: 0 },
  nftCollections: [
    {
      contractAddress: String,
      chainId: String,
      tokenIds: [String],
      lastChecked: Date,
    },
  ],
});

const User = mongoose.models.User || mongoose.model('User', userSchema);

function countEthTokens(nftCollections) {
  if (!Array.isArray(nftCollections)) return 0;
  return nftCollections
    .filter((c) => (c?.chainId || '').toString() === '1')
    .reduce((sum, c) => sum + (Array.isArray(c?.tokenIds) ? c.tokenIds.length : 0), 0);
}

async function main() {
  const start = Date.now();
  console.log(`🚀 Starting grant (dryRun=${isDryRun})`);

  await mongoose.connect(MONGODB_URI, {
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 8000,
  });
  console.log('✅ Connected to MongoDB');

  // Find users that have at least one ETH NFT
  const cursor = User.find({ 'nftCollections.chainId': '1' })
    .select('walletAddress credits totalCreditsEarned nftCollections')
    .cursor();

  let usersSeen = 0;
  let usersUpdated = 0;
  let creditsTotal = 0;

  for await (const user of cursor) {
    usersSeen += 1;
    const tokenCount = countEthTokens(user.nftCollections);
    if (tokenCount <= 0) continue;

    const creditsToAdd = 2 * tokenCount;
    creditsTotal += creditsToAdd;

    console.log(`→ ${user.walletAddress} | tokens=${tokenCount} | add=${creditsToAdd} | prev=${user.credits}`);

    if (!isDryRun) {
      user.credits = (user.credits || 0) + creditsToAdd;
      user.totalCreditsEarned = (user.totalCreditsEarned || 0) + creditsToAdd;
      await user.save();
      usersUpdated += 1;
    }
  }

  console.log('—'.repeat(60));
  console.log(`👥 Users scanned: ${usersSeen}`);
  console.log(`✅ Users updated: ${usersUpdated}${isDryRun ? ' (dry-run)' : ''}`);
  console.log(`➕ Credits to add total: ${creditsTotal}`);
  console.log(`⏱️ Took ${(Date.now() - start) / 1000}s`);

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('❌ Error during grant:', err);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});


