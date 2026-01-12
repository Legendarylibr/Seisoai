# Build Scripts Analysis

## Overview

This document analyzes all build scripts and deployment configurations across the project.

## Build Scripts by Package

### Root Package (`package.json`)

```json
{
  "build": "vite build",                    // Builds frontend only
  "build:start": "npm run build && npm start",
  "start": "node --import tsx start-app.ts"
}
```

**Purpose**: Builds the React frontend using Vite.

### Backend Package (`backend/package.json`)

```json
{
  "build": "tsc",                          // Compiles TypeScript (optional)
  "start": "tsx server-modular.ts"         // Runs directly with tsx
}
```

**Purpose**: Backend runs directly with `tsx` - no compilation needed in production.

### Discord Bot Package (`discord-bot/package.json`)

```json
{
  "build": "tsc",                          // Compiles TypeScript
  "start": "node dist/index.js"           // Runs compiled JS
}
```

**Purpose**: Discord bot needs to be compiled before running.

## Railway Deployment Flow

### Configuration Files

**`railway.toml`**:
- Builder: `nixpacks`
- Config: `nixpacks.toml`
- Start Command: `node --import tsx serve-real-backend.ts`
- Watch Patterns: `["src/**", "backend/**", "package.json", "vite.config.ts"]`

**`nixpacks.toml`** - Build Process:

1. **Setup Phase**:
   - Installs Node.js 22 and ffmpeg

2. **Install Phase**:
   ```bash
   npm ci --prefer-offline --no-audit --no-fund
   cd backend && npm ci --prefer-offline --no-audit --no-fund
   ```

3. **Build Phase**:
   ```bash
   rm -rf dist
   NODE_ENV=production npm run build  # Runs 'vite build'
   npm prune --omit=dev
   cd backend && npm prune --omit=dev
   ```

4. **Start Phase**:
   ```bash
   node --import tsx serve-real-backend.ts
   ```

### What Gets Built

✅ **Frontend**: Built via `vite build` → outputs to `dist/`  
✅ **Backend**: Runs directly with `tsx` (no build needed)  
❌ **Discord Bot**: NOT included in Railway build

## Start Scripts

### `serve-real-backend.ts` (Railway Production)
- Validates environment variables
- Imports `backend/server-modular.ts` directly
- Uses `tsx` to run TypeScript without compilation

### `start-app.ts` (Alternative)
- Similar to `serve-real-backend.ts`
- Used for local development

## Potential Issues

### 1. Railway Not Detecting Changes

**Watch Patterns** in `railway.toml`:
```toml
watchPatterns = ["src/**", "backend/**", "package.json", "vite.config.ts"]
```

**Missing**: `discord-bot/**` - Discord bot changes won't trigger rebuilds

**Solution**: Add `discord-bot/**` to watch patterns if Discord bot is deployed separately.

### 2. Build Not Triggering

**Check**:
- Railway Dashboard → Settings → Source
- Verify GitHub connection
- Verify branch is `main`
- Verify Auto Deploy is enabled

### 3. Environment Variables

**Required in Production** (from `serve-real-backend.ts`):
- `MONGODB_URI`
- `JWT_SECRET`
- `ENCRYPTION_KEY`

**Check**: Railway Dashboard → Variables

### 4. Build Process

**Current Flow**:
1. Install root dependencies
2. Install backend dependencies
3. Build frontend (`npm run build`)
4. Prune dev dependencies
5. Start server with `tsx`

**Note**: Backend TypeScript is NOT compiled - runs directly with `tsx`.

## Discord Bot Deployment

**Separate Service**: Discord bot is NOT deployed via Railway in this configuration.

**To Deploy Discord Bot**:
1. Create separate Railway service
2. Set root directory to `discord-bot/`
3. Build command: `npm run build`
4. Start command: `npm start`

## Build Verification

### Local Build Test

```bash
# Test frontend build
npm run build

# Test backend (no build needed)
cd backend && npm start

# Test discord bot build
cd discord-bot && npm run build && npm start
```

### Railway Build Test

1. Check Railway Dashboard → Deployments
2. View build logs for each phase
3. Verify:
   - ✅ Dependencies installed
   - ✅ Frontend built successfully
   - ✅ Server started without errors

## Recommendations

### 1. Add Discord Bot to Watch Patterns (if needed)

```toml
watchPatterns = [
  "src/**", 
  "backend/**", 
  "discord-bot/**",  # Add this
  "package.json", 
  "vite.config.ts"
]
```

### 2. Verify Railway Connection

- Railway Dashboard → Settings → Source
- Ensure GitHub repo is connected
- Ensure branch is `main`
- Ensure Auto Deploy is enabled

### 3. Check Build Logs

If builds aren't triggering:
1. Railway Dashboard → Deployments
2. Check latest deployment logs
3. Look for errors in install/build phases

### 4. Manual Trigger

If auto-deploy isn't working:
```bash
railway login
railway redeploy --service Seisoai
```

Or via Railway Dashboard → Deployments → Redeploy

## Summary

**What Railway Builds**:
- ✅ Frontend (React/Vite) → `dist/` folder
- ✅ Backend runs directly with `tsx` (no compilation)

**What Railway Doesn't Build**:
- ❌ Discord bot (separate service if needed)

**Build Trigger**:
- Pushes to `main` branch should trigger rebuild
- Watch patterns monitor: `src/`, `backend/`, `package.json`, `vite.config.ts`

**If Railway Isn't Rebuilding**:
1. Check GitHub connection in Railway dashboard
2. Verify Auto Deploy is enabled
3. Check watch patterns match your changes
4. Manually trigger via Railway dashboard
