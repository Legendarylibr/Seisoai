# Switch to Stripe LIVE Mode - Real Payments

## ✅ Quick Checklist

You need to ensure **BOTH** frontend and backend are using **LIVE mode keys**:

### 1. Verify Frontend is Using Live Key

**In Railway (Frontend Service):**
- Variable: `VITE_STRIPE_PUBLISHABLE_KEY`
- Should start with: `pk_live_...` ✅
- Should NOT start with: `pk_test_...` ❌

**Check:**
```bash
# In Railway dashboard, check frontend service variables
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_51SMcHm6... (should be live)
```

---

### 2. Verify Backend is Using Live Key

**In Railway (Backend Service):**
- Variable: `STRIPE_SECRET_KEY`
- Should start with: `sk_live_...` ✅
- Should NOT start with: `sk_test_...` ❌

**Check:**
```bash
# In Railway dashboard, check backend service variables
STRIPE_SECRET_KEY=sk_live_51SMcHm6... (should be live)
```

---

### 3. Add Webhook Secret (Required for Live Mode)

**In Railway (Backend Service):**
- Variable: `STRIPE_WEBHOOK_SECRET`
- Should start with: `whsec_...`
- Get it from: https://dashboard.stripe.com/webhooks (make sure LIVE mode is on)

---

## 🔧 How to Fix if You Have Test Keys

### Step 1: Get Your Live Keys

1. Go to: https://dashboard.stripe.com/apikeys
2. **Toggle to LIVE MODE** (top right corner - must say "Live mode")
3. Copy:
   - **Publishable key** (starts with `pk_live_...`)
   - **Secret key** (click "Reveal live key" - starts with `sk_live_...`)

### Step 2: Update Railway Variables

**Frontend Service:**
```
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_your_actual_live_key_here
```

**Backend Service:**
```
STRIPE_SECRET_KEY=sk_live_your_actual_live_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
```

### Step 3: Redeploy

- Railway will automatically redeploy when you update variables
- Or manually trigger a redeploy if needed

---

## ✅ Verification Steps

After updating, verify:

1. **Check Frontend Key:**
   - Open browser console (F12)
   - Run: `console.log(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY)`
   - Should show: `pk_live_...`

2. **Check Backend Key:**
   - Check Railway backend service logs
   - Should initialize with live key

3. **Test Payment:**
   - Use a **REAL credit card** (not test card)
   - Payment should process and charge real money
   - You should see the charge in Stripe dashboard

---

## ⚠️ Important Warnings

1. **LIVE MODE = REAL MONEY**
   - Real credit cards will be charged
   - Real payments will be processed
   - You'll receive real funds

2. **Make Sure You're Ready:**
   - Your app is working correctly
   - Payment flow is tested (with test mode first)
   - You understand Stripe's fee structure
   - You have proper error handling

3. **Domain Verification:**
   - Some payment methods (Apple Pay, etc.) require domain verification
   - See Stripe dashboard for domain verification steps

---

## 🚨 Common Issues

### Issue: Still getting "test mode" error
**Solution:** 
- Check BOTH frontend AND backend keys are live
- Make sure you're not using cached keys
- Clear browser cache and hard refresh (Ctrl+Shift+R / Cmd+Shift+R)
- Redeploy both services

### Issue: Payment succeeds but credits not added
**Solution:**
- Make sure `STRIPE_WEBHOOK_SECRET` is set
- Verify webhook endpoint is configured in Stripe dashboard
- Check backend logs for webhook errors

### Issue: 402 Payment Failed
**Solution:**
- This usually means the card was declined by the bank
- Check Stripe dashboard for specific error
- Try a different card
- Make sure you're using LIVE mode keys

---

## 📋 Quick Reference

**Live Mode Keys:**
- Frontend: `pk_live_...`
- Backend: `sk_live_...`
- Webhook: `whsec_...`

**Test Mode Keys:**
- Frontend: `pk_test_...`
- Backend: `sk_test_...`

**Both must match!** If frontend uses `pk_live_...`, backend must use `sk_live_...`

---

**Last Updated**: November 5, 2025

