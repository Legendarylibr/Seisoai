# Stripe Setup - LIVE MODE

## ⚠️ FIX: "Your request was in test mode, but used a non test card"

**If you're seeing this error, you need to switch from test keys to live keys:**

1. **Get your LIVE keys** from https://dashboard.stripe.com/apikeys (toggle to LIVE mode)
2. **Update Frontend** (Railway): `VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...`
3. **Update Backend** (Railway): `STRIPE_SECRET_KEY=sk_live_...`
4. **Redeploy** both services

**See details below ↓**

---

## ✅ Configuration

### Frontend Environment Variable
- `VITE_STRIPE_PUBLISHABLE_KEY`: Set in Railway/deployment platform
- Used by: src/services/stripeService.js
- **MUST be a LIVE key** (`pk_live_...`)

### Backend Environment Variable
- `STRIPE_SECRET_KEY`: Set in Railway/deployment platform
- **MUST be a LIVE key** (`sk_live_...`)
- `STRIPE_WEBHOOK_SECRET`: Webhook signing secret for payment verification

## 🚀 Getting Your Live Stripe Keys

1. Go to https://dashboard.stripe.com/apikeys
2. **Important**: Make sure you're in **LIVE MODE** (toggle in top right)
3. Copy your **Publishable key** (starts with `pk_live_...`)
4. Click "Reveal test key" or "Reveal live key" to see your **Secret key** (starts with `sk_live_...`)
5. Copy your **Webhook signing secret** from https://dashboard.stripe.com/webhooks

## 📝 Setting Up Live Keys

### For Railway Deployment:

```bash
# Set frontend publishable key (for frontend service)
railway variables set VITE_STRIPE_PUBLISHABLE_KEY="pk_live_your_actual_key_here" --service frontend

# Set backend secret key (for backend service)
railway variables set STRIPE_SECRET_KEY="sk_live_your_actual_key_here" --service backend

# Set webhook secret (for backend service)
railway variables set STRIPE_WEBHOOK_SECRET="whsec_your_webhook_secret_here" --service backend
```

### For Local Development:

Update your `.env` files:
- Frontend: `VITE_STRIPE_PUBLISHABLE_KEY=pk_live_your_key_here`
- Backend: `STRIPE_SECRET_KEY=sk_live_your_key_here`

## 🔐 Security

- ✅ Publishable keys are safe for frontend use
- ⚠️ Secret keys must NEVER be exposed to frontend
- ✅ Secret keys are stored securely in backend environment variables
- ⚠️ **LIVE keys process real payments** - use with caution!

## ⚠️ Important Notes

1. **LIVE MODE = REAL MONEY**: Live keys will process actual payments and charge real credit cards
2. **Test Mode**: If you need to test, use test keys (`pk_test_...` and `sk_test_...`) instead
3. **Webhook Setup**: Make sure your webhook endpoint is configured in Stripe dashboard for production
4. **Domain Verification**: Stripe may require domain verification for live mode

## 🎯 Current Status

- ✅ Configuration files updated to use live keys
- ⏳ **Action Required**: Add your actual live keys from Stripe dashboard
- ⏳ **Action Required**: Redeploy application after adding keys
- ⏳ **Action Required**: Configure webhook endpoint in Stripe dashboard

## 🚀 Next Steps

1. Get your live Stripe keys from https://dashboard.stripe.com/apikeys (make sure LIVE mode is enabled)
2. Add keys to your deployment platform (Railway, etc.)
3. Configure webhook endpoint: `https://your-backend-domain.com/api/stripe/webhook`
4. Redeploy the backend and frontend
5. Test with a small real payment to verify everything works

