# Secure FAL API Key Setup Guide

## ⚠️ Security Notice

**NEVER commit API keys to git!** All `.env` files are in `.gitignore` and should remain private.

## Required Environment Variables

You need to set the FAL API key in **TWO places**:

### 1. Frontend (`.env` file in root directory)
```bash
VITE_FAL_API_KEY=your_new_fal_api_key_here
```

### 2. Backend (`.env` file in `backend/` directory OR environment variables)
```bash
FAL_API_KEY=your_new_fal_api_key_here
```

## Quick Setup Steps

### Option 1: Using .env files (Recommended for local development)

1. **Frontend** - Create or update `.env` in the root directory:
   ```bash
   echo "VITE_FAL_API_KEY=your_new_fal_api_key_here" >> .env
   ```

2. **Backend** - Create or update `backend/.env`:
   ```bash
   echo "FAL_API_KEY=your_new_fal_api_key_here" >> backend/.env
   ```

### Option 2: Using environment variables (Recommended for production)

Set these in your hosting platform (Railway, Vercel, etc.):

- `VITE_FAL_API_KEY` - For frontend
- `FAL_API_KEY` - For backend

## Security Best Practices

✅ **DO:**
- Store API keys in `.env` files (already in `.gitignore`)
- Use different keys for development and production if possible
- Rotate keys regularly
- Use environment variables in production hosting platforms

❌ **DON'T:**
- Commit `.env` files to git
- Share API keys in chat, email, or documentation
- Use the same key for frontend and backend in production (though same key is OK for development)
- Hardcode keys in source code

## Verification

After setting the keys:

1. **Restart your development server** (required for env changes)
2. Check the console for any "FAL_API_KEY not configured" errors
3. Test image/video generation to verify the key works

## Current Security Status

✅ Backend now uses **only** `FAL_API_KEY` (removed insecure fallback to `VITE_FAL_API_KEY`)
✅ All `.env` files are in `.gitignore`
✅ API keys are never exposed in frontend code (only used in backend API calls)

## Important Notes

- The backend **must** use `FAL_API_KEY` (not `VITE_FAL_API_KEY`) for security
- Frontend uses `VITE_FAL_API_KEY` but it's only used for direct API calls from frontend services
- For maximum security, consider proxying all FAL API calls through your backend

