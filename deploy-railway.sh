#!/bin/bash

# Railway Deployment Script for AI Image Generator
echo "🚀 Railway Deployment Script"
echo "============================"

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI not found. Installing..."
    npm install -g @railway/cli
fi

# Check if user is logged in
if ! railway whoami &> /dev/null; then
    echo "🔐 Logging into Railway..."
    echo "This will open a browser window for authentication."
    echo ""
    read -p "Press Enter after you've completed the login process..."
    
    # Check again after user confirmation
    if ! railway whoami &> /dev/null; then
        echo "❌ Still not logged in. Please run 'railway login' manually and try again."
        exit 1
    fi
fi

echo "✅ Logged in to Railway"

# Check if we're in a Railway project
if ! railway status &> /dev/null; then
    echo "📦 Creating new Railway project..."
    railway new
fi

echo "✅ Railway project ready"

# Deploy backend
echo "🔧 Deploying backend service..."
railway up --service backend

# Get backend URL
echo "🔍 Getting backend URL..."
BACKEND_URL=$(railway domain)
echo "Backend URL: $BACKEND_URL"

# Set backend environment variables
echo "⚙️  Setting backend environment variables..."

# Check if MONGODB_URI is set
if ! railway variables get MONGODB_URI &> /dev/null; then
    echo "⚠️  MONGODB_URI not set. Please set it manually:"
    echo "   railway variables set MONGODB_URI=\"mongodb+srv://username:password@cluster.mongodb.net/ai-image-generator\""
    echo ""
    echo "Get your MongoDB connection string from: https://www.mongodb.com/atlas"
    echo ""
fi

# Set other backend variables
railway variables set JWT_SECRET="your-super-secret-jwt-key-here-$(date +%s)"
railway variables set SESSION_SECRET="your-session-secret-here-$(date +%s)"
railway variables set ENCRYPTION_KEY="your-32-character-encryption-key-here"
railway variables set ETH_PAYMENT_WALLET="0xa0aE05e2766A069923B2a51011F270aCadFf023a"
railway variables set POLYGON_PAYMENT_WALLET="0xa0aE05e2766A069923B2a51011F270aCadFf023a"
railway variables set ARBITRUM_PAYMENT_WALLET="0xa0aE05e2766A069923B2a51011F270aCadFf023a"
railway variables set OPTIMISM_PAYMENT_WALLET="0xa0aE05e2766A069923B2a51011F270aCadFf023a"
railway variables set BASE_PAYMENT_WALLET="0xa0aE05e2766A069923B2a51011F270aCadFf023a"
railway variables set SOLANA_PAYMENT_WALLET="BZ9LR3nnVP4oh477rZAKdhGFAbYqvazv3Ru1MDk9rk99"
railway variables set ETH_RPC_URL="https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY"
railway variables set POLYGON_RPC_URL="https://polygon-mainnet.g.alchemy.com/v2/YOUR_API_KEY"
railway variables set ARBITRUM_RPC_URL="https://arb-mainnet.g.alchemy.com/v2/YOUR_API_KEY"
railway variables set OPTIMISM_RPC_URL="https://opt-mainnet.g.alchemy.com/v2/YOUR_API_KEY"
railway variables set BASE_RPC_URL="https://base-mainnet.g.alchemy.com/v2/YOUR_API_KEY"
railway variables set FAL_API_KEY="a04e2397-ea04-41e8-9369-764c5bb18bb5:daf42f52c61eb5f089e094eee3bd4547"
railway variables set NODE_ENV="production"
railway variables set PORT="3001"

echo "✅ Backend environment variables set"

# Deploy frontend
echo "🎨 Deploying frontend service..."
railway add --service frontend
railway up --service frontend

# Get frontend URL
echo "🔍 Getting frontend URL..."
FRONTEND_URL=$(railway domain --service frontend)
echo "Frontend URL: $FRONTEND_URL"

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
railway variables set VITE_STRIPE_PUBLISHABLE_KEY="pk_test_your_stripe_publishable_key_here" --service frontend

echo "✅ Frontend environment variables set"

# Update CORS settings
echo "🔗 Updating CORS settings..."
railway variables set ALLOWED_ORIGINS="$FRONTEND_URL,$BACKEND_URL"

echo ""
echo "🎉 DEPLOYMENT COMPLETE!"
echo "======================="
echo "📱 Frontend: $FRONTEND_URL"
echo "🔧 Backend: $BACKEND_URL"
echo "🏥 Health Check: $BACKEND_URL/api/health"
echo ""
echo "🚨 IMPORTANT: You still need to:"
echo "1. Set up MongoDB Atlas and update MONGODB_URI"
echo "2. Get Alchemy API keys and update RPC URLs"
echo "3. Update Stripe keys if using card payments"
echo ""
echo "📋 Check deployment status:"
echo "   railway status"
echo ""
echo "🔍 View logs:"
echo "   railway logs --service backend"
echo "   railway logs --service frontend"
