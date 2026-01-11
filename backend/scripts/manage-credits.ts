#!/usr/bin/env node
/*
  Manage credits for users by wallet address, email, or userId
  
  Features:
  - Uses atomic database operations (findOneAndUpdate) for reliable credit updates
  - Automatically generates userId for all users (email or wallet)
  - Automatically fixes missing userId for existing users
  - Creates new users when adding credits if they don't exist
  
  Usage: 
    tsx manage-credits.ts --wallet <walletAddress> --add <credits>
    tsx manage-credits.ts --email <email> --add <credits>
    tsx manage-credits.ts --userId <userId> --add <credits>
    tsx manage-credits.ts --wallet <walletAddress> --set <credits>
    tsx manage-credits.ts --email <email> --set <credits>
    tsx manage-credits.ts --userId <userId> --set <credits>
    tsx manage-credits.ts --wallet <walletAddress> --subtract <credits>
    tsx manage-credits.ts --email <email> --subtract <credits>
    tsx manage-credits.ts --userId <userId> --subtract <credits>
    tsx manage-credits.ts --wallet <walletAddress> --show
    tsx manage-credits.ts --email <email> --show
    tsx manage-credits.ts --userId <userId> --show
*/

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import crypto from 'crypto';
import { createEmailHash } from '../utils/emailHash.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment
const envPath = path.join(__dirname, '..', '..', 'backend.env');
dotenv.config({ path: envPath });

// Parse command line arguments
const args = process.argv.slice(2);
let walletAddress: string | null = null;
let email: string | null = null;
let userId: string | null = null;
let action: string | null = null;
let credits: number | null = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--wallet' && args[i + 1]) {
    walletAddress = args[i + 1];
    i++;
  } else if (args[i] === '--email' && args[i + 1]) {
    email = args[i + 1];
    i++;
  } else if (args[i] === '--userId' && args[i + 1]) {
    userId = args[i + 1];
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
if (!walletAddress && !email && !userId) {
  console.error('❌ Usage: tsx manage-credits.ts --wallet <address> OR --email <email> OR --userId <userId> [--add|--set|--subtract|--show] <credits>');
  console.error('\nExamples:');
  console.error('  tsx manage-credits.ts --wallet 0x123... --add 10');
  console.error('  tsx manage-credits.ts --email user@example.com --add 10');
  console.error('  tsx manage-credits.ts --userId email_830e0b10bcd6cd0f --add 10');
  console.error('  tsx manage-credits.ts --wallet 0x123... --set 100');
  console.error('  tsx manage-credits.ts --email user@example.com --subtract 5');
  console.error('  tsx manage-credits.ts --userId wallet_a1b2c3d4e5f6g7h8 --show');
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

// Generate userId for users (same logic as server.ts)
function generateUserId(email: string | null = null, walletAddress: string | null = null): string | null {
  let hash: string;
  let prefix: string;
  
  if (email) {
    // Generate userId from email hash
    hash = crypto.createHash('sha256').update(email.toLowerCase()).digest('hex').substring(0, 16);
    prefix = 'email_';
  } else if (walletAddress) {
    // Generate userId from wallet address hash
    const normalizedAddress = walletAddress.startsWith('0x') 
      ? walletAddress.toLowerCase() 
      : walletAddress;
    hash = crypto.createHash('sha256').update(normalizedAddress).digest('hex').substring(0, 16);
    prefix = 'wallet_';
  } else {
    return null;
  }
  
  return `${prefix}${hash}`;
}

// Ensure users have a userId (fixes missing userId for existing users)
async function ensureUserId(user: any): Promise<any> {
  if (user && !user.userId) {
    const userId = generateUserId(user.email, user.walletAddress);
    if (!userId) {
      return user; // No email or wallet, can't generate userId
    }
    
    // Check if userId already exists for another user
    const existingUser = await User.findOne({ userId });
    if (existingUser && existingUser._id.toString() !== user._id.toString()) {
      console.warn(`⚠️  Warning: userId ${userId} already exists for another user, skipping userId assignment`);
      return user;
    }
    // Set userId using atomic update
    const updatedUser = await User.findOneAndUpdate(
      { _id: user._id },
      { $set: { userId: userId } },
      { new: true }
    );
    if (updatedUser && updatedUser.userId) {
      console.log(`✅ Generated and set missing userId: ${updatedUser.userId}`);
      return updatedUser;
    }
  }
  return user;
}

async function main(): Promise<void> {
  await mongoose.connect(MONGODB_URI, {
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 8000,
  });
  console.log('✅ Connected to MongoDB\n');

  // Easy unified lookup: find user by wallet OR email OR userId
  let identifier = '';
  let user: any = null;
  let query: any = {};
  
  if (walletAddress) {
    const isSolanaAddress = !walletAddress.startsWith('0x');
    const normalizedAddress = isSolanaAddress ? walletAddress : walletAddress.toLowerCase();
    // Try wallet first, then userId if provided
    const orConditions: Array<Record<string, unknown>> = [
      { walletAddress: normalizedAddress }
    ];
    if (email) {
      // Use encryption-aware email lookup
      const normalizedEmail = email.toLowerCase().trim();
      const emailHash = createEmailHash(normalizedEmail);
      const emailHashPlain = crypto.createHash('sha256').update(normalizedEmail).digest('hex');
      orConditions.push({ emailHash }, { emailHashPlain }, { emailLookup: normalizedEmail }, { email: normalizedEmail });
    }
    if (userId) {
      orConditions.push({ userId });
    }
    query = { $or: orConditions };
    user = await User.findOne(query);
    identifier = `wallet ${walletAddress}`;
  } else if (email) {
    // Use encryption-aware email lookup with multiple fallbacks
    const normalizedEmail = email.toLowerCase().trim();
    const emailHash = createEmailHash(normalizedEmail);
    const emailHashPlain = crypto.createHash('sha256').update(normalizedEmail).digest('hex');
    const orConditions: Array<Record<string, unknown>> = [
      { emailHash },
      { emailHashPlain },
      { emailLookup: normalizedEmail },
      { email: normalizedEmail }
    ];
    if (userId) {
      orConditions.push({ userId });
    }
    query = { $or: orConditions };
    user = await User.findOne(query);
    identifier = `email ${email}`;
  } else if (userId) {
    query = { userId: userId };
    user = await User.findOne(query);
    identifier = `userId ${userId}`;
  }
  
  if (!user) {
    // If user doesn't exist and action is 'add', create the user
    // Note: Cannot create user with only userId - need wallet or email
    if (action === 'add' && (walletAddress || email)) {
      console.log(`📝 User not found, creating new user for ${identifier}...`);
      const normalizedEmail = email ? email.toLowerCase() : null;
      const isSolanaAddress = walletAddress && !walletAddress.startsWith('0x');
      const normalizedAddress = walletAddress ? (isSolanaAddress ? walletAddress : walletAddress.toLowerCase()) : null;
      
      // Generate userId for users before creating (email or wallet)
      const userId = normalizedEmail 
        ? generateUserId(normalizedEmail, null)
        : (normalizedAddress ? generateUserId(null, normalizedAddress) : null);
      
      // Check if userId already exists
      if (userId) {
        const existingUserWithId = await User.findOne({ userId });
        if (existingUserWithId) {
          console.error(`❌ userId ${userId} already exists for another user!`);
          await mongoose.disconnect();
          process.exit(1);
        }
      }
      
      // Generate emailHash and fallback fields for robust email lookups
      // Uses createEmailHash which handles encryption config (HMAC vs SHA256)
      const emailHash = normalizedEmail 
        ? createEmailHash(normalizedEmail)
        : null;
      const emailHashPlain = normalizedEmail
        ? crypto.createHash('sha256').update(normalizedEmail).digest('hex')
        : null;
      
      user = new User({
        ...(normalizedAddress && { walletAddress: normalizedAddress }),
        ...(normalizedEmail && { email: normalizedEmail }),
        ...(emailHash && { emailHash: emailHash }),
        ...(emailHashPlain && { emailHashPlain: emailHashPlain }),
        ...(normalizedEmail && { emailLookup: normalizedEmail }),
        ...(userId && { userId: userId }),
        credits: 0, // Start with 0, will add credits below
        totalCreditsEarned: 0,
        totalCreditsSpent: 0,
        hasUsedFreeImage: false,
        nftCollections: [],
        paymentHistory: [],
        generationHistory: [],
        gallery: [],
        settings: {
          preferredStyle: null,
          defaultImageSize: '1024x1024',
          enableNotifications: true
        }
      });
      await user.save();
      
      // Ensure userId is set (in case pre-save hook didn't run)
      user = await ensureUserId(user);
      
      console.log(`✅ New user created!\n`);
    } else {
      if (action === 'add' && userId && !walletAddress && !email) {
        console.error(`❌ Cannot create new user with only userId: ${identifier}`);
        console.log('\n💡 Tip: To create a new user, use --wallet or --email with --add');
        console.log('💡 Tip: userId can only be used to reference existing users');
      } else {
        console.error(`❌ User not found: ${identifier}`);
        console.log('\n💡 Tip: Users can be referenced by wallet address, email, or userId');
        console.log('💡 Tip: Use --add to create a new user automatically (requires --wallet or --email)');
      }
      await mongoose.disconnect();
      process.exit(1);
    }
  }

  // Ensure email users have userId before proceeding
  user = await ensureUserId(user);
  
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
    // Record in paymentHistory for consistency with payment-based credits
    const paymentEntry = {
      txHash: `manual_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      tokenSymbol: 'MANUAL',
      amount: 0,
      credits: credits,
      chainId: 'manual',
      walletType: 'script',
      timestamp: new Date()
    };
    
    // Use atomic update to ensure credits are added reliably and recorded in paymentHistory
    user = await User.findOneAndUpdate(
      query,
      {
        $inc: { credits: credits!, totalCreditsEarned: credits! },
        $push: { paymentHistory: paymentEntry }
      },
      { new: true }
    );
    if (!user) {
      console.error('❌ Failed to update user');
      await mongoose.disconnect();
      process.exit(1);
    }
    console.log(`✅ Credits added and recorded in payment history!\n`);
  } else if (action === 'set') {
    console.log(`🔧 Setting credits to ${credits}...`);
    const difference = credits! - previousCredits;
    const updateFields: any = { $set: { credits: credits! } };
    if (difference > 0) {
      // If setting higher, add to total earned and record in paymentHistory
      updateFields.$inc = { totalCreditsEarned: difference };
      const paymentEntry = {
        txHash: `manual_set_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        tokenSymbol: 'MANUAL',
        amount: 0,
        credits: difference,
        chainId: 'manual',
        walletType: 'script',
        timestamp: new Date()
      };
      updateFields.$push = { paymentHistory: paymentEntry };
    }
    user = await User.findOneAndUpdate(
      query,
      updateFields,
      { new: true }
    );
    if (!user) {
      console.error('❌ Failed to update user');
      await mongoose.disconnect();
      process.exit(1);
    }
    console.log(`✅ Credits set${difference > 0 ? ' and recorded in payment history' : ''}!\n`);
  } else if (action === 'subtract') {
    console.log(`➖ Subtracting ${credits} credits...`);
    if (previousCredits < credits!) {
      console.warn(`⚠️  Warning: User only has ${previousCredits} credits, subtracting ${credits} will result in negative balance`);
    }
    user = await User.findOneAndUpdate(
      query,
      {
        $inc: { credits: -credits!, totalCreditsSpent: credits! }
      },
      { new: true }
    );
    if (!user) {
      console.error('❌ Failed to update user');
      await mongoose.disconnect();
      process.exit(1);
    }
    console.log(`✅ Credits subtracted!\n`);
  }

  // Ensure userId is still set after updates
  user = await ensureUserId(user);
  
  // Show final state (user is already updated from findOneAndUpdate)
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

main().catch(async (err: unknown) => {
  console.error('❌ Error:', err);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});





