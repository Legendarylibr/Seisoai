# Stripe Products Setup Guide

This guide explains how to set up the Stripe subscription products for credit card payments.

## Quick Setup

Run the setup script to automatically create all three subscription products in your Stripe account:

```bash
cd backend/scripts
node setup-stripe-products.js
```

### Dry Run (Preview)

To see what will be created without making changes:

```bash
node setup-stripe-products.js --dry-run
```

## Products Created

The script creates four subscription products:

1. **Starter Pack** - $15/month
   - Lookup Key: `starter_pack_monthly`
   - Description: Perfect for trying out Seiso AI

2. **Creator Pack** - $25/month
   - Lookup Key: `creator_pack_monthly`
   - Description: Great for regular creators

3. **Pro Pack** - $50/month
   - Lookup Key: `pro_pack_monthly`
   - Description: Best value for power users

4. **Studio Pack** - $100/month
   - Lookup Key: `studio_pack_monthly`
   - Description: For professional studios

## Prerequisites

1. **Stripe Secret Key**: Make sure `STRIPE_SECRET_KEY` is set in your environment
   - For local: Set in `backend.env` or `.env`
   - For production: Set in your deployment platform (Railway, etc.)

2. **Live Mode**: The script works with both test and live keys, but production should use live keys (`sk_live_...`)

## What the Script Does

1. Checks for existing products with the same names
2. Creates products if they don't exist
3. Creates prices with lookup keys for easy reference
4. Handles existing products/prices gracefully (won't duplicate)

## Verification

After running the script:

1. Check your Stripe Dashboard → Products
2. Verify all three products are created
3. Verify each product has a recurring price with the correct lookup key
4. Test the checkout flow in your application

## Manual Setup (Alternative)

If you prefer to set up products manually in the Stripe Dashboard:

1. Go to https://dashboard.stripe.com/products
2. Click "Add product"
3. For each product:
   - Enter the product name
   - Set the price (recurring, monthly)
   - **Important**: Set a "Lookup key" matching the keys in `PricingPage.jsx`:
     - `starter_pack_monthly`
     - `creator_pack_monthly`
     - `pro_pack_monthly`
     - `studio_pack_monthly`

## Troubleshooting

### Error: STRIPE_SECRET_KEY not found
- Make sure you have `STRIPE_SECRET_KEY` set in your environment
- Check `backend.env` or `.env` file exists and has the key

### Error: Invalid Stripe secret key format
- Stripe keys should start with `sk_live_` (production) or `sk_test_` (testing)
- Make sure you copied the full key

### Products already exist
- The script will detect existing products and reuse them
- If you want to recreate, delete them in Stripe Dashboard first

## Integration

The lookup keys are already configured in:
- `src/components/PricingPage.jsx` - Frontend pricing display
- `backend/server.js` - Backend checkout session creation

No code changes needed after running the script!

