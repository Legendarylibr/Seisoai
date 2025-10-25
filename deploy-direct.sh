#!/bin/bash

echo "🚀 DEPLOYING TO PROJECT: ee55e7fa-b010-4946-a87b-013e15e329a8"

# Build the frontend
echo "📦 Building frontend..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed"
    exit 1
fi

echo "✅ Build successful"

# Try to deploy with Railway CLI
echo "🚀 Attempting Railway deployment..."

# Method 1: Try with project ID in environment
RAILWAY_PROJECT_ID=ee55e7fa-b010-4946-a87b-013e15e329a8 railway up

if [ $? -eq 0 ]; then
    echo "✅ Deployed successfully!"
    railway domain
    exit 0
fi

# Method 2: Try with project configuration
echo "🔄 Trying alternative deployment method..."

# Create a temporary railway config
cat > railway-temp.json << 'EOF'
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "runtime": "V2",
    "numReplicas": 1,
    "healthcheckPath": "/",
    "sleepApplication": false,
    "useLegacyStacker": false,
    "restartPolicyType": "ON_FAILURE",
    "healthcheckTimeout": 30,
    "restartPolicyMaxRetries": 3,
    "startCommand": "npm run build:frontend"
  }
}
EOF

# Try deploying with the temp config
railway up

echo ""
echo "🎯 If CLI deployment failed, use manual deployment:"
echo "1. Go to: https://railway.com/project/ee55e7fa-b010-4946-a87b-013e15e329a8"
echo "2. Add new service from GitHub repo"
echo "3. Set start command: npm run build:frontend"
echo "4. Set env vars: NODE_ENV=production, VITE_API_URL=https://seisoai-prod.up.railway.app"
echo "5. Deploy!"