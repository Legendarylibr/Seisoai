#!/usr/bin/env node
/*
  Migration script: Ensure all users have totalCreditsEarned field initialized
  This fixes users created before the totalCreditsEarned field was added
*/

const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

// Load env from backend.env if present
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

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI is not set. Please set it in backend.env or your environment.');
  process.exit(1);
}

// User schema (minimal for migration)
const userSchema = new mongoose.Schema({
  walletAddress: { type: String, index: true, lowercase: true },
  credits: { type: Number, default: 0 },
  totalCreditsEarned: { type: Number, default: 0 },
  totalCreditsSpent: { type: Number, default: 0 },
}, { timestamps: true });

const User = mongoose.models.User || mongoose.model('User', userSchema);

async function main() {
  console.log('🔧 Starting migration: Ensuring all users have totalCreditsEarned field\n');

  await mongoose.connect(MONGODB_URI, {
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 8000,
  });
  console.log('✅ Connected to MongoDB\n');

  // Find all users where totalCreditsEarned is missing, null, or undefined
  const usersToFix = await User.find({
    $or: [
      { totalCreditsEarned: { $exists: false } },
      { totalCreditsEarned: null },
      { totalCreditsEarned: undefined }
    ]
  });

  console.log(`📊 Found ${usersToFix.length} users that need migration\n`);

  if (usersToFix.length === 0) {
    console.log('✅ All users already have totalCreditsEarned field initialized');
    await mongoose.disconnect();
    process.exit(0);
  }

  let fixed = 0;
  let errors = 0;

  for (const user of usersToFix) {
    try {
      // Initialize totalCreditsEarned based on credits if it exists
      // If user has credits but no totalCreditsEarned, set it to credits (they were earned somehow)
      const newTotalEarned = user.credits > 0 ? user.credits : 0;

      await User.updateOne(
        { _id: user._id },
        {
          $set: {
            totalCreditsEarned: newTotalEarned,
            // Also ensure totalCreditsSpent exists
            totalCreditsSpent: user.totalCreditsSpent != null ? user.totalCreditsSpent : 0
          }
        }
      );

      console.log(`✓ Fixed: ${user.walletAddress} - Set totalCreditsEarned to ${newTotalEarned} (credits: ${user.credits})`);
      fixed++;
    } catch (error) {
      console.error(`✗ Error fixing ${user.walletAddress}:`, error.message);
      errors++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`✅ Migration complete!`);
  console.log(`   Fixed: ${fixed} users`);
  if (errors > 0) {
    console.log(`   Errors: ${errors} users`);
  }
  console.log('='.repeat(60));

  await mongoose.disconnect();
  process.exit(errors > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error('❌ Migration error:', err);
  try {
    await mongoose.disconnect();
  } catch (_) {}
  process.exit(1);
});

