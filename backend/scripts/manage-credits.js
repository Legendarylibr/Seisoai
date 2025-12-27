#!/usr/bin/env node
/*
  Manage credits for users by wallet address or email
  Usage: 
    node manage-credits.js --wallet <walletAddress> --add <credits>
    node manage-credits.js --email <email> --add <credits>
    node manage-credits.js --wallet <walletAddress> --set <credits>
    node manage-credits.js --email <email> --set <credits>
    node manage-credits.js --wallet <walletAddress> --subtract <credits>
    node manage-credits.js --email <email> --subtract <credits>
    node manage-credits.js --wallet <walletAddress> --show
    node manage-credits.js --email <email> --show
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

// Parse command line arguments
const args = process.argv.slice(2);
let walletAddress = null;
let email = null;
let action = null;
let credits = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--wallet' && args[i + 1]) {
    walletAddress = args[i + 1];
    i++;
  } else if (args[i] === '--email' && args[i + 1]) {
    email = args[i + 1];
    i++;
  } else if (args[i] === '--add' && args[i + 1]) {
    action = 'add';
    credits = Number(args[i + 1]);
    i++;
  } else if (args[i] === '--set' && args[i + 1]) {
    action = 'set';
    credits = Number(args[i + 1]);
    i++;
  } else if (args[i] === '--subtract' && args[i + 1]) {
    action = 'subtract';
    credits = Number(args[i + 1]);
    i++;
  } else if (args[i] === '--show') {
    action = 'show';
  }
}

// Validation
if (!walletAddress && !email) {
  console.error('❌ Usage: node manage-credits.js --wallet <address> OR --email <email> [--add|--set|--subtract|--show] <credits>');
  console.error('\nExamples:');
  console.error('  node manage-credits.js --wallet 0x123... --add 10');
  console.error('  node manage-credits.js --email user@example.com --add 10');
  console.error('  node manage-credits.js --wallet 0x123... --set 100');
  console.error('  node manage-credits.js --email user@example.com --subtract 5');
  console.error('  node manage-credits.js --wallet 0x123... --show');
  console.error('  node manage-credits.js --email user@example.com --show');
  process.exit(1);
}

if (!action) {
  console.error('❌ Action required: --add, --set, --subtract, or --show');
  process.exit(1);
}

if (action !== 'show' && (credits === null || isNaN(credits))) {
  console.error('❌ Valid credits amount required for --add, --set, or --subtract');
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
  await mongoose.connect(MONGODB_URI, {
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 8000,
  });
  console.log('✅ Connected to MongoDB\n');

  // Easy unified lookup: find user by wallet OR email
  let identifier = '';
  let user = null;
  
  if (walletAddress) {
    const isSolanaAddress = !walletAddress.startsWith('0x');
    const normalizedAddress = isSolanaAddress ? walletAddress : walletAddress.toLowerCase();
    // Try wallet first, then email if provided
    user = await User.findOne({
      $or: [
        { walletAddress: normalizedAddress },
        ...(email ? [{ email: email.toLowerCase() }] : [])
      ]
    });
    identifier = `wallet ${walletAddress}`;
  } else if (email) {
    const normalizedEmail = email.toLowerCase();
    // Try email first, then wallet if user has one
    user = await User.findOne({ email: normalizedEmail });
    identifier = `email ${email}`;
  }
  
  if (!user) {
    console.error(`❌ User not found: ${identifier}`);
    console.log('\n💡 Tip: Users can be referenced by either wallet address or email');
    await mongoose.disconnect();
    process.exit(1);
  }

  const previousCredits = user.credits || 0;
  const previousEarned = user.totalCreditsEarned || 0;
  const previousSpent = user.totalCreditsSpent || 0;

  console.log(`📊 Current User Info:`);
  console.log(`   Identifier: ${identifier}`);
  if (user.walletAddress) console.log(`   Wallet: ${user.walletAddress}`);
  if (user.email) console.log(`   Email: ${user.email}`);
  if (user.userId) console.log(`   User ID: ${user.userId}`);
  console.log(`   Current Credits: ${previousCredits}`);
  console.log(`   Total Earned: ${previousEarned}`);
  console.log(`   Total Spent: ${previousSpent}\n`);

  // Perform action
  if (action === 'show') {
    console.log('✅ Displaying user credits (no changes made)\n');
  } else if (action === 'add') {
    console.log(`➕ Adding ${credits} credits...`);
    user.credits += credits;
    user.totalCreditsEarned += credits;
    await user.save();
    console.log(`✅ Credits added!\n`);
  } else if (action === 'set') {
    console.log(`🔧 Setting credits to ${credits}...`);
    const difference = credits - previousCredits;
    user.credits = credits;
    if (difference > 0) {
      // If setting higher, add to total earned
      user.totalCreditsEarned += difference;
    }
    await user.save();
    console.log(`✅ Credits set!\n`);
  } else if (action === 'subtract') {
    console.log(`➖ Subtracting ${credits} credits...`);
    if (previousCredits < credits) {
      console.warn(`⚠️  Warning: User only has ${previousCredits} credits, subtracting ${credits} will result in negative balance`);
    }
    user.credits -= credits;
    user.totalCreditsSpent += credits;
    await user.save();
    console.log(`✅ Credits subtracted!\n`);
  }

  // Refetch to show final state
  user = await User.findOne(query);

  console.log(`📊 Updated User Info:`);
  console.log(`   Previous Credits: ${previousCredits}`);
  if (action === 'add') {
    console.log(`   Added: +${credits}`);
  } else if (action === 'set') {
    console.log(`   Set to: ${credits}`);
  } else if (action === 'subtract') {
    console.log(`   Subtracted: -${credits}`);
  }
  console.log(`   Current Credits: ${user.credits}`);
  console.log(`   Total Earned: ${user.totalCreditsEarned}`);
  console.log(`   Total Spent: ${user.totalCreditsSpent}\n`);

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('❌ Error:', err);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});

