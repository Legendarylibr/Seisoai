# AI Image Generator Backend

A comprehensive backend API for the AI Image Generator that stores user data by wallet address with automatic cleanup after 30 days.

## Features

- **Wallet-based User Management**: Users identified by wallet address
- **Credit System**: Track credits earned and spent
- **Payment Verification**: Verify blockchain transactions
- **Gallery Storage**: Store generated images and metadata
- **Generation History**: Track all image generations
- **NFT Integration**: Store NFT collection data
- **Auto-cleanup**: Automatically delete user data after 30 days
- **Multi-chain Support**: Ethereum, Polygon, Arbitrum, Optimism, Base, Solana

## Quick Start

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Set Up Environment Variables

Copy `env.example` to `.env` and configure:

```bash
cp env.example .env
```

Update the `.env` file with your actual values:

```env
# Database
MONGODB_URI=mongodb://localhost:27017/ai-image-generator

# Payment Wallets (your actual wallet addresses)
ETH_PAYMENT_WALLET=0xYourEthereumWallet
POLYGON_PAYMENT_WALLET=0xYourPolygonWallet
# ... etc

# RPC Endpoints (your actual RPC URLs)
ETH_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY
POLYGON_RPC_URL=https://polygon-mainnet.g.alchemy.com/v2/YOUR_API_KEY
# ... etc
```

### 3. Set Up MongoDB

Install MongoDB locally or use MongoDB Atlas:

**Local MongoDB:**
```bash
# Install MongoDB
# macOS: brew install mongodb-community
# Ubuntu: sudo apt-get install mongodb
# Windows: Download from https://www.mongodb.com/try/download/community

# Start MongoDB
mongod
```

**MongoDB Atlas (Cloud):**
1. Create account at https://www.mongodb.com/atlas
2. Create a cluster
3. Get connection string
4. Update `MONGODB_URI` in `.env`

### 4. Start the Server

```bash
# Development
npm run dev

# Production
npm start
```

The API will be available at `http://localhost:3001`

## API Endpoints

### User Management

- `GET /api/users/:walletAddress` - Get user data
- `POST /api/nft/check-credits` - Check user credits
- `PUT /api/users/:walletAddress/settings` - Update user settings

### Payments

- `POST /api/payments/verify` - Verify payment transaction

### Generations

- `POST /api/generations/add` - Add generation to history
- `GET /api/gallery/:walletAddress` - Get user gallery
- `DELETE /api/gallery/:walletAddress/:generationId` - Delete generation

### System

- `GET /api/health` - Health check

## Database Schema

### User Document

```javascript
{
  walletAddress: String,        // User's wallet address (unique)
  credits: Number,              // Current credits
  totalCreditsEarned: Number,   // Total credits ever earned
  totalCreditsSpent: Number,    // Total credits ever spent
  nftCollections: [{            // NFT collections owned
    contractAddress: String,
    chainId: String,
    tokenIds: [String],
    lastChecked: Date
  }],
  paymentHistory: [{            // Payment transactions
    txHash: String,
    tokenSymbol: String,
    amount: Number,
    credits: Number,
    chainId: String,
    walletType: String,
    timestamp: Date
  }],
  generationHistory: [{         // All generations
    id: String,
    prompt: String,
    style: String,
    imageUrl: String,
    creditsUsed: Number,
    timestamp: Date
  }],
  gallery: [{                   // Gallery items
    id: String,
    imageUrl: String,
    prompt: String,
    style: String,
    creditsUsed: Number,
    timestamp: Date
  }],
  settings: {                   // User preferences
    preferredStyle: String,
    defaultImageSize: String,
    enableNotifications: Boolean
  },
  lastActive: Date,             // Last activity
  createdAt: Date,              // Account creation
  expiresAt: Date               // Auto-deletion date (30 days)
}
```

## Auto-cleanup

The system automatically deletes user data after 30 days of inactivity:

- **Cron Job**: Runs daily at midnight
- **Cleanup Logic**: Deletes users where `expiresAt < now()`
- **Data Retention**: All user data is permanently deleted
- **Privacy**: No data is kept beyond the 30-day limit

## Payment Verification

The backend verifies blockchain transactions by:

1. **Fetching Transaction**: Get transaction details from blockchain
2. **Validating Details**: Check sender, recipient, amount
3. **Confirming Transfer**: Verify tokens were sent to payment wallet
4. **Calculating Credits**: Apply credit rate based on token
5. **Updating Database**: Add credits to user account

## Security Features

- **Input Validation**: All inputs are validated and sanitized
- **Rate Limiting**: Prevents abuse (configurable)
- **Transaction Verification**: Blockchain-level verification
- **Duplicate Prevention**: Prevents double-spending
- **Auto-cleanup**: No permanent data storage

## Deployment

### Using PM2

```bash
# Install PM2
npm install -g pm2

# Start application
pm2 start server.js --name "ai-image-generator-api"

# Save PM2 configuration
pm2 save
pm2 startup
```

### Using Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3001
CMD ["node", "server.js"]
```

### Environment Variables for Production

Make sure to set these in your production environment:

- `MONGODB_URI` - Your MongoDB connection string
- `ETH_PAYMENT_WALLET` - Your Ethereum payment wallet
- `POLYGON_PAYMENT_WALLET` - Your Polygon payment wallet
- `ETH_RPC_URL` - Your Ethereum RPC endpoint
- `POLYGON_RPC_URL` - Your Polygon RPC endpoint
- `NODE_ENV=production`

## Monitoring

The API includes health check endpoint:

```bash
curl http://localhost:3001/api/health
```

Response:
```json
{
  "success": true,
  "message": "AI Image Generator API is running",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Troubleshooting

### Common Issues

1. **MongoDB Connection Failed**
   - Check MongoDB is running
   - Verify connection string
   - Check network connectivity

2. **Payment Verification Failed**
   - Verify RPC endpoints are working
   - Check payment wallet addresses
   - Ensure transaction is confirmed

3. **Credits Not Updating**
   - Check transaction hash is unique
   - Verify payment wallet matches
   - Check token configuration

### Logs

The application logs important events:

- User creation and updates
- Payment verifications
- Credit transactions
- Cleanup operations
- Errors and warnings

## Support

For issues or questions:

1. Check the logs for error messages
2. Verify environment variables
3. Test API endpoints with curl/Postman
4. Check MongoDB connection and data
