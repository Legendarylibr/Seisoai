# Deploy Frontend to Existing Railway Project

## Your Target Project
- **Project ID**: ee55e7fa-b010-4946-a87b-013e15e329a8
- **Service ID**: 9d84a971-c312-4fcd-a5b8-e30fbf1690e5
- **Dashboard**: https://railway.com/project/ee55e7fa-b010-4946-a87b-013e15e329a8/service/9d84a971-c312-4fcd-a5b8-e30fbf1690e5

## Step 1: Add New Service to Existing Project

1. Go to your Railway dashboard: https://railway.com/project/ee55e7fa-b010-4946-a87b-013e15e329a8
2. Click **"+ New Service"**
3. Select **"GitHub Repo"**
4. Choose your **Seisoai** repository
5. Name it **"seiso-ai-frontend"**

## Step 2: Configure the New Service

### Start Command:
```bash
npm run build:frontend
```

### Environment Variables:
```
NODE_ENV=production
VITE_API_URL=https://seisoai-prod.up.railway.app
```

## Step 3: Deploy

Click **"Deploy"** and wait for the build to complete.

## What's Ready for Deployment

✅ **Frontend built** - All files in `dist/` folder  
✅ **Static server** - `serve-frontend.js` created  
✅ **Package.json** - Updated with frontend scripts  
✅ **Nixpacks config** - `nixpacks.toml` for proper build  

## Expected Result

You'll have:
- **Backend**: https://seisoai-prod.up.railway.app (existing)
- **Frontend**: https://your-new-frontend-service.up.railway.app (new)

## Alternative: Use Railway CLI

If you want to try the CLI approach:

```bash
# First, you need to link to the existing project
railway link --project ee55e7fa-b010-4946-a87b-013e15e329a8

# Then add a new service
railway add

# Set environment variables
railway variables --set "NODE_ENV=production"
railway variables --set "VITE_API_URL=https://seisoai-prod.up.railway.app"

# Deploy
railway up
```

## Files Ready

All necessary files are prepared:
- `dist/` - Built frontend
- `serve-frontend.js` - Static file server
- `package.json` - Updated with frontend scripts
- `nixpacks.toml` - Build configuration
