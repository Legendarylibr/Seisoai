/**
 * Migration Script: Move embedded arrays to separate collections
 * 
 * This migrates:
 * - user.generationHistory → Generation collection
 * - user.gallery → GalleryItem collection  
 * - user.paymentHistory → Payment collection
 *
 * Run with: tsx scripts/migrate-to-collections.ts
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import crypto from 'crypto';
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
import Payment from '../models/Payment.js';

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not set');
  process.exit(1);
}

async function migrate(): Promise<void> {
  console.log('🚀 Starting migration...\n');

  try {
    await mongoose.connect(MONGODB_URI!);
    console.log('✅ Connected to MongoDB\n');

    // Get all users with embedded data
    const users = await User.find({
      $or: [
        { generationHistory: { $exists: true, $ne: [] } },
        { gallery: { $exists: true, $ne: [] } },
        { paymentHistory: { $exists: true, $ne: [] } }
      ]
    }).select('userId email walletAddress generationHistory gallery paymentHistory');

    console.log(`📊 Found ${users.length} users with embedded data to migrate\n`);

    let totalGenerations = 0;
    let totalGalleryItems = 0;
    let totalPayments = 0;
    let usersProcessed = 0;

    for (const user of users) {
      const userId = user.userId;
      if (!userId) {
        console.log(`⚠️  Skipping user without userId: ${user.email || user.walletAddress}`);
        continue;
      }

      console.log(`\n📦 Processing user: ${userId}`);

      // Migrate generationHistory
      if ((user as any).generationHistory && (user as any).generationHistory.length > 0) {
        const generations = (user as any).generationHistory.map((gen: { id?: string; prompt?: string; style?: string; imageUrl?: string; videoUrl?: string; requestId?: string; status?: string; creditsUsed?: number; timestamp?: Date }, idx: number) => ({
          userId,
          generationId: gen.id || `gen_${userId}_${idx}_${crypto.randomBytes(4).toString('hex')}`,
          prompt: gen.prompt || '',
          style: gen.style,
          imageUrl: gen.imageUrl,
          videoUrl: gen.videoUrl,
          requestId: gen.requestId,
          status: gen.status || 'completed',
          creditsUsed: gen.creditsUsed || 0,
          createdAt: gen.timestamp || new Date()
        }));

        // Use bulkWrite with upsert to avoid duplicates
        const genOps = generations.map((gen: { generationId: string; userId: string; prompt: string; style?: string; imageUrl?: string; videoUrl?: string; requestId?: string; status: string; creditsUsed: number; createdAt: Date }) => ({
          updateOne: {
            filter: { generationId: gen.generationId },
            update: { $setOnInsert: gen },
            upsert: true
          }
        }));

        if (genOps.length > 0) {
          const result = await Generation.bulkWrite(genOps, { ordered: false });
          console.log(`   ✅ Migrated ${result.upsertedCount} generations (${generations.length} total, ${generations.length - result.upsertedCount} already existed)`);
          totalGenerations += result.upsertedCount;
        }
      }

      // Migrate gallery
      if ((user as any).gallery && (user as any).gallery.length > 0) {
        const galleryItems = (user as any).gallery.map((item: { id?: string; imageUrl?: string; videoUrl?: string; prompt?: string; style?: string; creditsUsed?: number; timestamp?: Date }, idx: number) => ({
          userId,
          itemId: item.id || `gallery_${userId}_${idx}_${crypto.randomBytes(4).toString('hex')}`,
          imageUrl: item.imageUrl || '',
          videoUrl: item.videoUrl,
          prompt: item.prompt,
          style: item.style,
          creditsUsed: item.creditsUsed || 0,
          createdAt: item.timestamp || new Date()
        }));

        const galleryOps = galleryItems.map((item: { itemId: string; userId: string; imageUrl: string; videoUrl?: string; prompt?: string; style?: string; creditsUsed: number; createdAt: Date }) => ({
          updateOne: {
            filter: { itemId: item.itemId },
            update: { $setOnInsert: item },
            upsert: true
          }
        }));

        if (galleryOps.length > 0) {
          const result = await GalleryItem.bulkWrite(galleryOps, { ordered: false });
          console.log(`   ✅ Migrated ${result.upsertedCount} gallery items (${galleryItems.length} total, ${galleryItems.length - result.upsertedCount} already existed)`);
          totalGalleryItems += result.upsertedCount;
        }
      }

      // Migrate paymentHistory
      if ((user as any).paymentHistory && (user as any).paymentHistory.length > 0) {
        const payments = (user as any).paymentHistory.map((payment: { txHash?: string; tokenSymbol?: string; amount?: number; credits?: number; chainId?: number; walletType?: string; timestamp?: Date }, idx: number) => ({
          userId,
          paymentId: payment.txHash || `payment_${userId}_${idx}_${crypto.randomBytes(4).toString('hex')}`,
          txHash: payment.txHash,
          type: 'crypto',
          tokenSymbol: payment.tokenSymbol,
          amount: payment.amount,
          credits: payment.credits || 0,
          chainId: payment.chainId,
          walletType: payment.walletType,
          createdAt: payment.timestamp || new Date()
        }));

        const paymentOps = payments.map((payment: { paymentId: string; userId: string; txHash?: string; type: string; tokenSymbol?: string; amount?: number; credits: number; chainId?: number; walletType?: string; createdAt: Date }) => ({
          updateOne: {
            filter: { paymentId: payment.paymentId },
            update: { $setOnInsert: payment },
            upsert: true
          }
        }));

        if (paymentOps.length > 0) {
          const result = await Payment.bulkWrite(paymentOps, { ordered: false });
          console.log(`   ✅ Migrated ${result.upsertedCount} payments (${payments.length} total, ${payments.length - result.upsertedCount} already existed)`);
          totalPayments += result.upsertedCount;
        }
      }

      usersProcessed++;
    }

    console.log('\n' + '='.repeat(50));
    console.log('📊 MIGRATION SUMMARY');
    console.log('='.repeat(50));
    console.log(`   Users processed: ${usersProcessed}`);
    console.log(`   Generations migrated: ${totalGenerations}`);
    console.log(`   Gallery items migrated: ${totalGalleryItems}`);
    console.log(`   Payments migrated: ${totalPayments}`);
    console.log('='.repeat(50));

    // Ask before clearing embedded arrays
    console.log('\n⚠️  Migration complete. Embedded arrays are still in user documents.');
    console.log('   Run with --clear-embedded flag to remove them after verifying migration.');

    if (process.argv.includes('--clear-embedded')) {
      console.log('\n🧹 Clearing embedded arrays from user documents...');
      
      const clearResult = await User.updateMany(
        {},
        { 
          $set: { 
            generationHistory: [],
            gallery: [],
            paymentHistory: []
          }
        }
      );
      
      console.log(`   ✅ Cleared embedded arrays from ${clearResult.modifiedCount} users`);
    }

    console.log('\n✅ Migration complete!');

  } catch (error: any) {
    console.error('❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

migrate();





