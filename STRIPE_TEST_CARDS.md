# Stripe Test Cards Guide

## Issue: "Your card was declined. Your request was in test mode, but used a non test card."

This error means you're using **Stripe Test Mode** (test keys: `pk_test_...` or `sk_test_...`) but trying to use a **real credit card**. 

Stripe Test Mode **only accepts test card numbers** - it will never charge real cards.

---

## Solution Options

### Option 1: Use Test Cards (Recommended for Testing)

If you're testing the payment flow, use these **Stripe test card numbers**:

#### Successful Test Cards

| Card Number | Description |
|------------|-------------|
| `4242 4242 4242 4242` | Visa - Always succeeds |
| `5555 5555 5555 4444` | Mastercard - Always succeeds |
| `4000 0566 5566 5556` | Visa (debit) - Always succeeds |
| `5200 8282 8282 8210` | Mastercard (debit) - Always succeeds |

**Use any future expiry date** (e.g., `12/34`)  
**Use any 3-digit CVC** (e.g., `123`)  
**Use any ZIP code** (e.g., `12345`)

#### Test Cards for Different Scenarios

| Card Number | Description |
|------------|-------------|
| `4000 0000 0000 0002` | Card declined (generic decline) |
| `4000 0000 0000 9995` | Insufficient funds |
| `4000 0000 0000 0069` | Expired card |
| `4000 0025 0000 3155` | Requires authentication (3D Secure) |

**Full list**: https://stripe.com/docs/testing

---

### Option 2: Switch to Live Mode (For Real Payments)

If you want to accept **real credit cards** and process **real payments**, you need to:

1. **Switch to Live Mode Keys**:
   - Go to https://dashboard.stripe.com/apikeys
   - Toggle to **"LIVE MODE"** (top right of dashboard)
   - Copy your **Live keys**:
     - `pk_live_...` (Publishable key)
     - `sk_live_...` (Secret key)

2. **Update Environment Variables**:

   **Frontend** (`.env` or Railway):
   ```bash
   VITE_STRIPE_PUBLISHABLE_KEY=pk_live_your_actual_live_key_here
   ```

   **Backend** (`backend/.env` or Railway):
   ```bash
   STRIPE_SECRET_KEY=sk_live_your_actual_live_key_here
   ```

3. **Restart Your Application**:
   - Restart backend server
   - Rebuild frontend if needed

4. **⚠️ Important**: 
   - Live mode will charge **real credit cards** and process **real payments**
   - Make sure you're ready for production
   - Test thoroughly before going live

---

## How to Check Your Current Stripe Mode

### Check Frontend Configuration

1. Open browser console (F12)
2. Check the Stripe publishable key:
   ```javascript
   console.log(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);
   ```
3. If it starts with `pk_test_` → **Test Mode**
4. If it starts with `pk_live_` → **Live Mode**

### Check Backend Configuration

1. Check your backend environment variables:
   ```bash
   # Local development
   cat backend/.env | grep STRIPE_SECRET_KEY
   
   # Railway
   railway variables --service backend
   ```
2. If it starts with `sk_test_` → **Test Mode**
3. If it starts with `sk_live_` → **Live Mode**

---

## Quick Fix: Use Test Card

For immediate testing, use this test card:

**Card Number**: `4242 4242 4242 4242`  
**Expiry**: Any future date (e.g., `12/34`)  
**CVC**: Any 3 digits (e.g., `123`)  
**ZIP**: Any 5 digits (e.g., `12345`)

This will work immediately with test mode keys.

---

## Testing Payment Flow

### Test Payment Scenarios

1. **Successful Payment**:
   - Use: `4242 4242 4242 4242`
   - Result: Payment succeeds immediately

2. **Payment Requires Authentication**:
   - Use: `4000 0025 0000 3155`
   - Result: Requires 3D Secure authentication

3. **Payment Declined**:
   - Use: `4000 0000 0000 0002`
   - Result: Card declined error

4. **Insufficient Funds**:
   - Use: `4000 0000 0000 9995`
   - Result: Insufficient funds error

---

## Recommended Setup

### For Development
- ✅ Use **Test Mode** keys (`pk_test_...`, `sk_test_...`)
- ✅ Use **Test Cards** for testing
- ✅ No real money charged

### For Production
- ✅ Use **Live Mode** keys (`pk_live_...`, `sk_live_...`)
- ✅ Accept real credit cards
- ✅ Process real payments

---

## Additional Resources

- **Stripe Test Cards**: https://stripe.com/docs/testing
- **Stripe Dashboard**: https://dashboard.stripe.com/test/apikeys
- **Stripe API Documentation**: https://stripe.com/docs/api

---

## Common Issues

### Issue: "Invalid API Key"
**Solution**: Make sure both frontend and backend use keys from the same mode (both test or both live)

### Issue: "Test mode card used with live key"
**Solution**: Switch to live mode cards when using live keys (or use test keys)

### Issue: "Payment succeeded but credits not added"
**Solution**: Check webhook configuration and verify payment intent status

---

**Last Updated**: November 5, 2025

