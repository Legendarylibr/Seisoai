# Quick Start Guide

## 🚀 Get Running in 2 Minutes

### 1. Copy Environment Files
```bash
cp env.example .env
cp backend/env.example backend/.env
```

### 2. Set Required Environment Variables

#### Frontend (.env)
```bash
# Required for image generation
VITE_FAL_API_KEY=your_actual_fal_api_key_here

# Payment wallets (replace with your actual addresses)
VITE_ETH_PAYMENT_WALLET=0x1234567890123456789012345678901234567890
VITE_POLYGON_PAYMENT_WALLET=0x1234567890123456789012345678901234567890
VITE_ARBITRUM_PAYMENT_WALLET=0x1234567890123456789012345678901234567890
VITE_OPTIMISM_PAYMENT_WALLET=0x1234567890123456789012345678901234567890
VITE_BASE_PAYMENT_WALLET=0x1234567890123456789012345678901234567890
VITE_SOLANA_PAYMENT_WALLET=So11111111111111111111111111111111111111112
```

#### Backend (.env)
```bash
# Database
MONGODB_URI=mongodb://localhost:27017/ai-image-generator

# Payment wallets (same as frontend)
ETH_PAYMENT_WALLET=0x1234567890123456789012345678901234567890
POLYGON_PAYMENT_WALLET=0x1234567890123456789012345678901234567890
ARBITRUM_PAYMENT_WALLET=0x1234567890123456789012345678901234567890
OPTIMISM_PAYMENT_WALLET=0x1234567890123456789012345678901234567890
BASE_PAYMENT_WALLET=0x1234567890123456789012345678901234567890
SOLANA_PAYMENT_WALLET=So11111111111111111111111111111111111111112

# RPC Endpoints
ETH_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY
POLYGON_RPC_URL=https://polygon-mainnet.g.alchemy.com/v2/YOUR_API_KEY
ARBITRUM_RPC_URL=https://arb-mainnet.g.alchemy.com/v2/YOUR_API_KEY
OPTIMISM_RPC_URL=https://opt-mainnet.g.alchemy.com/v2/YOUR_API_KEY
BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_API_KEY
```

### 3. Install Dependencies
```bash
npm install
cd backend && npm install
```

### 4. Start Development Servers
```bash
# Terminal 1 - Frontend
npm run dev

# Terminal 2 - Backend
cd backend && npm run dev
```

### 5. Open Your Browser
Visit `http://localhost:5173`

## ✅ What's Fixed

- ✅ **No more environment variable errors** - App runs with warnings instead of crashing
- ✅ **Ethereum property conflicts resolved** - Better wallet injection protection
- ✅ **Graceful fallbacks** - App continues to work even with missing config
- ✅ **Security maintained** - All critical security fixes still in place

## 🔧 Development Mode

The app now runs in "development mode" with:
- Warning messages for missing environment variables
- Fallback values for payment wallets
- Graceful error handling
- All security features intact

## 🚀 Production Deployment

For production, ensure ALL environment variables are properly set:
- Real API keys
- Actual wallet addresses
- Production database URLs
- Proper RPC endpoints

See [SECURITY_CHECKLIST.md](./SECURITY_CHECKLIST.md) for complete production setup.

## 🆘 Troubleshooting

### "Missing environment variables" warnings
- This is normal in development
- Set the variables in your .env file to remove warnings
- App will work with fallback values

### Wallet connection issues
- Make sure you have a wallet extension installed
- Try refreshing the page
- Check browser console for specific errors

### Image generation not working
- Ensure VITE_FAL_API_KEY is set correctly
- Check your FAL.ai account has credits
- Verify the API key is valid

## 📞 Need Help?

- Check the [SECURITY_CHECKLIST.md](./SECURITY_CHECKLIST.md) for security setup
- Review the [README.md](./README.md) for detailed documentation
- Check browser console for specific error messages
