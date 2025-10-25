#!/bin/bash

# Fix MongoDB Connection Script
echo "🔧 Fixing MongoDB Connection"
echo "============================"

# Check if we're in a Railway project
if railway status &> /dev/null; then
    echo "✅ Railway project detected"
    
    # Check current MONGODB_URI
    CURRENT_URI=$(railway variables get MONGODB_URI 2>/dev/null || echo "not set")
    echo "Current MONGODB_URI: $CURRENT_URI"
    
    if [[ "$CURRENT_URI" == *"localhost"* ]]; then
        echo "❌ MONGODB_URI is set to localhost - this won't work in production"
        echo ""
        echo "🚨 You need to set up MongoDB Atlas and update the connection string:"
        echo ""
        echo "1. Go to https://www.mongodb.com/atlas"
        echo "2. Create a free cluster"
        echo "3. Get your connection string"
        echo "4. Run this command:"
        echo "   railway variables set MONGODB_URI=\"mongodb+srv://username:password@cluster.mongodb.net/ai-image-generator\""
        echo ""
        echo "Or use this temporary fix (will work but data won't persist):"
        read -p "Set MONGODB_URI to a placeholder? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            railway variables set MONGODB_URI="mongodb+srv://placeholder:placeholder@cluster.mongodb.net/ai-image-generator"
            echo "✅ MONGODB_URI set to placeholder (update with real connection string)"
        fi
    else
        echo "✅ MONGODB_URI looks good: $CURRENT_URI"
    fi
    
    # Restart the service
    echo "🔄 Restarting backend service..."
    railway up --service backend
    
    echo ""
    echo "✅ Backend restarted with updated MongoDB configuration"
    echo "📋 Check logs: railway logs --service backend"
    
else
    echo "❌ Not in a Railway project"
    echo "Please run this from your Railway project directory"
    echo "Or run: railway link [project-id]"
fi
