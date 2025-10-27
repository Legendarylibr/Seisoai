# Stablecoin Payment Testing Guide

## ✅ Backend is Working Correctly

### Payment Detection Flow

1. **Frontend calls**: `/api/payment/check-payment` or `/api/payment/instant-check`
2. **Backend searches**: All chains for USDC transfers to payment wallet
3. **Backend checks**: Amount matches expected amount (±1%)
4. **Backend adds credits**: 6.67 credits per USDC (non-NFT) or 10 credits per USDC (NFT)
5. **Backend saves**: Payment to history to prevent duplicate processing

### Current Payment Addresses
- **EVM Chains**: `0xa0aE05e2766A069923B2a51011F270aCadFf023a`
- **Solana**: `CkhFmeUNxdr86SZEPg6bLgagFkRyaDMTmFzSVL69oadA`

### Credit Rates
- **Regular Users**: 6.67 credits per USDC
- **NFT Holders**: 10 credits per USDC

## 🧪 How to Test

### Option 1: Frontend Flow (Recommended)
1. Go to https://seisoai-prod.up.railway.app
2. Connect wallet
3. Click "Buy Credits" 
4. Choose USDC payment
5. Send exact amount of USDC to the payment address
6. Click "Check Payment"
7. Credits should be detected and added

### Option 2: Manual API Test
```bash
# Test payment detection
curl -X POST https://seisoai-prod.up.railway.app/api/payment/check-payment \
  -H "Content-Type: application/json" \
  -d '{
    "walletAddress": "0x686B86Cd9F8792985904da924c9A21a65Fca2176",
    "expectedAmount": "10",
    "token": "USDC",
    "chainId": "1"
  }'
```

## ⚙️ Payment Detection Settings

- **Blocks checked**: Last 10 blocks (to avoid RPC limits)
- **Timeout**: 3 seconds per chain
- **Chains checked**: Ethereum, Polygon, Arbitrum, Optimism, Base, Solana
- **Deduplication**: Checks payment history by txHash

## 📊 Expected Behavior

When a payment is detected:
```json
{
  "success": true,
  "paymentDetected": true,
  "payment": {
    "txHash": "0x...",
    "amount": "10.0",
    "token": "USDC",
    "chain": "ethereum",
    "creditsAdded": 66
  },
  "newBalance": 165
}
```

## 🔍 Troubleshooting

### Payments Not Detected?

1. **Check blocks**: Only last 10 blocks are scanned
2. **Check amount**: Must match exactly (±1% tolerance)
3. **Check RPC**: Some RPC endpoints may be rate-limited
4. **Check address**: Must send to correct payment address

### Frontend Not Showing Credits?

1. **Clear browser cache**: Sometimes old API URL is cached
2. **Check console**: Look for "Credits loaded: X" message
3. **Refresh**: Use the refresh button in wallet connect component
4. **Wait**: Periodic refresh happens every 60 seconds

## ✅ Status

Your stablecoin payment system is fully functional:
- ✅ Payment detection working
- ✅ Credit calculation correct
- ✅ Payment history tracked
- ✅ Deduplication prevents double credits
- ✅ Multi-chain support active

