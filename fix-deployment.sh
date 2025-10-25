#!/bin/bash

# Seiso AI Deployment Fix Script
echo "🔧 Fixing Seiso AI Deployment Issues..."

# Kill any existing server processes
echo "🛑 Stopping existing servers..."
pkill -f "node.*server.js" || true
sleep 2

# Install missing dependencies
echo "📦 Installing dependencies..."
cd /Users/libr/seisoaif/Seisoai
npm install

cd backend
npm install

# Remove problematic mongoose-encryption dependency
echo "🗑️ Removing problematic mongoose-encryption..."
npm uninstall mongoose-encryption || true

# Set environment variables for development
echo "⚙️ Setting environment variables..."
export NODE_ENV=development
export PORT=3001
export ALLOWED_ORIGINS="http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000,http://127.0.0.1:5173"
export JWT_SECRET="dev-jwt-secret-key-32-chars-min"
export SESSION_SECRET="dev-session-secret-32-chars-min"

# Payment wallets
export ETH_PAYMENT_WALLET="0xa0aE05e2766A069923B2a51011F270aCadFf023a"
export POLYGON_PAYMENT_WALLET="0xa0aE05e2766A069923B2a51011F270aCadFf023a"
export ARBITRUM_PAYMENT_WALLET="0xa0aE05e2766A069923B2a51011F270aCadFf023a"
export OPTIMISM_PAYMENT_WALLET="0xa0aE05e2766A069923B2a51011F270aCadFf023a"
export BASE_PAYMENT_WALLET="0xa0aE05e2766A069923B2a51011F270aCadFf023a"
export SOLANA_PAYMENT_WALLET="BZ9LR3nnVP4oh477rZAKdhGFAbYqvazv3Ru1MDk9rk99"

# RPC endpoints (replace with real ones)
export ETH_RPC_URL="https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY"
export POLYGON_RPC_URL="https://polygon-mainnet.g.alchemy.com/v2/YOUR_API_KEY"
export ARBITRUM_RPC_URL="https://arb-mainnet.g.alchemy.com/v2/YOUR_API_KEY"
export OPTIMISM_RPC_URL="https://opt-mainnet.g.alchemy.com/v2/YOUR_API_KEY"
export BASE_RPC_URL="https://base-mainnet.g.alchemy.com/v2/YOUR_API_KEY"

# FAL.ai API key
export FAL_API_KEY="a04e2397-ea04-41e8-9369-764c5bb18bb5:daf42f52c61eb5f089e094eee3bd4547"

# MongoDB URI (replace with real one)
export MONGODB_URI="mongodb+srv://username:password@cluster.mongodb.net/ai-image-generator"

echo "✅ Environment variables set"
echo "🚀 Starting backend server..."

# Start the backend server
node server.js
