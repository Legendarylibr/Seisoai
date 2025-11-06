# Switch to Stripe Live Mode - Quick Guide

## 🚨 Current Issue

You're getting the error: **"Your request was in test mode, but used a non test card"**

This means your Stripe keys are in **TEST MODE** but you're trying to use a **real credit card**.

## ✅ Solution: Switch to Live Mode Keys

### Step 1: Get Your Live Keys from Stripe

1. Go to: **https://dashboard.stripe.com/apikeys**
2. **CRITICAL**: Toggle to **"Live mode"** (top right corner - must say "Live mode", NOT "Test mode")
3. Copy your keys:
   - **Publishable key** (starts with `pk_live_...`)
   - **Secret key** (click "Reveal live key" - starts with `sk_live_...`)
4. Get your **Webhook secret**:
   - Go to: **https://dashboard.stripe.com/webhooks** (make sure LIVE mode is on)
   - Copy the signing secret (starts with `whsec_...`)

### Step 2: Update Environment Variables

#### If using Railway:

**Frontend Service:**
```
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_your_actual_live_key_here
```

**Backend Service:**
```
STRIPE_SECRET_KEY=sk_live_your_actual_live_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
```

#### If using local `.env` files:

**Frontend `.env` (root directory):**
```bash
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_your_actual_live_key_here
```

**Backend `backend/.env`:**
```bash
STRIPE_SECRET_KEY=sk_live_your_actual_live_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
```

### Step 3: Verify Keys

**Frontend key must start with:** `pk_live_...` ✅  
**Backend key must start with:** `sk_live_...` ✅

**DO NOT use keys starting with:**
- `pk_test_...` ❌
- `sk_test_...` ❌

### Step 4: Redeploy

- **Railway**: Automatically redeploys when you update variables
- **Local**: Restart both frontend and backend servers
- **Other platforms**: Trigger a redeploy

### Step 5: Clear Browser Cache

After redeploy, clear your browser cache:
- **Windows/Linux**: `Ctrl + Shift + R`
- **Mac**: `Cmd + Shift + R`

## 🔍 How to Verify

### Check Frontend (Browser Console)
1. Open browser console (F12)
2. Run: `console.log(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY)`
3. Should show: `pk_live_...` (NOT `pk_test_...`)

### Check Backend (Server Logs)
When the backend starts, you should see:
- ✅ `Stripe LIVE mode configured - ready to accept real payments`

If you see:
- ⚠️ `WARNING: Stripe TEST mode key detected` - you still have test keys!

## ⚠️ Important Notes

1. **Live mode = REAL MONEY**: Live keys will process actual payments and charge real credit cards
2. **Both keys must match**: Frontend and backend must use the same mode (both live or both test)
3. **Test cards won't work**: In live mode, test cards like `4242 4242 4242 4242` will be declined
4. **Webhook required**: Make sure your webhook endpoint is configured in Stripe dashboard for live mode

## 🎯 After Switching

Once you've switched to live mode:
- ✅ Real credit cards will be accepted
- ✅ Real payments will be processed
- ✅ Test cards will be declined (this is normal in live mode)
- ✅ The test mode warning banner will disappear from the payment modal

## 📞 Need Help?

If you still see errors after switching:
1. Verify both frontend and backend keys start with `pk_live_` and `sk_live_`
2. Check server logs for Stripe initialization messages
3. Clear browser cache and hard refresh
4. Verify webhook secret is from live mode webhook endpoint

