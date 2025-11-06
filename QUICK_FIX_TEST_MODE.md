# ⚠️ QUICK FIX: Invalid Stripe Keys

## The Problem
You're seeing errors because your Railway environment variables are using **test keys** (`pk_test_...` or `sk_test_...`).

**This application does not support test keys** - only live keys are accepted.

## ✅ Solution: Update Railway Variables (5 minutes)

### Step 1: Get Your Live Stripe Keys

1. Go to: **https://dashboard.stripe.com/apikeys**
2. **IMPORTANT**: Look at top right corner - toggle to **"Live mode"** (must say "Live mode", NOT "Test mode")
3. Copy these keys:
   - **Publishable key** (starts with `pk_live_...`)
   - **Secret key** (click "Reveal live key" - starts with `sk_live_...`)
4. Get webhook secret:
   - Go to: **https://dashboard.stripe.com/webhooks** (with LIVE mode ON)
   - Copy the signing secret (starts with `whsec_...`)

### Step 2: Update Railway Frontend Service

1. Go to **Railway Dashboard**: https://railway.app
2. Open your project
3. Click on your **Frontend service**
4. Go to **"Variables"** tab
5. Find or add: `VITE_STRIPE_PUBLISHABLE_KEY`
6. Set value to: `pk_live_your_actual_key_here` (replace with your actual live key)
7. Click **"Save"** or **"Update"**

### Step 3: Update Railway Backend Service

1. In Railway, click on your **Backend service**
2. Go to **"Variables"** tab
3. Find or add: `STRIPE_SECRET_KEY`
4. Set value to: `sk_live_your_actual_key_here` (replace with your actual live key)
5. Find or add: `STRIPE_WEBHOOK_SECRET`
6. Set value to: `whsec_your_webhook_secret_here` (replace with your actual webhook secret)
7. Click **"Save"** or **"Update"**

### Step 4: Wait for Redeploy

- Railway will automatically redeploy when you update variables
- Wait 1-2 minutes for deployment to complete
- Check the deployment logs to ensure it's successful

### Step 5: Clear Browser Cache

- **Windows/Linux**: Press `Ctrl + Shift + R`
- **Mac**: Press `Cmd + Shift + R`
- Or clear browser cache completely

### Step 6: Verify It's Fixed

1. Open your app in browser
2. Open browser console (F12)
3. Run: `console.log(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY)`
4. Should show: `pk_live_...` (NOT `pk_test_...`)
5. Try a payment with a real credit card - it should work!

## 🔍 Verification Checklist

- [ ] Got live keys from Stripe (LIVE mode enabled)
- [ ] Updated `VITE_STRIPE_PUBLISHABLE_KEY` in Railway Frontend service
- [ ] Updated `STRIPE_SECRET_KEY` in Railway Backend service
- [ ] Updated `STRIPE_WEBHOOK_SECRET` in Railway Backend service
- [ ] Waited for Railway to redeploy
- [ ] Cleared browser cache
- [ ] Verified key starts with `pk_live_` (not `pk_test_`)

## 🚨 Still Not Working?

1. **Check both services**: Make sure BOTH frontend AND backend are updated
2. **Check key format**: Keys must start with `pk_live_` and `sk_live_` (not `pk_test_` or `sk_test_`)
3. **Hard refresh**: Clear browser cache completely
4. **Check Railway logs**: Look for any errors during deployment
5. **Wait longer**: Sometimes it takes 2-3 minutes for changes to propagate

## 📚 Alternative: Use Railway CLI

If you have Railway CLI installed, you can run:

```bash
./fix-stripe-live-mode.sh
```

Or manually:

```bash
# Frontend
railway variables set VITE_STRIPE_PUBLISHABLE_KEY="pk_live_your_key" --service frontend

# Backend
railway variables set STRIPE_SECRET_KEY="sk_live_your_key" --service backend
railway variables set STRIPE_WEBHOOK_SECRET="whsec_your_secret" --service backend
```

---

**That's it!** After updating these variables, your app will accept real credit cards. 🎉

