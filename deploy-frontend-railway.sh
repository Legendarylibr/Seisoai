#!/bin/bash

# Deploy Frontend to Railway
echo "🚀 Deploying Seiso AI Frontend to Railway..."

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Not in the project root directory"
    exit 1
fi

# Build the frontend
echo "📦 Building frontend..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed"
    exit 1
fi

echo "✅ Build successful"

# Check if Railway CLI is available
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI not found. Installing..."
    npm install -g @railway/cli
fi

# Login to Railway
echo "🔐 Logging into Railway..."
railway login

# Create a new service for the frontend
echo "🚀 Creating frontend service..."
railway add

# Set environment variables for frontend
echo "⚙️ Setting frontend environment variables..."
railway variables set NODE_ENV=production
railway variables set VITE_API_URL=https://seisoai-prod.up.railway.app

# Deploy
echo "🚀 Deploying to Railway..."
railway up

# Get the frontend URL
echo "✅ Frontend deployment complete!"
echo "🔗 Your frontend URL:"
railway domain

echo ""
echo "🎉 Frontend deployed successfully!"
echo "📋 Next steps:"
echo "1. Test your frontend at the URL above"
echo "2. Make sure to set VITE_FAL_API_KEY in Railway dashboard"
echo "3. Test wallet connection and payment flows"
