#!/bin/bash

# Quick Redeploy Script for Railway
echo "🚀 Redeploying Seiso AI to Railway..."

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI not found. Please install it first:"
    echo "   npm i -g @railway/cli"
    echo ""
    echo "Or redeploy via Railway dashboard:"
    echo "   1. Go to https://railway.app/dashboard"
    echo "   2. Select your project"
    echo "   3. Click on each service → Deploy → Redeploy"
    exit 1
fi

# Login if needed
echo "🔐 Checking Railway authentication..."
railway whoami || railway login

# Link to project if needed
echo "🔗 Linking to project..."
railway link || echo "Project already linked"

# Get project info
PROJECT_ID=$(railway status --json 2>/dev/null | grep -o '"project":"[^"]*"' | cut -d'"' -f4 || echo "ee55e7fa-b010-4946-a87b-013e15e329a8")

if [ -z "$PROJECT_ID" ]; then
    PROJECT_ID="ee55e7fa-b010-4946-a87b-013e15e329a8"
fi

echo "📦 Project ID: $PROJECT_ID"

# List services
echo ""
echo "📋 Available services:"
railway status

echo ""
echo "🔄 To redeploy, run one of:"
echo "   railway up              # Deploy current service"
echo "   railway up --service backend   # Deploy backend service"
echo "   railway up --service frontend   # Deploy frontend service"
echo ""
echo "Or use Railway dashboard:"
echo "   https://railway.app/project/$PROJECT_ID"
echo ""
echo "⚠️  Make sure environment variables are set correctly:"
echo "   - Frontend: VITE_STRIPE_PUBLISHABLE_KEY=pk_live_..."
echo "   - Backend: STRIPE_SECRET_KEY=sk_live_..."
echo "   - Backend: STRIPE_WEBHOOK_SECRET=whsec_..."

