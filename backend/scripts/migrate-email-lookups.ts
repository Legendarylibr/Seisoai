#!/usr/bin/env node
/**
 * Migration script: Add fallback email lookup fields to all existing users
 * 
 * This adds:
 * - emailHashPlain: plain SHA-256 hash (no encryption key)
 * - emailLookup: normalized plain email
 * 
 * These allow users to be found regardless of ENCRYPTION_KEY configuration.
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import crypto from 'crypto';
import { decrypt, isEncryptionConfigured } from '../utils/encryption.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '..', 'backend.env') });

// Helper to check if a string is encrypted
function isEncrypted(value: string): boolean {
  if (!value) return false;
  const parts = value.split(':');
  return parts.length === 3 && parts[0].length > 10;
}

async function main() {
  console.log('=== Email Lookup Migration ===\n');
  console.log('Encryption configured:', isEncryptionConfigured());
  
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected to MongoDB\n');

  // Find all users with email but missing fallback fields
  const users = await mongoose.connection.db.collection('users').find({
    $or: [
      { email: { $exists: true, $ne: null } },
      { emailHash: { $exists: true, $ne: null } }
    ]
  }).toArray();

  console.log(`Found ${users.length} users with email/emailHash\n`);

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const user of users) {
    try {
      // Determine the plain email
      let plainEmail: string | null = null;
      
      if (user.emailLookup) {
        // Already has emailLookup, use it
        plainEmail = user.emailLookup;
      } else if (user.email) {
        if (isEncrypted(user.email)) {
          // Decrypt to get plain email
          try {
            plainEmail = decrypt(user.email);
          } catch (e) {
            console.log(`  ⚠️  Could not decrypt email for ${user.userId}`);
          }
        } else {
          // Email is already plain
          plainEmail = user.email.toLowerCase().trim();
        }
      }

      if (!plainEmail) {
        console.log(`  ⏭️  Skipping ${user.userId} - no recoverable email`);
        skipped++;
        continue;
      }

      const normalizedEmail = plainEmail.toLowerCase().trim();
      const emailHashPlain = crypto.createHash('sha256').update(normalizedEmail).digest('hex');

      // Check if update is needed
      if (user.emailLookup === normalizedEmail && user.emailHashPlain === emailHashPlain) {
        skipped++;
        continue;
      }

      // Update user with fallback fields
      await mongoose.connection.db.collection('users').updateOne(
        { _id: user._id },
        { 
          $set: { 
            emailLookup: normalizedEmail,
            emailHashPlain: emailHashPlain
          } 
        }
      );

      console.log(`  ✅ Updated ${user.userId}`);
      updated++;
    } catch (error) {
      console.log(`  ❌ Error updating ${user.userId}:`, (error as Error).message);
      errors++;
    }
  }

  console.log('\n=== Migration Complete ===');
  console.log(`  Updated: ${updated}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Errors:  ${errors}`);

  await mongoose.disconnect();
}

main().catch(console.error);
