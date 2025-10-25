# 🚀 Deploy Seiso AI to Railway

## Prerequisites
- Railway account (sign up at railway.app)
- MongoDB Atlas account (for database)
- RPC endpoints (Alchemy, Infura, or QuickNode)

## Step 1: Prepare for Deployment

### 1.1 Set up MongoDB Atlas
1. Go to [MongoDB Atlas](https://cloud.mongodb.com)
2. Create a new cluster
3. Create a database user
4. Get your connection string (looks like: `mongodb+srv://username:password@cluster.mongodb.net/ai-image-generator`)

### 1.2 Get RPC Endpoints
1. Sign up for [Alchemy](https://alchemy.com) or [Infura](https://infura.io)
2. Create projects for each network:
   - Ethereum Mainnet
   - Polygon
   - Arbitrum
   - Optimism
   - Base
3. Copy the RPC URLs

## Step 2: Deploy to Railway

### 2.1 Connect Repository
1. Go to [Railway Dashboard](https://railway.app/dashboard)
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Choose your Seiso AI repository
5. Railway will automatically detect the configuration

### 2.2 Set Environment Variables
In Railway dashboard, go to Variables tab and add:

```bash
# Database (REQUIRED)
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/ai-image-generator

# Server Configuration
PORT=3001
NODE_ENV=production

# CORS Configuration (REQUIRED)
ALLOWED_ORIGINS=https://your-app-name.up.railway.app

# Security (REQUIRED - generate secure keys)
JWT_SECRET=your-super-secret-jwt-key-here-32-chars-min
SESSION_SECRET=your-session-secret-here-32-chars-min

# Payment Wallets (REQUIRED - replace with your actual addresses)
ETH_PAYMENT_WALLET=0xa0aE05e2766A069923B2a51011F270aCadFf023a
POLYGON_PAYMENT_WALLET=0xa0aE05e2766A069923B2a51011F270aCadFf023a
ARBITRUM_PAYMENT_WALLET=0xa0aE05e2766A069923B2a51011F270aCadFf023a
OPTIMISM_PAYMENT_WALLET=0xa0aE05e2766A069923B2a51011F270aCadFf023a
BASE_PAYMENT_WALLET=0xa0aE05e2766A069923B2a51011F270aCadFf023a
SOLANA_PAYMENT_WALLET=BZ9LR3nnVP4oh477rZAKdhGFAbYqvazv3Ru1MDk9rk99

# RPC Endpoints (REQUIRED - replace with your actual URLs)
ETH_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY
POLYGON_RPC_URL=https://polygon-mainnet.g.alchemy.com/v2/YOUR_API_KEY
ARBITRUM_RPC_URL=https://arb-mainnet.g.alchemy.com/v2/YOUR_API_KEY
OPTIMISM_RPC_URL=https://opt-mainnet.g.alchemy.com/v2/YOUR_API_KEY
BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_API_KEY

# FAL.ai API Configuration
FAL_API_KEY=a04e2397-ea04-41e8-9369-764c5bb18bb5:daf42f52c61eb5f089e094eee3bd4547

# FastAPI Configuration
FASTAPI_URL=https://your-fastapi-domain.com
FASTAPI_ENABLED=true

# Stripe Configuration (OPTIONAL)
STRIPE_SECRET_KEY=sk_live_your_stripe_secret_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
```

### 2.3 Deploy
1. Railway will automatically start building and deploying
2. Wait for the build to complete (usually 2-5 minutes)
3. Check the logs for any errors

## Step 3: Verify Deployment

### 3.1 Test Health Endpoint
Visit: `https://your-app-name.up.railway.app/api/health`

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2025-10-25T04:37:46.176Z",
  "uptime": 39.756536708,
  "environment": "production",
  "database": "connected"
}
```

### 3.2 Test API Endpoints
- Health: `GET /api/health`
- Metrics: `GET /api/metrics`
- User data: `GET /api/users/:walletAddress`

## Step 4: Update Frontend

### 4.1 Update API URL
In your frontend environment variables, update:
```bash
VITE_API_URL=https://your-app-name.up.railway.app
```

### 4.2 Deploy Frontend
Deploy your frontend to Vercel, Netlify, or Railway as well.

## Troubleshooting

### Common Issues:

1. **Build Fails**
   - Check Railway logs for specific errors
   - Ensure all dependencies are in package.json
   - Verify Dockerfile syntax

2. **Database Connection Fails**
   - Verify MongoDB URI is correct
   - Check MongoDB Atlas network access settings
   - Ensure database user has proper permissions

3. **CORS Errors**
   - Update ALLOWED_ORIGINS with your frontend domain
   - Check that frontend is using correct API URL

4. **RPC Errors**
   - Verify RPC URLs are correct and active
   - Check API key limits and quotas

### Debug Commands:
```bash
# Check Railway logs
railway logs

# Check service status
railway status

# Connect to service
railway connect
```

## Production Checklist

- [ ] MongoDB Atlas cluster created and accessible
- [ ] RPC endpoints configured and tested
- [ ] Environment variables set in Railway
- [ ] Payment wallet addresses updated
- [ ] CORS origins configured
- [ ] Health check endpoint responding
- [ ] Frontend updated with production API URL
- [ ] SSL certificates working
- [ ] Monitoring set up (optional)

## Support

If you encounter issues:
1. Check Railway deployment logs
2. Verify all environment variables are set
3. Test individual components (database, RPC endpoints)
4. Check the troubleshooting section above
