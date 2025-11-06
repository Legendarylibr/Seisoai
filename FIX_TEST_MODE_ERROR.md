# Fix: "Your request was in test mode, but used a non test card"

## 🚨 The Problem

You're seeing this error because your application is configured with **Stripe Test Mode keys** (`pk_test_...` or `sk_test_...`) but you're trying to use a **real credit card**.

Stripe Test Mode **only accepts test card numbers** - it will never process real payments.

## ✅ The Solution: Switch to Live Mode

To accept real credit cards and process real payments, you need to switch to **Stripe Live Mode keys**.

### Step 1: Get Your Live Keys from Stripe

1. Go to: **https://dashboard.stripe.com/apikeys**
2. **CRITICAL**: Look at the top right corner - toggle to **"Live mode"** (must say "Live mode", not "Test mode")
3. Copy your keys:
   - **Publishable key** (starts with `pk_live_...`)
   - **Secret key** (click "Reveal live key" - starts with `sk_live_...`)
4. Get your **Webhook secret**:
   - Go to: https://dashboard.stripe.com/webhooks (make sure LIVE mode is on)
   - Copy the signing secret (starts with `whsec_...`)

### Step 2: Update Frontend Environment Variable

**If using Railway:**
```bash
# In Railway dashboard, go to your Frontend service
# Add or update the variable:
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_your_actual_live_key_here
```

**If using local `.env` file:**
```bash
# In your root .env file:
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_your_actual_live_key_here
```

### Step 3: Update Backend Environment Variable

**If using Railway:**
```bash
# In Railway dashboard, go to your Backend service
# Add or update these variables:
STRIPE_SECRET_KEY=sk_live_your_actual_live_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
```

**If using local `backend/.env` file:**
```bash
# In backend/.env:
STRIPE_SECRET_KEY=sk_live_your_actual_live_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
```

### Step 4: Redeploy

- **Railway**: Will automatically redeploy when you update variables
- **Other platforms**: Restart your services or trigger a redeploy
- **Local**: Restart both frontend and backend servers

### Step 5: Clear Browser Cache

- Hard refresh: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)
- Or clear browser cache completely

### Step 6: Verify

1. **Check Frontend Key:**
   - Open browser console (F12)
   - Run: `console.log(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY)`
   - Should show: `pk_live_...` (NOT `pk_test_...`)

2. **Check Backend Key:**
   - Check your deployment platform's environment variables
   - Should show: `sk_live_...` (NOT `sk_test_...`)

3. **Test Payment:**
   - Try a real credit card payment
   - Should process successfully (and charge real money!)

## ⚠️ Important Warnings

1. **LIVE MODE = REAL MONEY**
   - Real credit cards will be charged
   - Real payments will be processed
   - You'll receive real funds

2. **Both Keys Must Match**
   - If frontend uses `pk_live_...`, backend MUST use `sk_live_...`
   - If frontend uses `pk_test_...`, backend MUST use `sk_test_...`

3. **Make Sure You're Ready**
   - Your app is working correctly
   - Payment flow is tested
   - You understand Stripe's fee structure

## 🔍 Quick Checklist

- [ ] Got live keys from Stripe dashboard (LIVE mode enabled)
- [ ] Updated `VITE_STRIPE_PUBLISHABLE_KEY` to `pk_live_...` (Frontend)
- [ ] Updated `STRIPE_SECRET_KEY` to `sk_live_...` (Backend)
- [ ] Updated `STRIPE_WEBHOOK_SECRET` to `whsec_...` (Backend)
- [ ] Redeployed both services
- [ ] Cleared browser cache
- [ ] Verified keys are live (not test)

## 📚 More Information

- See `STRIPE_SETUP.md` for detailed setup instructions
- See `STRIPE_ENV_VARIABLES.md` for environment variable reference
- See `SWITCH_TO_LIVE_MODE.md` for troubleshooting

---

**Last Updated**: November 5, 2025

