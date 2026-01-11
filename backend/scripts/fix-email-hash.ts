#!/usr/bin/env node
/**
 * Fix missing emailHash for a user
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import { createEmailHash } from '../utils/emailHash.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment
dotenv.config({ path: path.join(__dirname, '..', '..', 'backend.env') });

const email = process.argv[2];

if (!email) {
  console.error('Usage: npx tsx fix-email-hash.ts <email>');
  process.exit(1);
}

async function main() {
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected to MongoDB');

  const normalizedEmail = email.toLowerCase().trim();
  const emailHash = createEmailHash(normalizedEmail);
  console.log('Email:', normalizedEmail);
  console.log('Email hash:', emailHash);

  // Update user to add emailHash
  const result = await mongoose.connection.db.collection('users').updateOne(
    { email: normalizedEmail },
    { $set: { emailHash: emailHash } }
  );

  console.log('Updated:', result.modifiedCount, 'document(s)');

  // Verify
  const user = await mongoose.connection.db.collection('users').findOne({ emailHash });
  if (user) {
    console.log('✅ User found by emailHash');
    console.log('   Credits:', user.credits);
    console.log('   userId:', user.userId);
  } else {
    console.log('❌ User NOT found by emailHash');
  }

  await mongoose.disconnect();
}

main().catch(console.error);
