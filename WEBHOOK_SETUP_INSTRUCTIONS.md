# Webhook Setup - Quick Instructions

## ✅ Products Already Created!

All 4 subscription products are set up in Stripe:
- Starter Pack ($10/month)
- Creator Pack ($20/month)  
- Pro Pack ($40/month)
- Studio Pack ($80/month)

## 🚀 Set Up Webhook (Choose One Method)

### Method 1: Using the Script (Easiest)

1. Get your Railway backend URL from Railway Dashboard
   - Go to your Railway project
   - Select the backend service
   - Copy the domain (e.g., `https://your-backend.up.railway.app`)

2. Run the script:
   ```bash
   ./create-webhook.sh https://your-backend.up.railway.app
   ```

3. Copy the signing secret it outputs

4. Add to Railway:
   - Railway Dashboard → Backend Service → Variables
   - Add: `STRIPE_WEBHOOK_SECRET=whsec_...`

### Method 2: Using Stripe CLI Directly

```bash
export STRIPE_API_KEY=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

stripe webhook_endpoints create \
  --url "https://YOUR-BACKEND.up.railway.app/api/stripe/webhook" \
  --enabled-events checkout.session.completed invoice.payment_succeeded \
  --api-key "$STRIPE_API_KEY"
```

Then get the signing secret from the output and add it to Railway.

### Method 3: Using Stripe Dashboard

1. Go to https://dashboard.stripe.com/webhooks (LIVE MODE)
2. Click **"+ Add endpoint"**
3. Enter URL: `https://your-backend.up.railway.app/api/stripe/webhook`
4. Select events:
   - ✅ `checkout.session.completed`
   - ✅ `invoice.payment_succeeded`
5. Click **"Add endpoint"**
6. Click on the endpoint → **"Reveal"** signing secret
7. Copy `whsec_...` and add to Railway as `STRIPE_WEBHOOK_SECRET`

## ✅ Final Checklist

- [ ] Webhook endpoint created in Stripe
- [ ] `STRIPE_WEBHOOK_SECRET` added to Railway backend service
- [ ] `FRONTEND_URL` set in Railway backend service
- [ ] `VITE_STRIPE_PUBLISHABLE_KEY` set in Railway frontend service

Once all checked, your subscriptions are ready! 🎉

