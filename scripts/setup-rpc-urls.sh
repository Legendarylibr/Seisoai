#!/bin/bash

# Setup RPC URLs for Seisoai production environment
# Uses Alchemy endpoints for reliable RPC access

ALCHEMY_API_KEY="REDACTED_ALCHEMY_KEY"

echo "🔧 Setting up RPC URLs with Alchemy API key..."

# Check if railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI not found. Installing..."
    npm install -g @railway/cli
fi

echo "📡 Setting RPC environment variables on Railway..."

# Set all RPC URLs in one command
railway variables \
  --set "ETH_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}" \
  --set "POLYGON_RPC_URL=https://polygon-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}" \
  --set "ARBITRUM_RPC_URL=https://arb-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}" \
  --set "OPTIMISM_RPC_URL=https://opt-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}" \
  --set "BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}"

# Helius for Solana (you'll need a separate Helius API key for Solana)
# railway variables --set "SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_HELIUS_KEY"

echo ""
echo "✅ RPC URLs configured!"
echo ""
echo "Configured endpoints:"
echo "  • ETH_RPC_URL      → eth-mainnet.g.alchemy.com"
echo "  • POLYGON_RPC_URL  → polygon-mainnet.g.alchemy.com"
echo "  • ARBITRUM_RPC_URL → arb-mainnet.g.alchemy.com"
echo "  • OPTIMISM_RPC_URL → opt-mainnet.g.alchemy.com"
echo "  • BASE_RPC_URL     → base-mainnet.g.alchemy.com"
echo ""
echo "⚠️  Note: Solana requires a Helius API key (not Alchemy)"
echo ""
echo "🚀 Railway will auto-redeploy with new variables"

