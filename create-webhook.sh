#!/bin/bash
# Create Stripe webhook endpoint for subscriptions
# Usage: ./create-webhook.sh [RAILWAY_BACKEND_URL]

set -e

# Get Stripe API key from environment variable or prompt user
if [ -z "$STRIPE_API_KEY" ]; then
    echo "⚠️  STRIPE_API_KEY not found in environment"
    echo "Please provide your Stripe Secret Key (starts with sk_live_...)"
    read -p "Enter your Stripe Secret Key: " STRIPE_API_KEY
    
    if [ -z "$STRIPE_API_KEY" ]; then
        echo "❌ Error: Stripe API key is required"
        exit 1
    fi
fi

# Validate key format
if [[ ! "$STRIPE_API_KEY" =~ ^sk_(live|test)_ ]]; then
    echo "❌ Error: Invalid Stripe key format. Must start with sk_live_ or sk_test_"
    exit 1
fi

if [ -z "$1" ]; then
    echo "🚀 Stripe Webhook Endpoint Creator"
    echo "==================================="
    echo ""
    echo "This will create a webhook endpoint in Stripe for subscription events."
    echo ""
    echo "You need your Railway backend URL."
    echo "Example: https://your-backend-service.up.railway.app"
    echo ""
    read -p "Enter your Railway backend URL (without /api/stripe/webhook): " BACKEND_URL
    
    if [ -z "$BACKEND_URL" ]; then
        echo "❌ Error: No URL provided"
        exit 1
    fi
else
    BACKEND_URL="$1"
fi

# Remove trailing slash if present
BACKEND_URL="${BACKEND_URL%/}"

WEBHOOK_URL="${BACKEND_URL}/api/stripe/webhook"

echo ""
echo "Creating webhook endpoint..."
echo "URL: $WEBHOOK_URL"
echo ""

WEBHOOK_OUTPUT=$(stripe webhook_endpoints create \
  --url "$WEBHOOK_URL" \
  --enabled-events checkout.session.completed invoice.payment_succeeded \
  --api-key "$STRIPE_API_KEY" 2>&1)

if [ $? -eq 0 ]; then
    echo "✅ Webhook endpoint created successfully!"
    echo ""
    echo "$WEBHOOK_OUTPUT" | grep -E '"id"|"secret"|"url"' | head -10
    echo ""
    
    # Extract signing secret
    SIGNING_SECRET=$(echo "$WEBHOOK_OUTPUT" | grep -o '"secret": "[^"]*' | cut -d'"' -f4)
    
    if [ -n "$SIGNING_SECRET" ]; then
        echo "📋 Signing Secret (add this to Railway as STRIPE_WEBHOOK_SECRET):"
        echo "$SIGNING_SECRET"
        echo ""
        echo "Next steps:"
        echo "1. Copy the signing secret above"
        echo "2. Go to Railway Dashboard → Backend Service → Variables"
        echo "3. Add: STRIPE_WEBHOOK_SECRET=$SIGNING_SECRET"
    else
        echo "⚠️  Could not extract signing secret. Check the output above."
        echo "You can get it from: https://dashboard.stripe.com/webhooks"
    fi
else
    echo "❌ Error creating webhook:"
    echo "$WEBHOOK_OUTPUT"
    exit 1
fi

