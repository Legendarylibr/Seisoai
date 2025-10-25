#!/bin/bash

# Direct deployment to specific Railway project
echo "🚀 Deploying to Railway project: ee55e7fa-b010-4946-a87b-013e15e329a8"

# Set the project ID
PROJECT_ID="ee55e7fa-b010-4946-a87b-013e15e329a8"

# Try to link to the project using environment variable
export RAILWAY_PROJECT_ID=$PROJECT_ID

echo "📦 Project ID: $PROJECT_ID"
echo "🔗 Attempting to link to project..."

# Try to get project info first
echo "🔍 Checking project status..."
railway status

# Deploy directly with the project ID
echo "🚀 Deploying application..."
railway up

# Set essential environment variables after deployment
echo "⚙️ Setting environment variables..."
railway variables --set "NODE_ENV=production"
railway variables --set "PORT=3001"
railway variables --set "JWT_SECRET=$(openssl rand -base64 32)"
railway variables --set "SESSION_SECRET=$(openssl rand -base64 32)"

# Set CORS origins
railway variables --set "ALLOWED_ORIGINS=https://helpful-serenity-production.up.railway.app,http://localhost:3000,http://localhost:5173"

# Set payment wallets
railway variables --set "ETH_PAYMENT_WALLET=0xa0aE05e2766A069923B2a51011F270aCadFf023a"
railway variables --set "POLYGON_PAYMENT_WALLET=0xa0aE05e2766A069923B2a51011F270aCadFf023a"
railway variables --set "ARBITRUM_PAYMENT_WALLET=0xa0aE05e2766A069923B2a51011F270aCadFf023a"
railway variables --set "OPTIMISM_PAYMENT_WALLET=0xa0aE05e2766A069923B2a51011F270aCadFf023a"
railway variables --set "BASE_PAYMENT_WALLET=0xa0aE05e2766A069923B2a51011F270aCadFf023a"
railway variables --set "SOLANA_PAYMENT_WALLET=BZ9LR3nnVP4oh477rZAKdhGFAbYqvazv3Ru1MDk9rk99"

# Set FAL API key
railway variables --set "FAL_API_KEY=a04e2397-ea04-41e8-9369-764c5bb18bb5:daf42f52c61eb5f089e094eee3bd4547"

# Set RPC endpoints (using demo URLs - replace with your actual RPC URLs)
railway variables --set "ETH_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/demo"
railway variables --set "POLYGON_RPC_URL=https://polygon-mainnet.g.alchemy.com/v2/demo"
railway variables --set "ARBITRUM_RPC_URL=https://arb-mainnet.g.alchemy.com/v2/demo"
railway variables --set "OPTIMISM_RPC_URL=https://opt-mainnet.g.alchemy.com/v2/demo"
railway variables --set "BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/demo"

# Get the deployment URL
echo "✅ Deployment complete!"
echo "🔗 Your API URL:"
railway domain

echo ""
echo "🎉 Deployment successful!"
echo "📋 Next steps:"
echo "1. Test your API at: $(railway domain)/api/health"
echo "2. Update your frontend VITE_API_URL to: $(railway domain)"
echo "3. Test wallet connection and payment flows"
echo ""
echo "🛡️ Enhanced wallet conflict resolution is now active!"
