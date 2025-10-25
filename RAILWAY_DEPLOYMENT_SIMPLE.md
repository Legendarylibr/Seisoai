# Railway Deployment Guide - Simplified

## Quick Deploy to Railway

### 1. Prerequisites
- Railway account
- MongoDB Atlas database
- RPC endpoints for blockchain networks

### 2. Environment Variables
Set these in your Railway project:

```bash
# Database (REQUIRED)
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/ai-image-generator

# Server Configuration
PORT=3001
NODE_ENV=production

# Security (REQUIRED)
JWT_SECRET=your-super-secret-jwt-key-here-32-chars-min
SESSION_SECRET=your-session-secret-here-32-chars-min

# CORS Configuration (REQUIRED)
ALLOWED_ORIGINS=https://your-frontend-domain.com

# Payment Wallets (REQUIRED)
ETH_PAYMENT_WALLET=0xa0aE05e2766A069923B2a51011F270aCadFf023a
POLYGON_PAYMENT_WALLET=0xa0aE05e2766A069923B2a51011F270aCadFf023a
ARBITRUM_PAYMENT_WALLET=0xa0aE05e2766A069923B2a51011F270aCadFf023a
OPTIMISM_PAYMENT_WALLET=0xa0aE05e2766A069923B2a51011F270aCadFf023a
BASE_PAYMENT_WALLET=0xa0aE05e2766A069923B2a51011F270aCadFf023a
SOLANA_PAYMENT_WALLET=BZ9LR3nnVP4oh477rZAKdhGFAbYqvazv3Ru1MDk9rk99

# RPC Endpoints (REQUIRED)
ETH_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY
POLYGON_RPC_URL=https://polygon-mainnet.g.alchemy.com/v2/YOUR_API_KEY
ARBITRUM_RPC_URL=https://arb-mainnet.g.alchemy.com/v2/YOUR_API_KEY
OPTIMISM_RPC_URL=https://opt-mainnet.g.alchemy.com/v2/YOUR_API_KEY
BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_API_KEY

# Stripe Configuration (OPTIONAL)
STRIPE_SECRET_KEY=sk_live_your_stripe_secret_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
```

### 3. Deploy Steps
1. Connect your GitHub repository to Railway
2. Set environment variables in Railway dashboard
3. Deploy - Railway will automatically build and deploy
4. Your API will be available at the Railway-provided URL

### 4. Health Check
Visit `https://your-railway-url.railway.app/api/health` to verify deployment.

### 5. Frontend Configuration
Update your frontend's `VITE_API_URL` to point to your Railway backend URL.

## Simplified Features
- ✅ Wallet connection (EVM + Solana)
- ✅ Credit system
- ✅ Payment verification
- ✅ Image generation
- ✅ User management
- ✅ Gallery system
- ✅ Rate limiting
- ✅ Security headers
- ✅ Error handling

## Removed Complexity
- ❌ Sentry monitoring (simplified logging)
- ❌ Complex metrics collection
- ❌ Cron jobs (manual cleanup)
- ❌ MongoDB logging
- ❌ Data encryption (mongoose-encryption removed)
- ❌ Complex error tracking
