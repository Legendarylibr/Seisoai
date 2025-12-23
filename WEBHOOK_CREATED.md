# ✅ Stripe Webhook Endpoint Created!

## Webhook Details

- **Webhook ID**: `we_1SVPOT6XpprUkSc5OKv3jE5E`
- **URL**: `https://seisoai.com/api/stripe/webhook`
- **Status**: Enabled
- **Events**:
  - ✅ `checkout.session.completed`
  - ✅ `invoice.payment_succeeded`

## 🔐 Signing Secret

**IMPORTANT**: Add this to Railway as `STRIPE_WEBHOOK_SECRET`:

```
whsec_YOUR_WEBHOOK_SECRET_HERE
```

**Note**: Get the actual signing secret from Stripe Dashboard → Webhooks → Your endpoint → "Reveal" button

## 📝 Next Steps

1. **Add to Railway Backend Service:**
   - Go to Railway Dashboard → Your Backend Service → Variables
   - Add new variable:
     - **Name**: `STRIPE_WEBHOOK_SECRET`
     - **Value**: `whsec_YOUR_ACTUAL_SECRET_HERE` (from Stripe Dashboard)
   - Save

2. **Verify `FRONTEND_URL` is set:**
   - In Railway backend service variables
   - Should be: `https://seisoai.com` (or your frontend URL)

3. **Test the subscription flow:**
   - Visit your pricing page
   - Subscribe to a plan
   - Verify credits are added via webhook

## ✅ Setup Complete!

Your Stripe subscriptions are now fully configured:
- ✅ Products created (Starter, Creator, Pro, Studio packs)
- ✅ Webhook endpoint created
- ⚠️ **Action needed**: Add `STRIPE_WEBHOOK_SECRET` to Railway

Once you add the secret to Railway, subscriptions will be fully functional! 🎉

