#!/usr/bin/env node
/**
 * Fix user lookup by adding both HMAC and plain SHA-256 emailHash
 * This ensures the user can be found regardless of ENCRYPTION_KEY
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import crypto from 'crypto';
import { createEmailHash } from '../utils/emailHash.js';
import { isEncryptionConfigured } from '../utils/encryption.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '..', 'backend.env') });

const email = process.argv[2] || 'test@example.com';

async function main() {
  console.log('Encryption configured:', isEncryptionConfigured());
  
  await mongoose.connect(process.env.MONGODB_URI!);
  console.log('✅ Connected\n');
  
  const normalized = email.toLowerCase().trim();
  
  // Current hash (HMAC with encryption key if configured)
  const currentHash = createEmailHash(email);
  console.log('Current emailHash:', currentHash);
  
  // Plain SHA-256 hash (no encryption key)
  const plainHash = crypto.createHash('sha256').update(normalized).digest('hex');
  console.log('Plain SHA-256 hash:', plainHash);
  
  console.log('Hashes match:', currentHash === plainHash);
  
  // Find the user by current hash
  let user = await mongoose.connection.db.collection('users').findOne({ emailHash: currentHash });
  
  if (!user) {
    console.log('\n❌ User not found by HMAC hash');
    
    // Try plain hash
    user = await mongoose.connection.db.collection('users').findOne({ emailHash: plainHash });
    if (user) {
      console.log('✅ Found by plain SHA-256 hash!');
      console.log('   This means production uses no encryption or different key');
    } else {
      console.log('❌ Not found by either hash method');
      
      // List all users to debug
      const allUsers = await mongoose.connection.db.collection('users').find({}).limit(10).toArray();
      console.log('\nAll users in database:');
      for (const u of allUsers) {
        console.log('  -', u.userId, '| hash:', u.emailHash?.substring(0, 16) + '...');
      }
    }
    await mongoose.disconnect();
    return;
  }
  
  console.log('\n✅ User found:', user.userId);
  console.log('   Credits:', user.credits);
  console.log('   Current emailHash in DB:', user.emailHash?.substring(0, 20) + '...');
  
  // Add BOTH hashes to ensure user can be found either way
  // Store plain hash as secondary index
  console.log('\nAdding secondary hash for cross-environment compatibility...');
  
  const updateFields: Record<string, unknown> = {};
  
  // Store the plain email (lowercase) for fallback $or lookup in signin
  updateFields.emailLookup = normalized;
  
  // If current hash is HMAC, also store the plain hash as secondary
  if (currentHash !== plainHash) {
    updateFields.emailHashPlain = plainHash;
  }
  
  await mongoose.connection.db.collection('users').updateOne(
    { _id: user._id },
    { $set: updateFields }
  );
  
  console.log('✅ Updated user with fallback lookup fields');
  console.log('   emailLookup:', normalized);
  if (currentHash !== plainHash) {
    console.log('   emailHashPlain:', plainHash.substring(0, 20) + '...');
  }
  
  await mongoose.disconnect();
}

main().catch(console.error);
