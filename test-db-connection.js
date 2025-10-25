import mongoose from 'mongoose';

async function testConnection() {
  try {
    console.log('🔍 Testing MongoDB connection...');
    
    // Connect to MongoDB
    const MONGODB_URI = 'mongodb://localhost:27017/ai-image-generator';
    await mongoose.connect(MONGODB_URI);
    
    console.log('✅ MongoDB connected successfully!');
    
    // Test a simple query
    const User = mongoose.model('User', new mongoose.Schema({
      walletAddress: String,
      credits: Number
    }));
    
    const user = await User.findOne({ walletAddress: '0x686B86Cd9F8792985904da924c9A21a65Fca2176' });
    
    if (user) {
      console.log('✅ User found:', {
        walletAddress: user.walletAddress,
        credits: user.credits
      });
    } else {
      console.log('❌ User not found');
    }
    
    await mongoose.disconnect();
    console.log('✅ Database connection closed');
    
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
  }
}

testConnection();
