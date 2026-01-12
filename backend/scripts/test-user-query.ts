import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '..', 'backend.env') });

const MONGODB_URI = process.env.MONGODB_URI!;

async function main() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');
  
  // Direct query - no model hooks, no selects
  const db = mongoose.connection.db;
  const user = await db.collection('users').findOne({ 
    userId: 'user_test_123' 
  });
  
  console.log('\n=== RAW DB QUERY RESULT ===');
  console.log('userId:', user?.userId);
  console.log('credits:', user?.credits);
  console.log('totalCreditsEarned:', user?.totalCreditsEarned);
  console.log('email (encrypted):', user?.email?.substring(0, 20) + '...');
  
  await mongoose.disconnect();
}

main().catch(console.error);
