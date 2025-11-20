# Quick Stripe Subscriptions Setup

## ✅ What's Already Done

1. ✅ Backend is running on port 3001
2. ✅ Stripe subscription code is implemented
3. ✅ Setup script is ready to use
4. ✅ Frontend components are configured

## 🚀 Quick Setup (3 Steps)

### Step 1: Get Your Stripe Keys

1. Go to https://dashboard.stripe.com/apikeys
2. **Switch to LIVE MODE** (toggle top right)
3. Copy:
   - **Publishable key**: `pk_live_...`
   - **Secret key**: `sk_live_...` (click "Reveal")

### Step 2: Create `backend.env` File

Create `/Users/libr/Downloads/Seisoai/backend.env`:

```env
STRIPE_SECRET_KEY=sk_live_YOUR_ACTUAL_KEY_HERE
STRIPE_WEBHOOK_SECRET=whsec_YOUR_WEBHOOK_SECRET_HERE
FRONTEND_URL=http://localhost:5173
```

**For webhook secret**: See Step 3 below.

### Step 3: Set Up Webhook

**Option A: Local Development (Use Stripe CLI)**
```bash
# Install Stripe CLI: https://stripe.com/docs/stripe-cli
stripe listen --forward-to localhost:3001/api/stripe/webhook
# Copy the whsec_... secret it shows
```

**Option B: Production**
1. Go to https://dashboard.stripe.com/webhooks
2. Click "+ Add endpoint"
3. URL: `https://your-backend-domain.com/api/stripe/webhook`
4. Select events: `checkout.session.completed`, `invoice.payment_succeeded`
5. Copy the signing secret to `backend.env`

### Step 4: Create Products

```bash
cd backend/scripts
node setup-stripe-products.js
```

This creates:
- Starter Pack: $10/month
- Creator Pack: $20/month  
- Pro Pack: $40/month
- Studio Pack: $80/month

### Step 5: Restart Backend

```bash
# Stop current backend (Ctrl+C)
cd backend
npm start
```

Look for: `✅ Stripe configured with LIVE key`

### Step 6: Frontend Configuration

Add to your frontend `.env` or deployment platform:

```env
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_YOUR_ACTUAL_KEY_HERE
```

## 🧪 Test It

1. Visit your pricing page
2. Click "Subscribe Now" on any plan
3. Use test card: `4242 4242 4242 4242` (if in test mode)
4. Complete checkout
5. Credits should be added automatically via webhook

## 📚 Full Guide

See `STRIPE_SUBSCRIPTIONS_SETUP_GUIDE.md` for detailed instructions.

