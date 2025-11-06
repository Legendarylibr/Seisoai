# Stripe Environment Variables - Quick Reference

## 📋 Required Environment Variables

### Frontend (`.env` or Railway Frontend Service)
```bash
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_your_key_here  # For testing
# OR
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_your_key_here  # For production
```

### Backend (`backend/.env` or Railway Backend Service)
```bash
STRIPE_SECRET_KEY=sk_test_your_key_here  # For testing
# OR
STRIPE_SECRET_KEY=sk_live_your_key_here  # For production

# Optional: Webhook secret (only needed for live mode)
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
```

---

## 🔑 How to Get Your Keys

### Test Mode Keys (for testing)
1. Go to: https://dashboard.stripe.com/test/apikeys
2. Make sure **"Test mode"** toggle is ON (top right)
3. Copy:
   - **Publishable key** (starts with `pk_test_...`)
   - **Secret key** (click "Reveal test key" - starts with `sk_test_...`)

### Live Mode Keys (for real payments)
1. Go to: https://dashboard.stripe.com/apikeys
2. Make sure **"Live mode"** toggle is ON (top right)
3. Copy:
   - **Publishable key** (starts with `pk_live_...`)
   - **Secret key** (click "Reveal live key" - starts with `sk_live_...`)
4. **Webhook secret**: Go to https://dashboard.stripe.com/webhooks and copy signing secret

---

## 📝 Example Configuration

### Test Mode (Local Development)
**Frontend `.env`:**
```bash
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_51ABC123xyz...
```

**Backend `backend/.env`:**
```bash
STRIPE_SECRET_KEY=sk_test_51ABC123xyz...
```

### Live Mode (Production)
**Frontend `.env` or Railway:**
```bash
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_51ABC123xyz...
```

**Backend `backend/.env` or Railway:**
```bash
STRIPE_SECRET_KEY=sk_live_51ABC123xyz...
STRIPE_WEBHOOK_SECRET=whsec_ABC123xyz...
```

---

## ⚠️ Important Notes

1. **Test Mode** = Test cards only (e.g., `4242 4242 4242 4242`)
2. **Live Mode** = Real credit cards (charges real money!)
3. **Both keys must match**: If frontend uses `pk_test_...`, backend must use `sk_test_...`
4. **Never commit keys to git**: Add `.env` to `.gitignore`

---

## 🚀 Quick Setup

### For Testing (Use Test Cards)
```bash
# Frontend
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_your_test_key

# Backend
STRIPE_SECRET_KEY=sk_test_your_test_key
```

### For Production (Real Payments)
```bash
# Frontend
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_your_live_key

# Backend
STRIPE_SECRET_KEY=sk_live_your_live_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
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

