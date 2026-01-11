#!/usr/bin/env node
/*
  Clear all generation history from the database
  
  This script removes ALL generation data from:
  - Generation collection (generation history)
  - GalleryItem collection (saved gallery items)
  - Embedded gallery arrays in User documents
  - Embedded generationHistory arrays in User documents
  
  Usage: 
    tsx clear-all-generations.ts
    tsx clear-all-generations.ts --confirm   (skip confirmation prompt)
*/

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment
const envPath = path.join(__dirname, '..', '..', 'backend.env');
dotenv.config({ path: envPath });

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI is not set');
  process.exit(1);
}

// Check for --confirm flag
const skipConfirm = process.argv.includes('--confirm');

// Generation schema
const generationSchema = new mongoose.Schema({
  userId: String,
  generationId: String,
  prompt: String,
  style: String,
  model: String,
  imageUrl: String,
  videoUrl: String,
  requestId: String,
  status: String,
  creditsUsed: Number,
  metadata: mongoose.Schema.Types.Mixed,
  createdAt: Date
}, { timestamps: true, strict: false });

// GalleryItem schema
const galleryItemSchema = new mongoose.Schema({
  userId: String,
  itemId: String,
  imageUrl: String,
  videoUrl: String,
  prompt: String,
  style: String,
  model: String,
  creditsUsed: Number,
  metadata: mongoose.Schema.Types.Mixed,
  createdAt: Date
}, { timestamps: true, strict: false });

const Generation = mongoose.models.Generation || mongoose.model('Generation', generationSchema);
const GalleryItem = mongoose.models.GalleryItem || mongoose.model('GalleryItem', galleryItemSchema);

async function askConfirmation(): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question('\n⚠️  Are you sure you want to delete ALL generation history? (type "yes" to confirm): ', (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes');
    });
  });
}

async function main(): Promise<void> {
  console.log('🗑️  Clear All Generations Script\n');
  console.log('This will permanently delete:');
  console.log('  - All items from the Generation collection');
  console.log('  - All items from the GalleryItem collection');
  console.log('  - All embedded gallery items in User documents');
  console.log('  - All embedded generationHistory in User documents\n');

  await mongoose.connect(MONGODB_URI!, {
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 8000,
  });
  console.log('✅ Connected to MongoDB\n');

  // Count existing documents in collections
  const generationCount = await Generation.countDocuments();
  const galleryCount = await GalleryItem.countDocuments();

  // Count embedded items in users
  const usersCollection = mongoose.connection.db.collection('users');
  const pipeline = [
    { $project: { 
      galleryCount: { $size: { $ifNull: ['$gallery', []] } }, 
      historyCount: { $size: { $ifNull: ['$generationHistory', []] } } 
    }},
    { $group: { 
      _id: null, 
      totalGallery: { $sum: '$galleryCount' }, 
      totalHistory: { $sum: '$historyCount' } 
    }}
  ];
  const totals = await usersCollection.aggregate(pipeline).toArray();
  const embeddedGallery = totals.length > 0 ? totals[0].totalGallery : 0;
  const embeddedHistory = totals.length > 0 ? totals[0].totalHistory : 0;

  console.log(`📊 Current counts:`);
  console.log(`   Generations collection: ${generationCount}`);
  console.log(`   GalleryItems collection: ${galleryCount}`);
  console.log(`   Embedded gallery items in users: ${embeddedGallery}`);
  console.log(`   Embedded generation history in users: ${embeddedHistory}`);

  const totalItems = generationCount + galleryCount + embeddedGallery + embeddedHistory;
  if (totalItems === 0) {
    console.log('\n✅ Nothing to delete - everything is already empty!');
    await mongoose.disconnect();
    process.exit(0);
  }

  // Ask for confirmation unless --confirm flag is passed
  if (!skipConfirm) {
    const confirmed = await askConfirmation();
    if (!confirmed) {
      console.log('\n❌ Aborted - no changes made');
      await mongoose.disconnect();
      process.exit(0);
    }
  }

  console.log('\n🔄 Deleting all generations...');
  
  // Delete from collections
  const generationResult = await Generation.deleteMany({});
  console.log(`   ✅ Deleted ${generationResult.deletedCount} from Generation collection`);

  const galleryResult = await GalleryItem.deleteMany({});
  console.log(`   ✅ Deleted ${galleryResult.deletedCount} from GalleryItem collection`);

  // Clear embedded arrays in all users
  const userUpdateResult = await usersCollection.updateMany(
    {},
    { $set: { gallery: [], generationHistory: [] } }
  );
  console.log(`   ✅ Cleared embedded data from ${userUpdateResult.modifiedCount} users`);

  console.log('\n🎉 All generation history has been cleared!\n');

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (err: unknown) => {
  console.error('❌ Error:', err);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});
