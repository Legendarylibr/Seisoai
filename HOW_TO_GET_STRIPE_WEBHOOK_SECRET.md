# How to Get STRIPE_WEBHOOK_SECRET

## 📍 Where to Find It

### Step 1: Go to Stripe Webhooks Page
**Direct Link**: https://dashboard.stripe.com/webhooks

Or navigate manually:
1. Go to https://dashboard.stripe.com
2. Make sure you're in **LIVE MODE** (toggle in top right corner)
3. Click **"Developers"** in the left sidebar
4. Click **"Webhooks"** in the submenu

---

### Step 2: Find or Create Your Webhook Endpoint

#### If You Already Have a Webhook Endpoint:
- You'll see it listed on the webhooks page
- Click on the webhook endpoint to view details

#### If You Don't Have a Webhook Endpoint Yet:
1. Click **"+ Add endpoint"** button (top right)
2. Enter your webhook URL:
   ```
   https://your-backend-domain.com/api/stripe/webhook
   ```
   Example: `https://your-app.up.railway.app/api/stripe/webhook`
3. Select events to listen to:
   - ✅ **`payment_intent.succeeded`** (required)
   - Optionally: `payment_intent.payment_failed` (for error handling)
4. Click **"Add endpoint"**

---

### Step 3: Get the Signing Secret

1. **Click on your webhook endpoint** (from the list)
2. You'll see a page with webhook details
3. Look for **"Signing secret"** section
4. Click **"Reveal"** or **"Click to reveal"** button
5. Copy the secret (it starts with `whsec_...`)

**Example format:**
```
whsec_1234567890abcdefghijklmnopqrstuvwxyz
```

---

### Step 4: Add to Railway/Environment Variables

**For Railway Backend Service:**
```
STRIPE_WEBHOOK_SECRET=whsec_your_actual_secret_here
```

**For Local Development (`backend/.env`):**
```
STRIPE_WEBHOOK_SECRET=whsec_your_actual_secret_here
```

---

## 🎯 Quick Visual Guide

```
Stripe Dashboard
├── Developers (left sidebar)
    └── Webhooks (submenu)
        ├── Your Webhook Endpoint (click it)
        │   └── Signing secret (click "Reveal")
        │       └── Copy: whsec_...
        └── + Add endpoint (if you don't have one)
```

---

## 📝 Important Notes

1. **LIVE vs TEST Mode**: 
   - Make sure you're in **LIVE MODE** when getting the webhook secret
   - Test mode webhook secrets are different from live mode

2. **Webhook URL Must Match**:
   - Your webhook endpoint URL must be accessible from the internet
   - Railway automatically provides HTTPS URLs
   - Format: `https://your-backend.railway.app/api/stripe/webhook`

3. **One Secret Per Endpoint**:
   - Each webhook endpoint has its own unique signing secret
   - If you create a new endpoint, you'll get a new secret

4. **Security**:
   - Never commit the webhook secret to git
   - Keep it in environment variables only
   - It's safe to use in backend (never expose to frontend)

---

## 🔍 Troubleshooting

### Can't find webhooks section?
- Make sure you're logged into your Stripe account
- Check that you have the right permissions
- Try: https://dashboard.stripe.com/webhooks directly

### Webhook secret not showing?
- Make sure you clicked on the webhook endpoint (not just viewing the list)
- Try refreshing the page
- Check if you're in LIVE mode (not test mode)

### Need to test webhooks?
- You can use Stripe CLI: `stripe listen --forward-to localhost:3001/api/stripe/webhook`
- Or use test mode webhooks for local testing

---

## 📚 Related Links

- **Stripe Webhooks Dashboard**: https://dashboard.stripe.com/webhooks
- **Stripe Webhook Docs**: https://stripe.com/docs/webhooks
- **Stripe CLI**: https://stripe.com/docs/stripe-cli

---

**Last Updated**: November 5, 2025

