# Subscription Verification Testing

## Test Results ✅

The subscription verification endpoint has been tested and is working correctly:

### Test 1: Health Check ✅
- Endpoint is accessible
- Signup is available
- All required environment variables are configured

### Test 2: Endpoint Validation ✅
- Endpoint correctly validates that `sessionId` is required
- Returns proper error message when `sessionId` is missing

### Test 3: Error Handling ✅
- Endpoint handles invalid session IDs gracefully
- Returns appropriate error responses

## How to Test with a Real Subscription

### Step 1: Complete a Subscription Checkout
1. Go to your pricing page
2. Click "Subscribe Now" on any plan
3. Complete the Stripe checkout process
4. After payment, you'll be redirected back with `?session_id=cs_...` in the URL

### Step 2: Test the Verification Endpoint

**Option A: Using the Test Script**
```bash
# Test with session ID only (will use metadata/auth token)
node backend/scripts/test-subscription-verification.js <sessionId>

# Test with session ID and userId
node backend/scripts/test-subscription-verification.js <sessionId> <userId>

# Test against production
node backend/scripts/test-subscription-verification.js <sessionId> <userId> https://seisoai-prod.up.railway.app
```

**Option B: Using curl**
```bash
curl -X POST https://seisoai-prod.up.railway.app/api/subscription/verify \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -d '{"sessionId": "cs_test_..."}'
```

**Option C: Using Browser Console**
After completing checkout, open browser console and run:
```javascript
const sessionId = new URLSearchParams(window.location.search).get('session_id');
const token = localStorage.getItem('authToken');

fetch('https://seisoai-prod.up.railway.app/api/subscription/verify', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({ sessionId })
})
  .then(r => r.json())
  .then(data => console.log('Verification result:', data));
```

## Expected Results

### Success Response
```json
{
  "success": true,
  "credits": 50,
  "totalCredits": 50,
  "planName": "Starter Pack",
  "planPrice": "$10.00/month",
  "amount": 10
}
```

### Already Processed Response
```json
{
  "success": true,
  "alreadyProcessed": true,
  "credits": 0,
  "totalCredits": 50,
  "planName": "Starter Pack",
  "planPrice": "$10.00/month",
  "amount": 10
}
```

### Error Responses
- `400`: Missing sessionId, payment not completed, or invalid session
- `404`: User not found (check metadata in Stripe session)
- `500`: Server error (check logs)

## User Lookup Priority

The endpoint tries to find the user in this order:
1. **Auth Token** (from `Authorization: Bearer <token>` header)
2. **Request userId** (from request body)
3. **Session metadata userId** (from Stripe checkout session)
4. **Session metadata walletAddress** (from Stripe checkout session)
5. **Session metadata email** (from Stripe checkout session)
6. **Stripe customer email** (retrieved from Stripe API)

## Troubleshooting

### Credits Not Added
1. Check if payment status is "paid" in Stripe dashboard
2. Verify session metadata contains userId/email
3. Check backend logs for error messages
4. Ensure user exists in database

### User Not Found
1. Verify the checkout session was created with proper metadata
2. Check if user email matches Stripe customer email
3. Try providing userId explicitly in the request
4. Check backend logs for detailed lookup attempts

### Already Processed
- This is expected if webhook already processed the payment
- Credits should already be in the user's account
- Check user's credit balance

## Credit Calculation

Credits are calculated based on:
- **Base Rate**: 5 credits per dollar
- **Scaling Multiplier**:
  - $10/month: 1.0x (no bonus)
  - $20-39/month: 1.1x (10% bonus)
  - $40-79/month: 1.2x (20% bonus)
  - $80+/month: 1.3x (30% bonus)
- **NFT Multiplier**: 1.2x (20% bonus) if user has linked wallet with NFTs

Example: $20/month subscription = 20 × 5 × 1.1 = 110 credits

