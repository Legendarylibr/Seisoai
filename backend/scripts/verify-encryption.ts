/**
 * Verification Script: Check encryption status of database
 * 
 * This script scans the database and reports:
 * - How many documents have encrypted vs plain text data
 * - Identifies any documents that still have plain text sensitive fields
 *
 * Run with: tsx scripts/verify-encryption.ts
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '..', 'backend.env') });

// Note: We access raw MongoDB collections directly (not through Mongoose models)
// to bypass auto-decryption hooks and see the actual encrypted values

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not set');
  process.exit(1);
}

// Check if a string is encrypted (has our iv:authTag:ciphertext format)
function isEncrypted(value: string): boolean {
  if (!value) return false;
  const parts = value.split(':');
  return parts.length === 3 && parts[0].length > 10;
}

// Check if value looks like a plain email
function isPlainEmail(value: string): boolean {
  if (!value) return false;
  return /^[^\s:]+@[^\s:]+\.[^\s:]+$/.test(value);
}

interface VerificationResult {
  collection: string;
  field: string;
  total: number;
  encrypted: number;
  plainText: number;
  empty: number;
  plainTextIds: string[];
}

async function verifyUserEmails(): Promise<VerificationResult> {
  const db = mongoose.connection.db!;
  const users = await db.collection('users').find({ email: { $exists: true } }).toArray();
  
  const result: VerificationResult = {
    collection: 'users',
    field: 'email',
    total: users.length,
    encrypted: 0,
    plainText: 0,
    empty: 0,
    plainTextIds: []
  };
  
  for (const user of users) {
    const email = user.email;
    if (!email) {
      result.empty++;
    } else if (isEncrypted(email)) {
      result.encrypted++;
    } else if (isPlainEmail(email)) {
      result.plainText++;
      result.plainTextIds.push(user.userId || user._id.toString());
    } else {
      // Unknown format - might be partial encryption or invalid
      result.plainText++;
      result.plainTextIds.push(user.userId || user._id.toString());
    }
  }
  
  return result;
}

async function verifyGenerationPrompts(): Promise<VerificationResult> {
  const db = mongoose.connection.db!;
  const generations = await db.collection('generations').find({ prompt: { $exists: true } }).toArray();
  
  const result: VerificationResult = {
    collection: 'generations',
    field: 'prompt',
    total: generations.length,
    encrypted: 0,
    plainText: 0,
    empty: 0,
    plainTextIds: []
  };
  
  for (const gen of generations) {
    const prompt = gen.prompt;
    if (!prompt) {
      result.empty++;
    } else if (isEncrypted(prompt)) {
      result.encrypted++;
    } else {
      result.plainText++;
      result.plainTextIds.push(gen.generationId || gen._id.toString());
    }
  }
  
  return result;
}

async function verifyGalleryPrompts(): Promise<VerificationResult> {
  const db = mongoose.connection.db!;
  const items = await db.collection('galleryitems').find({ prompt: { $exists: true, $ne: null, $ne: '' } }).toArray();
  
  const result: VerificationResult = {
    collection: 'galleryitems',
    field: 'prompt',
    total: items.length,
    encrypted: 0,
    plainText: 0,
    empty: 0,
    plainTextIds: []
  };
  
  for (const item of items) {
    const prompt = item.prompt;
    if (!prompt) {
      result.empty++;
    } else if (isEncrypted(prompt)) {
      result.encrypted++;
    } else {
      result.plainText++;
      result.plainTextIds.push(item.itemId || item._id.toString());
    }
  }
  
  return result;
}

async function verifyEmbeddedPrompts(): Promise<VerificationResult> {
  const db = mongoose.connection.db!;
  const users = await db.collection('users').find({
    $or: [
      { 'generationHistory.prompt': { $exists: true } },
      { 'gallery.prompt': { $exists: true } }
    ]
  }).toArray();
  
  const result: VerificationResult = {
    collection: 'users (embedded)',
    field: 'generationHistory.prompt & gallery.prompt',
    total: 0,
    encrypted: 0,
    plainText: 0,
    empty: 0,
    plainTextIds: []
  };
  
  for (const user of users) {
    const userId = user.userId || user._id.toString();
    
    // Check generationHistory prompts
    const genHistory = user.generationHistory || [];
    for (const gen of genHistory) {
      if (gen?.prompt) {
        result.total++;
        if (isEncrypted(gen.prompt)) {
          result.encrypted++;
        } else {
          result.plainText++;
          if (!result.plainTextIds.includes(userId)) {
            result.plainTextIds.push(userId);
          }
        }
      }
    }
    
    // Check gallery prompts
    const gallery = user.gallery || [];
    for (const item of gallery) {
      if (item?.prompt) {
        result.total++;
        if (isEncrypted(item.prompt)) {
          result.encrypted++;
        } else {
          result.plainText++;
          if (!result.plainTextIds.includes(userId)) {
            result.plainTextIds.push(userId);
          }
        }
      }
    }
  }
  
  return result;
}

function printResult(result: VerificationResult): void {
  const status = result.plainText === 0 ? '✅' : '⚠️';
  const pct = result.total > 0 ? Math.round((result.encrypted / result.total) * 100) : 100;
  
  console.log(`\n${status} ${result.collection}.${result.field}`);
  console.log(`   Total: ${result.total}`);
  console.log(`   Encrypted: ${result.encrypted} (${pct}%)`);
  console.log(`   Plain text: ${result.plainText}`);
  console.log(`   Empty/null: ${result.empty}`);
  
  if (result.plainText > 0 && result.plainTextIds.length <= 10) {
    console.log(`   Plain text IDs: ${result.plainTextIds.join(', ')}`);
  } else if (result.plainText > 0) {
    console.log(`   Plain text IDs (first 10): ${result.plainTextIds.slice(0, 10).join(', ')}...`);
  }
}

async function verify(): Promise<void> {
  console.log('='.repeat(60));
  console.log('🔍 ENCRYPTION VERIFICATION REPORT');
  console.log('='.repeat(60));

  try {
    await mongoose.connect(MONGODB_URI);
    console.log('\n✅ Connected to MongoDB');

    // Run all verifications
    const results = await Promise.all([
      verifyUserEmails(),
      verifyGenerationPrompts(),
      verifyGalleryPrompts(),
      verifyEmbeddedPrompts()
    ]);

    // Print results
    results.forEach(printResult);

    // Summary
    const totalPlainText = results.reduce((sum, r) => sum + r.plainText, 0);
    const totalEncrypted = results.reduce((sum, r) => sum + r.encrypted, 0);
    const totalFields = results.reduce((sum, r) => sum + r.total, 0);

    console.log('\n' + '='.repeat(60));
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));
    console.log(`   Total sensitive fields: ${totalFields}`);
    console.log(`   Encrypted: ${totalEncrypted}`);
    console.log(`   Plain text: ${totalPlainText}`);
    
    if (totalPlainText === 0) {
      console.log('\n✅ All sensitive data is encrypted!');
    } else {
      console.log('\n⚠️  Plain text data found!');
      console.log('   Run migration script to encrypt:');
      console.log('   npx tsx scripts/migrate-to-encryption.ts --execute');
    }
    console.log('='.repeat(60));

  } catch (error: any) {
    console.error('❌ Verification failed:', error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

verify();

