#!/usr/bin/env node
/**
 * Fix user emailHash using the actual server hash function
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import { createEmailHash } from '../utils/emailHash.js';
import { isEncryptionConfigured } from '../utils/encryption.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment
dotenv.config({ path: path.join(__dirname, '..', '..', 'backend.env') });

const email = process.argv[2] || 'test@example.com';

async function main() {
  console.log('Encryption configured:', isEncryptionConfigured());
  
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected to MongoDB\n');

  const normalizedEmail = email.toLowerCase().trim();
  const correctHash = createEmailHash(normalizedEmail);
  
  console.log('Email:', normalizedEmail);
  console.log('Correct emailHash:', correctHash);

  // Find user by email
  const user = await mongoose.connection.db.collection('users').findOne({ 
    email: { $regex: new RegExp(`^${normalizedEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
  });

  if (!user) {
    console.log('\n❌ User not found by email');
    
    // Try finding by hash
    const byHash = await mongoose.connection.db.collection('users').findOne({ emailHash: correctHash });
    if (byHash) {
      console.log('✅ But found by emailHash! User exists correctly.');
      console.log('   credits:', byHash.credits);
      console.log('   email field:', byHash.email);
    }
    await mongoose.disconnect();
    return;
  }

  console.log('\nFound user:');
  console.log('  _id:', user._id);
  console.log('  current emailHash:', user.emailHash || 'NOT SET');
  console.log('  credits:', user.credits);

  if (user.emailHash === correctHash) {
    console.log('\n✅ emailHash is already correct!');
    await mongoose.disconnect();
    return;
  }

  // Check if another user has this hash
  const existingWithHash = await mongoose.connection.db.collection('users').findOne({ 
    emailHash: correctHash,
    _id: { $ne: user._id }
  });

  if (existingWithHash) {
    console.log('\n⚠️  Another user already has this emailHash:');
    console.log('   _id:', existingWithHash._id);
    console.log('   email:', existingWithHash.email);
    console.log('   credits:', existingWithHash.credits);
    console.log('\n   Need to merge these accounts!');
    
    // Merge credits to the correct user
    const totalCredits = (user.credits || 0) + (existingWithHash.credits || 0);
    const totalEarned = (user.totalCreditsEarned || 0) + (existingWithHash.totalCreditsEarned || 0);
    
    console.log('\n   Merging: total credits will be', totalCredits);
    
    // Update the correct user (with emailHash)
    await mongoose.connection.db.collection('users').updateOne(
      { _id: existingWithHash._id },
      { 
        $set: { 
          credits: totalCredits,
          totalCreditsEarned: totalEarned
        } 
      }
    );
    
    // Delete the duplicate
    await mongoose.connection.db.collection('users').deleteOne({ _id: user._id });
    
    console.log('✅ Merged! Duplicate deleted.');
    
    // Verify
    const final = await mongoose.connection.db.collection('users').findOne({ emailHash: correctHash });
    console.log('\nFinal user:');
    console.log('  credits:', final?.credits);
    
    await mongoose.disconnect();
    return;
  }

  // Update the hash
  await mongoose.connection.db.collection('users').updateOne(
    { _id: user._id },
    { $set: { emailHash: correctHash } }
  );

  console.log('\n✅ Updated emailHash');

  // Verify
  const updated = await mongoose.connection.db.collection('users').findOne({ emailHash: correctHash });
  console.log('Verified - found by hash:', updated ? 'Yes' : 'No');
  console.log('Credits:', updated?.credits);

  await mongoose.disconnect();
}

main().catch(console.error);
