# 🚀 Seiso AI - Railway Deployment Guide

## Quick Deploy Steps

### 1. Prerequisites
- [ ] Railway account (sign up at railway.app)
- [ ] MongoDB Atlas account (sign up at mongodb.com/atlas)
- [ ] GitHub repository connected to Railway

### 2. Set Up MongoDB Atlas

1. **Create MongoDB Atlas Account**
   - Go to https://mongodb.com/atlas
   - Sign up for free account
   - Create a new cluster (free tier available)

2. **Get Connection String**
   - In Atlas dashboard, click "Connect"
   - Choose "Connect your application"
   - Copy the connection string
   - Replace `<password>` with your actual password
   - Replace `<dbname>` with `ai-image-generator`

3. **Example Connection String:**
   ```
   mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/ai-image-generator?retryWrites=true&w=majority
   ```

### 3. Deploy Backend to Railway

1. **Connect Repository**
   - Go to Railway dashboard
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose your repository

2. **Configure Service**
   - Railway will detect the Dockerfile
   - Set the service name to "seiso-ai-backend"

3. **Set Environment Variables**
   Copy these to Railway environment variables:

   ```bash
   # Database (REQUIRED)
   MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/ai-image-generator
   
   # Server Configuration
   PORT=3001
   NODE_ENV=production
   
   # Security (REQUIRED - generate secure keys)
   JWT_SECRET=your-super-secret-jwt-key-here-32-chars-min
   SESSION_SECRET=your-session-secret-here-32-chars-min
   
   # CORS Configuration (will be updated after frontend deploy)
   ALLOWED_ORIGINS=https://your-frontend-domain.railway.app
   
   # Payment Wallets (REQUIRED)
   ETH_PAYMENT_WALLET=0xa0aE05e2766A069923B2a51011F270aCadFf023a
   POLYGON_PAYMENT_WALLET=0xa0aE05e2766A069923B2a51011F270aCadFf023a
   ARBITRUM_PAYMENT_WALLET=0xa0aE05e2766A069923B2a51011F270aCadFf023a
   OPTIMISM_PAYMENT_WALLET=0xa0aE05e2766A069923B2a51011F270aCadFf023a
   BASE_PAYMENT_WALLET=0xa0aE05e2766A069923B2a51011F270aCadFf023a
   SOLANA_PAYMENT_WALLET=BZ9LR3nnVP4oh477rZAKdhGFAbYqvazv3Ru1MDk9rk99
   
   # RPC Endpoints (REQUIRED - get from Alchemy/Infura)
   ETH_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY
   POLYGON_RPC_URL=https://polygon-mainnet.g.alchemy.com/v2/YOUR_API_KEY
   ARBITRUM_RPC_URL=https://arb-mainnet.g.alchemy.com/v2/YOUR_API_KEY
   OPTIMISM_RPC_URL=https://opt-mainnet.g.alchemy.com/v2/YOUR_API_KEY
   BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_API_KEY
   
   # Data Encryption (REQUIRED - 32 characters)
   ENCRYPTION_KEY=your-32-character-encryption-key-here
   AUTHENTICATION_CODE=your-authentication-code-here
   
   # Stripe Configuration (Optional)
   STRIPE_SECRET_KEY=sk_live_your_stripe_secret_key_here
   STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
   ```

4. **Deploy**
   - Railway will automatically build and deploy
   - Wait for deployment to complete
   - Note the backend URL (e.g., `https://seiso-ai-backend-production.up.railway.app`)

### 4. Deploy Frontend to Railway

1. **Create New Service**
   - In same Railway project, click "New Service"
   - Choose "Deploy from GitHub repo"
   - Select same repository

2. **Configure Frontend Service**
   - Set service name to "seiso-ai-frontend"
   - Railway will detect it's a Vite project

3. **Set Frontend Environment Variables**
   ```bash
   # API Configuration
   VITE_API_URL=https://your-backend-url.railway.app
   
   # FAL.ai API Key
   VITE_FAL_API_KEY=a04e2397-ea04-41e8-9369-764c5bb18bb5:daf42f52c61eb5f089e094eee3bd4547
   
   # Payment Wallets
   VITE_ETH_PAYMENT_WALLET=0xa0aE05e2766A069923B2a51011F270aCadFf023a
   VITE_POLYGON_PAYMENT_WALLET=0xa0aE05e2766A069923B2a51011F270aCadFf023a
   VITE_ARBITRUM_PAYMENT_WALLET=0xa0aE05e2766A069923B2a51011F270aCadFf023a
   VITE_OPTIMISM_PAYMENT_WALLET=0xa0aE05e2766A069923B2a51011F270aCadFf023a
   VITE_BASE_PAYMENT_WALLET=0xa0aE05e2766A069923B2a51011F270aCadFf023a
   VITE_SOLANA_PAYMENT_WALLET=BZ9LR3nnVP4oh477rZAKdhGFAbYqvazv3Ru1MDk9rk99
   
   # Stripe (Optional)
   VITE_STRIPE_PUBLISHABLE_KEY=pk_live_your_stripe_publishable_key_here
   ```

4. **Deploy Frontend**
   - Railway will build and deploy the frontend
   - Note the frontend URL (e.g., `https://seiso-ai-frontend-production.up.railway.app`)

### 5. Update CORS Configuration

1. **Update Backend CORS**
   - Go to backend service in Railway
   - Update `ALLOWED_ORIGINS` environment variable:
   ```
   ALLOWED_ORIGINS=https://your-frontend-url.railway.app
   ```
   - Redeploy the backend service

### 6. Test Deployment

1. **Health Check**
   - Visit: `https://your-backend-url.railway.app/api/health`
   - Should return: `{"status":"healthy","database":"connected"}`

2. **Frontend Test**
   - Visit your frontend URL
   - Try connecting a wallet
   - Test image generation

### 7. Custom Domain (Optional)

1. **Add Custom Domain**
   - In Railway dashboard, go to your frontend service
   - Click "Settings" → "Domains"
   - Add your custom domain
   - Update DNS records as instructed

2. **Update Environment Variables**
   - Update `ALLOWED_ORIGINS` in backend
   - Update `VITE_API_URL` in frontend if needed

## 🔧 Troubleshooting

### Common Issues:

1. **MongoDB Connection Failed**
   - Check MongoDB Atlas IP whitelist (add 0.0.0.0/0 for Railway)
   - Verify connection string format
   - Check username/password

2. **CORS Errors**
   - Ensure `ALLOWED_ORIGINS` includes your frontend URL
   - Check for trailing slashes in URLs

3. **Build Failures**
   - Check Railway build logs
   - Ensure all dependencies are in package.json
   - Verify Dockerfile syntax

4. **Environment Variables**
   - Double-check all required variables are set
   - Ensure no typos in variable names
   - Verify values don't have extra spaces

## 📊 Monitoring

- **Railway Dashboard**: Monitor logs, metrics, and deployments
- **MongoDB Atlas**: Monitor database performance
- **Health Endpoint**: `https://your-backend-url.railway.app/api/health`

## 🎉 Success!

Your Seiso AI application should now be live and accessible at your Railway URLs!

- **Frontend**: `https://your-frontend-url.railway.app`
- **Backend API**: `https://your-backend-url.railway.app`
- **Health Check**: `https://your-backend-url.railway.app/api/health`