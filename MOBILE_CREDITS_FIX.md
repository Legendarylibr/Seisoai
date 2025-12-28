# Mobile Credits Not Showing - Fix Applied

## Problem
Credits work locally but don't show on mobile devices in production.

## Root Causes (Mobile-Specific)

### 1. **Aggressive Mobile Browser Caching**
Mobile browsers cache more aggressively than desktop:
- **Bandwidth conservation**: Mobile data is expensive
- **Battery saving**: Fewer network requests save battery
- **Slower connections**: Caching improves perceived performance
- **More storage**: Mobile browsers have more cache storage

### 2. **No Cache-Busting**
Requests looked identical, so mobile browsers used cached responses even when credits changed.

### 3. **Network Timeouts**
Mobile networks are slower, so 15s timeout was too short for some connections.

### 4. **sessionStorage Issues**
Some mobile browsers (especially in private mode) have restrictions on sessionStorage.

## Fixes Applied

### 1. **Cache-Busting Added**
```javascript
// Before
const url = `${API_URL}/api/users/${address}?skipNFTs=true`;

// After
const cacheBuster = `t=${Date.now()}&attempt=${attempt}`;
const url = `${API_URL}/api/users/${address}?skipNFTs=true&${cacheBuster}`;
```

### 2. **Cache-Control Headers**
```javascript
headers: { 
  'Content-Type': 'application/json',
  'Cache-Control': 'no-cache, no-store, must-revalidate',
  'Pragma': 'no-cache'
},
cache: 'no-store' // Prevent browser caching
```

### 3. **Increased Timeout for Mobile**
```javascript
// Before: 15 seconds
signal: AbortSignal.timeout(15000)

// After: 20 seconds (mobile networks are slower)
signal: AbortSignal.timeout(20000)
```

### 4. **Reduced Cache Time**
```javascript
// Before: 60 seconds cache
if (Date.now() - timestamp < 60000)

// After: 30 seconds cache (mobile needs fresher data)
if (Date.now() - timestamp < 30000)
```

### 5. **Faster Refresh Interval**
```javascript
// Before: Refresh every 30 seconds
setInterval(..., 30000)

// After: Refresh every 20 seconds (mobile needs fresher data)
setInterval(..., 20000)
```

### 6. **sessionStorage Error Handling**
```javascript
try {
  const cached = sessionStorage.getItem(cacheKey);
  // ... use cache
} catch (e) {
  // sessionStorage might not be available on some mobile browsers
  // Just continue to fetch from API
  logger.debug('sessionStorage not available, fetching from API');
}
```

## Testing on Mobile

### Quick Test
1. Open your production site on mobile
2. Connect wallet or sign in with email
3. Check browser console (if available) or use remote debugging
4. Look for:
   - ✅ Cache-busting timestamps in URLs
   - ✅ No CORS errors
   - ✅ Credits loading successfully

### Remote Debugging (Chrome)
1. Connect phone via USB
2. Enable USB debugging on phone
3. Open Chrome → `chrome://inspect`
4. Click "inspect" on your device
5. Check Console and Network tabs

### Remote Debugging (Safari/iOS)
1. On iPhone: Settings → Safari → Advanced → Web Inspector
2. Connect iPhone to Mac via USB
3. On Mac: Safari → Develop → [Your iPhone] → [Your Site]
4. Check Console and Network tabs

## Verification

After the fix, verify:
1. ✅ Credits load on mobile devices
2. ✅ Credits update when changed on another device
3. ✅ No stale cached data
4. ✅ Works on both iOS Safari and Android Chrome

## Additional Mobile Optimizations

### If Still Not Working:

1. **Clear Mobile Browser Cache**
   - iOS Safari: Settings → Safari → Clear History and Website Data
   - Android Chrome: Settings → Privacy → Clear browsing data

2. **Check Network Tab**
   - Look for failed requests
   - Check if requests have cache-busting parameters
   - Verify response headers include `Cache-Control: no-store`

3. **Test in Private/Incognito Mode**
   - This bypasses cache completely
   - If it works in private mode, it's a caching issue

4. **Check Backend Logs**
   - Verify requests are reaching the backend
   - Check for CORS errors
   - Verify authentication is working

## Why Mobile is Different

Mobile browsers are more aggressive with caching because:
- **Data costs**: Mobile data is expensive, so browsers cache more
- **Battery**: Fewer network requests save battery
- **Performance**: Caching makes slow mobile networks feel faster
- **Storage**: Mobile devices have more storage for cache

This is why the same code works on desktop but not mobile - mobile browsers need explicit cache-busting and cache-control headers.

