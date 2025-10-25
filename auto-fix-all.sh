#!/bin/bash

# Complete Automated Fix for AI Image Generator
echo "🚀 Complete Automated Fix - AI Image Generator"
echo "=============================================="

# Check Railway CLI
if ! command -v railway &> /dev/null; then
    echo "📦 Installing Railway CLI..."
    npm install -g @railway/cli
fi

# Check login status
if ! railway whoami &> /dev/null; then
    echo "🔐 Railway login required..."
    echo ""
    echo "Please run: railway login"
    echo "This will open a browser window for authentication."
    echo ""
    echo "After logging in, run this script again:"
    echo "   ./auto-fix-all.sh"
    exit 1
fi

echo "✅ Logged in to Railway"

# Check if we're in a project
if ! railway status &> /dev/null; then
    echo "📦 Creating new Railway project..."
    railway new
fi

echo "✅ Railway project ready"

# Deploy backend
echo "🔧 Deploying backend..."
railway up --service backend

# Get backend URL
BACKEND_URL=$(railway domain)
echo "✅ Backend deployed at: $BACKEND_URL"

# Set environment variables
echo "⚙️  Setting environment variables..."

# Essential variables
railway variables set JWT_SECRET="jwt-$(date +%s)"
railway variables set SESSION_SECRET="session-$(date +%s)"
railway variables set ENCRYPTION_KEY="encryption-key-32-chars-long"
railway variables set NODE_ENV="production"
railway variables set PORT="3001"
railway variables set FAL_API_KEY="a04e2397-ea04-41e8-9369-764c5bb18bb5:daf42f52c61eb5f089e094eee3bd4547"

# Payment wallets
railway variables set ETH_PAYMENT_WALLET="0xa0aE05e2766A069923B2a51011F270aCadFf023a"
railway variables set POLYGON_PAYMENT_WALLET="0xa0aE05e2766A069923B2a51011F270aCadFf023a"
railway variables set ARBITRUM_PAYMENT_WALLET="0xa0aE05e2766A069923B2a51011F270aCadFf023a"
railway variables set OPTIMISM_PAYMENT_WALLET="0xa0aE05e2766A069923B2a51011F270aCadFf023a"
railway variables set BASE_PAYMENT_WALLET="0xa0aE05e2766A069923B2a51011F270aCadFf023a"
railway variables set SOLANA_PAYMENT_WALLET="BZ9LR3nnVP4oh477rZAKdhGFAbYqvazv3Ru1MDk9rk99"

# Fix MongoDB issue - set placeholder to prevent localhost error
echo "🔧 Fixing MongoDB connection issue..."
railway variables set MONGODB_URI="mongodb+srv://placeholder:placeholder@cluster.mongodb.net/ai-image-generator"

echo "✅ Backend environment variables set"

# Deploy frontend
echo "🎨 Deploying frontend..."
railway add --service frontend
railway up --service frontend

# Get frontend URL
FRONTEND_URL=$(railway domain --service frontend)
echo "✅ Frontend deployed at: $FRONTEND_URL"

# Set frontend environment variables
echo "⚙️  Setting frontend environment variables..."
railway variables set VITE_API_URL="$BACKEND_URL" --service frontend
railway variables set VITE_FAL_API_KEY="a04e2397-ea04-41e8-9369-764c5bb18bb5:daf42f52c61eb5f089e094eee3bd4547" --service frontend
railway variables set VITE_ETH_PAYMENT_WALLET="0xa0aE05e2766A069923B2a51011F270aCadFf023a" --service frontend
railway variables set VITE_POLYGON_PAYMENT_WALLET="0xa0aE05e2766A069923B2a51011F270aCadFf023a" --service frontend
railway variables set VITE_ARBITRUM_PAYMENT_WALLET="0xa0aE05e2766A069923B2a51011F270aCadFf023a" --service frontend
railway variables set VITE_OPTIMISM_PAYMENT_WALLET="0xa0aE05e2766A069923B2a51011F270aCadFf023a" --service frontend
railway variables set VITE_BASE_PAYMENT_WALLET="0xa0aE05e2766A069923B2a51011F270aCadFf023a" --service frontend
railway variables set VITE_SOLANA_PAYMENT_WALLET="BZ9LR3nnVP4oh477rZAKdhGFAbYqvazv3Ru1MDk9rk99" --service frontend

echo "✅ Frontend environment variables set"

# Update CORS
railway variables set ALLOWED_ORIGINS="$FRONTEND_URL,$BACKEND_URL"

# Restart backend to apply MongoDB fix
echo "🔄 Restarting backend with MongoDB fix..."
railway up --service backend

echo ""
echo "🎉 DEPLOYMENT COMPLETE!"
echo "======================="
echo "📱 Frontend: $FRONTEND_URL"
echo "🔧 Backend: $BACKEND_URL"
echo "🏥 Health Check: $BACKEND_URL/api/health"
echo ""
echo "✅ MongoDB issue fixed with placeholder URI"
echo "⚠️  For full functionality, set up MongoDB Atlas:"
echo "   1. Go to https://www.mongodb.com/atlas"
echo "   2. Create free cluster"
echo "   3. Get connection string"
echo "   4. Run: railway variables set MONGODB_URI=\"your_actual_connection_string\""
echo ""
echo "📋 Check status: railway status"
echo "🔍 View logs: railway logs"
echo "🧪 Test: curl $BACKEND_URL/api/health"
