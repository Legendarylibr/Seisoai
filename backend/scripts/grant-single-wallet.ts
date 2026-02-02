#!/usr/bin/env node
/*
  Grant credits to a single wallet address or email
  Usage: 
    tsx grant-single-wallet.ts <walletAddress> [credits]
    tsx grant-single-wallet.ts --email <email> [credits]
  
  NOTE: Uses encryption-aware email lookup for proper database queries.
*/

import path from 'path';
import fs from 'fs';
import mongoose from 'mongoose';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env
(() => {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const backendEnvPath = path.join(repoRoot, 'backend.env');
  if (fs.existsSync(backendEnvPath)) {
    try {
      dotenv.config({ path: backendEnvPath });
      console.log(`[env] Loaded environment from ${backendEnvPath}`);
    } catch (e: any) {
      console.warn('[env] Failed to load backend.env:', e.message);
    }
  }
})();

const args = process.argv.slice(2);
let walletAddress: string | null = null;
let email: string | null = null;
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
  console.error('❌ Usage: tsx grant-single-wallet.ts <walletAddress> [credits]');
  console.error('   OR: tsx grant-single-wallet.ts --email <email> [credits]');
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

/**
 * Create email hash for lookups (matches backend implementation)
 */
function createEmailHash(email: string): string {
  const normalized = email.toLowerCase().trim();
  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (encryptionKey && encryptionKey.length === 64) {
    const key = Buffer.from(encryptionKey, 'hex');
    return crypto.createHmac('sha256', key).update(normalized).digest('hex');
  }
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Build encryption-aware email lookup query
 */
function buildEmailLookupConditions(email: string): Array<Record<string, string>> {
  const normalized = email.toLowerCase().trim();
  const emailHash = createEmailHash(normalized);
  const emailHashPlain = crypto.createHash('sha256').update(normalized).digest('hex');
  
  return [
    { emailHash },
    { emailHashPlain },
    { emailLookup: normalized },
    { email: normalized }
  ];
}

async function main(): Promise<void> {
  let query: any = {};
  let identifier = '';
  let normalizedIdentifier = '';

  if (walletAddress) {
    const isSolanaAddress = !walletAddress.startsWith('0x');
    const normalizedAddress = isSolanaAddress ? walletAddress : walletAddress.toLowerCase();
    query.walletAddress = normalizedAddress;
    identifier = walletAddress;
    normalizedIdentifier = normalizedAddress;
  } else if (email) {
    const normalizedEmail = email.toLowerCase().trim();
    // Use encryption-aware email lookup
    query = { $or: buildEmailLookupConditions(normalizedEmail) };
    identifier = email;
    normalizedIdentifier = normalizedEmail;
  }

  console.log(`🎁 Granting ${creditsToGrant} credits to: ${identifier}`);
  console.log(`   Normalized: ${normalizedIdentifier}\n`);

  await mongoose.connect(MONGODB_URI!, {
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 8000,
  });
  console.log('✅ Connected to MongoDB\n');

  // Check existing user
  let user = await User.findOne(query);
  const previousCredits = user ? user.credits : 0;

  // Build update object
  const updateFields: any = {
    $inc: { credits: creditsToGrant, totalCreditsEarned: creditsToGrant },
  };

  // Add $setOnInsert for new users
  if (walletAddress) {
    const isSolanaAddress = !walletAddress.startsWith('0x');
    const normalizedAddress = isSolanaAddress ? walletAddress : walletAddress.toLowerCase();
    updateFields.$setOnInsert = { walletAddress: normalizedAddress };
  } else if (email) {
    const normalizedEmail = email.toLowerCase().trim();
    const emailHash = createEmailHash(normalizedEmail);
    const emailHashPlain = crypto.createHash('sha256').update(normalizedEmail).digest('hex');
    updateFields.$setOnInsert = { 
      email: normalizedEmail,
      emailHash,
      emailHashPlain,
      emailLookup: normalizedEmail
    };
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

main().catch(async (err: unknown) => {
  console.error('❌ Error:', err);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});





