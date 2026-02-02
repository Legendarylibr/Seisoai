/**
 * Migration Script: Encrypt existing plain text data
 * 
 * This migrates plain text data to encrypted format:
 * - user.email → encrypted with emailHash for lookups
 * - Generation.prompt → encrypted
 * - GalleryItem.prompt → encrypted
 * - user.gallery[].prompt → encrypted (embedded array)
 * - user.generationHistory[].prompt → encrypted (embedded array)
 *
 * SAFETY:
 * - Dry run by default (use --execute to actually perform migration)
 * - Only encrypts data that isn't already encrypted
 * - Reports on all changes before/after
 *
 * Run with: 
 *   tsx scripts/migrate-to-encryption.ts           # Dry run
 *   tsx scripts/migrate-to-encryption.ts --execute # Actually perform migration
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '..', 'backend.env') });

// Import models
import User from '../models/User.js';
import Generation from '../models/Generation.js';
import GalleryItem from '../models/GalleryItem.js';
import { encrypt, createBlindIndex, isEncryptionConfigured } from '../utils/encryption.js';

const MONGODB_URI = process.env.MONGODB_URI;
const DRY_RUN = !process.argv.includes('--execute');

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not set');
  process.exit(1);
}

// Check if a string is already encrypted (has our iv:authTag:ciphertext format)
function isEncrypted(value: string): boolean {
  if (!value) return false;
  const parts = value.split(':');
  return parts.length === 3 && parts[0].length > 10;
}

// Check if value looks like a plain email (simple heuristic)
function isPlainEmail(value: string): boolean {
  if (!value) return false;
  return /^[^\s:]+@[^\s:]+\.[^\s:]+$/.test(value);
}

interface MigrationStats {
  usersScanned: number;
  emailsEncrypted: number;
  embeddedPromptsEncrypted: number;
  generationsScanned: number;
  generationPromptsEncrypted: number;
  galleryItemsScanned: number;
  galleryPromptsEncrypted: number;
}

async function migrateUserEmails(stats: MigrationStats): Promise<void> {
  console.log('\n📧 Phase 1: Migrating User Emails...\n');
  
  // Find users with plain text emails (not encrypted)
  const users = await User.find({ email: { $exists: true, $ne: null } }).select('_id userId email emailHash');
  
  console.log(`   Found ${users.length} users with email field`);
  
  for (const user of users) {
    stats.usersScanned++;
    
    const email = user.email;
    if (!email) continue;
    
    // Skip if already encrypted
    if (isEncrypted(email)) {
      continue;
    }
    
    // Looks like plain text email
    if (isPlainEmail(email)) {
      const normalizedEmail = email.toLowerCase().trim();
      const newEmailHash = createBlindIndex(normalizedEmail);
      const encryptedEmail = encrypt(normalizedEmail);
      
      console.log(`   📝 User ${user.userId || user._id}:`);
      console.log(`      Plain email: ${email.substring(0, 3)}***@***`);
      console.log(`      → Encrypting and generating emailHash`);
      
      if (!DRY_RUN) {
        await User.updateOne(
          { _id: user._id },
          { 
            $set: { 
              email: encryptedEmail,
              emailHash: newEmailHash
            } 
          }
        );
      }
      
      stats.emailsEncrypted++;
    }
  }
  
  console.log(`\n   ✅ Phase 1 complete: ${stats.emailsEncrypted} emails ${DRY_RUN ? 'would be' : 'were'} encrypted`);
}

async function migrateEmbeddedPrompts(stats: MigrationStats): Promise<void> {
  console.log('\n📝 Phase 2: Migrating Embedded User Prompts...\n');
  
  // Find users with embedded arrays that have prompts
  const users = await User.find({
    $or: [
      { 'generationHistory.prompt': { $exists: true } },
      { 'gallery.prompt': { $exists: true } }
    ]
  }).select('_id userId generationHistory gallery');
  
  console.log(`   Found ${users.length} users with embedded data`);
  
  for (const user of users) {
    const userId = user.userId || user._id.toString();
    let modified = false;
    
    // Process generationHistory prompts
    const genHistory = (user as any).generationHistory || [];
    for (let i = 0; i < genHistory.length; i++) {
      const prompt = genHistory[i]?.prompt;
      if (prompt && !isEncrypted(prompt)) {
        if (!DRY_RUN) {
          genHistory[i].prompt = encrypt(prompt);
        }
        stats.embeddedPromptsEncrypted++;
        modified = true;
      }
    }
    
    // Process gallery prompts
    const gallery = (user as any).gallery || [];
    for (let i = 0; i < gallery.length; i++) {
      const prompt = gallery[i]?.prompt;
      if (prompt && !isEncrypted(prompt)) {
        if (!DRY_RUN) {
          gallery[i].prompt = encrypt(prompt);
        }
        stats.embeddedPromptsEncrypted++;
        modified = true;
      }
    }
    
    if (modified) {
      console.log(`   📝 User ${userId}: encrypting ${genHistory.length + gallery.length} embedded prompts`);
      
      if (!DRY_RUN) {
        await User.updateOne(
          { _id: user._id },
          { 
            $set: { 
              generationHistory: genHistory,
              gallery: gallery
            } 
          }
        );
      }
    }
  }
  
  console.log(`\n   ✅ Phase 2 complete: ${stats.embeddedPromptsEncrypted} embedded prompts ${DRY_RUN ? 'would be' : 'were'} encrypted`);
}

async function migrateGenerationPrompts(stats: MigrationStats): Promise<void> {
  console.log('\n🖼️  Phase 3: Migrating Generation Prompts...\n');
  
  // Find generations with prompts
  const generations = await Generation.find({ prompt: { $exists: true, $ne: null } });
  
  console.log(`   Found ${generations.length} generations with prompts`);
  
  let batch: { id: any; encryptedPrompt: string }[] = [];
  const BATCH_SIZE = 100;
  
  for (const gen of generations) {
    stats.generationsScanned++;
    
    const prompt = gen.prompt;
    if (!prompt || isEncrypted(prompt)) continue;
    
    batch.push({
      id: gen._id,
      encryptedPrompt: encrypt(prompt)
    });
    stats.generationPromptsEncrypted++;
    
    // Process in batches
    if (batch.length >= BATCH_SIZE) {
      if (!DRY_RUN) {
        await Promise.all(batch.map(item => 
          Generation.updateOne({ _id: item.id }, { $set: { prompt: item.encryptedPrompt } })
        ));
      }
      console.log(`   📝 Encrypted batch of ${batch.length} generation prompts`);
      batch = [];
    }
  }
  
  // Process remaining
  if (batch.length > 0 && !DRY_RUN) {
    await Promise.all(batch.map(item => 
      Generation.updateOne({ _id: item.id }, { $set: { prompt: item.encryptedPrompt } })
    ));
  }
  
  console.log(`\n   ✅ Phase 3 complete: ${stats.generationPromptsEncrypted} generation prompts ${DRY_RUN ? 'would be' : 'were'} encrypted`);
}

async function migrateGalleryPrompts(stats: MigrationStats): Promise<void> {
  console.log('\n🎨 Phase 4: Migrating Gallery Item Prompts...\n');
  
  // Find gallery items with prompts
  const galleryItems = await GalleryItem.find({ prompt: { $exists: true, $ne: null } });
  
  console.log(`   Found ${galleryItems.length} gallery items with prompts`);
  
  let batch: { id: any; encryptedPrompt: string }[] = [];
  const BATCH_SIZE = 100;
  
  for (const item of galleryItems) {
    stats.galleryItemsScanned++;
    
    const prompt = item.prompt;
    if (!prompt || isEncrypted(prompt)) continue;
    
    batch.push({
      id: item._id,
      encryptedPrompt: encrypt(prompt)
    });
    stats.galleryPromptsEncrypted++;
    
    // Process in batches
    if (batch.length >= BATCH_SIZE) {
      if (!DRY_RUN) {
        await Promise.all(batch.map(i => 
          GalleryItem.updateOne({ _id: i.id }, { $set: { prompt: i.encryptedPrompt } })
        ));
      }
      console.log(`   📝 Encrypted batch of ${batch.length} gallery prompts`);
      batch = [];
    }
  }
  
  // Process remaining
  if (batch.length > 0 && !DRY_RUN) {
    await Promise.all(batch.map(i => 
      GalleryItem.updateOne({ _id: i.id }, { $set: { prompt: i.encryptedPrompt } })
    ));
  }
  
  console.log(`\n   ✅ Phase 4 complete: ${stats.galleryPromptsEncrypted} gallery prompts ${DRY_RUN ? 'would be' : 'were'} encrypted`);
}

async function migrate(): Promise<void> {
  console.log('='.repeat(60));
  console.log('🔐 ENCRYPTION MIGRATION SCRIPT');
  console.log('='.repeat(60));
  
  if (DRY_RUN) {
    console.log('\n⚠️  DRY RUN MODE - No changes will be made');
    console.log('   Run with --execute to perform actual migration\n');
  } else {
    console.log('\n🚨 EXECUTE MODE - Changes will be written to database\n');
  }
  
  // Verify encryption is configured
  if (!isEncryptionConfigured()) {
    console.error('❌ Encryption is not configured!');
    console.error('   Set ENCRYPTION_KEY in your backend.env file');
    console.error('   Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    process.exit(1);
  }
  
  console.log('✅ Encryption key is configured\n');

  try {
    await mongoose.connect(MONGODB_URI!);
    console.log('✅ Connected to MongoDB\n');

    const stats: MigrationStats = {
      usersScanned: 0,
      emailsEncrypted: 0,
      embeddedPromptsEncrypted: 0,
      generationsScanned: 0,
      generationPromptsEncrypted: 0,
      galleryItemsScanned: 0,
      galleryPromptsEncrypted: 0
    };

    // Run all phases
    await migrateUserEmails(stats);
    await migrateEmbeddedPrompts(stats);
    await migrateGenerationPrompts(stats);
    await migrateGalleryPrompts(stats);

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 MIGRATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`   Mode: ${DRY_RUN ? 'DRY RUN (no changes made)' : 'EXECUTED'}`);
    console.log('');
    console.log('   Users:');
    console.log(`      Scanned: ${stats.usersScanned}`);
    console.log(`      Emails encrypted: ${stats.emailsEncrypted}`);
    console.log(`      Embedded prompts encrypted: ${stats.embeddedPromptsEncrypted}`);
    console.log('');
    console.log('   Generations:');
    console.log(`      Scanned: ${stats.generationsScanned}`);
    console.log(`      Prompts encrypted: ${stats.generationPromptsEncrypted}`);
    console.log('');
    console.log('   Gallery Items:');
    console.log(`      Scanned: ${stats.galleryItemsScanned}`);
    console.log(`      Prompts encrypted: ${stats.galleryPromptsEncrypted}`);
    console.log('');
    console.log(`   TOTAL FIELDS ENCRYPTED: ${stats.emailsEncrypted + stats.embeddedPromptsEncrypted + stats.generationPromptsEncrypted + stats.galleryPromptsEncrypted}`);
    console.log('='.repeat(60));

    if (DRY_RUN && (stats.emailsEncrypted + stats.embeddedPromptsEncrypted + stats.generationPromptsEncrypted + stats.galleryPromptsEncrypted) > 0) {
      console.log('\n⚠️  Plain text data found! Run with --execute to encrypt it:');
      console.log('   npx tsx scripts/migrate-to-encryption.ts --execute\n');
    } else if (!DRY_RUN) {
      console.log('\n✅ Migration complete! All sensitive data is now encrypted.');
      console.log('\n🔒 IMPORTANT: Make sure to:');
      console.log('   1. Back up your ENCRYPTION_KEY securely');
      console.log('   2. Never lose or change the key (data will be unrecoverable)');
      console.log('   3. Test that your app still works correctly\n');
    } else {
      console.log('\n✅ All data is already encrypted. Nothing to migrate.\n');
    }

  } catch (error: any) {
    console.error('❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

migrate();

