# How to Find Your Railway Backend URL

## Quick Method (30 seconds)

1. Go to: https://railway.app/dashboard
2. Click on project: **Seisoai**
3. Click on your **backend service** (usually named "backend" or similar)
4. Click **Settings** tab
5. Scroll to **Domains** section
6. Copy the Railway-provided domain (looks like: `https://xxxxx.up.railway.app`)

## Then Create the Webhook

Once you have the URL, run:

```bash
./create-webhook.sh https://YOUR-BACKEND-URL.up.railway.app
```

Or create it directly with Stripe CLI:

```bash
# Set your Stripe Secret Key (get it from https://dashboard.stripe.com/apikeys)
export STRIPE_API_KEY=sk_live_YOUR_ACTUAL_KEY_HERE

stripe webhook_endpoints create \
  --url "https://YOUR-BACKEND-URL.up.railway.app/api/stripe/webhook" \
  --enabled-events checkout.session.completed invoice.payment_succeeded \
  --api-key "$STRIPE_API_KEY"
```

Copy the `secret` from output and add to Railway as `STRIPE_WEBHOOK_SECRET`.

