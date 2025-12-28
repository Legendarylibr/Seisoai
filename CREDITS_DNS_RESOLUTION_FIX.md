# Credits Not Loading - DNS Resolution Error Fix

**Error:** `ERR_NAME_NOT_RESOLVED`  
**Issue:** Credits are not showing because the API URL cannot be resolved

---

## Understanding the Error

`ERR_NAME_NOT_RESOLVED` means the browser cannot resolve the domain name in your `VITE_API_URL` to an IP address. This typically happens when:

1. **`VITE_API_URL` is not set** - Defaults to `http://localhost:3001` which won't work in production
2. **Invalid domain** - The domain in `VITE_API_URL` doesn't exist or is unreachable
3. **Backend is down** - The backend service is not running or not accessible
4. **Network issue** - DNS server cannot resolve the domain

---

## Quick Diagnosis

### Step 1: Check Current API URL

Open browser console and check what API URL is being used:

```javascript
// In browser console:
console.log('API_URL:', import.meta.env.VITE_API_URL);
```

**Expected:** Should show your production backend URL (e.g., `https://your-backend.up.railway.app`)  
**Problem:** Shows `undefined` or `http://localhost:3001` in production

---

### Step 2: Check Network Tab

1. Open DevTools → Network tab
2. Filter by "Fetch/XHR"
3. Look for requests to `/api/users/...` or `/api/auth/me`
4. Check the request URL - what domain is it trying to reach?

**If you see:**
- `http://localhost:3001/...` → `VITE_API_URL` is not set correctly
- `https://invalid-domain.com/...` → Domain doesn't exist
- Request fails with `ERR_NAME_NOT_RESOLVED` → DNS cannot resolve the domain

---

## Solutions

### Solution 1: Set VITE_API_URL Environment Variable

**For Vite apps, environment variables must be set at BUILD TIME, not runtime.**

#### If using Vercel:
1. Go to Project Settings → Environment Variables
2. Add: `VITE_API_URL` = `https://your-backend-domain.com`
3. **Redeploy** the app (environment variables are baked into the build)

#### If using Netlify:
1. Go to Site settings → Environment variables
2. Add: `VITE_API_URL` = `https://your-backend-domain.com`
3. **Redeploy** the app

#### If using Railway:
1. Go to your frontend service → Variables
2. Add: `VITE_API_URL` = `https://your-backend-domain.com`
3. **Redeploy** the app

#### If building locally:
```bash
# Create .env file in project root
echo "VITE_API_URL=https://your-backend-domain.com" > .env

# Then rebuild
npm run build
```

---

### Solution 2: Verify Backend is Running

Check if your backend is accessible:

```bash
# Test if backend responds
curl https://your-backend-domain.com/api/health

# Or in browser
# Open: https://your-backend-domain.com/api/health
```

**If backend is down:**
- Start your backend service
- Check backend logs for errors
- Verify backend is deployed and running

---

### Solution 3: Check Domain Configuration

If using a custom domain:

1. **Verify DNS records** - Domain should point to your backend
2. **Check SSL certificate** - HTTPS should be working
3. **Test domain resolution:**
   ```bash
   # In terminal
   nslookup your-backend-domain.com
   # Should return an IP address
   ```

---

### Solution 4: Use Backend's Public URL

If you're using Railway, Vercel, or similar:

1. Find your backend's public URL (e.g., `https://your-backend.up.railway.app`)
2. Set `VITE_API_URL` to this URL
3. **Rebuild and redeploy** your frontend

---

## Testing After Fix

1. **Check console** - Should see successful API calls
2. **Check Network tab** - Requests should return 200 OK
3. **Credits should load** - Should see your credit balance

### Verify in Console:

```javascript
// Should see logs like:
// ✅ "Fetching credits" with correct API_URL
// ✅ "Credits updated successfully"
// ❌ No "ERR_NAME_NOT_RESOLVED" errors
```

---

## Common Mistakes

### ❌ Wrong: Setting at Runtime
```javascript
// This won't work - Vite env vars are build-time only
window.API_URL = 'https://backend.com';
```

### ✅ Correct: Setting at Build Time
```bash
# Set before building
VITE_API_URL=https://backend.com npm run build
```

---

### ❌ Wrong: Using localhost in Production
```bash
# This won't work in production
VITE_API_URL=http://localhost:3001
```

### ✅ Correct: Using Production URL
```bash
# Use your actual backend URL
VITE_API_URL=https://your-backend.up.railway.app
```

---

## Additional Notes on Wallet Extension Errors

The `evmAsk.js` errors (`Cannot redefine property: ethereum`) are from wallet browser extensions trying to inject `window.ethereum`. This is:

- **Not related to credits not loading**
- **Common when multiple wallet extensions are installed**
- **Usually harmless** - extensions handle conflicts automatically

If these errors are annoying, you can:
- Disable unused wallet extensions
- Use only one wallet extension at a time
- Ignore them (they don't affect functionality)

---

## Improved Error Handling

The code now includes better error detection for DNS failures:

- ✅ Detects `ERR_NAME_NOT_RESOLVED` specifically
- ✅ Shows helpful error messages in console
- ✅ Validates API URL format before making requests
- ✅ Provides suggestions for fixing the issue

Check your browser console for detailed error messages and suggestions.

---

## Still Having Issues?

1. **Check browser console** - Look for detailed error messages
2. **Check Network tab** - See what requests are failing
3. **Verify backend is running** - Test backend URL directly
4. **Check environment variables** - Ensure `VITE_API_URL` is set correctly
5. **Rebuild after setting env vars** - Vite requires rebuild for env changes

---

**Last Updated:** 2025-01-24

