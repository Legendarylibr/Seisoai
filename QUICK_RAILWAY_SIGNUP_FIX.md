# 🚀 Quick Fix: Railway Signup 500 Error

## The Problem
Signup returns 500 error on Railway because environment variables are missing.

## The Solution (5 minutes)

### Step 1: Generate Secrets
```bash
node scripts/generate-railway-secrets.js
```
This will output `JWT_SECRET` and `SESSION_SECRET` - copy them!

### Step 2: Set Environment Variables in Railway

1. Go to https://railway.app → Your Project → Backend Service
2. Click **Variables** tab
3. Add these 4 variables:

```
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/dbname
JWT_SECRET=<paste from step 1>
SESSION_SECRET=<paste from step 1>
NODE_ENV=production
```

### Step 3: Redeploy
Railway will auto-redeploy when you add variables, or click **Redeploy** manually.

### Step 4: Verify
Check health endpoint:
```bash
curl https://seisoai-prod.up.railway.app/api/health
```

Look for:
- ✅ `"signupAvailable": true`
- ✅ `"database": "connected"`
- ❌ No `"missingEnvVars"` field

## That's It! 🎉

Signup should now work. Test it:
```bash
curl -X POST https://seisoai-prod.up.railway.app/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123456"}'
```

## Need Help?

- See `RAILWAY_SIGNUP_FIX.md` for detailed instructions
- Check Railway logs for error messages
- Health endpoint shows what's missing: `/api/health`

