#!/bin/bash

# Configure Stripe Live Keys
# This script helps you update your Railway environment variables to use live Stripe keys

echo "🔧 Configure Stripe Live Keys"
echo "=================================================="
echo ""

# Check if railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI is not installed."
    echo "   Install it: npm install -g @railway/cli"
    echo "   Then run: railway login"
    exit 1
fi

echo "📋 Steps to fix:"
echo ""
echo "1. Get your LIVE Stripe keys from:"
echo "   https://dashboard.stripe.com/apikeys"
echo "   (Make sure LIVE MODE toggle is ON in top right)"
echo ""
echo "2. Get your webhook secret from:"
echo "   https://dashboard.stripe.com/webhooks"
echo "   (Make sure LIVE MODE is ON)"
echo ""
echo ""

# Prompt for keys
read -p "Enter your LIVE Publishable Key (pk_live_...): " PUBLISHABLE_KEY
read -p "Enter your LIVE Secret Key (sk_live_...): " SECRET_KEY
read -p "Enter your Webhook Secret (whsec_...): " WEBHOOK_SECRET

# Validate keys
if [[ ! $PUBLISHABLE_KEY =~ ^pk_live_ ]]; then
    echo "❌ Error: Publishable key must start with 'pk_live_'"
    exit 1
fi

if [[ ! $SECRET_KEY =~ ^sk_live_ ]]; then
    echo "❌ Error: Secret key must start with 'sk_live_'"
    exit 1
fi

if [[ ! $WEBHOOK_SECRET =~ ^whsec_ ]]; then
    echo "❌ Error: Webhook secret must start with 'whsec_'"
    exit 1
fi

echo ""
echo "✅ Keys validated!"
echo ""
echo "🚀 Updating Railway environment variables..."
echo ""

# Update frontend service
echo "Updating Frontend service (VITE_STRIPE_PUBLISHABLE_KEY)..."
railway variables set VITE_STRIPE_PUBLISHABLE_KEY="$PUBLISHABLE_KEY" --service frontend 2>/dev/null || {
    echo "⚠️  Could not set frontend variable. Make sure you're in the right project."
    echo "   You may need to set it manually in Railway dashboard."
}

# Update backend service
echo "Updating Backend service (STRIPE_SECRET_KEY)..."
railway variables set STRIPE_SECRET_KEY="$SECRET_KEY" --service backend 2>/dev/null || {
    echo "⚠️  Could not set backend secret key. Make sure you're in the right project."
    echo "   You may need to set it manually in Railway dashboard."
}

echo "Updating Backend service (STRIPE_WEBHOOK_SECRET)..."
railway variables set STRIPE_WEBHOOK_SECRET="$WEBHOOK_SECRET" --service backend 2>/dev/null || {
    echo "⚠️  Could not set webhook secret. Make sure you're in the right project."
    echo "   You may need to set it manually in Railway dashboard."
}

echo ""
echo "✅ Environment variables updated!"
echo ""
echo "📝 Next steps:"
echo "1. Railway will automatically redeploy your services"
echo "2. Wait for deployment to complete (check Railway dashboard)"
echo "3. Clear your browser cache (Ctrl+Shift+R or Cmd+Shift+R)"
echo "4. Test with a real credit card"
echo ""
echo "🔍 To verify:"
echo "   - Check Railway dashboard > Variables tab"
echo "   - Frontend: VITE_STRIPE_PUBLISHABLE_KEY should start with pk_live_"
echo "   - Backend: STRIPE_SECRET_KEY should start with sk_live_"
echo ""

