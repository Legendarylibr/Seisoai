# Stripe Subscriptions Setup with Stripe CLI

This guide uses Stripe CLI to set up your subscription products and webhook.

## Prerequisites

✅ Stripe CLI is installed (already done!)

## Step 1: Get Your Stripe Secret Key

Since your keys are in Railway, you can:

**Option A: Get from Railway Dashboard**
1. Go to your Railway project
2. Select backend service
3. Go to Variables tab
4. Copy `STRIPE_SECRET_KEY` value

**Option B: Use Railway CLI**
```bash
railway variables --service backend
```

## Step 2: Create Products with Stripe CLI

### Method 1: Using the Setup Script

```bash
# Get your Stripe secret key from Railway
export STRIPE_SECRET_KEY=sk_live_YOUR_KEY_HERE

# Run the setup script
cd backend/scripts
./setup-stripe-cli.sh
```

### Method 2: Manual Stripe CLI Commands

```bash
# Set your API key
export STRIPE_API_KEY=sk_live_YOUR_KEY_HERE

# Create Starter Pack
stripe products create \
  --name "Starter Pack" \
  --description "Perfect for trying out Seiso AI"

# Get the product ID from output, then create price
stripe prices create \
  --product prod_XXXXX \
  --unit-amount 1000 \
  --currency usd \
  --recurring interval=month \
  --lookup-key starter_pack_monthly

# Repeat for other products...
```

## Step 3: Set Up Webhook with Stripe CLI

### For Local Development

```bash
# Start webhook forwarding
stripe listen --forward-to localhost:3001/api/stripe/webhook

# This will output a webhook signing secret (whsec_...)
# Copy it and add to Railway backend service as STRIPE_WEBHOOK_SECRET
```

### For Production

1. **Create webhook endpoint in Stripe Dashboard:**
   ```bash
   # Or use Stripe CLI to create endpoint
   stripe webhook_endpoints create \
     --url https://your-backend.up.railway.app/api/stripe/webhook \
     --enabled-events checkout.session.completed invoice.payment_succeeded
   ```

2. **Get the webhook signing secret:**
   ```bash
   stripe webhook_endpoints list
   # Click on the endpoint in dashboard to get signing secret
   ```

3. **Add to Railway:**
   - Go to Railway backend service → Variables
   - Add: `STRIPE_WEBHOOK_SECRET=whsec_...`

## Step 4: Verify Setup

```bash
# List products
stripe products list

# List prices with lookup keys
stripe prices list --limit 100

# Test webhook (local)
stripe trigger checkout.session.completed
```

## Quick Reference Commands

```bash
# Login to Stripe CLI (opens browser)
stripe login

# List all products
stripe products list

# List all prices
stripe prices list

# Create a test webhook event
stripe trigger checkout.session.completed

# Listen for webhooks (local dev)
stripe listen --forward-to localhost:3001/api/stripe/webhook

# View webhook events
stripe events list
```

## Troubleshooting

### "Authentication required"
- Run `stripe login` first
- Or set `STRIPE_API_KEY` environment variable

### "Product already exists"
- The script will detect and reuse existing products
- Check existing products: `stripe products list`

### Webhook not receiving events
- Verify webhook URL is correct
- Check `STRIPE_WEBHOOK_SECRET` matches in Railway
- Test with: `stripe trigger checkout.session.completed`

## Next Steps

After products are created:
1. ✅ Verify in Stripe Dashboard → Products
2. ✅ Set up webhook endpoint
3. ✅ Add `STRIPE_WEBHOOK_SECRET` to Railway
4. ✅ Test checkout flow

Your subscriptions are ready! 🎉

