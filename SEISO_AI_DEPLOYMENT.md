# 🚀 Seiso.ai Deployment Guide

## Quick Deploy for seiso.ai

### Prerequisites
- Railway account
- MongoDB Atlas database
- RPC endpoints (Alchemy/Infura)
- Your seiso.ai domain

### Step 1: Install Railway CLI
```bash
npm install -g @railway/cli
```

### Step 2: Login to Railway
```bash
railway login
```

### Step 3: Run Deployment Script
```bash
./deploy-seiso-ai.sh
```

## Manual Deployment Steps

### 1. Initialize Railway Project
```bash
railway init
```

### 2. Set Environment Variables
```bash
# Required
railway variables set NODE_ENV=production
railway variables set PORT=3001
railway variables set MONGODB_URI="mongodb+srv://username:password@cluster.mongodb.net/seiso-ai"
railway variables set JWT_SECRET="your-32-character-secret-here"
railway variables set SESSION_SECRET="your-32-character-secret-here"
railway variables set ALLOWED_ORIGINS="https://seiso.ai,https://www.seiso.ai,http://localhost:5173"

# Payment Wallets (replace with your actual addresses)
railway variables set ETH_PAYMENT_WALLET="0xa0aE05e2766A069923B2a51011F270aCadFf023a"
railway variables set POLYGON_PAYMENT_WALLET="0xa0aE05e2766A069923B2a51011F270aCadFf023a"
railway variables set ARBITRUM_PAYMENT_WALLET="0xa0aE05e2766A069923B2a51011F270aCadFf023a"
railway variables set OPTIMISM_PAYMENT_WALLET="0xa0aE05e2766A069923B2a51011F270aCadFf023a"
railway variables set BASE_PAYMENT_WALLET="0xa0aE05e2766A069923B2a51011F270aCadFf023a"
railway variables set SOLANA_PAYMENT_WALLET="BZ9LR3nnVP4oh477rZAKdhGFAbYqvazv3Ru1MDk9rk99"

# RPC Endpoints (get from Alchemy/Infura)
railway variables set ETH_RPC_URL="https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY"
railway variables set POLYGON_RPC_URL="https://polygon-mainnet.g.alchemy.com/v2/YOUR_API_KEY"
railway variables set ARBITRUM_RPC_URL="https://arb-mainnet.g.alchemy.com/v2/YOUR_API_KEY"
railway variables set OPTIMISM_RPC_URL="https://opt-mainnet.g.alchemy.com/v2/YOUR_API_KEY"
railway variables set BASE_RPC_URL="https://base-mainnet.g.alchemy.com/v2/YOUR_API_KEY"

# Optional Stripe
railway variables set STRIPE_SECRET_KEY="sk_live_your_stripe_secret_key_here"
railway variables set STRIPE_WEBHOOK_SECRET="whsec_your_webhook_secret_here"
```

### 3. Deploy
```bash
railway up
```

### 4. Get API URL
```bash
railway domain
```

## Frontend Configuration for seiso.ai

Update your frontend `.env` file:
```bash
VITE_API_URL=https://your-railway-app.railway.app
VITE_CDN_URL=https://seiso.ai
```

## Domain Configuration

### Option 1: Use Railway Subdomain
- Railway provides: `https://your-app.railway.app`
- Update frontend to use this URL

### Option 2: Custom Domain (seiso.ai)
1. In Railway dashboard, go to your project
2. Go to Settings > Domains
3. Add custom domain: `api.seiso.ai`
4. Update DNS records as instructed
5. Update frontend: `VITE_API_URL=https://api.seiso.ai`

## Testing Your Deployment

### Health Check
```bash
curl https://your-railway-app.railway.app/api/health
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

### Test Wallet Connection
1. Open your seiso.ai frontend
2. Connect wallet (MetaMask, Phantom, etc.)
3. Verify credits are loaded
4. Test image generation

## Production Checklist

- [ ] MongoDB Atlas database configured
- [ ] RPC endpoints working
- [ ] Payment wallets set correctly
- [ ] CORS configured for seiso.ai domain
- [ ] Frontend deployed and connected to API
- [ ] SSL certificates working
- [ ] Health check endpoint responding
- [ ] Wallet connection working
- [ ] Payment flows tested

## Support

If you encounter issues:
1. Check Railway logs: `railway logs`
2. Verify environment variables: `railway variables`
3. Test API endpoints manually
4. Check frontend console for errors

## 🎉 You're Live!

Your simplified Seiso AI backend is now running on Railway with:
- ✅ Wallet connection (EVM + Solana)
- ✅ Payment verification
- ✅ Credit system
- ✅ Image generation
- ✅ User management
- ✅ Gallery system
- ✅ Optimized for seiso.ai domain
