# AI Image Generator Backend

A comprehensive backend API for the AI Image Generator that stores user data by wallet address with automatic cleanup after 30 days.

## 📝 For AI Agents: TypeScript Migration

If you're helping with the JavaScript-to-TypeScript migration:

- **📖 Detailed Guide**: See [REWRITE_GUIDE.md](./REWRITE_GUIDE.md) for complete conversion instructions
- **✅ Checklist**: See [REWRITE_CHECKLIST.md](./REWRITE_CHECKLIST.md) for remaining files and quick reference
- **🏗️ Architecture**: See [ARCHITECTURE.md](./ARCHITECTURE.md) for project structure

**Remaining files to convert:**
- `routes/generate.js` → `routes/generate.ts`
- `routes/wan-animate.js` → `routes/wan-animate.ts`

## Features

- **Wallet-based User Management**: Users identified by wallet address
- **Credit System**: Track credits earned and spent
- **Payment Verification**: Verify blockchain transactions
- **Gallery Storage**: Store generated images and metadata
- **Generation History**: Track all image generations
- **NFT Integration**: Store NFT collection data
- **Auto-cleanup**: Automatically delete user data after 30 days
- **Multi-chain Support**: Ethereum, Polygon, Arbitrum, Optimism, Base, Solana

## New Features (v1.1.0)

- **API Versioning**: Supports `/api/v1/*` and `/api/*` (defaults to v1)
- **Request ID Tracing**: Every request has a unique ID for debugging
- **Redis Integration**: Distributed caching and session management
- **Job Queues**: Background job processing with BullMQ
- **Circuit Breakers**: Protection against cascading failures
- **OpenAPI Documentation**: API docs available at `/api/docs`
- **CI/CD Pipeline**: GitHub Actions for automated testing and deployment
- **Comprehensive Testing**: Jest test framework with coverage

## Quick Start

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Run Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run in watch mode
npm run test:watch
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

### Authentication

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/auth/signup` | Create account with email/password | None |
| POST | `/api/auth/signin` | Sign in with email/password | None |
| POST | `/api/auth/refresh` | Refresh access token | Refresh Token |
| POST | `/api/auth/logout` | Logout and blacklist token | JWT |
| POST | `/api/auth/forgot-password` | Request password reset | None |
| POST | `/api/auth/verify-reset-token` | Verify reset token validity | None |
| POST | `/api/auth/reset-password` | Reset password with token | None |

### User Management

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/users/:walletAddress` | Get user data | JWT |
| PUT | `/api/users/:walletAddress/settings` | Update user settings | JWT |
| POST | `/api/nft/check-credits` | Check user credits | JWT |

### Payments

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/payments/verify` | Verify blockchain payment | JWT |

### Generations

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/generate` | Generate image | JWT |
| POST | `/api/generations/add` | Add to history | JWT |
| GET | `/api/gallery/:walletAddress` | Get user gallery | JWT |
| DELETE | `/api/gallery/:id` | Delete from gallery | JWT |

### Discord Integration

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/auth/discord` | Start Discord OAuth | None |
| GET | `/api/auth/discord/callback` | Discord OAuth callback | None |
| POST | `/api/auth/discord-link-code` | Generate link code | JWT |
| POST | `/api/auth/verify-discord-link` | Verify link code | Bot API Key |

### GDPR Compliance

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/gdpr/export` | Export user data | JWT |
| POST | `/api/gdpr/rectify` | Update user data | JWT |
| DELETE | `/api/gdpr/delete` | Delete user account | JWT |

### System

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/health` | Health check | None |
| GET | `/api/version` | API version info | None |

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

See [SECURITY.md](./SECURITY.md) for comprehensive security documentation.

### Authentication & Authorization
- **JWT Authentication**: Access tokens (15min) + Refresh tokens (7d)
- **Token Blacklisting**: Redis/in-memory blacklist for logout
- **Account Lockout**: 5 failed attempts → 15min lockout with exponential backoff
- **Password Requirements**: 12+ chars, uppercase, lowercase, number, special char

### Input Validation & Sanitization
- **NoSQL Injection Prevention**: Deep sanitization of all inputs
- **XSS Prevention**: HTML entity encoding, script tag removal
- **Prototype Pollution Prevention**: Blocks `__proto__`, `constructor`, `prototype`
- **Email Validation**: RFC-compliant regex with disposable domain blocking

### Rate Limiting
- **IP-based Rate Limiting**: Configurable limits per endpoint
- **Browser Fingerprinting**: Additional client identification
- **Exponential Backoff**: Increasing delays on repeated failures

### Cryptographic Security
- **AES-256-GCM Encryption**: For sensitive data at rest
- **Timing-Safe Comparisons**: Prevents timing attacks on secrets
- **Secure Token Generation**: `crypto.randomBytes` for all tokens
- **Password Hashing**: bcrypt with configurable rounds

### API Security
- **CSRF Protection**: Double-submit cookie pattern
- **Security Headers**: CSP, HSTS, X-Frame-Options, etc.
- **RPC Proxy Whitelist**: Only read-only blockchain methods allowed
- **Redirect URL Validation**: Prevents open redirect attacks

### Monitoring & Alerting
- **Security Event Alerts**: Real-time Discord webhook notifications
- **Request ID Tracing**: Every request has unique ID for debugging
- **Structured Logging**: JSON logs with security context

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
