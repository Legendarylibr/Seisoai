#!/usr/bin/env node
/*
  Check user details by email
*/

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.join(__dirname, '..', '..', 'backend.env');
dotenv.config({ path: envPath });

const email = process.argv[2];
if (!email) {
  console.error('Usage: node check-user.js <email>');
  process.exit(1);
}

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI is not set');
  process.exit(1);
}

const userSchema = new mongoose.Schema({}, { strict: false, timestamps: true });
const User = mongoose.models.User || mongoose.model('User', userSchema);

async function main() {
  await mongoose.connect(MONGODB_URI, {
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 8000,
  });
  console.log('✅ Connected to MongoDB\n');

  const normalizedEmail = email.toLowerCase();
  const users = await User.find({ email: normalizedEmail });
  
  console.log(`Found ${users.length} user(s) with email: ${email}\n`);
  
  users.forEach((user, index) => {
    console.log(`User ${index + 1}:`);
    console.log(`  _id: ${user._id}`);
    console.log(`  userId: ${user.userId || 'N/A'}`);
    console.log(`  email: ${user.email || 'N/A'}`);
    console.log(`  walletAddress: ${user.walletAddress || 'N/A'}`);
    console.log(`  credits: ${user.credits || 0}`);
    console.log(`  totalCreditsEarned: ${user.totalCreditsEarned || 0}`);
    console.log(`  totalCreditsSpent: ${user.totalCreditsSpent || 0}`);
    console.log(`  createdAt: ${user.createdAt}`);
    console.log(`  updatedAt: ${user.updatedAt}`);
    console.log('');
  });

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('❌ Error:', err);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});


