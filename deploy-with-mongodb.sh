#!/bin/bash

# Seiso.ai Railway Deployment with MongoDB
echo "🚀 Deploying Seiso AI to Railway with MongoDB..."

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI not found. Installing..."
    npm install -g @railway/cli
    echo "✅ Railway CLI installed. Please run 'railway login' manually first."
    echo "Then run this script again."
    exit 1
fi

# Check if logged in
if ! railway whoami &> /dev/null; then
    echo "❌ Not logged in to Railway. Please run 'railway login' first."
    echo "This will open your browser to authenticate with Railway."
    exit 1
fi

echo "✅ Logged in to Railway as $(railway whoami)"

# Initialize Railway project (if not already done)
echo "📦 Initializing Railway project..."
railway init

# Set environment variables for seiso.ai
echo "⚙️ Setting environment variables for seiso.ai..."

# Required variables
railway variables set NODE_ENV=production
railway variables set PORT=3001

# Database with your MongoDB connection string
echo "📊 Setting up MongoDB database..."
MONGODB_URI="mongodb+srv://legendarylibraries_db_user:<db_password>@cluster0.yqlccoa.mongodb.net/?appName=Cluster0"
echo "Using MongoDB: cluster0.yqlccoa.mongodb.net"
railway variables set MONGODB_URI="$MONGODB_URI"

# Security secrets
echo "🔒 Generating security secrets..."
JWT_SECRET=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)
SESSION_SECRET=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)
railway variables set JWT_SECRET="$JWT_SECRET"
railway variables set SESSION_SECRET="$SESSION_SECRET"

# CORS for seiso.ai domain
echo "🌐 Setting CORS for seiso.ai domain..."
railway variables set ALLOWED_ORIGINS="https://seiso.ai,https://www.seiso.ai,http://localhost:5173,http://localhost:3000"

# Payment wallets
echo "💰 Setting payment wallets..."
railway variables set ETH_PAYMENT_WALLET="0xa0aE05e2766A069923B2a51011F270aCadFf023a"
railway variables set POLYGON_PAYMENT_WALLET="0xa0aE05e2766A069923B2a51011F270aCadFf023a"
railway variables set ARBITRUM_PAYMENT_WALLET="0xa0aE05e2766A069923B2a51011F270aCadFf023a"
railway variables set OPTIMISM_PAYMENT_WALLET="0xa0aE05e2766A069923B2a51011F270aCadFf023a"
railway variables set BASE_PAYMENT_WALLET="0xa0aE05e2766A069923B2a51011F270aCadFf023a"
railway variables set SOLANA_PAYMENT_WALLET="BZ9LR3nnVP4oh477rZAKdhGFAbYqvazv3Ru1MDk9rk99"

# RPC endpoints - you'll need to provide these
echo "🔗 Setting RPC endpoints..."
echo "You need RPC endpoints for blockchain networks."
echo "Get them from: https://alchemy.com or https://infura.io"
echo ""

read -p "Enter your Ethereum RPC URL: " ETH_RPC
railway variables set ETH_RPC_URL="$ETH_RPC"

read -p "Enter your Polygon RPC URL: " POLYGON_RPC
railway variables set POLYGON_RPC_URL="$POLYGON_RPC"

read -p "Enter your Arbitrum RPC URL: " ARBITRUM_RPC
railway variables set ARBITRUM_RPC_URL="$ARBITRUM_RPC"

read -p "Enter your Optimism RPC URL: " OPTIMISM_RPC
railway variables set OPTIMISM_RPC_URL="$OPTIMISM_RPC"

read -p "Enter your Base RPC URL: " BASE_RPC
railway variables set BASE_RPC_URL="$BASE_RPC"

# Optional Stripe configuration
echo "💳 Stripe configuration (optional)..."
read -p "Do you want to configure Stripe for card payments? (y/n): " CONFIGURE_STRIPE
if [ "$CONFIGURE_STRIPE" = "y" ]; then
    read -p "Enter your Stripe Secret Key: " STRIPE_SECRET
    railway variables set STRIPE_SECRET_KEY="$STRIPE_SECRET"
    
    read -p "Enter your Stripe Webhook Secret: " STRIPE_WEBHOOK
    railway variables set STRIPE_WEBHOOK_SECRET="$STRIPE_WEBHOOK"
fi

# Deploy to Railway
echo "🚀 Deploying to Railway..."
railway up

# Get deployment URL
echo "✅ Deployment complete!"
echo "🔗 Your API URL:"
API_URL=$(railway domain)
echo "$API_URL"

echo ""
echo "🎉 Seiso AI deployed successfully!"
echo ""
echo "📋 Next steps for seiso.ai:"
echo "1. Test your API at: $API_URL/api/health"
echo "2. Update your frontend VITE_API_URL to: $API_URL"
echo "3. Test wallet connection and payment flows"
echo ""
echo "🌐 Your MongoDB database: cluster0.yqlccoa.mongodb.net"
echo "🔗 Railway API URL: $API_URL"
echo ""
echo "📖 For more details, see: SEISO_AI_DEPLOYMENT.md"
