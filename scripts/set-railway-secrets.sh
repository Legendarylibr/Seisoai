#!/bin/bash
# Script to set Railway environment variables for signup
# Usage: ./scripts/set-railway-secrets.sh

set -e

echo "🔐 Setting Railway Environment Variables for Signup"
echo "=================================================="
echo ""

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI not found. Install it with: npm i -g @railway/cli"
    exit 1
fi

# Check if logged in
if ! railway whoami &> /dev/null; then
    echo "❌ Not logged in to Railway. Run: railway login"
    exit 1
fi

# Check if project is linked
if ! railway status &> /dev/null; then
    echo "⚠️  Project not linked. Attempting to link using project ID..."
    PROJECT_ID="ee55e7fa-b010-4946-a87b-013e15e329a8"
    if railway link --project "$PROJECT_ID" 2>&1 | grep -q "Failed to prompt"; then
        echo ""
        echo "❌ Railway CLI requires interactive input."
        echo "Please run this command manually in your terminal:"
        echo "   railway link"
        echo ""
        echo "Then run this script again, or set variables manually:"
        echo "   railway variables --set \"JWT_SECRET=36e914e517a0f57dfeec11847bde1e3063885056507cec0678646f0eb0cf1c65\""
        echo "   railway variables --set \"SESSION_SECRET=6ced8320c351878b5cdb30288143744f87fd61551ce2a5de\""
        echo "   railway variables --set \"NODE_ENV=production\""
        exit 1
    fi
fi

echo ""
echo "Setting environment variables..."
echo ""

# Set the secrets
railway variables --set "JWT_SECRET=36e914e517a0f57dfeec11847bde1e3063885056507cec0678646f0eb0cf1c65"
railway variables --set "SESSION_SECRET=6ced8320c351878b5cdb30288143744f87fd61551ce2a5de"
railway variables --set "NODE_ENV=production"

echo ""
echo "✅ Environment variables set!"
echo ""
echo "⚠️  IMPORTANT: You still need to set MONGODB_URI manually:"
echo "   railway variables --set 'MONGODB_URI=your_mongodb_connection_string'"
echo ""
echo "📋 To verify, run: railway variables"
echo ""

