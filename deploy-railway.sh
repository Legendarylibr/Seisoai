#!/bin/bash

# Railway Deployment Script for Seiso AI
echo "🚀 Deploying Seiso AI to Railway..."

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI not found. Installing..."
    npm install -g @railway/cli
fi

# Login to Railway
echo "🔐 Logging into Railway..."
railway login

# Initialize Railway project (if not already done)
echo "📦 Initializing Railway project..."
railway init

# Set environment variables
echo "⚙️ Setting environment variables..."

# Required variables
railway variables set NODE_ENV=production
railway variables set PORT=3001

# Database (you need to replace with your actual MongoDB URI)
echo "📊 Please set your MongoDB URI:"
read -p "Enter your MongoDB Atlas connection string: " MONGODB_URI
railway variables set MONGODB_URI="$MONGODB_URI"

# Security secrets
echo "🔒 Setting security secrets..."
railway variables set JWT_SECRET="$(openssl rand -base64 32)"
railway variables set SESSION_SECRET="$(openssl rand -base64 32)"

# CORS (replace with your frontend domain)
echo "🌐 Setting CORS origins..."
read -p "Enter your frontend domain (e.g., https://your-app.vercel.app): " FRONTEND_DOMAIN
railway variables set ALLOWED_ORIGINS="$FRONTEND_DOMAIN"

# Payment wallets (USDC payments only)
echo "💰 Setting payment wallets..."
railway variables set EVM_PAYMENT_WALLET_ADDRESS="0xa0aE05e2766A069923B2a51011F270aCadFf023a"
railway variables set SOLANA_PAYMENT_WALLET_ADDRESS="CkhFmeUNxdr86SZEPg6bLgagFkRyaDMTmFzSVL69oadA"

# RPC endpoints (you need to replace with your actual RPC URLs)
echo "🔗 Setting RPC endpoints..."
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
read -p "Do you want to configure Stripe? (y/n): " CONFIGURE_STRIPE
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
railway domain

echo ""
echo "🎉 Deployment successful!"
echo "📋 Next steps:"
echo "1. Test your API at: $(railway domain)/api/health"
echo "2. Update your frontend VITE_API_URL to: $(railway domain)"
echo "3. Test wallet connection and payment flows"
echo ""
echo "📖 For more details, see: RAILWAY_DEPLOYMENT_SIMPLE.md"