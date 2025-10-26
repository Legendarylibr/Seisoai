# Backend API Endpoints Reference

## Overview
All endpoints are prefixed with `/api` and return JSON responses. Wallet addresses are automatically lowercased for consistency.

## Endpoints by Category

### User Management

#### `GET /api/users/:walletAddress`
Get user data by wallet address.

**Response:**
```json
{
  "success": true,
  "user": {
    "walletAddress": "0x123...",
    "credits": 100,
    "totalCreditsEarned": 500,
    "totalCreditsSpent": 400,
    "nftCollections": [],
    "paymentHistory": [...],
    "generationHistory": [...],
    "gallery": [...],
    "settings": {...},
    "lastActive": "2024-01-01T00:00:00.000Z"
  }
}
```

#### `PUT /api/users/:walletAddress/settings`
Update user settings.

**Request Body:**
```json
{
  "preferredStyle": "photorealistic",
  "defaultImageSize": "1024x1024",
  "enableNotifications": true
}
```

### Payments

#### `POST /api/payment/get-address`
Get payment wallet address for a specific chain/token.

**Request Body:**
```json
{
  "chainId": "1",
  "tokenSymbol": "USDC"
}
```

**Response:**
```json
{
  "success": true,
  "paymentAddress": "0x123...",
  "chainId": "1",
  "tokenSymbol": "USDC"
}
```

#### `POST /api/payment/check-payment`
Check for blockchain payment (monitors blockchain).

**Request Body:**
```json
{
  "walletAddress": "0x123...",
  "expectedAmount": "10",
  "token": "USDC",
  "chainId": "1"
}
```

**Response:**
```json
{
  "success": true,
  "paymentDetected": true,
  "payment": {
    "txHash": "0xabc...",
    "amount": "10",
    "token": "USDC",
    "chain": "ethereum",
    "creditsAdded": 66
  },
  "newBalance": 166
}
```

#### `POST /api/payment/instant-check`
Instant payment check endpoint (faster detection).

**Request Body:**
```json
{
  "walletAddress": "0x123...",
  "expectedAmount": "10",
  "token": "USDC"
}
```

#### `POST /api/payments/verify`
Verify a payment transaction.

**Request Body:**
```json
{
  "txHash": "0xabc...",
  "walletAddress": "0x123...",
  "tokenSymbol": "USDC",
  "amount": "10",
  "chainId": "1",
  "walletType": "evm"
}
```

### Stripe Payments

#### `POST /api/stripe/create-payment-intent`
Create a Stripe payment intent.

**Request Body:**
```json
{
  "walletAddress": "0x123...",
  "amount": 50.00,
  "currency": "usd",
  "credits": 666
}
```

**Response:**
```json
{
  "success": true,
  "clientSecret": "pi_xxx_secret_yyy"
}
```

#### `POST /api/stripe/verify-payment`
Verify Stripe payment and award credits.

**Request Body:**
```json
{
  "paymentIntentId": "pi_xxx",
  "walletAddress": "0x123..."
}
```

#### `POST /api/stripe/webhook`
Stripe webhook endpoint for payment notifications.

### NFT Verification

#### `POST /api/nft/check-holdings`
Check NFT holdings for a wallet.

**Request Body:**
```json
{
  "walletAddress": "0x123...",
  "collections": [
    {
      "chainId": "1",
      "address": "0xabc...",
      "name": "Collection Name"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "isHolder": true,
  "collections": [
    {
      "contractAddress": "0xabc...",
      "chainId": "1",
      "tokenIds": ["1", "2", "3"]
    }
  ]
}
```

#### `POST /api/nft/check-credits`
Check user credits (legacy endpoint).

### Generations & Gallery

#### `POST /api/generations/add`
Add a generation to history.

**Request Body:**
```json
{
  "walletAddress": "0x123...",
  "prompt": "Beautiful sunset",
  "style": "photorealistic",
  "imageUrl": "https://...",
  "creditsUsed": 10
}
```

**Response:**
```json
{
  "success": true,
  "generationId": "gen_xxx",
  "message": "Generation added successfully"
}
```

#### `GET /api/gallery/:walletAddress`
Get user gallery with pagination.

**Query Parameters:**
- `page` (default: 1)
- `limit` (default: 20)

**Response:**
```json
{
  "success": true,
  "gallery": [...],
  "total": 50,
  "page": 1,
  "limit": 20
}
```

#### `DELETE /api/gallery/:walletAddress/:generationId`
Delete a generation from gallery.

**Response:**
```json
{
  "success": true,
  "message": "Generation deleted successfully"
}
```

### Content Safety

#### `POST /api/safety/violation`
Log a content safety violation.

**Request Body:**
```json
{
  "violationType": "CSAM",
  "prompt": "...",
  "walletAddress": "0x123...",
  "reason": "Inappropriate content detected"
}
```

### Admin

#### `POST /api/admin/add-credits`
Add credits to a user account (admin only).

**Request Body:**
```json
{
  "walletAddress": "0x123...",
  "credits": 100,
  "reason": "Promotional credits"
}
```

### System

#### `GET /api/health`
Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 3600,
  "environment": "production",
  "database": "connected"
}
```

## Data Storage

### User Schema
All user data is stored keyed by wallet address (lowercased for consistency):

```javascript
{
  walletAddress: String (lowercase, unique, indexed),
  credits: Number (current balance),
  totalCreditsEarned: Number,
  totalCreditsSpent: Number,
  nftCollections: Array,
  paymentHistory: Array,
  generationHistory: Array,
  gallery: Array,
  settings: Object,
  lastActive: Date,
  createdAt: Date,
  expiresAt: Date
}
```

### Payment History Schema
All payment records follow this structure:

```javascript
{
  txHash: String,
  tokenSymbol: String,
  amount: Number,
  credits: Number,
  chainId: String,
  walletType: String,
  timestamp: Date
}
```

## Important Notes

1. **Wallet Address Normalization**: All wallet addresses are automatically lowercased when stored in the database to ensure consistency.

2. **Credit Calculation**: 
   - Regular users: 1 USDC = 6.67 credits
   - NFT holders: 1 USDC = 10 credits

3. **Payment Deduplication**: The system checks `paymentHistory` to prevent double-processing of the same transaction.

4. **Auto-cleanup**: User data is automatically deleted after 30 days of inactivity.

5. **Error Handling**: All endpoints return `{ success: true/false, error?: string }` format.
