#!/bin/bash

# Copy Environment Variables Script
echo "🔄 Copying environment variables from existing files..."

# Copy frontend environment variables
echo "📋 Frontend environment variables (copy to Vercel/Netlify/etc.):"
echo "=========================================="
cat seiso.env | grep "^VITE_"
echo ""

# Copy backend environment variables  
echo "📋 Backend environment variables (copy to Railway/Heroku/etc.):"
echo "=========================================="
cat backend.env | grep -E "^(MONGODB_URI|JWT_SECRET|SESSION_SECRET|ENCRYPTION_KEY|ETH_PAYMENT_WALLET|POLYGON_PAYMENT_WALLET|ARBITRUM_PAYMENT_WALLET|OPTIMISM_PAYMENT_WALLET|BASE_PAYMENT_WALLET|SOLANA_PAYMENT_WALLET|ETH_RPC_URL|POLYGON_RPC_URL|ARBITRUM_RPC_URL|OPTIMISM_RPC_URL|BASE_RPC_URL|STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET|ALLOWED_ORIGINS|NODE_ENV|PORT|FAL_API_KEY|FASTAPI_URL|FASTAPI_ENABLED|SENTRY_DSN|RATE_LIMIT|LOG_LEVEL|MAX_REQUEST_SIZE|REQUEST_TIMEOUT|BACKUP_|ENCRYPTION_KEY)"
echo ""

echo "✅ Environment variables copied!"
echo ""
echo "🚨 IMPORTANT: You still need to:"
echo "1. Set up MongoDB Atlas and get your connection string"
echo "2. Replace 'your-backend-domain.com' with your actual backend URL"
echo "3. Replace 'your-frontend-domain.com' with your actual frontend URL"
echo "4. Replace 'YOUR_API_KEY' with your actual Alchemy API keys"
echo "5. Replace security keys with actual secure values"
echo ""
echo "📁 Files created:"
echo "   - production.env (frontend)"
echo "   - (backend)"
echo "   - docker.env (Docker setup)"
