#!/usr/bin/env node
/*
  Fix database indexes - drops conflicting indexes and recreates them
  
  This script fixes index conflicts where existing indexes have different
  options than what the schema defines (e.g., missing TTL).
  
  Usage: 
    tsx fix-db-indexes.ts
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
  console.log('🔧 Fixing Database Indexes\n');

  await mongoose.connect(MONGODB_URI!, {
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 8000,
  });
  console.log('✅ Connected to MongoDB\n');

  const db = mongoose.connection.db;

  // Fix Generation collection - needs TTL index on createdAt
  console.log('📦 Fixing generations collection...');
  try {
    const genCollection = db.collection('generations');
    
    // Drop the non-TTL createdAt index
    try {
      await genCollection.dropIndex('createdAt_1');
      console.log('   Dropped old createdAt index');
    } catch (e) {
      // Index might not exist
    }
    
    // Create TTL index (30 days)
    await genCollection.createIndex(
      { createdAt: 1 },
      { expireAfterSeconds: 30 * 24 * 60 * 60, background: true }
    );
    console.log('   ✅ Created TTL index (30 days)');
  } catch (error) {
    console.log('   ❌ Error:', (error as Error).message);
  }

  // Fix GalleryItem collection - needs TTL index on createdAt
  console.log('📦 Fixing galleryitems collection...');
  try {
    const galleryCollection = db.collection('galleryitems');
    
    // Drop the non-TTL createdAt index
    try {
      await galleryCollection.dropIndex('createdAt_1');
      console.log('   Dropped old createdAt index');
    } catch (e) {
      // Index might not exist
    }
    
    // Create TTL index (30 days)
    await galleryCollection.createIndex(
      { createdAt: 1 },
      { expireAfterSeconds: 30 * 24 * 60 * 60, background: true }
    );
    console.log('   ✅ Created TTL index (30 days)');
  } catch (error) {
    console.log('   ❌ Error:', (error as Error).message);
  }

  // Ensure IPFreeImage has TTL index (7 days)
  console.log('📦 Checking ipfreeimages collection...');
  try {
    const ipCollection = db.collection('ipfreeimages');
    const indexes = await ipCollection.indexes();
    const hasTTL = indexes.some((idx: any) => idx.expireAfterSeconds !== undefined);
    
    if (hasTTL) {
      console.log('   ✅ Already has TTL index');
    } else {
      await ipCollection.createIndex(
        { createdAt: 1 },
        { expireAfterSeconds: 7 * 24 * 60 * 60, background: true }
      );
      console.log('   ✅ Created TTL index (7 days)');
    }
  } catch (error) {
    console.log('   ❌ Error:', (error as Error).message);
  }

  // Check users collection for expiresAt TTL
  console.log('📦 Checking users collection...');
  try {
    const usersCollection = db.collection('users');
    const indexes = await usersCollection.indexes();
    const expiresAtIndex = indexes.find((idx: any) => 
      idx.key && idx.key.expiresAt !== undefined
    );
    
    if (expiresAtIndex?.expireAfterSeconds === 0) {
      console.log('   ✅ Already has expiresAt TTL index');
    } else {
      // Drop and recreate if it exists without TTL
      try {
        await usersCollection.dropIndex('expiresAt_1');
      } catch (e) {
        // Index might not exist
      }
      await usersCollection.createIndex(
        { expiresAt: 1 },
        { expireAfterSeconds: 0, background: true }
      );
      console.log('   ✅ Created expiresAt TTL index');
    }
  } catch (error) {
    console.log('   ❌ Error:', (error as Error).message);
  }

  // Final verification
  console.log('\n📊 Final Index Summary:\n');
  
  const collectionsToCheck = ['users', 'generations', 'galleryitems', 'ipfreeimages', 'payments'];
  for (const colName of collectionsToCheck) {
    try {
      const indexes = await db.collection(colName).indexes();
      const ttlIndexes = indexes.filter((idx: any) => idx.expireAfterSeconds !== undefined);
      
      console.log(`  ${colName}:`);
      console.log(`    Total indexes: ${indexes.length}`);
      
      if (ttlIndexes.length > 0) {
        for (const idx of ttlIndexes) {
          const days = idx.expireAfterSeconds === 0 
            ? 'on expiresAt date' 
            : `${Math.round(idx.expireAfterSeconds / (24 * 60 * 60))} days`;
          console.log(`    TTL: ${JSON.stringify(idx.key)} - expires ${days}`);
        }
      }
    } catch (e) {
      // Skip
    }
  }

  console.log('\n✅ Index fixes complete!\n');

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (err: unknown) => {
  console.error('❌ Error:', err);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});
