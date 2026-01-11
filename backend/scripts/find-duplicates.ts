#!/usr/bin/env node
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '..', 'backend.env') });

const email = process.argv[2] || 'test@example.com';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  console.log('✅ Connected\n');

  const normalizedEmail = email.toLowerCase().trim();
  
  // Find all users that might match this email
  const users = await mongoose.connection.db.collection('users').find({
    $or: [
      { email: normalizedEmail },
      { email: { $regex: new RegExp(normalizedEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') } }
    ]
  }).toArray();

  console.log(`Found ${users.length} user(s):\n`);
  
  for (const user of users) {
    console.log('---');
    console.log('_id:', user._id);
    console.log('email:', user.email);
    console.log('emailHash:', user.emailHash || 'NOT SET');
    console.log('userId:', user.userId);
    console.log('credits:', user.credits);
    console.log('');
  }

  // Also check by emailHash
  const crypto = await import('crypto');
  const hash = crypto.createHash('sha256').update(normalizedEmail).digest('hex');
  console.log('\nChecking for users with emailHash:', hash);
  
  const hashUsers = await mongoose.connection.db.collection('users').find({
    emailHash: hash
  }).toArray();
  
  console.log(`Found ${hashUsers.length} user(s) by hash:\n`);
  for (const user of hashUsers) {
    console.log('---');
    console.log('_id:', user._id);
    console.log('email:', user.email);
    console.log('emailHash:', user.emailHash);
    console.log('userId:', user.userId);
    console.log('credits:', user.credits);
  }

  await mongoose.disconnect();
}

main().catch(console.error);
