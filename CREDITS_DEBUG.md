# Credits Not Showing in Production - Debug Guide

## Common Issues

### 1. **VITE_API_URL Not Set in Production**

**Problem**: Frontend defaults to `http://localhost:3001` which won't work in production.

**Check**:
```javascript
// In browser console on production site:
console.log('API_URL:', import.meta.env.VITE_API_URL);
// Should show your production backend URL, not localhost
```

**Fix**: Set `VITE_API_URL` in your production build environment:
- **Vercel**: Add to Environment Variables in project settings
- **Netlify**: Add to Site settings → Environment variables
- **Railway**: Add to frontend service environment variables
- **Build-time**: Must be set before `npm run build`

**Example**:
```bash
VITE_API_URL=https://your-backend.up.railway.app
```

### 2. **CORS Blocking Requests**

**Problem**: Backend `ALLOWED_ORIGINS` doesn't include your production frontend URL.

**Check**:
```javascript
// In browser console on production site:
fetch('https://your-backend.up.railway.app/api/cors-info')
  .then(r => r.json())
  .then(console.log)
  .catch(err => console.error('CORS Error:', err));
```

**Fix**: Add your production frontend URL to backend `ALLOWED_ORIGINS`:
```bash
ALLOWED_ORIGINS=https://your-frontend.com,https://www.your-frontend.com
```

### 3. **Network Errors (Silent Failures)**

**Problem**: API calls fail but errors are caught silently, credits default to 0.

**Check Browser Console**:
- Open DevTools → Console
- Look for errors like:
  - `Failed to fetch`
  - `NetworkError`
  - `CORS policy`
  - `404 Not Found`

**Check Network Tab**:
- Open DevTools → Network
- Filter by "Fetch/XHR"
- Look for requests to `/api/users/...` or `/api/auth/me`
- Check if they're:
  - ❌ Red (failed)
  - ⚠️ CORS errors
  - ⚠️ 404/500 errors

### 4. **Environment Variable Not Available at Build Time**

**Problem**: Vite environment variables must be available at build time, not runtime.

**Check**:
```javascript
// This will show what was baked into the build:
console.log('All env vars:', import.meta.env);
```

**Fix**: 
- Rebuild after setting environment variables
- Vite variables (VITE_*) are replaced at build time
- They cannot be changed after build without rebuilding

## Debugging Steps

### Step 1: Check API_URL in Production

```javascript
// Run in browser console on production site
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
console.log('Current API_URL:', API_URL);
console.log('Is localhost?', API_URL.includes('localhost'));
```

**Expected**: Should show your production backend URL (e.g., `https://your-backend.up.railway.app`)

### Step 2: Test API Endpoint Directly

```javascript
// Run in browser console on production site
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const testUrl = `${API_URL}/api/health`;

fetch(testUrl)
  .then(r => {
    console.log('✅ Health check status:', r.status);
    return r.json();
  })
  .then(data => console.log('✅ Health check response:', data))
  .catch(err => {
    console.error('❌ Health check failed:', err);
    console.error('This indicates:', err.message.includes('CORS') ? 'CORS issue' : 'Network/URL issue');
  });
```

### Step 3: Test Credits Endpoint (Wallet Users)

```javascript
// Run in browser console (replace with your wallet address)
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const walletAddress = 'YOUR_WALLET_ADDRESS';
const testUrl = `${API_URL}/api/users/${walletAddress.toLowerCase()}?skipNFTs=true`;

fetch(testUrl)
  .then(r => {
    console.log('Status:', r.status, r.statusText);
    if (!r.ok) {
      return r.text().then(text => {
        console.error('❌ Error response:', text);
        throw new Error(`HTTP ${r.status}: ${text}`);
      });
    }
    return r.json();
  })
  .then(data => {
    console.log('✅ Credits response:', data);
    console.log('Credits:', data.user?.credits || data.credits || 0);
  })
  .catch(err => {
    console.error('❌ Credits fetch failed:', err);
  });
```

### Step 4: Test Auth Endpoint (Email Users)

```javascript
// Run in browser console (requires auth token)
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const token = localStorage.getItem('authToken'); // or wherever token is stored

if (!token) {
  console.error('❌ No auth token found');
} else {
  fetch(`${API_URL}/api/auth/me`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  })
    .then(r => {
      console.log('Status:', r.status, r.statusText);
      if (!r.ok) {
        return r.text().then(text => {
          console.error('❌ Error response:', text);
          throw new Error(`HTTP ${r.status}: ${text}`);
        });
      }
      return r.json();
    })
    .then(data => {
      console.log('✅ Auth response:', data);
      console.log('Credits:', data.user?.credits || 0);
    })
    .catch(err => {
      console.error('❌ Auth fetch failed:', err);
    });
}
```

## Quick Fixes

### Fix 1: Set VITE_API_URL in Production

**Vercel**:
1. Go to Project Settings → Environment Variables
2. Add: `VITE_API_URL` = `https://your-backend.up.railway.app`
3. Redeploy

**Netlify**:
1. Go to Site settings → Environment variables
2. Add: `VITE_API_URL` = `https://your-backend.up.railway.app`
3. Redeploy

**Railway** (if frontend is separate):
1. Go to frontend service → Variables
2. Add: `VITE_API_URL` = `https://your-backend.up.railway.app`
3. Redeploy

### Fix 2: Update Backend CORS

**Railway Backend**:
1. Go to backend service → Variables
2. Update `ALLOWED_ORIGINS`:
   ```
   https://your-frontend.com,https://www.your-frontend.com
   ```
3. Redeploy backend

### Fix 3: Check Backend Logs

Check your backend logs for:
- CORS errors
- 404 errors on `/api/users/...`
- Authentication errors

## Verification

After fixes, verify:

1. ✅ `VITE_API_URL` is set correctly in production
2. ✅ Backend `ALLOWED_ORIGINS` includes frontend URL
3. ✅ API health check works from production frontend
4. ✅ Credits endpoint returns data (check Network tab)
5. ✅ No CORS errors in browser console
6. ✅ Credits display in UI

## Still Not Working?

1. **Check browser console** for specific error messages
2. **Check Network tab** for failed requests
3. **Check backend logs** for incoming requests
4. **Verify environment variables** are set correctly
5. **Rebuild frontend** after setting `VITE_API_URL`

