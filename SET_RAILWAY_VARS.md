# Set Railway Environment Variables

## Quick Setup (Run This)

Since Railway CLI requires interactive input, run this script:

```bash
./scripts/set-railway-secrets.sh
```

This will:
1. Check Railway CLI is installed
2. Check you're logged in
3. Link the project (if needed)
4. Set JWT_SECRET, SESSION_SECRET, and NODE_ENV

## Manual Setup (Alternative)

If the script doesn't work, set them manually:

```bash
# 1. Link project (if not already linked)
railway link

# 2. Set the variables
railway variables --set "JWT_SECRET=36e914e517a0f57dfeec11847bde1e3063885056507cec0678646f0eb0cf1c65"
railway variables --set "SESSION_SECRET=6ced8320c351878b5cdb30288143744f87fd61551ce2a5de"
railway variables --set "NODE_ENV=production"

# 3. Set MONGODB_URI (you need to provide your MongoDB connection string)
railway variables --set "MONGODB_URI=your_mongodb_connection_string_here"
```

## Via Railway Dashboard

1. Go to https://railway.app/dashboard
2. Select your project → Backend service
3. Go to **Variables** tab
4. Click **+ New Variable** for each:
   - `JWT_SECRET` = `36e914e517a0f57dfeec11847bde1e3063885056507cec0678646f0eb0cf1c65`
   - `SESSION_SECRET` = `6ced8320c351878b5cdb30288143744f87fd61551ce2a5de`
   - `NODE_ENV` = `production`
   - `MONGODB_URI` = (your MongoDB connection string)

## Verify

After setting variables, Railway will auto-redeploy. Check:

```bash
railway variables
```

Or check the health endpoint:
```bash
curl https://seisoai-prod.up.railway.app/api/health
```

Look for `"signupAvailable": true` in the response.

