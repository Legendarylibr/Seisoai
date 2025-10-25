#!/bin/bash

# Development Environment Setup Script
echo "🔧 Setting up development environment..."

# Create backend .env file
cat > backend/.env << 'EOF'
# Backend Development Environment Configuration

# Database (REQUIRED - replace with your MongoDB Atlas connection string)
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/ai-image-generator

# FAL.ai API Configuration
FAL_API_KEY=a04e2397-ea04-41e8-9369-764c5bb18bb5:daf42f52c61eb5f089e094eee3bd4547

# Server Configuration
PORT=3001
NODE_ENV=development

# CORS Configuration (for development)
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:3000

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

# Security Configuration (REQUIRED - generate secure keys)
JWT_SECRET=dev-jwt-secret-key-32-chars-minimum
SESSION_SECRET=dev-session-secret-32-chars-minimum

# Data Encryption (REQUIRED - must be exactly 32 characters for AES-256)
ENCRYPTION_KEY=dev-encryption-key-32-chars-min
AUTHENTICATION_CODE=dev-auth-code-32-chars-min

# Stripe Configuration (REQUIRED for card payments)
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here

# Rate Limiting Configuration
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=1000
PAYMENT_RATE_LIMIT_WINDOW_MS=300000
PAYMENT_RATE_LIMIT_MAX_REQUESTS=10

# Logging Configuration
LOG_LEVEL=info
LOG_FILE_PATH=logs/

# Performance Configuration
MAX_REQUEST_SIZE=10mb
REQUEST_TIMEOUT=30000
EOF

# Create frontend .env file
cat > .env << 'EOF'
# Frontend Environment Configuration
# This file is used by Vite for frontend environment variables

# FAL.ai API Configuration
VITE_FAL_API_KEY=a04e2397-ea04-41e8-9369-764c5bb18bb5:daf42f52c61eb5f089e094eee3bd4547

# API Configuration - Update this to your actual Railway URL
VITE_API_URL=http://localhost:3001

# CDN Configuration (for production)
VITE_CDN_URL=https://seiso.ai

# Payment Wallet Addresses (REQUIRED)
VITE_ETH_PAYMENT_WALLET=0xa0aE05e2766A069923B2a51011F270aCadFf023a
VITE_POLYGON_PAYMENT_WALLET=0xa0aE05e2766A069923B2a51011F270aCadFf023a
VITE_ARBITRUM_PAYMENT_WALLET=0xa0aE05e2766A069923B2a51011F270aCadFf023a
VITE_OPTIMISM_PAYMENT_WALLET=0xa0aE05e2766A069923B2a51011F270aCadFf023a
VITE_BASE_PAYMENT_WALLET=0xa0aE05e2766A069923B2a51011F270aCadFf023a
VITE_SOLANA_PAYMENT_WALLET=BZ9LR3nnVP4oh477rZAKdhGFAbYqvazv3Ru1MDk9rk99

# Monitoring Configuration
VITE_SENTRY_DSN=your_sentry_dsn_here

# Feature Flags
VITE_ENABLE_ANALYTICS=true
VITE_ENABLE_ERROR_REPORTING=true
VITE_ENABLE_PERFORMANCE_MONITORING=true

# Stripe Configuration (REQUIRED for card payments)
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_publishable_key_here
EOF

echo "✅ Environment files created successfully!"
echo ""
echo "📝 Next steps:"
echo "1. Update the MongoDB URI in backend/.env with your actual connection string"
echo "2. Update the RPC URLs in backend/.env with your actual API keys"
echo "3. Update the Stripe keys if you want to use card payments"
echo "4. Run 'npm run dev' to start the development server"
echo ""
echo "🚀 Your development environment is ready!"
