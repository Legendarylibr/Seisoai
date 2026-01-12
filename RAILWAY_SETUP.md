# Railway Deployment Setup Guide

## Current Configuration

- **Project ID**: `ee55e7fa-b010-4946-a87b-013e15e329a8`
- **GitHub Repo**: `https://github.com/Legendarylibr/Seisoai.git`
- **Branch**: `main`

## Verify Railway Auto-Deploy Setup

### Step 1: Check GitHub Connection

1. Go to [Railway Dashboard](https://railway.app)
2. Open your **Seisoai** project
3. Click on **Settings** → **Source**
4. Verify:
   - ✅ GitHub repository is connected
   - ✅ Repository: `Legendarylibr/Seisoai`
   - ✅ Branch: `main`
   - ✅ Auto Deploy: **Enabled**

### Step 2: Check Service Configuration

1. In Railway dashboard, go to your **Seisoai** service
2. Click **Settings** → **Deploy**
3. Verify:
   - ✅ **Auto Deploy** is enabled
   - ✅ **Branch** is set to `main`
   - ✅ **Root Directory** is set correctly (usually `/`)

### Step 3: Verify Webhook

1. Go to your GitHub repository: `https://github.com/Legendarylibr/Seisoai`
2. Click **Settings** → **Webhooks**
3. Look for a Railway webhook (should have `railway.app` in the URL)
4. Verify it's **Active** and shows recent deliveries

### Step 4: Manual Trigger (If Auto-Deploy Not Working)

If auto-deploy isn't working, you can manually trigger:

**Option A: Via Railway Dashboard**
1. Go to Railway Dashboard → Your Project
2. Click on **Deployments** tab
3. Click **Deploy** or **Redeploy** button

**Option B: Via Railway CLI**
```bash
# Login to Railway
railway login

# Link to your project (if not already linked)
railway link

# Trigger redeploy
railway redeploy --service Seisoai
```

**Option C: Via GitHub Webhook Test**
1. Go to GitHub → Settings → Webhooks
2. Find Railway webhook
3. Click **Recent Deliveries**
4. Click **Redeliver** on the latest push event

## Troubleshooting

### Railway Not Detecting Pushes

1. **Check Railway Service Logs**:
   ```bash
   railway logs --service Seisoai
   ```

2. **Verify Branch Name**:
   - Railway might be watching a different branch
   - Check Settings → Source → Branch

3. **Reconnect GitHub**:
   - Railway Dashboard → Settings → Source
   - Click **Disconnect** then **Connect GitHub**
   - Re-select your repository and branch

### Build Failing

1. **Check Build Logs**:
   - Railway Dashboard → Deployments → Latest deployment
   - Click to view build logs

2. **Verify Environment Variables**:
   - Railway Dashboard → Variables
   - Ensure all required env vars are set

3. **Check nixpacks.toml**:
   - Verify build configuration is correct
   - Check for any syntax errors

## Quick Fix Commands

```bash
# Check Railway status
railway status

# View recent deployments
railway logs --tail 50

# Trigger manual redeploy (requires login)
railway redeploy --service Seisoai

# Check service health
railway open
```

## Expected Behavior

When you push to `main` branch:
1. ✅ Railway webhook receives the push event
2. ✅ Railway starts a new build
3. ✅ Build completes successfully
4. ✅ Service redeploys with new code
5. ✅ Health check passes on `/api/health`

## Next Steps

1. **Verify the connection** using the steps above
2. **Test with a small change** - make a commit and push
3. **Monitor the deployment** in Railway dashboard
4. **Check logs** if deployment fails

If issues persist, check Railway's status page or contact Railway support.
