# Debugging Webhook Issues

## Most Common Issue: Missing STRIPE_WEBHOOK_SECRET

If credits aren't being added, the most likely cause is that `STRIPE_WEBHOOK_SECRET` is not set in Railway.

**Check:**
1. Go to Railway Dashboard → Backend Service → Variables
2. Verify `STRIPE_WEBHOOK_SECRET` exists
3. Value should be: `whsec_TdMRww8Ja1L1zai06d4oIYhut9XECZCX`

**If missing, add it:**
- Variable name: `STRIPE_WEBHOOK_SECRET`
- Variable value: `whsec_TdMRww8Ja1L1zai06d4oIYhut9XECZCX`
- Save and redeploy

## Check Webhook Delivery in Stripe

1. Go to: https://dashboard.stripe.com/webhooks
2. Click on the webhook endpoint: `https://seisoai.com/api/stripe/webhook`
3. Check "Recent events" tab
4. Look for `checkout.session.completed` event
5. Click on it to see:
   - Delivery status (success/failed)
   - Response code
   - Error message (if any)

## Check Backend Logs

Check your Railway backend logs for:
- "Webhook signature verification failed" - means STRIPE_WEBHOOK_SECRET is wrong/missing
- "Checkout session completed via webhook" - webhook received
- "Credits added via subscription checkout webhook" - credits were added
- "Could not find user" - user lookup failed

## Manual Credit Addition (Temporary Fix)

If webhook isn't working, you can manually add credits via API or database, but fix the webhook first!

