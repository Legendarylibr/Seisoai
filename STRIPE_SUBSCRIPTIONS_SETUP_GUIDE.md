# Complete Stripe Subscriptions Setup Guide

This guide will walk you through setting up Stripe subscriptions for your application.

## Prerequisites

1. A Stripe account (sign up at https://stripe.com)
2. Access to your Stripe Dashboard (https://dashboard.stripe.com)
3. Your backend running (✅ Already done!)

## Step 1: Get Your Stripe API Keys

1. Go to https://dashboard.stripe.com/apikeys
2. **IMPORTANT**: Make sure you're in **LIVE MODE** (toggle in top right)
3. Copy your **Publishable key** (starts with `pk_live_...`)
4. Click "Reveal live key" to see your **Secret key** (starts with `sk_live_...`)

## Step 2: Configure Environment Variables

### ✅ Railway Production (Already Set Up)

If your Stripe keys are already in Railway production environment, you're good! Just verify:

1. **Backend Service** in Railway should have:
   - `STRIPE_SECRET_KEY=sk_live_...`
   - `STRIPE_WEBHOOK_SECRET=whsec_...`
   - `FRONTEND_URL=https://your-frontend-domain.com`

2. **Frontend Service** in Railway should have:
   - `VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...`
   - `VITE_API_URL=https://your-backend-domain.com`

### Local Development Configuration

For local testing, create `backend.env` in root directory:

```env
# Stripe Configuration (get from Railway or Stripe Dashboard)
STRIPE_SECRET_KEY=sk_live_YOUR_ACTUAL_SECRET_KEY_HERE
STRIPE_WEBHOOK_SECRET=whsec_YOUR_WEBHOOK_SECRET_HERE

# Frontend URL (for redirects after checkout)
FRONTEND_URL=http://localhost:5173
```

And frontend `.env`:
```env
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_YOUR_ACTUAL_PUBLISHABLE_KEY_HERE
VITE_API_URL=http://localhost:3001
```

## Step 3: Create Stripe Products

### Option A: Run Locally with Railway Keys

If your Stripe keys are already in Railway production environment, you can run the script locally by exporting the keys:

```bash
# Get your Stripe secret key from Railway dashboard
# Then run:
export STRIPE_SECRET_KEY=sk_live_YOUR_KEY_FROM_RAILWAY
cd backend/scripts
node setup-stripe-products.js
```

### Option B: Run on Railway (Recommended)

Use Railway CLI to run the script in your production environment:

```bash
# Install Railway CLI if needed: https://docs.railway.app/develop/cli
railway run --service backend "cd backend/scripts && node setup-stripe-products.js"
```

Or via Railway Dashboard:
1. Go to your Railway project
2. Select the backend service
3. Go to "Deployments" → "New Deployment" → "Run Command"
4. Run: `cd backend/scripts && node setup-stripe-products.js`

### Option C: Verify Products Already Exist

If products were already created, verify in Stripe Dashboard:
1. Go to https://dashboard.stripe.com/products
2. Check for these products:
   - **Starter Pack**: $10/month
   - **Creator Pack**: $20/month
   - **Pro Pack**: $40/month
   - **Studio Pack**: $80/month
3. Verify each has a lookup key matching: `starter_pack_monthly`, `creator_pack_monthly`, `pro_pack_monthly`, `studio_pack_monthly`

This will create:
- **Starter Pack**: $10/month (50 credits)
- **Creator Pack**: $20/month (110 credits, 10% savings)
- **Pro Pack**: $40/month (240 credits, 20% savings)
- **Studio Pack**: $80/month (520 credits, 30% savings)

**Note**: The script will use `STRIPE_SECRET_KEY` from Railway environment automatically if running on Railway.

## Step 4: Set Up Stripe Webhook

1. Go to https://dashboard.stripe.com/webhooks
2. Make sure you're in **LIVE MODE**
3. Click **"+ Add endpoint"**
4. Enter your webhook URL:
   - **Local development**: Use Stripe CLI (see below)
   - **Production**: `https://your-backend-domain.com/api/stripe/webhook`
5. Select these events:
   - ✅ `checkout.session.completed`
   - ✅ `invoice.payment_succeeded`
6. Click **"Add endpoint"**
7. Click on the endpoint to view details
8. Click **"Reveal"** next to "Signing secret"
9. Copy the secret (starts with `whsec_...`)
10. Add it to `backend.env` as `STRIPE_WEBHOOK_SECRET`

### Local Development with Stripe CLI

For local testing, use Stripe CLI to forward webhooks:

```bash
# Install Stripe CLI: https://stripe.com/docs/stripe-cli
stripe listen --forward-to localhost:3001/api/stripe/webhook
```

This will give you a webhook signing secret starting with `whsec_...` that you can use locally.

## Step 5: Restart Backend

After setting environment variables:

```bash
# Stop the current backend (Ctrl+C if running in terminal)
# Then restart:
cd backend
npm start
```

## Step 6: Verify Setup

1. Check backend logs for: `✅ Stripe configured with LIVE key`
2. Test the health endpoint: `curl http://localhost:3001/api/health`
3. Visit your pricing page and try to subscribe (use a test card in test mode first)

## Testing

### Test Mode (Recommended First)

1. Switch to **TEST MODE** in Stripe Dashboard
2. Use test keys (`pk_test_...` and `sk_test_...`)
3. Use test card: `4242 4242 4242 4242`
4. Any future expiry date and CVC

### Live Mode (Production)

1. Switch to **LIVE MODE** in Stripe Dashboard
2. Use live keys (`pk_live_...` and `sk_live_...`)
3. Real payments will be processed!

## Troubleshooting

### "STRIPE_SECRET_KEY not set"
- Make sure `backend.env` exists in the root directory
- Check that `STRIPE_SECRET_KEY` is set correctly
- Restart the backend after adding the key

### "Price with lookup_key not found"
- Run the setup script: `node backend/scripts/setup-stripe-products.js`
- Verify products exist in Stripe Dashboard → Products

### Webhook not working
- Check webhook URL is correct
- Verify `STRIPE_WEBHOOK_SECRET` is set
- Check Stripe Dashboard → Webhooks for delivery logs
- For local dev, use Stripe CLI

### Checkout redirects to wrong URL
- Set `FRONTEND_URL` in `backend.env`
- Or it will use the request origin

## Next Steps

Once everything is set up:
1. ✅ Products created in Stripe
2. ✅ Environment variables configured
3. ✅ Webhook endpoint configured
4. ✅ Backend restarted with Stripe enabled

Your subscriptions should now work! Users can:
- Visit the pricing page
- Click "Subscribe Now" on any plan
- Complete checkout via Stripe
- Receive credits automatically via webhook

## Support

- Stripe Dashboard: https://dashboard.stripe.com
- Stripe Docs: https://stripe.com/docs
- Webhook Testing: https://dashboard.stripe.com/webhooks

