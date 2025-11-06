# 🚀 Railway Frontend Deployment Guide

## Deploy Your Seiso AI Frontend to Railway

### Step 1: Create New Railway Service

1. **Go to your Railway dashboard**: https://railway.app/dashboard
2. **Click on your existing project** (the one with your backend)
3. **Click "New Service"**
4. **Select "Deploy from GitHub repo"**
5. **Choose your Seiso AI repository**

### Step 2: Configure Frontend Service

1. **Railway will auto-detect it's a Vite project**
2. **Set these configurations**:
   - **Build Command**: `npm run build`
   - **Start Command**: `npx serve dist -s -l 3000`
   - **Root Directory**: Leave empty

### Step 3: Add Environment Variables

In your new frontend service, add these environment variables:

```bash
# API Configuration - Your Railway Backend URL
VITE_API_URL=https://your-backend-service.up.railway.app

# FAL.ai API Configuration
VITE_FAL_API_KEY=your_actual_fal_api_key_here

# FastAPI/ComfyUI Configuration (for free NFT users)
VITE_FASTAPI_URL=http://your-fastapi-server.com:8000
VITE_FASTAPI_ENABLED=true

# Payment Wallet Addresses (replace with your actual addresses)
VITE_ETH_PAYMENT_WALLET=0x1234567890123456789012345678901234567890
VITE_POLYGON_PAYMENT_WALLET=0x1234567890123456789012345678901234567890
VITE_ARBITRUM_PAYMENT_WALLET=0x1234567890123456789012345678901234567890
VITE_OPTIMISM_PAYMENT_WALLET=0x1234567890123456789012345678901234567890
VITE_BASE_PAYMENT_WALLET=0x1234567890123456789012345678901234567890
VITE_SOLANA_PAYMENT_WALLET=So11111111111111111111111111111111111111112

# Stripe Configuration (for credit card payments) - LIVE MODE
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_your_stripe_publishable_key_here

# Monitoring (optional)
VITE_SENTRY_DSN=your_sentry_dsn_here
```

### Step 4: Deploy

1. **Railway will automatically build and deploy**
2. **Wait for deployment to complete**
3. **Get your frontend URL** (something like `https://your-frontend-service.up.railway.app`)

### Step 5: Update Backend CORS

In your backend Railway service, update the `ALLOWED_ORIGINS` environment variable:

```bash
ALLOWED_ORIGINS=https://your-frontend-service.up.railway.app,https://your-backend-service.up.railway.app
```

## 🎯 Expected Result

Once deployed, you'll have:
- **Frontend**: `https://your-frontend-service.up.railway.app`
- **Backend**: `https://your-backend-service.up.railway.app`
- **Full-stack app** running on Railway
- **NFT holder routing** working
- **Payment system** ready

## 🔧 Troubleshooting

### If Build Fails:
- Check that all environment variables are set
- Verify the build command is `npm run build`
- Check Railway logs for specific errors

### If CORS Errors:
- Update `ALLOWED_ORIGINS` in backend to include frontend URL
- Redeploy backend after updating CORS

### If FastAPI Not Working:
- Make sure `VITE_FASTAPI_URL` points to your running FastAPI server
- Check that FastAPI server is accessible from the internet

## 🎉 You're Ready!

Your complete Seiso AI application will be live on Railway with:
- ✅ Smart NFT holder routing
- ✅ Free generation for NFT holders via FastAPI
- ✅ Paid generation for non-NFT holders via FAL.ai
- ✅ Multiple payment options (Stripe + Crypto)
- ✅ Full wallet integration
