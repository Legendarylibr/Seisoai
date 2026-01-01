# Backend Architecture

## Status: ✅ Complete (Modular) | 🔄 TypeScript Migration In Progress

The backend has been refactored from a monolithic 10,975-line server.js into a clean modular architecture with a 274-line entry point.

**TypeScript Migration**: Most files have been converted to TypeScript. See [REWRITE_GUIDE.md](./REWRITE_GUIDE.md) for conversion status and [REWRITE_CHECKLIST.md](./REWRITE_CHECKLIST.md) for remaining work.

## Directory Structure

```
backend/
├── server.js              # Main entry point (274 lines)
├── server-original.js     # Backup of original (10,975 lines)
├── server-modular.js      # Modular version copy
│
├── config/
│   ├── index.ts           # Config barrel export ✅ TS
│   ├── constants.ts       # Application constants ✅ TS
│   ├── env.ts             # Environment variables ✅ TS
│   └── database.ts        # MongoDB connection ✅ TS
│
├── middleware/
│   ├── index.ts           # Middleware barrel export ✅ TS
│   ├── auth.ts            # JWT authentication ✅ TS
│   ├── credits.ts         # Credit checking ✅ TS
│   ├── rateLimiter.ts     # Rate limiting ✅ TS
│   └── validation.ts      # Input sanitization ✅ TS
│
├── services/
│   ├── index.ts           # Services barrel export ✅ TS
│   ├── cache.ts           # LRU and TTL caches ✅ TS
│   ├── stripe.ts          # Stripe integration ✅ TS
│   ├── fal.ts             # FAL.ai integration ✅ TS
│   ├── user.ts            # User management ✅ TS
│   └── blockchain.ts      # Blockchain interactions ✅ TS
│
├── routes/
│   ├── index.ts           # Route aggregation ✅ TS
│   ├── auth.ts            # Authentication routes ✅ TS
│   ├── user.ts            # User management routes ✅ TS
│   ├── generate.js        # Image/video/music generation ⚠️ JS
│   ├── wan-animate.js     # WAN animate routes ⚠️ JS
│   ├── gallery.ts         # Gallery routes ✅ TS
│   ├── payments.ts        # Blockchain payment routes ✅ TS
│   ├── stripe.ts          # Stripe payment routes ✅ TS
│   ├── admin.ts           # Admin routes ✅ TS
│   ├── rpc.ts             # RPC proxy routes ✅ TS
│   ├── extract.ts         # Layer extraction routes ✅ TS
│   ├── utility.ts         # Health, CORS, logging ✅ TS
│   ├── static.ts          # Robots.txt, favicon, metrics ✅ TS
│   └── health.ts          # Health check ✅ TS
│
├── models/                # Database models (unchanged)
├── utils/                 # Utilities (unchanged)
└── scripts/               # Admin scripts (unchanged)
```

## Route Modules (14 total)

| Module | Routes | Description |
|--------|--------|-------------|
| auth.js | 6 | Signup, signin, verify, logout, refresh, me |
| user.js | 4 | User info, credits, NFT verification |
| generate.js | 5 | Image, video, music, status, result |
| wan-animate.js | 6 | Upload video/image, submit, status, result, complete |
| gallery.js | 4 | Get gallery, stats, delete, save |
| payments.js | 2 | Get address, verify payment |
| stripe.js | 4 | Payment intent, subscription, webhook, verify |
| admin.js | 4 | Add credits, fix documents |
| rpc.js | 3 | Solana RPC, EVM RPC, config |
| extract.js | 1 | Layer extraction |
| utility.js | 3 | Health, CORS info, logs |
| static.js | 3 | Robots.txt, favicon, metrics |

## Key Improvements

1. **Maintainability**: 274 lines vs 10,975 lines
2. **Separation of Concerns**: Each module has a single responsibility
3. **Testability**: Routes can be tested independently
4. **Scalability**: Easy to add new routes
5. **Dependency Injection**: Routes receive dependencies, not import globals

## Usage

### Start Server

```bash
cd backend
node server.js
```

### Rollback to Original

```bash
cp server-original.js server.js
```

## Testing

All routes verified working:
- ✅ Health check
- ✅ Authentication (signup, signin, verify)
- ✅ Image/video/music generation
- ✅ WAN animate (upload, submit, status)
- ✅ Gallery management
- ✅ Payments (Stripe, blockchain)
- ✅ Admin functions
- ✅ RPC proxy
- ✅ Static files (robots.txt, metrics)

## TypeScript Migration

Most of the codebase has been migrated to TypeScript. For agents continuing the migration:

- **Guide**: See [REWRITE_GUIDE.md](./REWRITE_GUIDE.md) for detailed conversion instructions
- **Checklist**: See [REWRITE_CHECKLIST.md](./REWRITE_CHECKLIST.md) for remaining files
- **Reference**: Use `routes/auth.ts` as the reference implementation

**Remaining files to convert:**
- `routes/generate.js` → `routes/generate.ts`
- `routes/wan-animate.js` → `routes/wan-animate.ts`
