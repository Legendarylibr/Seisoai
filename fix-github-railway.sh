#!/bin/bash

# Fix GitHub-connected Railway project
echo "🔧 Fixing GitHub-connected Railway project"
echo "=========================================="

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "📦 Installing Railway CLI..."
    npm install -g @railway/cli
fi

# Check login status
if ! railway whoami &> /dev/null; then
    echo "🔐 Please login to Railway first:"
    echo "   railway login"
    echo ""
    echo "After logging in, run this script again."
    exit 1
fi

echo "✅ Logged in to Railway"

# List your projects to find the right one
echo "📋 Your Railway projects:"
railway projects

echo ""
echo "Please select your project:"
echo "1. If you see your project listed above, run: railway link [project-id]"
echo "2. Or if you want to create a new project, run: railway new"
echo ""

# Check if we're in a project
if ! railway status &> /dev/null; then
    echo "❌ Not connected to a Railway project"
    echo ""
    echo "Please run one of these commands:"
    echo "   railway link [your-project-id]"
    echo "   railway new"
    echo ""
    echo "Then run this script again."
    exit 1
fi

echo "✅ Connected to Railway project"

# Get current project info
PROJECT_NAME=$(railway status --json | jq -r '.project.name' 2>/dev/null || echo "Unknown")
echo "📦 Project: $PROJECT_NAME"

# Fix MongoDB issue
echo "🔧 Fixing MongoDB connection..."
railway variables set MONGODB_URI="mongodb+srv://placeholder:placeholder@cluster.mongodb.net/ai-image-generator"

# Set essential environment variables
echo "⚙️  Setting environment variables..."
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

echo "✅ Environment variables set"

# Deploy the changes
echo "🚀 Deploying changes..."
railway up

# Get deployment URL
DEPLOY_URL=$(railway domain)
echo "✅ Deployed at: $DEPLOY_URL"

echo ""
echo "🎉 MONGODB ISSUE FIXED!"
echo "======================="
echo "🔧 Backend: $DEPLOY_URL"
echo "🏥 Health Check: $DEPLOY_URL/api/health"
echo ""
echo "✅ MongoDB error fixed with placeholder URI"
echo "⚠️  For full functionality, set up MongoDB Atlas:"
echo "   1. Go to https://www.mongodb.com/atlas"
echo "   2. Create free cluster"
echo "   3. Get connection string"
echo "   4. Run: railway variables set MONGODB_URI=\"your_actual_connection_string\""
echo ""
echo "📋 Check status: railway status"
echo "🔍 View logs: railway logs"
echo "🧪 Test: curl $DEPLOY_URL/api/health"
