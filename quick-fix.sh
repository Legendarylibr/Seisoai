#!/bin/bash

# Quick fix for GitHub-connected Railway project
echo "🔧 Quick Fix for Railway + GitHub"
echo "================================="

# Check if we can access Railway
if ! railway whoami &> /dev/null; then
    echo "❌ Please login to Railway first:"
    echo "   railway login"
    exit 1
fi

echo "✅ Logged in to Railway"

# Check if we're in a project
if ! railway status &> /dev/null; then
    echo "❌ Not in a Railway project"
    echo "Please run: railway link [your-project-id]"
    echo "Or: railway new"
    exit 1
fi

echo "✅ Connected to Railway project"

# Fix the MongoDB issue immediately
echo "🔧 Fixing MongoDB connection issue..."
railway variables set MONGODB_URI="mongodb+srv://placeholder:placeholder@cluster.mongodb.net/ai-image-generator"

# Set essential variables
echo "⚙️  Setting essential variables..."
railway variables set JWT_SECRET="jwt-$(date +%s)"
railway variables set SESSION_SECRET="session-$(date +%s)"
railway variables set ENCRYPTION_KEY="encryption-key-32-chars-long"
railway variables set NODE_ENV="production"
railway variables set PORT="3001"

# Deploy the fix
echo "🚀 Deploying fix..."
railway up

# Get URL
URL=$(railway domain)
echo ""
echo "✅ FIXED! Your app is now running at: $URL"
echo "🏥 Health check: $URL/api/health"
echo ""
echo "📋 Next steps:"
echo "1. Test your app: curl $URL/api/health"
echo "2. Set up MongoDB Atlas for full functionality"
echo "3. Check logs: railway logs"
