#!/usr/bin/env node
/**
 * Diagnose why credits are not showing for a user
 * Run: tsx diagnose-user-credits.ts <email>
 */
import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '..', 'backend.env') });

const email = process.argv[2] || 'test@example.com';

// Replicate the createEmailHash function
function createEmailHash(email: string): string {
  const normalized = email.toLowerCase().trim();
  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (encryptionKey && encryptionKey.length === 64) {
    const key = Buffer.from(encryptionKey, 'hex');
    return crypto.createHmac('sha256', key).update(normalized).digest('hex');
  }
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

async function main() {
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI not set');
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected to MongoDB\n');
  console.log('='.repeat(60));
  console.log('DIAGNOSING CREDITS ISSUE');
  console.log('='.repeat(60));
  console.log('\nEmail:', email);

  const db = mongoose.connection.db;
  const normalizedEmail = email.toLowerCase().trim();
  
  // Generate all possible lookup hashes
  const emailHash = createEmailHash(normalizedEmail);
  const emailHashPlain = crypto.createHash('sha256').update(normalizedEmail).digest('hex');
  
  console.log('\n📋 LOOKUP HASHES:');
  console.log('   HMAC Hash:', emailHash.substring(0, 32) + '...');
  console.log('   Plain SHA256:', emailHashPlain.substring(0, 32) + '...');
  console.log('   Hashes match:', emailHash === emailHashPlain ? '✅ Yes (no ENCRYPTION_KEY)' : '❌ No (using ENCRYPTION_KEY)');

  // Find ALL users that could match this email
  console.log('\n🔍 SEARCHING FOR USER(S)...\n');
  
  const users = await db.collection('users').find({
    $or: [
      { emailHash },
      { emailHashPlain },
      { emailLookup: normalizedEmail },
      { email: normalizedEmail },
      { email: { $regex: new RegExp(`^${normalizedEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i') } }
    ]
  }).toArray();

  if (users.length === 0) {
    console.log('❌ NO USER FOUND!');
    console.log('   The user does not exist in the database.');
    console.log('   They need to sign up or there was a lookup issue.');
    await mongoose.disconnect();
    return;
  }

  console.log(`Found ${users.length} user record(s):\n`);
  
  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    console.log(`--- USER ${i + 1} ---`);
    console.log('_id:', user._id);
    console.log('userId:', user.userId || '⚠️ NOT SET');
    console.log('email:', user.email?.substring(0, 50) + (user.email?.length > 50 ? '...' : ''));
    console.log('emailHash:', user.emailHash?.substring(0, 32) + '...' || '⚠️ NOT SET');
    console.log('emailHashPlain:', user.emailHashPlain?.substring(0, 32) + '...' || '⚠️ NOT SET');
    console.log('emailLookup:', user.emailLookup || '⚠️ NOT SET');
    console.log('credits:', user.credits ?? 0);
    console.log('totalCreditsEarned:', user.totalCreditsEarned ?? 0);
    console.log('totalCreditsSpent:', user.totalCreditsSpent ?? 0);
    console.log('password SET:', !!user.password);
    console.log('createdAt:', user.createdAt);
    console.log('lastActive:', user.lastActive || 'never');
    console.log('');
  }

  // Check for problems
  console.log('='.repeat(60));
  console.log('DIAGNOSIS');
  console.log('='.repeat(60));

  const issues: string[] = [];
  const fixes: string[] = [];

  // Problem 1: Multiple users (duplicates)
  if (users.length > 1) {
    issues.push('DUPLICATE USERS: Found multiple user records for the same email!');
    fixes.push('Merge duplicate accounts (combine credits, keep one record)');
  }

  const user = users[0]; // Primary user

  // Problem 2: Missing userId
  if (!user.userId) {
    issues.push('MISSING userId: The user record has no userId field!');
    fixes.push('Run migration to set userId based on emailHash');
  }

  // Problem 3: userId format mismatch
  if (user.userId) {
    const isOldFormat = user.userId.startsWith('user_');
    const isNewFormat = user.userId.startsWith('email_') || user.userId.startsWith('wallet_');
    
    if (isOldFormat) {
      issues.push(`OLD userId FORMAT: "${user.userId}" uses old timestamp format`);
      fixes.push('Consider updating to new format OR ensure JWTs are refreshed on signin');
    }
    
    // Check if expected new userId matches
    const expectedNewUserId = `email_${emailHashPlain.substring(0, 16)}`;
    if (isNewFormat && user.userId !== expectedNewUserId) {
      issues.push(`userId MISMATCH: DB has "${user.userId}" but expected "${expectedNewUserId}"`);
      fixes.push('Update userId to match expected value or check emailHash');
    }
  }

  // Problem 4: Missing emailHash
  if (!user.emailHash) {
    issues.push('MISSING emailHash: Cannot look up user efficiently');
    fixes.push('Run set-email-hash.ts to add emailHash');
  }

  // Problem 5: Missing fallback fields
  if (!user.emailLookup || !user.emailHashPlain) {
    issues.push('MISSING FALLBACK FIELDS: emailLookup or emailHashPlain not set');
    fixes.push('Run fix-user-lookup.ts to add fallback fields');
  }

  // Problem 6: No password (can't sign in with email)
  if (!user.password) {
    issues.push('NO PASSWORD: User cannot sign in with email/password');
    fixes.push('User needs to reset password or use wallet');
  }

  console.log('\n📊 ISSUES FOUND:', issues.length === 0 ? 'None! ✅' : '');
  issues.forEach((issue, i) => console.log(`   ${i + 1}. ${issue}`));

  console.log('\n🔧 RECOMMENDED FIXES:');
  if (fixes.length === 0) {
    console.log('   No fixes needed - check JWT token validity instead');
  } else {
    fixes.forEach((fix, i) => console.log(`   ${i + 1}. ${fix}`));
  }

  // JWT test section
  console.log('\n='.repeat(60));
  console.log('JWT VERIFICATION');
  console.log('='.repeat(60));
  
  if (user.userId) {
    console.log('\n✅ To test credits endpoint with this userId:');
    console.log(`   1. The JWT must contain: { userId: "${user.userId}" }`);
    console.log('   2. If the user\'s browser has an old JWT, they need to sign out and sign back in');
    console.log('   3. Check browser localStorage for old tokens');
  }

  await mongoose.disconnect();
  console.log('\n✅ Done\n');
}

main().catch(console.error);
