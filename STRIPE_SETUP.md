# Stripe Setup

## ✅ Configuration

### Frontend Environment Variable
- `VITE_STRIPE_PUBLISHABLE_KEY`: Set in Railway/deployment platform
- Used by: src/services/stripeService.ts
- **Production**: Must be a LIVE key (`pk_live_...`)
- **Development**: Test keys (`pk_test_...`) are accepted

### Backend Environment Variable
- `STRIPE_SECRET_KEY`: Set in Railway/deployment platform or `backend.env`
- **Production**: Must be a LIVE key (`sk_live_...`)
- **Development**: Test keys (`sk_test_...`) are accepted
- `STRIPE_WEBHOOK_SECRET`: Webhook signing secret for payment verification

### ⚠️ Common Issue: Placeholder Keys
If you see errors like "connection to Stripe failed" or "Request was retried", check that you're using a **real** Stripe API key, not a placeholder like `sk_test_your_stripe_secret_key_here`.

## 🚀 Getting Your Stripe Keys

1. Go to https://dashboard.stripe.com/apikeys
2. **Important**: Make sure you're in **LIVE MODE** (toggle in top right)
3. Copy your **Publishable key** (starts with `pk_live_...`)
4. Click "Reveal live key" to see your **Secret key** (starts with `sk_live_...`)
5. Copy your **Webhook signing secret** from https://dashboard.stripe.com/webhooks (make sure LIVE mode is on)

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
2. **Test keys in development**: Test keys (`pk_test_...` and `sk_test_...`) work in development mode
3. **Test keys in production**: Test keys are automatically rejected in production for safety
4. **Webhook Setup**: Make sure your webhook endpoint is configured in Stripe dashboard for production
5. **Domain Verification**: Stripe may require domain verification for live mode

## 🚀 Next Steps

1. Get your live Stripe keys from https://dashboard.stripe.com/apikeys (make sure LIVE mode is enabled)
2. Add keys to your deployment platform (Railway, etc.)
3. Configure webhook endpoint: `https://your-backend-domain.com/api/stripe/webhook`
4. Redeploy the backend and frontend
5. Test with a real payment to verify everything works

