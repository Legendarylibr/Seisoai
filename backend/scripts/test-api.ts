import dotenv from 'dotenv';
import path from 'path';
import jwt from 'jsonwebtoken';

dotenv.config({ path: path.join(process.cwd(), '..', '..', 'backend.env') });

const token = jwt.sign(
  { userId: 'user_test_123', email: 'test@example.com', type: 'access' },
  process.env.JWT_SECRET!,
  { expiresIn: '1h' }
);

console.log('Test this URL in your browser console:');
console.log('');
console.log(`fetch('/api/auth/credits', { headers: { 'Authorization': 'Bearer ${token}' }}).then(r => r.json()).then(console.log)`);
console.log('');
console.log('Or run this in terminal:');
console.log(`curl -H "Authorization: Bearer ${token}" https://YOUR_RAILWAY_URL/api/auth/credits`);
