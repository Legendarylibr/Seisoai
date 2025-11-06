# 🚀 Railway Deployment Guide for Seiso AI

## Quick Railway Deployment (5 minutes)

### Step 1: Prepare Your Repository
1. **Push your code to GitHub** (if not already done):
   ```bash
   git add .
   git commit -m "Ready for Railway deployment"
   git push origin main
   ```

### Step 2: Deploy to Railway
1. **Go to [Railway.app](https://railway.app)**
2. **Sign up/Login** with GitHub
3. **Click "New Project"**
4. **Select "Deploy from GitHub repo"**
5. **Choose your Seiso AI repository**
6. **Railway will automatically detect it's a Node.js app**

### Step 3: Configure Environment Variables
1. **Go to your project dashboard**
2. **Click on "Variables" tab**
3. **Add these required variables** (copy from `railway.env.example`):

#### **Required Variables:**
```bash
# Database (Railway will provide MongoDB automatically)
MONGODB_URI=mongodb://username:password@host:port/database

# Server
NODE_ENV=production
PORT=3001

# CORS (Railway will provide your domain)
ALLOWED_ORIGINS=https://your-app-name.up.railway.app

# Payment Wallets (REQUIRED - replace with your actual addresses)
ETH_PAYMENT_WALLET=0x1234567890123456789012345678901234567890
POLYGON_PAYMENT_WALLET=0x1234567890123456789012345678901234567890
ARBITRUM_PAYMENT_WALLET=0x1234567890123456789012345678901234567890
OPTIMISM_PAYMENT_WALLET=0x1234567890123456789012345678901234567890
BASE_PAYMENT_WALLET=0x1234567890123456789012345678901234567890
SOLANA_PAYMENT_WALLET=So11111111111111111111111111111111111111112

# RPC Endpoints (REQUIRED - get from Alchemy)
ETH_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY
POLYGON_RPC_URL=https://polygon-mainnet.g.alchemy.com/v2/YOUR_API_KEY
ARBITRUM_RPC_URL=https://arb-mainnet.g.alchemy.com/v2/YOUR_API_KEY
OPTIMISM_RPC_URL=https://opt-mainnet.g.alchemy.com/v2/YOUR_API_KEY
BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_API_KEY

# Stripe Configuration - LIVE MODE
STRIPE_SECRET_KEY=sk_live_your_stripe_secret_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here

# Security (REQUIRED - generate secure keys)
ENCRYPTION_KEY=your-32-character-encryption-key-here
JWT_SECRET=your-super-secret-jwt-key-here
SESSION_SECRET=your-session-secret-here
```

### Step 4: Add MongoDB Database
1. **In Railway dashboard, click "New"**
2. **Select "Database"**
3. **Choose "MongoDB"**
4. **Railway will automatically connect it to your app**

### Step 5: Deploy Frontend (Optional)
For a complete deployment, you can also deploy the frontend:

1. **Create a new Railway project for frontend**
2. **Connect the same GitHub repo**
3. **Set build command**: `npm run build`
4. **Set start command**: `npx serve dist`
5. **Add frontend environment variables**:
   ```bash
   VITE_FAL_API_KEY=your_actual_fal_api_key
   VITE_API_URL=https://your-backend-app.up.railway.app
   VITE_STRIPE_PUBLISHABLE_KEY=pk_live_your_stripe_key
   ```

### Step 6: Configure Domain (Optional)
1. **Go to "Settings" tab**
2. **Click "Generate Domain"** for a custom subdomain
3. **Or add your own domain** in "Custom Domains"

## 🎉 Your App is Live!

Once deployed, your app will be available at:
- **Backend**: `https://your-app-name.up.railway.app`
- **Frontend**: `https://your-frontend-app.up.railway.app` (if deployed separately)

## 🔧 Post-Deployment Setup

### 1. Test Your Deployment
```bash
# Test backend health
curl https://your-app-name.up.railway.app/api/health

# Test frontend
curl https://your-app-name.up.railway.app/
```

### 2. Configure Stripe Webhook
1. **Go to Stripe Dashboard → Webhooks**
2. **Add endpoint**: `https://your-app-name.up.railway.app/api/stripe/webhook`
3. **Select events**: `payment_intent.succeeded`
4. **Copy webhook secret** to Railway environment variables

### 3. Set Up Monitoring
1. **Add Sentry DSN** to environment variables
2. **Monitor logs** in Railway dashboard
3. **Set up alerts** for errors

## 💰 Railway Pricing

- **Hobby Plan**: $5/month (includes $5 credit)
- **Pro Plan**: $20/month (includes $20 credit)
- **Pay-as-you-go**: $0.10 per GB-hour

## 🆘 Troubleshooting

### Common Issues:
1. **Build fails**: Check environment variables are set correctly
2. **Database connection**: Verify MongoDB URI is correct
3. **CORS errors**: Check ALLOWED_ORIGINS includes your domain
4. **Payment failures**: Verify RPC endpoints and API keys

### Railway Logs:
- **View logs**: Railway dashboard → Deployments → View Logs
- **Debug**: Check build logs and runtime logs

## 📈 Scaling

Railway automatically scales your app based on traffic. For high-traffic apps:
- **Upgrade to Pro plan** for better performance
- **Add Redis** for caching
- **Use CDN** for static assets

---

**🎉 Your Seiso AI app is now live on Railway!**
