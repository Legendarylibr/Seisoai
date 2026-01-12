#!/usr/bin/env node
/**
 * Fix user emailHash to match current server configuration
 * Also ensures all fallback fields are properly set
 * 
 * Run: tsx fix-user-email-hash.ts <email>
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

  const db = mongoose.connection.db;
  const normalizedEmail = email.toLowerCase().trim();
  
  // Generate all hash variants
  const emailHash = createEmailHash(normalizedEmail);  // HMAC with current key
  const emailHashPlain = crypto.createHash('sha256').update(normalizedEmail).digest('hex');  // Plain SHA256
  
  console.log('Email:', normalizedEmail);
  console.log('Current emailHash (HMAC):', emailHash.substring(0, 32) + '...');
  console.log('emailHashPlain (SHA256):', emailHashPlain.substring(0, 32) + '...');
  console.log('');

  // Find user with any matching field
  const user = await db.collection('users').findOne({
    $or: [
      { emailLookup: normalizedEmail },
      { emailHashPlain },
      { email: normalizedEmail }
    ]
  });

  if (!user) {
    console.log('❌ User not found!');
    await mongoose.disconnect();
    return;
  }

  console.log('✅ User found:');
  console.log('   _id:', user._id);
  console.log('   userId:', user.userId);
  console.log('   Current emailHash:', user.emailHash?.substring(0, 32) + '...');
  console.log('   credits:', user.credits);
  console.log('');

  // Check if emailHash needs updating
  const needsEmailHashUpdate = user.emailHash !== emailHash;
  const needsEmailHashPlainUpdate = user.emailHashPlain !== emailHashPlain;
  const needsEmailLookupUpdate = user.emailLookup !== normalizedEmail;

  if (!needsEmailHashUpdate && !needsEmailHashPlainUpdate && !needsEmailLookupUpdate) {
    console.log('✅ All email lookup fields are already correct!');
    await mongoose.disconnect();
    return;
  }

  console.log('📝 Updating user record...');
  
  const updateFields: Record<string, string> = {};
  
  if (needsEmailHashUpdate) {
    updateFields.emailHash = emailHash;
    console.log('   - Updating emailHash');
  }
  
  if (needsEmailHashPlainUpdate) {
    updateFields.emailHashPlain = emailHashPlain;
    console.log('   - Updating emailHashPlain');
  }
  
  if (needsEmailLookupUpdate) {
    updateFields.emailLookup = normalizedEmail;
    console.log('   - Updating emailLookup');
  }

  await db.collection('users').updateOne(
    { _id: user._id },
    { $set: updateFields }
  );

  console.log('\n✅ Updated successfully!');

  // Verify the update
  const updatedUser = await db.collection('users').findOne({ _id: user._id });
  console.log('\nVerification:');
  console.log('   emailHash:', updatedUser?.emailHash?.substring(0, 32) + '...');
  console.log('   emailHashPlain:', updatedUser?.emailHashPlain?.substring(0, 32) + '...');
  console.log('   emailLookup:', updatedUser?.emailLookup);
  
  // Test that lookup now works
  console.log('\n🔍 Testing lookup by new emailHash...');
  const testLookup = await db.collection('users').findOne({ emailHash });
  console.log('   Found:', testLookup ? '✅ Yes' : '❌ No');

  await mongoose.disconnect();
  console.log('\n✅ Done');
}

main().catch(console.error);
