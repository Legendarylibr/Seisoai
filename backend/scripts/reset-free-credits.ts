#!/usr/bin/env node
/**
 * Reset Free Credits Migration Script
 * 
 * This script resets credit balances to 0 for users who:
 * - Have never made a purchase (only have free credits from signup/onboarding)
 * - Their credits balance equals their totalCreditsEarned (meaning they haven't spent any)
 * 
 * Users who purchased credits are NOT affected.
 * 
 * Usage:
 *   tsx reset-free-credits.ts --dry-run    # Preview what would be changed
 *   tsx reset-free-credits.ts --execute    # Actually perform the reset
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

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isExecute = args.includes('--execute');

if (!isDryRun && !isExecute) {
  console.error('❌ Usage: tsx reset-free-credits.ts --dry-run OR --execute');
  console.error('\nOptions:');
  console.error('  --dry-run   Preview what would be changed (no actual changes)');
  console.error('  --execute   Actually perform the reset');
  process.exit(1);
}

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI is not set');
  process.exit(1);
}

// User schema (simplified for this script)
const userSchema = new mongoose.Schema({
  userId: String,
  walletAddress: String,
  email: String,
  credits: Number,
  totalCreditsEarned: Number,
  totalCreditsSpent: Number,
  paymentHistory: [{
    type: { type: String },
    amount: Number,
    credits: Number,
    timestamp: Date
  }]
}, { collection: 'users', strict: false });

const User = mongoose.model('User', userSchema);

async function main() {
  console.log('🔗 Connecting to database...');
  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected to MongoDB\n');

  // Find users who only have free credits (no purchases)
  // These are users who:
  // 1. Have credits > 0
  // 2. Have no payment history entries with type 'crypto' or 'stripe' (actual purchases)
  // 3. Only have 'admin', 'referral', or 'bonus' type payment entries (free credits)
  
  const usersWithFreeCredits = await User.find({
    credits: { $gt: 0 },
    $or: [
      // No payment history at all
      { paymentHistory: { $size: 0 } },
      { paymentHistory: { $exists: false } },
      // Or only have free credit types (no actual purchases)
      {
        'paymentHistory.type': { 
          $not: { $in: ['crypto', 'stripe', 'purchase'] }
        }
      }
    ]
  }).select('userId walletAddress email credits totalCreditsEarned totalCreditsSpent paymentHistory');

  // Filter to only include users who have ONLY free credits (admin, referral, bonus types)
  const usersToReset = usersWithFreeCredits.filter(user => {
    const history = user.paymentHistory || [];
    // If empty history and has credits, these are likely initial free credits
    if (history.length === 0 && user.credits > 0) {
      return true;
    }
    // Check if ALL payment history entries are free credit types
    const hasPurchase = history.some((entry: { type?: string }) => 
      entry.type === 'crypto' || entry.type === 'stripe' || entry.type === 'purchase'
    );
    return !hasPurchase && user.credits > 0;
  });

  console.log(`📊 Found ${usersToReset.length} users with only free credits\n`);

  if (usersToReset.length === 0) {
    console.log('✅ No users need to be reset');
    await mongoose.disconnect();
    return;
  }

  // Show summary
  let totalCreditsToReset = 0;
  console.log('Users to reset:');
  console.log('─'.repeat(80));
  
  for (const user of usersToReset.slice(0, 20)) {
    const identifier = user.walletAddress || user.email || user.userId;
    const historyTypes = (user.paymentHistory || [])
      .map((h: { type?: string }) => h.type)
      .filter((t: string | undefined) => t)
      .join(', ') || 'none';
    
    console.log(`  ${identifier?.substring(0, 30).padEnd(32)} | Credits: ${user.credits} | History: ${historyTypes}`);
    totalCreditsToReset += user.credits || 0;
  }
  
  if (usersToReset.length > 20) {
    console.log(`  ... and ${usersToReset.length - 20} more users`);
  }
  
  console.log('─'.repeat(80));
  console.log(`\n📈 Total credits to reset: ${totalCreditsToReset}`);

  if (isDryRun) {
    console.log('\n🔍 DRY RUN - No changes made');
    console.log('   Run with --execute to perform the reset');
  } else {
    console.log('\n⚠️  EXECUTING RESET...\n');
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const user of usersToReset) {
      try {
        await User.findByIdAndUpdate(user._id, {
          $set: {
            credits: 0,
            totalCreditsEarned: 0
          }
        });
        successCount++;
      } catch (error) {
        console.error(`❌ Error resetting user ${user.userId}: ${(error as Error).message}`);
        errorCount++;
      }
    }
    
    console.log(`\n✅ Reset complete!`);
    console.log(`   Success: ${successCount}`);
    console.log(`   Errors: ${errorCount}`);
    console.log(`   Total credits removed: ${totalCreditsToReset}`);
  }

  await mongoose.disconnect();
  console.log('\n👋 Disconnected from MongoDB');
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
