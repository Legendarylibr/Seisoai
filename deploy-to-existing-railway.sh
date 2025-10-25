#!/bin/bash

# Deploy Frontend to Existing Railway Project
echo "🚀 Deploying frontend to existing Railway project..."

# Build the frontend
echo "📦 Building frontend..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed"
    exit 1
fi

echo "✅ Build successful"

# Create a simple static server for Railway
cat > serve-frontend.js << 'EOF'
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from the dist directory
app.use(express.static(path.join(__dirname, 'dist')));

// Handle client-side routing - return index.html for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Frontend server running on port ${PORT}`);
  console.log(`Serving static files from: ${path.join(__dirname, 'dist')}`);
});
EOF

echo "✅ Frontend server created"

# Update package.json to use the frontend server
echo "📝 Updating package.json..."
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.scripts['start:frontend'] = 'node serve-frontend.js';
pkg.scripts['build:frontend'] = 'npm run build && npm run start:frontend';
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
console.log('✅ Package.json updated');
"

echo ""
echo "🎯 Next steps:"
echo "1. Go to https://railway.com/project/ee55e7fa-b010-4946-a87b-013e15e329a8"
echo "2. Add a new service for the frontend"
echo "3. Set the start command to: npm run build:frontend"
echo "4. Set environment variables:"
echo "   - NODE_ENV=production"
echo "   - VITE_API_URL=https://seisoai-prod.up.railway.app"
echo "5. Deploy the service"
echo ""
echo "📁 Files ready for deployment:"
echo "   - dist/ (built frontend files)"
echo "   - serve-frontend.js (static server)"
echo "   - package.json (updated with frontend scripts)"