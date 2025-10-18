// Simple script to add credits to a wallet
import { MongoClient } from 'mongodb';

async function addCredits() {
  const client = new MongoClient('mongodb://localhost:27017');
  
  try {
    await client.connect();
    console.log('Connected to MongoDB');
    
    const db = client.db('ai-image-generator');
    const users = db.collection('users');
    
    const walletAddress = '0x686B86Cd9F8792985904da924c9A21a65Fca2176';
    const creditsToAdd = 200;
    
    // Find or create user
    const user = await users.findOne({ walletAddress: walletAddress.toLowerCase() });
    
    if (user) {
      // Update existing user
      const result = await users.updateOne(
        { walletAddress: walletAddress.toLowerCase() },
        { 
          $inc: { 
            credits: creditsToAdd,
            totalCreditsEarned: creditsToAdd
          },
          $set: { 
            lastUpdated: new Date()
          }
        }
      );
      
      if (result.modifiedCount > 0) {
        console.log(`✅ Successfully added ${creditsToAdd} credits to ${walletAddress}`);
        
        // Get updated user to show new balance
        const updatedUser = await users.findOne({ walletAddress: walletAddress.toLowerCase() });
        console.log(`📊 New balance: ${updatedUser.credits} credits`);
      } else {
        console.log('❌ Failed to update user');
      }
    } else {
      // Create new user
      const newUser = {
        walletAddress: walletAddress.toLowerCase(),
        credits: creditsToAdd,
        totalCreditsEarned: creditsToAdd,
        nftCollections: [],
        paymentHistory: [],
        createdAt: new Date(),
        lastUpdated: new Date()
      };
      
      const result = await users.insertOne(newUser);
      
      if (result.insertedId) {
        console.log(`✅ Created new user and added ${creditsToAdd} credits to ${walletAddress}`);
        console.log(`📊 New balance: ${creditsToAdd} credits`);
      } else {
        console.log('❌ Failed to create user');
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
    console.log('Disconnected from MongoDB');
  }
}

addCredits();
