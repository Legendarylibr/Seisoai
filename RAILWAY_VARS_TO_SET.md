# Railway Environment Variables to Set

## Values from your local backend.env:

Use these exact values in Railway:

```
JWT_SECRET=ce5e025b87ce0e56c625dbb7045032b9f29ecac8478cf9a7789c58695e585e08
SESSION_SECRET=a981f12bcfe1ab344a8ac46fcfcade97a629de1f1c248ed2
NODE_ENV=production
MONGODB_URI=your_mongodb_atlas_connection_string_here
```

## Quick Setup Options:

### Option 1: Railway Dashboard (Easiest)
1. Go to https://railway.app/dashboard
2. Select your project → Backend service
3. Go to **Variables** tab
4. Add these 4 variables (copy/paste the values above)

### Option 2: Railway CLI (If project is linked)
```bash
railway variables --set "JWT_SECRET=ce5e025b87ce0e56c625dbb7045032b9f29ecac8478cf9a7789c58695e585e08"
railway variables --set "SESSION_SECRET=a981f12bcfe1ab344a8ac46fcfcade97a629de1f1c248ed2"
railway variables --set "NODE_ENV=production"
railway variables --set "MONGODB_URI=your_mongodb_atlas_connection_string"
```

### Option 3: Use the Script
```bash
# First link project (if not already linked)
railway link

# Then run the script
./scripts/set-railway-from-local.sh
```

## Important Notes:

1. **MONGODB_URI**: Your local value (`mongodb://localhost:27017/...`) won't work on Railway. You need a MongoDB Atlas connection string like:
   ```
   mongodb+srv://username:password@cluster.mongodb.net/ai-image-generator?retryWrites=true&w=majority
   ```

2. **After setting variables**: Railway will auto-redeploy. Wait for deployment to complete.

3. **Verify**: Check `/api/health` endpoint - it should show `"signupAvailable": true`

