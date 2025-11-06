# Stripe Environment Variables - Quick Reference

## ⚠️ IMPORTANT: For Production (Real Payments) - Use LIVE Keys

**If you're getting the error "Your request was in test mode, but used a non test card", you need to switch to LIVE mode keys below.**

## 📋 Required Environment Variables

### Frontend (`.env` or Railway Frontend Service)
```bash
# PRODUCTION (Real Payments) - REQUIRED FOR LIVE MODE
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_your_key_here

# DEVELOPMENT ONLY (Test Mode)
# VITE_STRIPE_PUBLISHABLE_KEY=pk_test_your_key_here  # Only for testing
```

### Backend (`backend/.env` or Railway Backend Service)
```bash
# PRODUCTION (Real Payments) - REQUIRED FOR LIVE MODE
STRIPE_SECRET_KEY=sk_live_your_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here

# DEVELOPMENT ONLY (Test Mode)
# STRIPE_SECRET_KEY=sk_test_your_key_here  # Only for testing
```

---

## 🔑 How to Get Your Keys

### 🚀 Live Mode Keys (for real payments) - PRODUCTION
**Use this for production to accept real credit cards!**

1. Go to: https://dashboard.stripe.com/apikeys
2. **CRITICAL**: Make sure **"Live mode"** toggle is ON (top right - must say "Live mode")
3. Copy:
   - **Publishable key** (starts with `pk_live_...`)
   - **Secret key** (click "Reveal live key" - starts with `sk_live_...`)
4. **Webhook secret**: Go to https://dashboard.stripe.com/webhooks (with LIVE mode on) and copy signing secret

### Test Mode Keys (for development/testing only)
1. Go to: https://dashboard.stripe.com/test/apikeys
2. Make sure **"Test mode"** toggle is ON (top right)
3. Copy:
   - **Publishable key** (starts with `pk_test_...`)
   - **Secret key** (click "Reveal test key" - starts with `sk_test_...`)

---

## 📝 Example Configuration

### 🚀 Live Mode (Production) - FOR REAL PAYMENTS
**Frontend `.env` or Railway:**
```bash
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_51ABC123xyz...
```

**Backend `backend/.env` or Railway:**
```bash
STRIPE_SECRET_KEY=sk_live_51ABC123xyz...
STRIPE_WEBHOOK_SECRET=whsec_ABC123xyz...
```

### Test Mode (Local Development Only)
**Frontend `.env`:**
```bash
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_51ABC123xyz...
```

**Backend `backend/.env`:**
```bash
STRIPE_SECRET_KEY=sk_test_51ABC123xyz...
```

---

## ⚠️ Important Notes

1. **Live Mode** = Real credit cards (charges real money!) - **USE FOR PRODUCTION**
2. **Test Mode** = Test cards only (e.g., `4242 4242 4242 4242`) - **DEVELOPMENT ONLY**
3. **Both keys must match**: 
   - If frontend uses `pk_live_...`, backend MUST use `sk_live_...`
   - If frontend uses `pk_test_...`, backend MUST use `sk_test_...`
4. **Never commit keys to git**: Add `.env` to `.gitignore`
5. **Error "test mode but used non-test card"**: You're using test keys (`pk_test_` or `sk_test_`) - switch to live keys (`pk_live_` and `sk_live_`)

---

## 🚀 Quick Setup

### 🚀 For Production (Real Payments) - USE THIS FOR LIVE MODE
```bash
# Frontend (Railway or .env)
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_your_live_key

# Backend (Railway or backend/.env)
STRIPE_SECRET_KEY=sk_live_your_live_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
```

### For Testing (Development Only - Use Test Cards)
```bash
# Frontend
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_your_test_key

# Backend
STRIPE_SECRET_KEY=sk_test_your_test_key
```

---

## 🔍 Verify Your Setup

After setting variables, restart your application:

```bash
# Local development
npm run dev  # Frontend
cd backend && npm start  # Backend

# Railway
# Variables are automatically applied on next deployment
```

Then test payment flow:
- **Test mode**: Use card `4242 4242 4242 4242`
- **Live mode**: Use a real credit card (will charge real money!)

---

**Last Updated**: November 5, 2025

