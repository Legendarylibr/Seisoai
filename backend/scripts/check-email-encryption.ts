/**
 * Quick script to check if emails are encrypted in the database
 * Shows actual email values (encrypted format) to verify encryption
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '..', 'backend.env') });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  logger.error('MONGODB_URI not set');
  console.error('❌ MONGODB_URI not set');
  process.exit(1);
}

// Check if a string is encrypted (has our iv:authTag:ciphertext format)
function isEncrypted(value: string): boolean {
  if (!value) return false;
  const parts = value.split(':');
  return parts.length === 3 && parts[0].length > 10;
}

// Check if value looks like a plain email
function isPlainEmail(value: string): boolean {
  if (!value) return false;
  return /^[^\s:]+@[^\s:]+\.[^\s:]+$/.test(value);
}

async function checkEmails(): Promise<void> {
  console.log('='.repeat(70));
  console.log('📧 EMAIL ENCRYPTION VERIFICATION');
  console.log('='.repeat(70));

  try {
    await mongoose.connect(MONGODB_URI || '');
    console.log('\n✅ Connected to MongoDB\n');

    // Access raw collection to see actual stored values (bypass Mongoose decryption)
    const db = mongoose.connection.db!;
    const users = await db.collection('users').find({ 
      email: { $exists: true, $ne: null } 
    }).toArray();

    console.log(`Found ${users.length} users with email addresses\n`);

    if (users.length === 0) {
      console.log('No users with emails found.');
      await mongoose.disconnect();
      return;
    }

    let encryptedCount = 0;
    let plainTextCount = 0;
    let emptyCount = 0;

    for (const user of users) {
      const email = user.email;
      const userId = user.userId || user._id.toString();
      const emailHash = user.emailHash || 'N/A';

      console.log(`User: ${userId}`);
      console.log(`  Email Hash: ${emailHash.substring(0, 16)}...`);
      
      if (!email) {
        console.log(`  Email: (empty/null)`);
        emptyCount++;
      } else if (isEncrypted(email)) {
        // Show encrypted format
        const parts = email.split(':');
        console.log(`  Email: ENCRYPTED ✅`);
        console.log(`    Format: iv:authTag:ciphertext`);
        console.log(`    IV (first 20 chars): ${parts[0].substring(0, 20)}...`);
        console.log(`    Auth Tag (first 20 chars): ${parts[1].substring(0, 20)}...`);
        console.log(`    Ciphertext (first 30 chars): ${parts[2].substring(0, 30)}...`);
        console.log(`    Full length: ${email.length} characters`);
        encryptedCount++;
      } else if (isPlainEmail(email)) {
        console.log(`  Email: PLAIN TEXT ⚠️`);
        console.log(`    Value: ${email}`);
        plainTextCount++;
      } else {
        console.log(`  Email: UNKNOWN FORMAT ⚠️`);
        console.log(`    Value (first 50 chars): ${email.substring(0, 50)}...`);
        plainTextCount++;
      }
      console.log('');
    }

    console.log('='.repeat(70));
    console.log('📊 SUMMARY');
    console.log('='.repeat(70));
    console.log(`  Total users with emails: ${users.length}`);
    console.log(`  ✅ Encrypted: ${encryptedCount}`);
    console.log(`  ⚠️  Plain text: ${plainTextCount}`);
    console.log(`  Empty/null: ${emptyCount}`);
    console.log('='.repeat(70));

    if (plainTextCount === 0) {
      console.log('\n✅ All emails are encrypted!');
    } else {
      console.log('\n⚠️  Some emails are NOT encrypted!');
      console.log('   Run migration script to encrypt them:');
      console.log('   node --import tsx scripts/migrate-to-encryption.ts --execute');
    }

  } catch (error: any) {
    logger.error('Email encryption check failed', { error: error.message, stack: error.stack });
    console.error('❌ Check failed:', error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

checkEmails();

