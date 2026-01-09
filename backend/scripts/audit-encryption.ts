/**
 * Comprehensive Encryption Audit Script
 * 
 * This script checks ALL potentially sensitive fields in the database
 * and reports on encryption status. It's more thorough than verify-encryption.ts
 * as it checks additional fields that might contain sensitive data.
 *
 * Run with: tsx scripts/audit-encryption.ts
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '..', 'backend.env') });

const MONGODB_URI = process.env.MONGODB_URI;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

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

// Check if value looks like a password hash (bcrypt format)
function isPasswordHash(value: string): boolean {
  if (!value) return false;
  // Bcrypt hashes start with $2a$, $2b$, or $2y$ and are 60 characters
  return /^\$2[ayb]\$\d{2}\$/.test(value);
}

interface AuditResult {
  collection: string;
  field: string;
  total: number;
  encrypted: number;
  plainText: number;
  empty: number;
  hashed: number; // For passwords
  plainTextIds: string[];
  recommendation: string;
}

async function auditUserEmails(): Promise<AuditResult> {
  const db = mongoose.connection.db!;
  const users = await db.collection('users').find({ email: { $exists: true } }).toArray();
  
  const result: AuditResult = {
    collection: 'users',
    field: 'email',
    total: users.length,
    encrypted: 0,
    plainText: 0,
    empty: 0,
    hashed: 0,
    plainTextIds: [],
    recommendation: 'Should be encrypted'
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
    }
  }
  
  return result;
}

async function auditUserPasswords(): Promise<AuditResult> {
  const db = mongoose.connection.db!;
  const users = await db.collection('users').find({ password: { $exists: true } }).toArray();
  
  const result: AuditResult = {
    collection: 'users',
    field: 'password',
    total: users.length,
    encrypted: 0,
    plainText: 0,
    empty: 0,
    hashed: 0,
    plainTextIds: [],
    recommendation: 'Should be hashed (bcrypt) - NOT encrypted'
  };
  
  for (const user of users) {
    const password = user.password;
    if (!password) {
      result.empty++;
    } else if (isPasswordHash(password)) {
      result.hashed++;
    } else {
      result.plainText++;
      result.plainTextIds.push(user.userId || user._id.toString());
    }
  }
  
  return result;
}

async function auditGenerationPrompts(): Promise<AuditResult> {
  const db = mongoose.connection.db!;
  const generations = await db.collection('generations').find({ prompt: { $exists: true } }).toArray();
  
  const result: AuditResult = {
    collection: 'generations',
    field: 'prompt',
    total: generations.length,
    encrypted: 0,
    plainText: 0,
    empty: 0,
    hashed: 0,
    plainTextIds: [],
    recommendation: 'Should be encrypted (contains user content)'
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

async function auditGalleryPrompts(): Promise<AuditResult> {
  const db = mongoose.connection.db!;
  const items = await db.collection('galleryitems').find({ prompt: { $exists: true, $ne: null, $ne: '' } }).toArray();
  
  const result: AuditResult = {
    collection: 'galleryitems',
    field: 'prompt',
    total: items.length,
    encrypted: 0,
    plainText: 0,
    empty: 0,
    hashed: 0,
    plainTextIds: [],
    recommendation: 'Should be encrypted (contains user content)'
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

async function auditEmbeddedPrompts(): Promise<AuditResult> {
  const db = mongoose.connection.db!;
  const users = await db.collection('users').find({
    $or: [
      { 'generationHistory.prompt': { $exists: true } },
      { 'gallery.prompt': { $exists: true } }
    ]
  }).toArray();
  
  const result: AuditResult = {
    collection: 'users (embedded)',
    field: 'generationHistory.prompt & gallery.prompt',
    total: 0,
    encrypted: 0,
    plainText: 0,
    empty: 0,
    hashed: 0,
    plainTextIds: [],
    recommendation: 'Should be encrypted (contains user content)'
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

function printResult(result: AuditResult): void {
  const status = result.plainText === 0 ? '✅' : '⚠️';
  const pct = result.total > 0 ? Math.round((result.encrypted / result.total) * 100) : 100;
  
  console.log(`\n${status} ${result.collection}.${result.field}`);
  console.log(`   Total: ${result.total}`);
  if (result.hashed > 0) {
    console.log(`   Hashed: ${result.hashed} (correct for passwords)`);
  }
  console.log(`   Encrypted: ${result.encrypted} (${pct}%)`);
  console.log(`   Plain text: ${result.plainText}`);
  console.log(`   Empty/null: ${result.empty}`);
  console.log(`   Recommendation: ${result.recommendation}`);
  
  if (result.plainText > 0 && result.plainTextIds.length <= 10) {
    console.log(`   Plain text IDs: ${result.plainTextIds.join(', ')}`);
  } else if (result.plainText > 0) {
    console.log(`   Plain text IDs (first 10): ${result.plainTextIds.slice(0, 10).join(', ')}...`);
  }
}

async function audit(): Promise<void> {
  console.log('='.repeat(70));
  console.log('🔍 COMPREHENSIVE ENCRYPTION AUDIT REPORT');
  console.log('='.repeat(70));

  // Check encryption configuration
  console.log('\n📋 Configuration Check:');
  if (ENCRYPTION_KEY) {
    if (ENCRYPTION_KEY.length === 64) {
      console.log('   ✅ ENCRYPTION_KEY is configured (64 hex characters)');
    } else {
      console.log(`   ⚠️  ENCRYPTION_KEY length is ${ENCRYPTION_KEY.length}, expected 64`);
    }
  } else {
    console.log('   ❌ ENCRYPTION_KEY is NOT configured');
    console.log('   ⚠️  Encryption will not work without this key!');
  }

  try {
    await mongoose.connect(MONGODB_URI);
    console.log('\n✅ Connected to MongoDB\n');

    // Run all audits
    const results = await Promise.all([
      auditUserEmails(),
      auditUserPasswords(),
      auditGenerationPrompts(),
      auditGalleryPrompts(),
      auditEmbeddedPrompts()
    ]);

    // Print results
    results.forEach(printResult);

    // Summary
    const sensitiveFields = results.filter(r => r.field !== 'password');
    const totalPlainText = sensitiveFields.reduce((sum, r) => sum + r.plainText, 0);
    const totalEncrypted = sensitiveFields.reduce((sum, r) => sum + r.encrypted, 0);
    const totalFields = sensitiveFields.reduce((sum, r) => sum + r.total, 0);
    
    const passwordResult = results.find(r => r.field === 'password');
    const plainTextPasswords = passwordResult ? passwordResult.plainText : 0;

    console.log('\n' + '='.repeat(70));
    console.log('📊 SUMMARY');
    console.log('='.repeat(70));
    console.log(`   Total sensitive fields: ${totalFields}`);
    console.log(`   Encrypted: ${totalEncrypted}`);
    console.log(`   Plain text: ${totalPlainText}`);
    
    if (plainTextPasswords > 0) {
      console.log(`\n   ⚠️  CRITICAL: ${plainTextPasswords} passwords are NOT hashed!`);
      console.log('      Passwords must be hashed with bcrypt, not stored in plain text!');
    }
    
    if (totalPlainText === 0 && plainTextPasswords === 0) {
      console.log('\n✅ All sensitive data is properly protected!');
      console.log('   - Emails: Encrypted');
      console.log('   - Prompts: Encrypted');
      console.log('   - Passwords: Hashed (bcrypt)');
    } else {
      console.log('\n⚠️  Unencrypted/unhashed data found!');
      if (totalPlainText > 0) {
        console.log('\n   To encrypt plain text data, run:');
        console.log('   npx tsx scripts/migrate-to-encryption.ts --execute');
      }
      if (plainTextPasswords > 0) {
        console.log('\n   ⚠️  CRITICAL: Plain text passwords must be fixed manually!');
        console.log('      This is a security vulnerability.');
      }
    }
    console.log('='.repeat(70));

  } catch (error: any) {
    console.error('❌ Audit failed:', error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

audit();

