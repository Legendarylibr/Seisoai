# Contributing to SeisoAI

Thank you for your interest in contributing to SeisoAI! This document provides guidelines and information for contributors.

## Getting Started

### Prerequisites

- Node.js 22+ (see `.nvmrc`)
- MongoDB (local or Atlas)
- Redis (optional, for production features)

### Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-org/seisoai.git
   cd seisoai
   ```

2. **Install dependencies**
   ```bash
   npm install
   cd backend && npm install
   cd ../discord-bot && npm install
   ```

3. **Configure environment**
   ```bash
   cp env.example .env
   cp backend/env.example backend/.env
   ```

4. **Start development servers**
   ```bash
   # Terminal 1: Frontend
   npm run dev

   # Terminal 2: Backend
   npm run start:backend
   ```

## Project Structure

```
seisoai/
├── src/                    # React frontend
│   ├── components/         # UI components
│   ├── contexts/           # React contexts
│   ├── hooks/              # Custom hooks
│   ├── services/           # API services
│   ├── constants/          # App constants
│   └── utils/              # Utility functions
├── backend/                # Express API
│   ├── routes/             # API routes
│   ├── services/           # Business logic
│   ├── middleware/         # Express middleware
│   ├── models/             # Mongoose models
│   └── utils/              # Backend utilities
├── discord-bot/            # Discord bot
│   ├── src/commands/       # Slash commands
│   └── src/services/       # Bot services
└── docs/                   # Documentation
```

## Code Style

- **TypeScript**: All code should be written in TypeScript
- **ESLint**: Run `npm run lint` before committing
- **Formatting**: We use EditorConfig for consistent formatting

### Naming Conventions

- **Files**: `camelCase.ts` for utilities, `PascalCase.tsx` for components
- **Functions**: `camelCase`
- **Classes/Types**: `PascalCase`
- **Constants**: `SCREAMING_SNAKE_CASE`

## Making Changes

### Branch Naming

- `feature/description` - New features
- `fix/description` - Bug fixes
- `refactor/description` - Code refactoring
- `docs/description` - Documentation updates

### Commit Messages

Write clear, concise commit messages:

```
feat: add music generation with genre selection
fix: resolve credit calculation for NFT holders
refactor: extract Win95 components to shared folder
docs: update API documentation for v2 endpoints
```

### Pull Requests

1. Create a feature branch from `main`
2. Make your changes with clear commits
3. Run tests: `cd backend && npm test`
4. Run linter: `npm run lint`
5. Create a PR with a clear description

## Testing

### Backend Tests
```bash
cd backend
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # With coverage
```

### Type Checking
```bash
# Frontend
npx tsc --noEmit

# Backend
cd backend && npm run typecheck
```

## Security

- Never commit `.env` files or API keys
- Report security issues privately to security@seisoai.com
- Follow the security guidelines in the backend code comments

## Need Help?

- Check existing issues and discussions
- Create a new issue with the `question` label
- Join our Discord for community support

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
