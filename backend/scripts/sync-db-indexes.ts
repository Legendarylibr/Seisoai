#!/usr/bin/env node
/*
  Sync database indexes with schema definitions
  
  This script ensures all indexes defined in schemas are created in MongoDB,
  including TTL indexes for auto-expiry.
  
  Usage: 
    tsx sync-db-indexes.ts
*/

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

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

async function main(): Promise<void> {
  console.log('🔄 Syncing Database Indexes\n');

  await mongoose.connect(MONGODB_URI!, {
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 8000,
  });
  console.log('✅ Connected to MongoDB\n');

  // Import models to register schemas
  const { User, Generation, GalleryItem, Payment, IPFreeImage, GlobalFreeImage } = await import('../models/index.js');

  console.log('📊 Syncing indexes for all models...\n');

  // Sync indexes for each model
  const models = [
    { name: 'User', model: User },
    { name: 'Generation', model: Generation },
    { name: 'GalleryItem', model: GalleryItem },
    { name: 'Payment', model: Payment },
    { name: 'IPFreeImage', model: IPFreeImage },
    { name: 'GlobalFreeImage', model: GlobalFreeImage }
  ];

  for (const { name, model } of models) {
    try {
      console.log(`  Syncing ${name}...`);
      await model.syncIndexes();
      
      // Get and display indexes
      const indexes = await model.collection.indexes();
      const ttlIndexes = indexes.filter((idx: any) => idx.expireAfterSeconds !== undefined);
      
      console.log(`    ✅ ${indexes.length} indexes (${ttlIndexes.length} TTL)`);
      
      for (const idx of ttlIndexes) {
        const days = Math.round(idx.expireAfterSeconds / (24 * 60 * 60));
        console.log(`       TTL: ${JSON.stringify(idx.key)} expires after ${days} days`);
      }
    } catch (error) {
      const err = error as Error;
      console.log(`    ❌ Error: ${err.message}`);
    }
  }

  console.log('\n✅ Index sync complete!\n');

  // Show final state
  console.log('📊 Final Index Summary:\n');
  
  const collections = await mongoose.connection.db.listCollections().toArray();
  for (const col of collections) {
    try {
      const indexes = await mongoose.connection.db.collection(col.name).indexes();
      const ttlIndexes = indexes.filter((idx: any) => idx.expireAfterSeconds !== undefined);
      console.log(`  ${col.name}: ${indexes.length} indexes${ttlIndexes.length > 0 ? ` (${ttlIndexes.length} TTL)` : ''}`);
    } catch (e) {
      // Skip
    }
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (err: unknown) => {
  console.error('❌ Error:', err);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});
