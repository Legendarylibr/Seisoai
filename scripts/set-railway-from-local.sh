#!/bin/bash
# Script to set Railway environment variables using values from backend.env
# Usage: ./scripts/set-railway-from-local.sh

set -e

echo "🔐 Setting Railway Variables from Local backend.env"
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

# Load values from backend.env (in project root)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$PROJECT_ROOT/backend.env"

if [ ! -f "$ENV_FILE" ]; then
    echo "❌ backend.env not found at $ENV_FILE"
    exit 1
fi

# Extract values (handles both KEY=value and KEY="value" formats)
JWT_SECRET=$(grep "^JWT_SECRET=" "$ENV_FILE" | cut -d '=' -f2- | tr -d '"' | tr -d "'")
SESSION_SECRET=$(grep "^SESSION_SECRET=" "$ENV_FILE" | cut -d '=' -f2- | tr -d '"' | tr -d "'")
MONGODB_URI=$(grep "^MONGODB_URI=" "$ENV_FILE" | cut -d '=' -f2- | tr -d '"' | tr -d "'")

if [ -z "$JWT_SECRET" ]; then
    echo "❌ JWT_SECRET not found in backend.env"
    exit 1
fi

if [ -z "$SESSION_SECRET" ]; then
    echo "❌ SESSION_SECRET not found in backend.env"
    exit 1
fi

echo "📋 Found values from backend.env:"
echo "   JWT_SECRET: ${JWT_SECRET:0:20}..."
echo "   SESSION_SECRET: ${SESSION_SECRET:0:20}..."
if [ -n "$MONGODB_URI" ]; then
    echo "   MONGODB_URI: ${MONGODB_URI:0:30}..."
else
    echo "   MONGODB_URI: (not set - you'll need to set this manually)"
fi
echo ""

# Check if project is linked
if ! railway status &> /dev/null; then
    echo "⚠️  Project not linked."
    echo ""
    echo "Please run this command first to link your project:"
    echo "   railway link"
    echo ""
    echo "Then run this script again."
    echo ""
    echo "Or set variables manually with these commands:"
    echo ""
    echo "railway variables --set \"JWT_SECRET=$JWT_SECRET\""
    echo "railway variables --set \"SESSION_SECRET=$SESSION_SECRET\""
    echo "railway variables --set \"NODE_ENV=production\""
    if [ -n "$MONGODB_URI" ]; then
        echo "railway variables --set \"MONGODB_URI=$MONGODB_URI\""
    fi
    exit 1
fi

echo "Setting environment variables in Railway..."
echo ""

# Set the variables
railway variables --set "JWT_SECRET=$JWT_SECRET"
railway variables --set "SESSION_SECRET=$SESSION_SECRET"
railway variables --set "NODE_ENV=production"

if [ -n "$MONGODB_URI" ]; then
    echo "⚠️  Note: MONGODB_URI found in backend.env, but you may need to update it"
    echo "   for Railway (local MongoDB won't work on Railway)."
    echo ""
    echo "   If you're using MongoDB Atlas, update MONGODB_URI in Railway with your Atlas connection string."
    echo ""
    read -p "Set MONGODB_URI from backend.env? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        railway variables --set "MONGODB_URI=$MONGODB_URI"
    else
        echo "   Skipping MONGODB_URI - set it manually with your MongoDB Atlas connection string"
    fi
else
    echo "⚠️  MONGODB_URI not found in backend.env"
    echo "   You MUST set this manually with your MongoDB Atlas connection string:"
    echo "   railway variables --set 'MONGODB_URI=your_mongodb_atlas_connection_string'"
fi

echo ""
echo "✅ Environment variables set!"
echo ""
echo "📋 To verify, run: railway variables"
echo ""

