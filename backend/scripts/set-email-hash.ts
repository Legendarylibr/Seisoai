#!/usr/bin/env node
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '..', 'backend.env') });

const email = process.argv[2] || 'test@example.com';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  console.log('✅ Connected\n');

  const normalizedEmail = email.toLowerCase().trim();
  
  // Create hash the same way the server does (sha256 when encryption not configured)
  const emailHash = crypto.createHash('sha256').update(normalizedEmail).digest('hex');
  
  console.log('Email:', normalizedEmail);
  console.log('EmailHash to set:', emailHash);
  
  // First check if this hash already exists
  const existingWithHash = await mongoose.connection.db.collection('users').findOne({ emailHash });
  if (existingWithHash) {
    console.log('\n⚠️  User with this emailHash already exists:');
    console.log('   _id:', existingWithHash._id);
    console.log('   email:', existingWithHash.email);
    console.log('   credits:', existingWithHash.credits);
    
    // If it's the same user, we're good
    const targetUser = await mongoose.connection.db.collection('users').findOne({ email: normalizedEmail });
    if (targetUser && targetUser._id.toString() === existingWithHash._id.toString()) {
      console.log('\n✅ This is the same user - emailHash is already set correctly!');
    } else {
      console.log('\n❌ Different user has this hash - need to merge accounts');
    }
    await mongoose.disconnect();
    return;
  }
  
  // Update the user
  const result = await mongoose.connection.db.collection('users').updateOne(
    { email: normalizedEmail },
    { $set: { emailHash: emailHash } }
  );
  
  console.log('\nUpdate result:', result.modifiedCount, 'document(s) modified');
  
  // Verify
  const user = await mongoose.connection.db.collection('users').findOne({ email: normalizedEmail });
  console.log('\nUpdated user:');
  console.log('  emailHash:', user?.emailHash || 'NOT SET');
  console.log('  credits:', user?.credits);

  await mongoose.disconnect();
}

main().catch(console.error);
