# 🚀 Quick Deploy with MongoDB

## Your MongoDB Connection String
```
mongodb+srv://legendarylibraries_db_user:<db_password>@cluster0.yqlccoa.mongodb.net/?appName=Cluster0
```

## Step 1: Install Railway CLI
```bash
npm install -g @railway/cli
```

## Step 2: Login to Railway
```bash
railway login
```
This will open your browser to authenticate.

## Step 3: Initialize Project
```bash
railway init
```

## Step 4: Set Environment Variables
```bash
# Required
railway variables set NODE_ENV=production
railway variables set PORT=3001
railway variables set MONGODB_URI="mongodb+srv://legendarylibraries_db_user:<db_password>@cluster0.yqlccoa.mongodb.net/?appName=Cluster0"
railway variables set JWT_SECRET="your-32-character-secret-here"
railway variables set SESSION_SECRET="your-32-character-secret-here"
railway variables set ALLOWED_ORIGINS="https://seiso.ai,https://www.seiso.ai,http://localhost:5173"

# Payment Wallets
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
```

## Step 5: Deploy
```bash
railway up
```

## Step 6: Get API URL
```bash
railway domain
```

## Step 7: Test Your API
```bash
curl https://your-railway-app.railway.app/api/health
```

## Frontend Configuration
Update your frontend `.env` file:
```bash
VITE_API_URL=https://your-railway-app.railway.app
VITE_CDN_URL=https://seiso.ai
```

## 🎉 You're Live!

Your Seiso AI backend is now running on Railway with:
- ✅ MongoDB Atlas database (cluster0.yqlccoa.mongodb.net)
- ✅ Wallet connection (EVM + Solana)
- ✅ Payment verification
- ✅ Credit system
- ✅ Image generation
- ✅ User management
- ✅ Gallery system
- ✅ Optimized for seiso.ai domain
