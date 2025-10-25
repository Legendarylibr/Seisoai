# 🚀 Quick Railway Deployment Guide

## Option 1: Automated Script (Recommended)
```bash
./deploy-railway.sh
```

## Option 2: Manual Deployment

### 1. Install Railway CLI
```bash
npm install -g @railway/cli
```

### 2. Login to Railway
```bash
railway login
```

### 3. Initialize Project
```bash
railway init
```

### 4. Set Environment Variables
```bash
# Required
railway variables set NODE_ENV=production
railway variables set PORT=3001
railway variables set MONGODB_URI="mongodb+srv://username:password@cluster.mongodb.net/ai-image-generator"
railway variables set JWT_SECRET="your-32-character-secret-here"
railway variables set SESSION_SECRET="your-32-character-secret-here"
railway variables set ALLOWED_ORIGINS="https://your-frontend-domain.com"

# Payment Wallets
railway variables set ETH_PAYMENT_WALLET="0xa0aE05e2766A069923B2a51011F270aCadFf023a"
railway variables set POLYGON_PAYMENT_WALLET="0xa0aE05e2766A069923B2a51011F270aCadFf023a"
railway variables set ARBITRUM_PAYMENT_WALLET="0xa0aE05e2766A069923B2a51011F270aCadFf023a"
railway variables set OPTIMISM_PAYMENT_WALLET="0xa0aE05e2766A069923B2a51011F270aCadFf023a"
railway variables set BASE_PAYMENT_WALLET="0xa0aE05e2766A069923B2a51011F270aCadFf023a"
railway variables set SOLANA_PAYMENT_WALLET="BZ9LR3nnVP4oh477rZAKdhGFAbYqvazv3Ru1MDk9rk99"

# RPC Endpoints
railway variables set ETH_RPC_URL="https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY"
railway variables set POLYGON_RPC_URL="https://polygon-mainnet.g.alchemy.com/v2/YOUR_API_KEY"
railway variables set ARBITRUM_RPC_URL="https://arb-mainnet.g.alchemy.com/v2/YOUR_API_KEY"
railway variables set OPTIMISM_RPC_URL="https://opt-mainnet.g.alchemy.com/v2/YOUR_API_KEY"
railway variables set BASE_RPC_URL="https://base-mainnet.g.alchemy.com/v2/YOUR_API_KEY"

# Optional Stripe
railway variables set STRIPE_SECRET_KEY="sk_live_your_stripe_secret_key_here"
railway variables set STRIPE_WEBHOOK_SECRET="whsec_your_webhook_secret_here"
```

### 5. Deploy
```bash
railway up
```

### 6. Get Your API URL
```bash
railway domain
```

## Option 3: Railway Dashboard

1. Go to [railway.app](https://railway.app)
2. Connect your GitHub repository
3. Set environment variables in the dashboard
4. Deploy automatically

## ✅ Verification

Test your deployment:
```bash
curl https://your-railway-url.railway.app/api/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-XX...",
  "uptime": 123.45,
  "environment": "production",
  "database": "connected"
}
```

## 🔧 Frontend Configuration

Update your frontend `.env` file:
```bash
VITE_API_URL=https://your-railway-url.railway.app
```

## 🎉 You're Live!

Your simplified Seiso AI backend is now running on Railway with:
- ✅ Wallet connection (EVM + Solana)
- ✅ Payment verification
- ✅ Credit system
- ✅ Image generation
- ✅ User management
- ✅ Gallery system
