#!/usr/bin/env node
/**
 * Fix Oversized Documents Script
 * 
 * MongoDB has a 16MB document limit. This script finds and trims
 * documents that have grown too large due to unbounded array growth.
 * 
 * Usage: node scripts/fix-oversized-documents.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment
dotenv.config({ path: path.join(__dirname, '..', '..', 'backend.env') });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not set');
  process.exit(1);
}

// Define schema
const userSchema = new mongoose.Schema({}, { strict: false });
const User = mongoose.models.User || mongoose.model('User', userSchema);

// Limits for arrays
const LIMITS = {
  generationHistory: 200,
  gallery: 100,
  paymentHistory: 500
};

async function findOversizedDocuments() {
  console.log('🔍 Searching for oversized documents...\n');
  
  // Find documents with large arrays
  const users = await User.find({}).lean();
  
  const oversized = [];
  
  for (const user of users) {
    const historySize = user.generationHistory?.length || 0;
    const gallerySize = user.gallery?.length || 0;
    const paymentSize = user.paymentHistory?.length || 0;
    
    // Estimate document size (rough approximation)
    const docString = JSON.stringify(user);
    const estimatedSize = Buffer.byteLength(docString, 'utf8');
    const sizeMB = (estimatedSize / (1024 * 1024)).toFixed(2);
    
    if (historySize > LIMITS.generationHistory || 
        gallerySize > LIMITS.gallery || 
        estimatedSize > 10 * 1024 * 1024) { // Over 10MB
      oversized.push({
        _id: user._id,
        userId: user.userId,
        email: user.email,
        walletAddress: user.walletAddress,
        historySize,
        gallerySize,
        paymentSize,
        sizeMB
      });
    }
  }
  
  return oversized;
}

async function trimDocument(userId) {
  console.log(`\n✂️  Trimming document: ${userId}`);
  
  const user = await User.findById(userId);
  if (!user) {
    console.log('  ❌ User not found');
    return false;
  }
  
  let changes = false;
  
  // Trim generationHistory
  if (user.generationHistory && user.generationHistory.length > LIMITS.generationHistory) {
    const oldLen = user.generationHistory.length;
    user.generationHistory = user.generationHistory.slice(-LIMITS.generationHistory);
    console.log(`  📜 generationHistory: ${oldLen} → ${user.generationHistory.length}`);
    changes = true;
  }
  
  // Trim gallery
  if (user.gallery && user.gallery.length > LIMITS.gallery) {
    const oldLen = user.gallery.length;
    user.gallery = user.gallery.slice(-LIMITS.gallery);
    console.log(`  🖼️  gallery: ${oldLen} → ${user.gallery.length}`);
    changes = true;
  }
  
  // Trim paymentHistory
  if (user.paymentHistory && user.paymentHistory.length > LIMITS.paymentHistory) {
    const oldLen = user.paymentHistory.length;
    user.paymentHistory = user.paymentHistory.slice(-LIMITS.paymentHistory);
    console.log(`  💳 paymentHistory: ${oldLen} → ${user.paymentHistory.length}`);
    changes = true;
  }
  
  if (changes) {
    await user.save();
    console.log('  ✅ Document saved');
  } else {
    console.log('  ℹ️  No changes needed');
  }
  
  return changes;
}

async function main() {
  console.log('🔧 Fix Oversized Documents Script\n');
  console.log('Limits:');
  console.log(`  - generationHistory: max ${LIMITS.generationHistory} items`);
  console.log(`  - gallery: max ${LIMITS.gallery} items`);
  console.log(`  - paymentHistory: max ${LIMITS.paymentHistory} items`);
  console.log('');
  
  await mongoose.connect(MONGODB_URI, {
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 30000,
  });
  console.log('✅ Connected to MongoDB\n');
  
  const oversized = await findOversizedDocuments();
  
  if (oversized.length === 0) {
    console.log('✅ No oversized documents found!');
  } else {
    console.log(`\n⚠️  Found ${oversized.length} oversized document(s):\n`);
    
    for (const doc of oversized) {
      console.log(`  ID: ${doc._id}`);
      console.log(`  User: ${doc.email || doc.walletAddress || doc.userId}`);
      console.log(`  Size: ~${doc.sizeMB} MB`);
      console.log(`  Arrays: history=${doc.historySize}, gallery=${doc.gallerySize}, payments=${doc.paymentSize}`);
      console.log('');
    }
    
    // Ask for confirmation (auto-fix in non-interactive mode)
    const args = process.argv.slice(2);
    if (args.includes('--fix')) {
      console.log('\n🔧 Fixing documents...\n');
      for (const doc of oversized) {
        await trimDocument(doc._id);
      }
      console.log('\n✅ All documents fixed!');
    } else {
      console.log('To fix these documents, run:');
      console.log('  node scripts/fix-oversized-documents.js --fix\n');
    }
  }
  
  await mongoose.connection.close();
  console.log('\n👋 Done');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

