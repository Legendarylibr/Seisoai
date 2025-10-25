# 🚀 DEPLOY NOW - Step by Step Guide

## 🎯 **Quick Deploy Options**

### **Option 1: Railway (Easiest)**

#### **Step 1: Set up MongoDB Atlas (REQUIRED)**
1. Go to [MongoDB Atlas](https://www.mongodb.com/atlas)
2. Create free account
3. Create cluster
4. Get connection string (looks like: `mongodb+srv://username:password@cluster.mongodb.net/database`)

#### **Step 2: Deploy Backend to Railway**
```bash
# Install Railway CLI (if not installed)
npm install -g @railway/cli

# Login to Railway
railway login

# Create new project
railway new

# Deploy backend
railway up --service backend

# Set environment variables
railway variables set MONGODB_URI="your_mongodb_connection_string"
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

# Get your backend URL
railway domain
```

#### **Step 3: Deploy Frontend to Railway**
```bash
# Create frontend service
railway add --service frontend

# Deploy frontend
railway up --service frontend

# Set frontend environment variables
railway variables set VITE_API_URL="https://your-backend-url.railway.app" --service frontend
railway variables set VITE_FAL_API_KEY="a04e2397-ea04-41e8-9369-764c5bb18bb5:daf42f52c61eb5f089e094eee3bd4547" --service frontend
railway variables set VITE_ETH_PAYMENT_WALLET="0xa0aE05e2766A069923B2a51011F270aCadFf023a" --service frontend
railway variables set VITE_POLYGON_PAYMENT_WALLET="0xa0aE05e2766A069923B2a51011F270aCadFf023a" --service frontend
railway variables set VITE_ARBITRUM_PAYMENT_WALLET="0xa0aE05e2766A069923B2a51011F270aCadFf023a" --service frontend
railway variables set VITE_OPTIMISM_PAYMENT_WALLET="0xa0aE05e2766A069923B2a51011F270aCadFf023a" --service frontend
railway variables set VITE_BASE_PAYMENT_WALLET="0xa0aE05e2766A069923B2a51011F270aCadFf023a" --service frontend
railway variables set VITE_SOLANA_PAYMENT_WALLET="BZ9LR3nnVP4oh477rZAKdhGFAbYqvazv3Ru1MDk9rk99" --service frontend

# Get your frontend URL
railway domain --service frontend
```

### **Option 2: Docker (Complete Stack)**

```bash
# Update docker.env with your values
nano docker.env

# Start the complete stack
./start-docker.sh

# Your app will be available at:
# Frontend: http://localhost:3001
# Backend: http://localhost:3001/api
# Grafana: http://localhost:3000
```

### **Option 3: Vercel + Railway**

#### **Deploy Backend to Railway** (same as Option 1, Step 2)

#### **Deploy Frontend to Vercel**
```bash
# Install Vercel CLI
npm install -g vercel

# Login to Vercel
vercel login

# Deploy frontend
vercel

# Set environment variables in Vercel dashboard:
# VITE_API_URL=https://your-backend-url.railway.app
# VITE_FAL_API_KEY=a04e2397-ea04-41e8-9369-764c5bb18bb5:daf42f52c61eb5f089e094eee3bd4547
# (and all other VITE_ variables from seiso.env)
```

## 🔧 **Quick Setup Scripts**

I've created these files for you:
- `backend.env` - Backend environment variables
- `production.env` - Frontend environment variables
- `docker.env` - Docker environment variables
- `start-docker.sh` - Docker startup script

## ⚡ **Fastest Deploy (Docker)**

If you want to deploy immediately:

```bash
# 1. Update docker.env with your MongoDB connection string
nano docker.env

# 2. Start everything
./start-docker.sh

# 3. Your app is running!
```

## 🚨 **CRITICAL: Before Deploying**

1. **Set up MongoDB Atlas** - Get your connection string
2. **Replace placeholder URLs** with your actual domains
3. **Generate secure keys** for JWT_SECRET, SESSION_SECRET, ENCRYPTION_KEY
4. **Get Alchemy API keys** for RPC endpoints

## 📋 **Deployment Checklist**

- [ ] MongoDB Atlas set up
- [ ] Environment variables configured
- [ ] Backend deployed
- [ ] Frontend deployed
- [ ] URLs updated
- [ ] Health checks passing
- [ ] Test the application

## 🆘 **Need Help?**

Run any of these commands for assistance:
- `./copy-env.sh` - Show all environment variables
- `./start-docker.sh` - Start Docker deployment
- `railway status` - Check Railway deployment status
