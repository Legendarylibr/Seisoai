#!/usr/bin/env node
/*
  Script to find and fix all past subscription purchases that didn't get credits
  This checks all Stripe subscriptions and ensures credits were added
  
  Usage: node fix-past-subscription-credits.js [--dry-run]
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

// Check for required env vars
if (!process.env.STRIPE_SECRET_KEY) {
  console.error('❌ STRIPE_SECRET_KEY not found');
  process.exit(1);
}

if (!process.env.MONGODB_URI) {
  console.error('❌ MONGODB_URI not found');
  process.exit(1);
}

// Import Stripe
const Stripe = (await import('stripe')).default;
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Connect to MongoDB
await mongoose.connect(process.env.MONGODB_URI);
const User = mongoose.models.User || mongoose.model('User', new mongoose.Schema({}, { strict: false }));

const isDryRun = process.argv.includes('--dry-run');

async function fixPastSubscriptions() {
  try {
    console.log('🔍 Finding all active subscriptions...\n');
    
    // Get all subscriptions
    const subscriptions = await stripe.subscriptions.list({
      limit: 100,
      status: 'all' // Get all subscriptions (active, past_due, canceled, etc.)
    });
    
    console.log(`Found ${subscriptions.data.length} subscriptions\n`);
    
    let fixedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    
    for (const subscription of subscriptions.data) {
      try {
        // Get subscription details
        const sub = await stripe.subscriptions.retrieve(subscription.id);
        const amount = sub.items.data[0]?.price?.unit_amount || 0;
        const amountInDollars = amount / 100;
        
        // Find user
        let user = null;
        if (sub.metadata?.userId) {
          user = await User.findById(sub.metadata.userId);
        } else if (sub.metadata?.email) {
          user = await User.findOne({ email: sub.metadata.email.toLowerCase() });
        } else if (sub.customer) {
          try {
            const customer = await stripe.customers.retrieve(sub.customer);
            if (customer.email) {
              user = await User.findOne({ email: customer.email.toLowerCase() });
            }
          } catch (e) {
            // Skip if can't get customer
          }
        }
        
        if (!user) {
          console.log(`⚠️  Subscription ${sub.id}: User not found`);
          skippedCount++;
          continue;
        }
        
        // Check all invoices for this subscription
        const invoices = await stripe.invoices.list({
          subscription: sub.id,
          limit: 100
        });
        
        console.log(`\n📦 Subscription ${sub.id}:`);
        console.log(`   User: ${user.email || user.userId || 'Unknown'}`);
        console.log(`   Amount: $${amountInDollars}/month`);
        console.log(`   Status: ${sub.status}`);
        console.log(`   Invoices: ${invoices.data.length}`);
        
        // Calculate credit multipliers (same for all invoices of this subscription)
        const baseRate = 5; // 5 credits per dollar
        let scalingMultiplier = 1.0;
        if (amountInDollars >= 80) {
          scalingMultiplier = 1.3;
        } else if (amountInDollars >= 40) {
          scalingMultiplier = 1.2;
        } else if (amountInDollars >= 20) {
          scalingMultiplier = 1.1;
        }
        
        const isNFTHolder = user.walletAddress && user.nftCollections?.length > 0;
        const nftMultiplier = isNFTHolder ? 1.2 : 1;
        
        // Check each invoice
        for (const invoice of invoices.data) {
          if (invoice.status !== 'paid' || invoice.amount_paid === 0) {
            continue;
          }
          
          const paymentId = `invoice_${invoice.id}`;
          const isProcessed = user.paymentHistory?.some(p => 
            p.paymentIntentId === paymentId || p.txHash === paymentId
          );
          
          if (isProcessed) {
            console.log(`   ✓ Invoice ${invoice.id}: Already processed`);
            continue;
          }
          
          // Calculate credits for this invoice
          const finalCredits = Math.floor(amountInDollars * baseRate * scalingMultiplier * nftMultiplier);
          
          if (isDryRun) {
            console.log(`   [DRY RUN] Would add ${finalCredits} credits for invoice ${invoice.id}`);
          } else {
            // Add credits
            user.credits += finalCredits;
            user.totalCreditsEarned += finalCredits;
            
            user.paymentHistory = user.paymentHistory || [];
            user.paymentHistory.push({
              txHash: paymentId,
              paymentIntentId: paymentId,
              subscriptionId: sub.id,
              tokenSymbol: 'USD',
              amount: amountInDollars,
              credits: finalCredits,
              chainId: 'stripe',
              walletType: 'card',
              timestamp: new Date(invoice.created * 1000)
            });
            
            try {
              // Use findOneAndUpdate to ensure it saves
              const updatedUser = await User.findOneAndUpdate(
                { _id: user._id },
                {
                  $inc: { 
                    credits: finalCredits,
                    totalCreditsEarned: finalCredits
                  },
                  $push: {
                    paymentHistory: {
                      txHash: paymentId,
                      paymentIntentId: paymentId,
                      subscriptionId: sub.id,
                      tokenSymbol: 'USD',
                      amount: amountInDollars,
                      credits: finalCredits,
                      chainId: 'stripe',
                      walletType: 'card',
                      timestamp: new Date(invoice.created * 1000)
                    }
                  }
                },
                { new: true }
              );
              
              if (updatedUser) {
                console.log(`   ✅ Added ${finalCredits} credits for invoice ${invoice.id}`);
                console.log(`      New total credits: ${updatedUser.credits}`);
                fixedCount++;
                // Update user reference for next iteration
                user = updatedUser;
              } else {
                throw new Error('User not found after update');
              }
            } catch (saveError) {
              console.error(`   ❌ Error saving credits for invoice ${invoice.id}:`, saveError.message);
              errorCount++;
            }
          }
        }
        
        // Check if initial checkout was processed (look for checkout_ prefix in payment history)
        const hasCheckoutPayment = user.paymentHistory?.some(p => 
          p.subscriptionId === sub.id && (p.txHash?.includes('checkout') || p.paymentIntentId?.includes('checkout'))
        );
        
        // Only add initial checkout credits if:
        // 1. No checkout payment found in history
        // 2. First invoice exists and is paid
        // 3. First invoice hasn't been processed yet (to avoid double-counting)
        if (!hasCheckoutPayment && invoices.data.length > 0) {
          const firstInvoice = invoices.data[invoices.data.length - 1]; // Oldest invoice (last in list)
          const firstInvoicePaymentId = `invoice_${firstInvoice.id}`;
          const isFirstInvoiceProcessed = user.paymentHistory?.some(p => 
            p.paymentIntentId === firstInvoicePaymentId || p.txHash === firstInvoicePaymentId
          );
          
          // If first invoice is not processed, we'll process it in the invoice loop above
          // So we don't need to add checkout credits separately
          // But if subscription was just created and no invoices yet, add checkout credits
          if (firstInvoice.status === 'paid' && !isFirstInvoiceProcessed) {
            // First invoice will be handled in the loop above, skip checkout
            console.log(`   ℹ️  Initial checkout will be handled via first invoice`);
          } else if (invoices.data.length === 0 || firstInvoice.status !== 'paid') {
            // No invoices or first invoice not paid yet - add checkout credits
            const checkoutPaymentId = `checkout_sub_${sub.id}`;
            const isProcessed = user.paymentHistory?.some(p => 
              p.paymentIntentId === checkoutPaymentId || p.txHash === checkoutPaymentId
            );
            
            if (!isProcessed) {
              const checkoutCredits = Math.floor(amountInDollars * baseRate * scalingMultiplier * nftMultiplier);
              
              if (isDryRun) {
                console.log(`   [DRY RUN] Would add ${checkoutCredits} credits for initial checkout`);
              } else {
                user.credits += checkoutCredits;
                user.totalCreditsEarned += checkoutCredits;
                
                user.paymentHistory.push({
                  txHash: checkoutPaymentId,
                  paymentIntentId: checkoutPaymentId,
                  subscriptionId: sub.id,
                  tokenSymbol: 'USD',
                  amount: amountInDollars,
                  credits: checkoutCredits,
                  chainId: 'stripe',
                  walletType: 'card',
                  timestamp: new Date(sub.created * 1000)
                });
                
                await user.save();
                console.log(`   ✅ Added ${checkoutCredits} credits for initial checkout`);
                fixedCount++;
              }
            }
          }
        }
        
      } catch (error) {
        console.error(`❌ Error processing subscription ${subscription.id}:`, error.message);
        errorCount++;
      }
    }
    
    console.log('\n📊 Summary:');
    console.log(`   Fixed: ${fixedCount}`);
    console.log(`   Skipped: ${skippedCount}`);
    console.log(`   Errors: ${errorCount}`);
    
    if (isDryRun) {
      console.log('\n🔍 Dry run complete. Run without --dry-run to apply changes.');
    } else {
      console.log('\n✅ Done!');
    }
    
  } catch (error) {
    console.error('❌ Fatal error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

await fixPastSubscriptions();

