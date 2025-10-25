#!/bin/bash

# Production Environment Setup Script
echo "🔧 Setting up production environment for Railway deployment..."

# Generate secure random keys
JWT_SECRET=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)
SESSION_SECRET=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)
ENCRYPTION_KEY=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)
AUTHENTICATION_CODE=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)

echo "✅ Generated secure keys"

# Create production environment file
cat > backend/.env.production << EOF
# Backend Production Environment Configuration

# Database (REQUIRED - replace with your MongoDB Atlas connection string)
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/ai-image-generator

# FAL.ai API Configuration
FAL_API_KEY=a04e2397-ea04-41e8-9369-764c5bb18bb5:daf42f52c61eb5f089e094eee3bd4547

# Server Configuration
PORT=3001
NODE_ENV=production

# CORS Configuration (will be updated after frontend deploy)
ALLOWED_ORIGINS=https://your-frontend-domain.railway.app

# Payment Wallets (REQUIRED - replace with your actual wallet addresses)
ETH_PAYMENT_WALLET=0xa0aE05e2766A069923B2a51011F270aCadFf023a
POLYGON_PAYMENT_WALLET=0xa0aE05e2766A069923B2a51011F270aCadFf023a
ARBITRUM_PAYMENT_WALLET=0xa0aE05e2766A069923B2a51011F270aCadFf023a
OPTIMISM_PAYMENT_WALLET=0xa0aE05e2766A069923B2a51011F270aCadFf023a
BASE_PAYMENT_WALLET=0xa0aE05e2766A069923B2a51011F270aCadFf023a
SOLANA_PAYMENT_WALLET=BZ9LR3nnVP4oh477rZAKdhGFAbYqvazv3Ru1MDk9rk99

# RPC Endpoints (REQUIRED - replace with your actual RPC URLs)
ETH_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY
POLYGON_RPC_URL=https://polygon-mainnet.g.alchemy.com/v2/YOUR_API_KEY
ARBITRUM_RPC_URL=https://arb-mainnet.g.alchemy.com/v2/YOUR_API_KEY
OPTIMISM_RPC_URL=https://opt-mainnet.g.alchemy.com/v2/YOUR_API_KEY
BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_API_KEY

# Security Configuration (REQUIRED - generated secure keys)
JWT_SECRET=${JWT_SECRET}
SESSION_SECRET=${SESSION_SECRET}

# Data Encryption (REQUIRED - generated secure keys)
ENCRYPTION_KEY=${ENCRYPTION_KEY}
AUTHENTICATION_CODE=${AUTHENTICATION_CODE}

# Stripe Configuration (REQUIRED for card payments)
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here

# Rate Limiting Configuration
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
PAYMENT_RATE_LIMIT_WINDOW_MS=300000
PAYMENT_RATE_LIMIT_MAX_REQUESTS=10

# Logging Configuration
LOG_LEVEL=info
LOG_FILE_PATH=logs/

# Performance Configuration
MAX_REQUEST_SIZE=10mb
REQUEST_TIMEOUT=30000
EOF

echo "✅ Production environment file created: backend/.env.production"
echo ""
echo "🔑 Generated secure keys:"
echo "JWT_SECRET: ${JWT_SECRET}"
echo "SESSION_SECRET: ${SESSION_SECRET}"
echo "ENCRYPTION_KEY: ${ENCRYPTION_KEY}"
echo "AUTHENTICATION_CODE: ${AUTHENTICATION_CODE}"
echo ""
echo "📝 Next steps:"
echo "1. Set up MongoDB Atlas (see MONGODB_SETUP.md)"
echo "2. Update MONGODB_URI in backend/.env.production"
echo "3. Add your RPC endpoints"
echo "4. Deploy to Railway with these environment variables"
echo ""
echo "🚀 Ready for deployment!"
