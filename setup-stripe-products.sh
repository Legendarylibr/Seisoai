#!/bin/bash
# Quick setup script for Stripe products using Stripe CLI
# Get your STRIPE_SECRET_KEY from Railway dashboard first

echo "🚀 Stripe Products Setup with Stripe CLI"
echo "=========================================="
echo ""
echo "This script will create 4 subscription products in your Stripe account."
echo ""
echo "You need your STRIPE_SECRET_KEY from Railway."
echo "Get it from: Railway Dashboard → Backend Service → Variables → STRIPE_SECRET_KEY"
echo ""
read -p "Enter your Stripe Secret Key (sk_live_...): " STRIPE_KEY

if [ -z "$STRIPE_KEY" ]; then
    echo "❌ Error: No key provided"
    exit 1
fi

export STRIPE_API_KEY="$STRIPE_KEY"

echo ""
echo "Creating products..."
echo ""

# Starter Pack - $10/month
echo "📦 Creating Starter Pack ($10/month)..."
PRODUCT1=$(stripe products create --name "Starter Pack" --description "Perfect for trying out Seiso AI" --api-key "$STRIPE_KEY" 2>&1)
PROD1_ID=$(echo "$PRODUCT1" | grep -o '"id": "[^"]*' | head -1 | cut -d'"' -f4)
if [ -n "$PROD1_ID" ]; then
    stripe prices create --product "$PROD1_ID" --unit-amount 1000 --currency usd --recurring interval=month --lookup-key starter_pack_monthly --api-key "$STRIPE_KEY" > /dev/null 2>&1
    echo "✅ Created Starter Pack"
else
    echo "⚠️  Product may already exist or error occurred"
fi

# Creator Pack - $20/month
echo "📦 Creating Creator Pack ($20/month)..."
PRODUCT2=$(stripe products create --name "Creator Pack" --description "Great for regular creators" --api-key "$STRIPE_KEY" 2>&1)
PROD2_ID=$(echo "$PRODUCT2" | grep -o '"id": "[^"]*' | head -1 | cut -d'"' -f4)
if [ -n "$PROD2_ID" ]; then
    stripe prices create --product "$PROD2_ID" --unit-amount 2000 --currency usd --recurring interval=month --lookup-key creator_pack_monthly --api-key "$STRIPE_KEY" > /dev/null 2>&1
    echo "✅ Created Creator Pack"
else
    echo "⚠️  Product may already exist or error occurred"
fi

# Pro Pack - $40/month
echo "📦 Creating Pro Pack ($40/month)..."
PRODUCT3=$(stripe products create --name "Pro Pack" --description "Best value for power users" --api-key "$STRIPE_KEY" 2>&1)
PROD3_ID=$(echo "$PRODUCT3" | grep -o '"id": "[^"]*' | head -1 | cut -d'"' -f4)
if [ -n "$PROD3_ID" ]; then
    stripe prices create --product "$PROD3_ID" --unit-amount 4000 --currency usd --recurring interval=month --lookup-key pro_pack_monthly --api-key "$STRIPE_KEY" > /dev/null 2>&1
    echo "✅ Created Pro Pack"
else
    echo "⚠️  Product may already exist or error occurred"
fi

# Studio Pack - $80/month
echo "📦 Creating Studio Pack ($80/month)..."
PRODUCT4=$(stripe products create --name "Studio Pack" --description "For professional studios" --api-key "$STRIPE_KEY" 2>&1)
PROD4_ID=$(echo "$PRODUCT4" | grep -o '"id": "[^"]*' | head -1 | cut -d'"' -f4)
if [ -n "$PROD4_ID" ]; then
    stripe prices create --product "$PROD4_ID" --unit-amount 8000 --currency usd --recurring interval=month --lookup-key studio_pack_monthly --api-key "$STRIPE_KEY" > /dev/null 2>&1
    echo "✅ Created Studio Pack"
else
    echo "⚠️  Product may already exist or error occurred"
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Verify products in Stripe Dashboard: https://dashboard.stripe.com/products"
echo "2. Set up webhook endpoint (see STRIPE_CLI_SETUP.md)"
echo "3. Test checkout flow"

