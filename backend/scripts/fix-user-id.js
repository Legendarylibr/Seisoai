#!/usr/bin/env node
/*
  Fix missing userId for email users
*/

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.join(__dirname, '..', '..', 'backend.env');
dotenv.config({ path: envPath });

const email = process.argv[2];
if (!email) {
  console.error('Usage: node fix-user-id.js <email>');
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
  let user = await User.findOne({ email: normalizedEmail });
  
  if (!user) {
    console.error(`❌ User not found: ${email}`);
    await mongoose.disconnect();
    process.exit(1);
  }

  if (user.userId) {
    console.log(`✅ User already has userId: ${user.userId}`);
    console.log(`   Credits: ${user.credits}`);
    await mongoose.disconnect();
    process.exit(0);
  }

  // Generate userId same way as server.js pre-save hook
  const hash = crypto.createHash('sha256').update(user.email).digest('hex').substring(0, 16);
  const userId = `email_${hash}`;

  console.log(`📝 Adding userId to user...`);
  console.log(`   Email: ${user.email}`);
  console.log(`   Current Credits: ${user.credits}`);
  console.log(`   New userId: ${userId}\n`);

  // Check if userId already exists
  const existingUserWithId = await User.findOne({ userId });
  if (existingUserWithId && existingUserWithId._id.toString() !== user._id.toString()) {
    console.error(`❌ userId ${userId} already exists for another user!`);
    await mongoose.disconnect();
    process.exit(1);
  }

  // Use findOneAndUpdate to directly set userId (pre-save hook only runs for new docs)
  user = await User.findOneAndUpdate(
    { _id: user._id },
    { $set: { userId: userId } },
    { new: true }
  );
  
  if (!user) {
    console.error(`❌ Failed to update user`);
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log(`✅ userId added successfully!`);
  console.log(`   userId: ${user.userId}`);
  console.log(`   credits: ${user.credits}\n`);

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('❌ Error:', err);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});

