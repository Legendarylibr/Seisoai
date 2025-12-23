import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

// Security: Determine host binding based on environment
// - Production/Cloud (Railway, etc.): Use 0.0.0.0 (required for cloud platforms)
// - Development: Use 127.0.0.1 for better security (only localhost access)
// - Can be overridden with HOST environment variable
const isCloudEnvironment = !!(
  process.env.RAILWAY_ENVIRONMENT ||
  process.env.VERCEL ||
  process.env.HEROKU ||
  process.env.RENDER ||
  process.env.FLY_APP_NAME ||
  process.env.PORT // If PORT is set, likely in cloud environment
);

const bindHost = process.env.HOST || (
  isCloudEnvironment || process.env.NODE_ENV === 'production'
    ? '0.0.0.0'  // Required for cloud platforms
    : '127.0.0.1'  // Safer for local development
);

console.log('Environment variables:');
console.log('PORT:', process.env.PORT);
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('HOST:', bindHost);
console.log('Network Access:', bindHost === '0.0.0.0' ? 'all interfaces' : 'localhost only');

// Serve static files from the dist directory with long cache for assets
app.use(
  express.static(path.join(__dirname, 'dist'), {
    maxAge: '1y',
    immutable: true,
    etag: true,
    setHeaders: (res, filePath) => {
      // Prevent caching HTML documents
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('Surrogate-Control', 'no-store');
      }
    }
  })
);

// Add health check endpoints
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    port: PORT 
  });
});

// API health check endpoint for Railway
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    port: PORT,
    service: 'Seiso AI Frontend'
  });
});

// Root health check for Railway - must be before catch-all
app.get('/', (req, res) => {
  // Check if this is a health check request (no Accept header or JSON expected)
  if (req.headers.accept && req.headers.accept.includes('application/json')) {
    res.json({
      status: 'healthy',
      service: 'Seiso AI Frontend',
      timestamp: new Date().toISOString(),
      port: PORT
    });
  } else {
    // Serve the frontend for browser requests
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  }
});

// Handle client-side routing - return index.html for all other routes
app.use((req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, bindHost, () => {
  console.log(`Frontend server running on ${bindHost}:${PORT}`);
  console.log(`Serving static files from: ${path.join(__dirname, 'dist')}`);
  const accessUrl = bindHost === '0.0.0.0' ? `http://localhost:${PORT}` : `http://${bindHost}:${PORT}`;
  console.log(`Health check available at: ${accessUrl}/health`);
  console.log(`Network access: ${bindHost === '0.0.0.0' ? 'all interfaces (cloud mode)' : 'localhost only (local mode)'}`);
});