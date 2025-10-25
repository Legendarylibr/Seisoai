import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

console.log('🚀 Starting Full-Stack Seiso AI Server...');
console.log('Environment variables:');
console.log('PORT:', process.env.PORT);
console.log('NODE_ENV:', process.env.NODE_ENV);

// Basic CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoints
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    port: PORT,
    service: 'Seiso AI Full-Stack'
  });
});

app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    port: PORT,
    service: 'Seiso AI Full-Stack',
    database: 'Not connected (frontend-only mode)'
  });
});

// Root health check for Railway
app.get('/', (req, res) => {
  if (req.headers.accept && req.headers.accept.includes('application/json')) {
    res.json({
      status: 'healthy',
      service: 'Seiso AI Full-Stack',
      timestamp: new Date().toISOString(),
      port: PORT
    });
  } else {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  }
});

// Serve static files from the dist directory
app.use(express.static(path.join(__dirname, 'dist')));

// Mock API endpoints for basic functionality
app.get('/api/users/:walletAddress', (req, res) => {
  const { walletAddress } = req.params;
  res.json({
    success: true,
    user: {
      walletAddress: walletAddress.toLowerCase(),
      credits: 0,
      totalCreditsEarned: 0,
      totalCreditsSpent: 0,
      nftCollections: [],
      paymentHistory: [],
      generationHistory: [],
      gallery: [],
      settings: {
        preferredStyle: null,
        defaultImageSize: '1024x1024',
        enableNotifications: true
      },
      lastActive: new Date()
    }
  });
});

app.post('/api/nft/check-credits', (req, res) => {
  res.json({
    success: true,
    totalCredits: 0,
    totalCreditsEarned: 0,
    totalCreditsSpent: 0
  });
});

app.post('/api/nft/check-holdings', (req, res) => {
  res.json({
    success: true,
    isHolder: false,
    collections: [],
    message: 'No qualifying NFTs found. Purchase credits to generate images.'
  });
});

app.post('/api/payment/get-address', (req, res) => {
  res.json({
    success: true,
    paymentAddress: '0xa0aE05e2766A069923B2a51011F270aCadFf023a',
    solanaPaymentAddress: 'CkhFmeUNxdr86SZEPg6bLgagFkRyaDMTmFzSVL69oadA',
    supportedTokens: ['USDC', 'USDT'],
    networks: ['Ethereum', 'Polygon', 'Arbitrum', 'Optimism', 'Base', 'Solana']
  });
});

app.post('/api/payment/check-payment', (req, res) => {
  res.json({
    success: true,
    paymentDetected: false,
    message: 'Payment not detected yet. Please wait for blockchain confirmation.'
  });
});

app.post('/api/payments/verify', (req, res) => {
  res.json({
    success: false,
    error: 'Database not connected - running in frontend-only mode'
  });
});

app.post('/api/generations/add', (req, res) => {
  res.json({
    success: false,
    error: 'Database not connected - running in frontend-only mode'
  });
});

app.get('/api/gallery/:walletAddress', (req, res) => {
  res.json({
    success: true,
    gallery: [],
    total: 0,
    page: 1,
    limit: 20
  });
});

// Handle client-side routing - return index.html for all other routes
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Full-Stack server running on port ${PORT}`);
  console.log(`🌐 Frontend: http://localhost:${PORT}`);
  console.log(`🔗 API: http://localhost:${PORT}/api/health`);
  console.log(`⚠️  Database: Not connected (mock mode)`);
});
