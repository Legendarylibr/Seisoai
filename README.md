# SeisoAI

AI-powered creative platform for generating images, videos, music, and more. Built with React, Node.js, and powered by FAL.ai.

## Features

- **Image Generation** - Create stunning AI images with multiple models and styles
- **Video Generation** - Generate AI videos from text or images
- **Music Generation** - Create AI music with stem separation and mixing
- **3D Model Generation** - Convert images to 3D models
- **Chat Assistant** - AI-powered creative assistant
- **Prompt Lab** - Optimize and enhance your prompts
- **Public Gallery** - Share and browse community creations
- **Referral System** - Earn credits by referring friends
- **Achievements** - Gamified progression system

## Tech Stack

- **Frontend**: React 18, Vite, TypeScript, Tailwind CSS
- **Backend**: Node.js, Express, TypeScript
- **Database**: MongoDB
- **Cache**: Redis
- **AI Provider**: FAL.ai
- **Payments**: Crypto (USDC, USDT, DAI on EVM chains + Solana)
- **Wallets**: MetaMask, Phantom, WalletConnect, and more

## Quick Start

### Prerequisites

- Node.js 22+ (see `.nvmrc`)
- MongoDB (local or Atlas)
- Redis (optional, recommended for production)
- FAL.ai API key

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/Legendarylibr/Seisoai.git
   cd Seisoai
   ```

2. **Install dependencies**
   ```bash
   npm install
   cd backend && npm install
   ```

3. **Configure environment**
   ```bash
   cp env.example .env
   cp backend/env.example backend/.env
   ```

4. **Set required environment variables** in both `.env` files:
   - `FAL_API_KEY` - Get from [fal.ai](https://fal.ai)
   - `MONGODB_URI` - Your MongoDB connection string
   - `JWT_SECRET` - Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - `ENCRYPTION_KEY` - Generate with same command above
   - Payment wallet addresses for receiving crypto payments

5. **Start development servers**
   ```bash
   # Terminal 1: Frontend
   npm run dev

   # Terminal 2: Backend
   npm run start:backend
   ```

6. **Open** `http://localhost:5173`

## Payment System

SeisoAI uses cryptocurrency payments exclusively:

### Supported Tokens
- **EVM Chains**: USDC, USDT, DAI, WETH
- **Networks**: Ethereum, Polygon, Arbitrum, Optimism, Base
- **Solana**: USDC, USDT, SOL

### Wallet Support
- MetaMask, Rabby, Coinbase Wallet, Rainbow, Trust Wallet
- Phantom, Solflare (Solana)
- WalletConnect (200+ wallets)

## Project Structure

```
seisoai/
├── src/                    # React frontend
│   ├── components/         # UI components
│   ├── contexts/           # React contexts
│   ├── services/           # API services
│   └── utils/              # Utilities
├── backend/                # Express API
│   ├── routes/             # API routes
│   ├── services/           # Business logic
│   ├── middleware/         # Express middleware
│   └── models/             # Mongoose models
└── k8s/                    # Kubernetes configs
```

## Deployment

### Railway (Recommended)
```bash
railway up
```

### Docker
```bash
docker-compose -f docker-compose.prod.yml up -d
```

### Kubernetes
```bash
kubectl apply -f k8s/
```

## Documentation

- [Contributing Guide](./CONTRIBUTING.md)
- [Backend Security](./backend/SECURITY.md)

## Environment Variables

See `env.example` and `backend/env.example` for all configuration options.

### Critical Variables

| Variable | Description |
|----------|-------------|
| `FAL_API_KEY` | FAL.ai API key for AI generation |
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | Secret for JWT tokens (min 32 chars) |
| `ENCRYPTION_KEY` | AES-256 encryption key (64 hex chars) |
| `ALCHEMY_API_KEY` | Alchemy API key for blockchain RPC |

## License

[MIT License](./LICENSE)
