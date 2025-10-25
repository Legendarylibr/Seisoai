# 🚀 Railway Deployment Steps

## Step 1: Login to Railway
```bash
railway login
```
This will open a browser window for you to authenticate.

## Step 2: Create New Project
```bash
railway new
```
Choose a name for your project (e.g., "seiso-ai")

## Step 3: Deploy Backend
```bash
# Deploy the backend service
railway up --service backend

# Get the backend URL
railway domain
```

## Step 4: Set Backend Environment Variables
```bash
# Copy these commands and run them one by one:
railway variables set MONGODB_URI="mongodb+srv://username:password@cluster.mongodb.net/ai-image-generator"
railway variables set JWT_SECRET="your-super-secret-jwt-key-here"
railway variables set SESSION_SECRET="your-session-secret-here"
railway variables set ENCRYPTION_KEY="your-32-character-encryption-key-here"
railway variables set ETH_PAYMENT_WALLET="0xa0aE05e2766A069923B2a51011F270aCadFf023a"
railway variables set POLYGON_PAYMENT_WALLET="0xa0aE05e2766A069923B2a51011F270aCadFf023a"
railway variables set ARBITRUM_PAYMENT_WALLET="0xa0aE05e2766A069923B2a51011F270aCadFf023a"
railway variables set OPTIMISM_PAYMENT_WALLET="0xa0aE05e2766A069923B2a51011F270aCadFf023a"
railway variables set BASE_PAYMENT_WALLET="0xa0aE05e2766A069923B2a51011F270aCadFf023a"
railway variables set SOLANA_PAYMENT_WALLET="BZ9LR3nnVP4oh477rZAKdhGFAbYqvazv3Ru1MDk9rk99"
railway variables set ETH_RPC_URL="https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY"
railway variables set POLYGON_RPC_URL="https://polygon-mainnet.g.alchemy.com/v2/YOUR_API_KEY"
railway variables set ARBITRUM_RPC_URL="https://arb-mainnet.g.alchemy.com/v2/YOUR_API_KEY"
railway variables set OPTIMISM_RPC_URL="https://opt-mainnet.g.alchemy.com/v2/YOUR_API_KEY"
railway variables set BASE_RPC_URL="https://base-mainnet.g.alchemy.com/v2/YOUR_API_KEY"
railway variables set FAL_API_KEY="a04e2397-ea04-41e8-9369-764c5bb18bb5:daf42f52c61eb5f089e094eee3bd4547"
railway variables set NODE_ENV="production"
railway variables set PORT="3001"
railway variables set ALLOWED_ORIGINS="https://your-frontend-domain.railway.app"
```

## Step 5: Deploy Frontend
```bash
# Add frontend service
railway add --service frontend

# Deploy frontend
railway up --service frontend

# Get frontend URL
railway domain --service frontend
```

## Step 6: Set Frontend Environment Variables
```bash
# Get your backend URL first (from Step 3)
BACKEND_URL=$(railway domain)

# Set frontend variables
railway variables set VITE_API_URL="$BACKEND_URL" --service frontend
railway variables set VITE_FAL_API_KEY="a04e2397-ea04-41e8-9369-764c5bb18bb5:daf42f52c61eb5f089e094eee3bd4547" --service frontend
railway variables set VITE_ETH_PAYMENT_WALLET="0xa0aE05e2766A069923B2a51011F270aCadFf023a" --service frontend
railway variables set VITE_POLYGON_PAYMENT_WALLET="0xa0aE05e2766A069923B2a51011F270aCadFf023a" --service frontend
railway variables set VITE_ARBITRUM_PAYMENT_WALLET="0xa0aE05e2766A069923B2a51011F270aCadFf023a" --service frontend
railway variables set VITE_OPTIMISM_PAYMENT_WALLET="0xa0aE05e2766A069923B2a51011F270aCadFf023a" --service frontend
railway variables set VITE_BASE_PAYMENT_WALLET="0xa0aE05e2766A069923B2a51011F270aCadFf023a" --service frontend
railway variables set VITE_SOLANA_PAYMENT_WALLET="BZ9LR3nnVP4oh477rZAKdhGFAbYqvazv3Ru1MDk9rk99" --service frontend
railway variables set VITE_STRIPE_PUBLISHABLE_KEY="pk_test_your_stripe_publishable_key_here" --service frontend
```

## Step 7: Update CORS Settings
```bash
# Get both URLs
BACKEND_URL=$(railway domain)
FRONTEND_URL=$(railway domain --service frontend)

# Update CORS to allow frontend
railway variables set ALLOWED_ORIGINS="$FRONTEND_URL,$BACKEND_URL"
```

## 🚨 IMPORTANT: Before Starting

1. **Set up MongoDB Atlas** (if not done):
   - Go to [MongoDB Atlas](https://www.mongodb.com/atlas)
   - Create free cluster
   - Get connection string
   - Replace `mongodb+srv://username:password@cluster.mongodb.net/ai-image-generator` in Step 4

2. **Get Alchemy API Keys** (if not done):
   - Go to [Alchemy](https://www.alchemy.com/)
   - Create account
   - Get API keys for each network
   - Replace `YOUR_API_KEY` in Step 4

## 🎯 Quick Start Commands

```bash
# 1. Login
railway login

# 2. Create project
railway new

# 3. Deploy backend
railway up --service backend

# 4. Set environment variables (copy from Step 4 above)

# 5. Deploy frontend
railway add --service frontend
railway up --service frontend

# 6. Set frontend variables (copy from Step 6 above)

# 7. Test deployment
railway status
```

## ✅ Verification

After deployment, test these URLs:
- Backend health: `https://your-backend-url.railway.app/api/health`
- Frontend: `https://your-frontend-url.railway.app`
