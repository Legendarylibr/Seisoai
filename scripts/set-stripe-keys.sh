#!/bin/bash
# Set Stripe keys in Railway
# Usage: ./scripts/set-stripe-keys.sh <publishable_key> <secret_key>
#
# Example:
#   ./scripts/set-stripe-keys.sh pk_live_51ABC... sk_live_51ABC...

set -e

PUBLISHABLE_KEY="$1"
SECRET_KEY="$2"

if [ -z "$PUBLISHABLE_KEY" ] || [ -z "$SECRET_KEY" ]; then
    echo "❌ Usage: $0 <publishable_key> <secret_key>"
    echo ""
    echo "Get your LIVE keys from: https://dashboard.stripe.com/apikeys"
    echo "Make sure 'Test mode' toggle is OFF"
    echo ""
    echo "Example:"
    echo "  $0 pk_live_51SMcHr... sk_live_51SMcHr..."
    exit 1
fi

# Validate key formats
if [[ ! "$PUBLISHABLE_KEY" =~ ^pk_live_ ]]; then
    echo "❌ Error: Publishable key must start with 'pk_live_' for production"
    echo "   Got: ${PUBLISHABLE_KEY:0:15}..."
    exit 1
fi

if [[ ! "$SECRET_KEY" =~ ^sk_live_ ]]; then
    echo "❌ Error: Secret key must start with 'sk_live_' for production"
    echo "   Got: ${SECRET_KEY:0:15}..."
    exit 1
fi

# Check key lengths
if [ ${#PUBLISHABLE_KEY} -lt 50 ]; then
    echo "❌ Error: Publishable key seems truncated (${#PUBLISHABLE_KEY} chars, expected 100+)"
    exit 1
fi

if [ ${#SECRET_KEY} -lt 50 ]; then
    echo "❌ Error: Secret key seems truncated (${#SECRET_KEY} chars, expected 100+)"
    exit 1
fi

echo "✅ Keys validated"
echo "   Publishable: ${PUBLISHABLE_KEY:0:20}... (${#PUBLISHABLE_KEY} chars)"
echo "   Secret: ${SECRET_KEY:0:20}... (${#SECRET_KEY} chars)"
echo ""

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI not installed"
    echo "   Install with: npm install -g @railway/cli"
    echo "   Then run: railway login"
    exit 1
fi

echo "Setting Railway environment variables..."

# Set the variables
railway variables set STRIPE_PUBLISHABLE_KEY="$PUBLISHABLE_KEY"
railway variables set STRIPE_SECRET_KEY="$SECRET_KEY"

echo ""
echo "✅ Stripe keys set in Railway!"
echo ""
echo "Next steps:"
echo "  1. Redeploy your Railway service for changes to take effect"
echo "  2. Test: curl -k https://seisoai.com/api/config"
echo "     Should show: pk_live_..."

