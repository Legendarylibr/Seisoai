#!/usr/bin/env node
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import { createEmailHash } from '../utils/emailHash.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '..', 'backend.env') });

const email = process.argv[2] || 'test@example.com';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  console.log('✅ Connected\n');

  const normalizedEmail = email.toLowerCase().trim();
  const emailHash = createEmailHash(normalizedEmail);
  
  console.log('Looking for email:', normalizedEmail);
  console.log('EmailHash:', emailHash);
  console.log('');

  // Find by emailHash
  const user = await mongoose.connection.db.collection('users').findOne({ emailHash });
  
  if (!user) {
    console.log('❌ User not found by emailHash');
    await mongoose.disconnect();
    return;
  }

  console.log('✅ User found:\n');
  console.log('  _id:', user._id);
  console.log('  userId:', user.userId);
  console.log('  email (encrypted):', user.email?.substring(0, 30) + '...');
  console.log('  emailHash:', user.emailHash);
  console.log('  credits:', user.credits);
  console.log('  totalCreditsEarned:', user.totalCreditsEarned);
  console.log('  totalCreditsSpent:', user.totalCreditsSpent);
  console.log('  walletAddress:', user.walletAddress || 'none');
  console.log('  createdAt:', user.createdAt);
  console.log('  lastActive:', user.lastActive);
  console.log('');
  
  // Test lookup by userId
  console.log('Testing lookups:');
  const byUserId = await mongoose.connection.db.collection('users').findOne({ userId: user.userId });
  console.log('  By userId:', byUserId ? '✅ Found' : '❌ Not found');
  
  const byEmail = await mongoose.connection.db.collection('users').findOne({ email: user.email });
  console.log('  By encrypted email:', byEmail ? '✅ Found' : '❌ Not found');
  
  const byPlainEmail = await mongoose.connection.db.collection('users').findOne({ email: normalizedEmail });
  console.log('  By plain email:', byPlainEmail ? '✅ Found' : '❌ Not found');
  
  // Check password
  console.log('');
  console.log('Auth info:');
  console.log('  password SET:', !!user.password);
  console.log('  password length:', user.password?.length || 0);
  console.log('  failedLoginAttempts:', user.failedLoginAttempts || 0);
  console.log('  lockoutUntil:', user.lockoutUntil || 'none');

  await mongoose.disconnect();
}

main().catch(console.error);
