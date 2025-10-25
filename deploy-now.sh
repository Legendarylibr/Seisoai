#!/bin/bash

# One-Command Railway Deployment
echo "🚀 AI Image Generator - Railway Deployment"
echo "=========================================="

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "📦 Installing Railway CLI..."
    npm install -g @railway/cli
fi

# Check if logged in
if ! railway whoami &> /dev/null; then
    echo "🔐 Railway login required..."
    echo ""
    echo "Please run: railway login"
    echo "Then run this script again: ./deploy-now.sh"
    echo ""
    echo "Or run the manual deployment:"
    echo "1. railway new"
    echo "2. railway up --service backend"
    echo "3. railway add --service frontend"
    echo "4. railway up --service frontend"
    exit 1
fi

echo "✅ Logged in to Railway"

# Create project
if ! railway status &> /dev/null; then
    echo "📦 Creating Railway project..."
    railway new
fi

# Deploy backend
echo "🔧 Deploying backend..."
railway up --service backend

# Get URLs
BACKEND_URL=$(railway domain)
echo "Backend: $BACKEND_URL"

# Set essential backend variables
echo "⚙️  Setting backend variables..."
railway variables set JWT_SECRET="jwt-$(date +%s)"
railway variables set SESSION_SECRET="session-$(date +%s)"
railway variables set ENCRYPTION_KEY="encryption-key-32-chars-long"
railway variables set NODE_ENV="production"
railway variables set PORT="3001"
railway variables set FAL_API_KEY="a04e2397-ea04-41e8-9369-764c5bb18bb5:daf42f52c61eb5f089e094eee3bd4547"
railway variables set ETH_PAYMENT_WALLET="0xa0aE05e2766A069923B2a51011F270aCadFf023a"
railway variables set POLYGON_PAYMENT_WALLET="0xa0aE05e2766A069923B2a51011F270aCadFf023a"
railway variables set ARBITRUM_PAYMENT_WALLET="0xa0aE05e2766A069923B2a51011F270aCadFf023a"
railway variables set OPTIMISM_PAYMENT_WALLET="0xa0aE05e2766A069923B2a51011F270aCadFf023a"
railway variables set BASE_PAYMENT_WALLET="0xa0aE05e2766A069923B2a51011F270aCadFf023a"
railway variables set SOLANA_PAYMENT_WALLET="BZ9LR3nnVP4oh477rZAKdhGFAbYqvazv3Ru1MDk9rk99"

# Deploy frontend
echo "🎨 Deploying frontend..."
railway add --service frontend
railway up --service frontend

# Get frontend URL
FRONTEND_URL=$(railway domain --service frontend)
echo "Frontend: $FRONTEND_URL"

# Set frontend variables
echo "⚙️  Setting frontend variables..."
railway variables set VITE_API_URL="$BACKEND_URL" --service frontend
railway variables set VITE_FAL_API_KEY="a04e2397-ea04-41e8-9369-764c5bb18bb5:daf42f52c61eb5f089e094eee3bd4547" --service frontend
railway variables set VITE_ETH_PAYMENT_WALLET="0xa0aE05e2766A069923B2a51011F270aCadFf023a" --service frontend
railway variables set VITE_POLYGON_PAYMENT_WALLET="0xa0aE05e2766A069923B2a51011F270aCadFf023a" --service frontend
railway variables set VITE_ARBITRUM_PAYMENT_WALLET="0xa0aE05e2766A069923B2a51011F270aCadFf023a" --service frontend
railway variables set VITE_OPTIMISM_PAYMENT_WALLET="0xa0aE05e2766A069923B2a51011F270aCadFf023a" --service frontend
railway variables set VITE_BASE_PAYMENT_WALLET="0xa0aE05e2766A069923B2a51011F270aCadFf023a" --service frontend
railway variables set VITE_SOLANA_PAYMENT_WALLET="BZ9LR3nnVP4oh477rZAKdhGFAbYqvazv3Ru1MDk9rk99" --service frontend

# Update CORS
railway variables set ALLOWED_ORIGINS="$FRONTEND_URL,$BACKEND_URL"

echo ""
echo "🎉 DEPLOYMENT COMPLETE!"
echo "======================="
echo "📱 Frontend: $FRONTEND_URL"
echo "🔧 Backend: $BACKEND_URL"
echo "🏥 Health: $BACKEND_URL/api/health"
echo ""
echo "🚨 CRITICAL: Set MongoDB connection:"
echo "railway variables set MONGODB_URI=\"mongodb+srv://user:pass@cluster.mongodb.net/db\""
echo ""
echo "📋 Status: railway status"
echo "🔍 Logs: railway logs"
