# Stripe Subscriptions Setup for Railway

Since your Stripe keys are already configured in Railway production, here's what you need to do:

## ✅ What's Already Done

- ✅ Stripe keys are in Railway environment variables
- ✅ Backend code is ready
- ✅ Frontend components are configured

## 🚀 Quick Setup Steps

### 1. Create Stripe Products

Run the setup script to create the 4 subscription products. You have two options:

#### Option A: Run on Railway (Recommended)

```bash
# Install Railway CLI if needed
npm install -g @railway/cli

# Login to Railway
railway login

# Link to your project
railway link

# Run the setup script
railway run --service backend "cd backend/scripts && node setup-stripe-products.js"
```

#### Option B: Run Locally with Railway Keys

```bash
# Get STRIPE_SECRET_KEY from Railway dashboard
# Then export it:
export STRIPE_SECRET_KEY=sk_live_YOUR_KEY_FROM_RAILWAY

# Run the script
cd backend/scripts
node setup-stripe-products.js
```

This creates:
- **Starter Pack**: $10/month (lookup: `starter_pack_monthly`)
- **Creator Pack**: $20/month (lookup: `creator_pack_monthly`)
- **Pro Pack**: $40/month (lookup: `pro_pack_monthly`)
- **Studio Pack**: $80/month (lookup: `studio_pack_monthly`)

### 2. Set Up Webhook Endpoint

1. Go to https://dashboard.stripe.com/webhooks (LIVE MODE)
2. Click **"+ Add endpoint"**
3. Enter your Railway backend URL:
   ```
   https://your-backend-service.up.railway.app/api/stripe/webhook
   ```
4. Select events:
   - ✅ `checkout.session.completed`
   - ✅ `invoice.payment_succeeded`
5. Click **"Add endpoint"**
6. Copy the **Signing secret** (starts with `whsec_...`)
7. Add it to Railway backend service environment variables:
   - Variable: `STRIPE_WEBHOOK_SECRET`
   - Value: `whsec_...`

### 3. Verify Frontend URL

Make sure your Railway backend service has:
- `FRONTEND_URL=https://your-frontend-domain.com`

This is used for redirects after Stripe checkout.

### 4. Verify Products in Stripe

1. Go to https://dashboard.stripe.com/products
2. Verify all 4 products exist
3. Check each product has:
   - Correct price ($10, $20, $40, $80)
   - Monthly recurring billing
   - Correct lookup key

### 5. Test the Flow

1. Visit your pricing page
2. Click "Subscribe Now" on any plan
3. Complete checkout (use test card `4242 4242 4242 4242` if in test mode)
4. Verify credits are added via webhook

## 🔍 Verify Railway Environment Variables

Check your Railway backend service has these variables:

**Required:**
- ✅ `STRIPE_SECRET_KEY=sk_live_...`
- ✅ `STRIPE_WEBHOOK_SECRET=whsec_...`
- ✅ `FRONTEND_URL=https://your-frontend-domain.com`

**Frontend service should have:**
- ✅ `VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...`
- ✅ `VITE_API_URL=https://your-backend-domain.com`

## 🧪 Testing

### Test Mode (Recommended First)

1. Switch Stripe Dashboard to **TEST MODE**
2. Use test keys in Railway (temporarily)
3. Test with card: `4242 4242 4242 4242`
4. Verify webhook delivery in Stripe Dashboard

### Live Mode (Production)

1. Switch to **LIVE MODE** in Stripe
2. Use live keys (already in Railway)
3. Real payments will be processed!

## 📝 Troubleshooting

### Products not found
- Run the setup script: `railway run --service backend "cd backend/scripts && node setup-stripe-products.js"`
- Or verify products exist in Stripe Dashboard

### Webhook not receiving events
- Check webhook URL is correct in Stripe Dashboard
- Verify `STRIPE_WEBHOOK_SECRET` matches in Railway
- Check Stripe Dashboard → Webhooks → Your endpoint → Recent events

### Checkout redirects to wrong URL
- Set `FRONTEND_URL` in Railway backend service
- Should be your frontend domain (e.g., `https://your-app.up.railway.app`)

## ✅ Checklist

- [ ] Run setup script to create products
- [ ] Set up webhook endpoint in Stripe Dashboard
- [ ] Add `STRIPE_WEBHOOK_SECRET` to Railway backend
- [ ] Verify `FRONTEND_URL` is set in Railway backend
- [ ] Verify `VITE_STRIPE_PUBLISHABLE_KEY` is set in Railway frontend
- [ ] Test checkout flow
- [ ] Verify webhook delivers events successfully

Once all checked, your Stripe subscriptions are ready! 🎉

