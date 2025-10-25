#!/bin/bash

# Seiso AI - Deploy Now Script
echo "🚀 Seiso AI - Deploying to Railway"
echo "=================================="

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

# Check if we have environment variables
if [ ! -f "backend/.env" ]; then
    echo "❌ Backend environment file not found."
    echo "Please run: ./setup-dev-env.sh first"
    exit 1
fi

echo "✅ Environment files ready"

# Check if we have a MongoDB URI
if ! grep -q "mongodb+srv://" backend/.env; then
    echo "⚠️  MongoDB URI not configured in backend/.env"
    echo "Please update backend/.env with your MongoDB Atlas connection string"
    echo "See MONGODB_SETUP.md for instructions"
    exit 1
fi

echo "✅ MongoDB URI configured"

# Deploy to Railway
echo "🚀 Deploying to Railway..."
railway up

echo ""
echo "🎉 Deployment initiated!"
echo ""
echo "📝 Next steps:"
echo "1. Check Railway dashboard for deployment status"
echo "2. Set environment variables in Railway dashboard"
echo "3. Test your deployed application"
echo ""
echo "📖 See DEPLOY_NOW.md for detailed instructions"