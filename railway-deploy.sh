#!/bin/bash

# Railway Deployment Script
echo "🚀 Deploying Seiso AI to Railway"
echo "================================"

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI not found. Installing..."
    npm install -g @railway/cli
fi

# Check if user is logged in
if ! railway whoami &> /dev/null; then
    echo "🔐 Please log in to Railway first:"
    echo "   railway login"
    exit 1
fi

echo "✅ Railway CLI ready"

# Check if we have a Railway project
if [ ! -f "railway.json" ]; then
    echo "❌ No Railway project found. Creating..."
    railway init
fi

# Check if we have production environment
if [ ! -f "backend/.env.production" ]; then
    echo "❌ Production environment not found. Creating..."
    ./setup-production-env.sh
fi

echo "✅ Environment ready"

# Show the environment variables that need to be set
echo ""
echo "📋 Environment Variables for Railway:"
echo "====================================="
echo ""
echo "Copy these to your Railway project environment variables:"
echo ""

# Read the production environment file and display it
cat backend/.env.production | grep -v "^#" | grep -v "^$" | while IFS='=' read -r key value; do
    if [ ! -z "$key" ]; then
        echo "$key=$value"
    fi
done

echo ""
echo "⚠️  IMPORTANT: Update these values in Railway:"
echo "1. MONGODB_URI - Set to your MongoDB Atlas connection string"
echo "2. RPC URLs - Add your actual Alchemy/Infura API keys"
echo "3. ALLOWED_ORIGINS - Update after frontend deployment"
echo ""

# Ask if user wants to deploy
read -p "Do you want to deploy now? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🚀 Deploying to Railway..."
    railway up
    echo ""
    echo "✅ Deployment initiated!"
    echo "📝 Don't forget to set the environment variables in Railway dashboard"
else
    echo "📝 To deploy later, run: railway up"
    echo "📖 See DEPLOY_NOW.md for detailed instructions"
fi
