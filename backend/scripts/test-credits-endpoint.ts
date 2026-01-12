import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '..', 'backend.env') });

const JWT_SECRET = process.env.JWT_SECRET!;

// Create a test token for the user
const testToken = jwt.sign(
  { userId: 'user_test_123', email: 'test@example.com', type: 'access' },
  JWT_SECRET,
  { expiresIn: '1h' }
);

console.log('=== TEST JWT TOKEN ===');
console.log(testToken);
console.log('\n=== DECODED ===');
console.log(jwt.decode(testToken));

console.log('\n=== Test with curl (run this in terminal) ===');
console.log(`curl -H "Authorization: Bearer ${testToken}" https://api.seiso.ai/api/auth/credits`);
console.log('\nOr for localhost:');
console.log(`curl -H "Authorization: Bearer ${testToken}" http://localhost:3001/api/auth/credits`);
