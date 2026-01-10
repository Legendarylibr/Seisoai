# Security Fixes - Quick Implementation Guide

## 🔴 CRITICAL FIXES (Do Immediately)

### Fix 1: Restrict CORS

**File:** `backend.env`

```env
# Change this:
ALLOWED_ORIGINS=

# To this (replace with your actual domains):
ALLOWED_ORIGINS=https://seisoai.com,https://www.seisoai.com
```

**For development:**
```env
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
```

**Verify:** Restart server and check logs - should see "restricted" mode, not "permissive"

---

### Fix 2: Verify Secrets Are Not in Git

**Check if secrets were ever committed:**
```bash
# Check git history for backend.env
git log --all --full-history -- backend.env

# Check if secrets are in any committed files
git log -p -S "JWT_SECRET" --all
git log -p -S "ENCRYPTION_KEY" --all
git log -p -S "ADMIN_SECRET" --all
```

**If secrets were committed:**
1. **IMMEDIATELY** rotate all secrets:
   ```bash
   # Generate new JWT_SECRET (64 hex chars)
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   
   # Generate new ENCRYPTION_KEY (64 hex chars)
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   
   # Generate new ADMIN_SECRET (64 hex chars)
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   
   # Generate new SESSION_SECRET (32+ chars)
   node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
   ```

2. Update `backend.env` with new secrets
3. **WARNING:** Rotating `ENCRYPTION_KEY` will make existing encrypted data unreadable!
   - You'll need to decrypt with old key, then re-encrypt with new key
   - Or accept data loss and start fresh

4. Remove secrets from git history (if needed):
   ```bash
   # Use git-filter-repo or BFG Repo-Cleaner
   # This rewrites history - coordinate with team!
   ```

---

### Fix 3: Add Authentication to User Info Endpoint

**File:** `backend/routes/user.ts`

**Change line 34:**
```typescript
// BEFORE:
router.post('/info', async (req: Request, res: Response) => {

// AFTER:
router.post('/info', strictAuth, async (req: AuthenticatedRequest, res: Response) => {
```

**Then modify the handler to only return authenticated user's data:**
```typescript
router.post('/info', strictAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Only return authenticated user's data
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
      return;
    }
    
    res.json({
      success: true,
      user: {
        userId: req.user.userId,
        email: req.user.email,
        walletAddress: req.user.walletAddress,
        credits: req.user.credits,
        totalCreditsEarned: req.user.totalCreditsEarned,
        totalCreditsSpent: req.user.totalCreditsSpent
      }
    });
  } catch (error) {
    // ... error handling
  }
});
```

**OR** if you want to keep it public but limit data:
```typescript
router.post('/info', async (req: Request, res: Response) => {
  try {
    const { walletAddress, userId, email } = req.body;
    
    const user = await findUserByIdentifier(walletAddress || null, email || null, userId || null);
    
    if (!user) {
      res.json({
        success: true,
        user: null
      });
      return;
    }

    // Only return public data
    res.json({
      success: true,
      user: {
        userId: user.userId,
        walletAddress: user.walletAddress,
        // DO NOT return: email, credits, etc.
        isNFTHolder: user.nftCollections && user.nftCollections.length > 0
      }
    });
  } catch (error) {
    // ... error handling
  }
});
```

---

### Fix 4: Fix Gallery Access Control

**File:** `backend/routes/user.ts`

**Change lines 162-197:**
```typescript
// BEFORE:
router.post('/gallery', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { walletAddress, userId, email } = req.body;
    const user = await findUserByIdentifier(walletAddress || null, email || null, userId || null);
    // ... returns any user's gallery

// AFTER:
router.post('/gallery', strictAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Only return authenticated user's gallery
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
      return;
    }
    
    const User = mongoose.model<IUser>('User');
    const userWithGallery = await User.findOne({ userId: req.user.userId })
      .select('gallery')
      .lean();

    res.json({
      success: true,
      gallery: userWithGallery?.gallery || []
    });
  } catch (error) {
    // ... error handling
  }
});
```

**Also fix `/gallery/save` endpoint (line 203):**
```typescript
router.post('/gallery/save', strictAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
      return;
    }
    
    const { imageUrl, prompt, model } = req.body;
    
    if (!imageUrl) {
      res.status(400).json({
        success: false,
        error: 'Image URL required'
      });
      return;
    }

    // Only save to authenticated user's gallery
    const User = mongoose.model<IUser>('User');
    await User.findOneAndUpdate(
      { userId: req.user.userId }, // Use authenticated user's ID
      {
        $push: {
          gallery: {
            $each: [{
              id: `gen-${Date.now()}`,
              imageUrl,
              prompt,
              style: model,
              timestamp: new Date()
            }],
            $slice: -100
          }
        }
      }
    );

    res.json({
      success: true,
      message: 'Saved to gallery'
    });
  } catch (error) {
    // ... error handling
  }
});
```

---

### Fix 5: Strengthen Admin Authentication

**File:** `backend/routes/admin.ts`

**Change lines 42-64:**
```typescript
// BEFORE:
const requireAdmin = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  const providedSecret = authHeader?.replace('Bearer ', '') || (req.body as { adminSecret?: string }).adminSecret;

// AFTER:
const requireAdmin = (req: Request, res: Response, next: NextFunction): void => {
  // SECURITY: Only accept secret in Authorization header, never in body
  const authHeader = req.headers.authorization;
  const providedSecret = authHeader?.replace('Bearer ', '');
  
  // Reject if secret is in body (prevents accidental logging/exposure)
  if ((req.body as { adminSecret?: string }).adminSecret) {
    logger.warn('Admin secret provided in request body - rejected', { 
      ip: req.ip,
      path: req.path 
    });
    res.status(400).json({ success: false, error: 'Admin secret must be in Authorization header' });
    return;
  }
```

**Add rate limiting specifically for admin routes:**
```typescript
// At the top of the file, create stricter admin rate limiter
const adminAuthLimiter: RequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Only 5 attempts per 15 minutes
  message: { success: false, error: 'Too many admin authentication attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true
});

// Apply to requireAdmin middleware
const requireAdmin = adminAuthLimiter((req: Request, res: Response, next: NextFunction): void => {
  // ... rest of admin auth code
});
```

---

## 🟡 HIGH PRIORITY FIXES

### Fix 6: Add SSRF Protection to Video Metadata

**File:** `backend/utils/videoMetadata.ts`

**Add validation before fetch:**
```typescript
import { isValidFalUrl } from '../middleware/validation';

// Before any fetch() call, add:
if (!videoInput.startsWith('data:') && !isValidFalUrl(videoInput)) {
  throw new Error('Invalid video URL - only fal.ai URLs and data URIs are allowed');
}
```

---

### Fix 7: Reduce JWT Token Expiration

**File:** `backend/routes/auth.ts`

**Change lines 137 and 230:**
```typescript
// BEFORE:
{ expiresIn: '24h' }

// AFTER:
{ expiresIn: '1h' } // 1 hour for access tokens
```

**Keep refresh tokens at 30 days but implement rotation:**
```typescript
// When refreshing, invalidate old refresh token
// Store refresh tokens in database with rotation
```

---

### Fix 8: Add CSRF Protection

**Option 1: Use SameSite Cookies (if using cookies)**
```typescript
// In cookie settings:
{
  sameSite: 'strict',
  secure: true,
  httpOnly: true
}
```

**Option 2: CSRF Tokens**
```typescript
// Install: npm install csurf
import csrf from 'csurf';

const csrfProtection = csrf({ cookie: true });

// Apply to state-changing routes
router.post('/api/user/gallery/save', csrfProtection, authMiddleware, ...);
```

**Option 3: Custom CSRF Token (if not using cookies)**
```typescript
// Generate token on GET requests
// Include in POST requests
// Verify token matches session
```

---

## 🟢 MEDIUM PRIORITY FIXES

### Fix 9: Improve Rate Limiting

**File:** `backend/middleware/rateLimiter.ts`

**Add fingerprinting to more endpoints:**
```typescript
import { generateBrowserFingerprint } from '../abusePrevention';

export const createGeneralLimiter = (): RateLimitRequestHandler => rateLimit({
  windowMs: RATE_LIMITS.GENERAL.windowMs,
  max: process.env.NODE_ENV === 'production' ? RATE_LIMITS.GENERAL.max : 1000,
  keyGenerator: (req) => {
    const fingerprint = generateBrowserFingerprint(req);
    return `${req.ip || 'unknown'}-${fingerprint}`;
  },
  // ... rest
});
```

---

### Fix 10: Add Request Timeouts

**File:** `backend/routes/rpc.ts`

**Add timeout to fetch calls:**
```typescript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

try {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: controller.signal
  });
  clearTimeout(timeoutId);
  // ... handle response
} catch (error) {
  clearTimeout(timeoutId);
  if (error.name === 'AbortError') {
    throw new Error('Request timeout');
  }
  throw error;
}
```

---

## Testing Your Fixes

1. **Test CORS:**
   ```bash
   curl -H "Origin: https://evil.com" \
        -H "Access-Control-Request-Method: POST" \
        -X OPTIONS \
        https://your-api.com/api/user/info
   # Should reject if CORS is properly configured
   ```

2. **Test Authentication:**
   ```bash
   # Should fail without auth
   curl -X POST https://your-api.com/api/user/info \
        -H "Content-Type: application/json" \
        -d '{"walletAddress":"0x123"}'
   # Should return 401
   ```

3. **Test Gallery Access:**
   ```bash
   # Login as user A
   TOKEN_A=$(curl ... | jq -r .token)
   
   # Try to access user B's gallery
   curl -X POST https://your-api.com/api/user/gallery \
        -H "Authorization: Bearer $TOKEN_A" \
        -H "Content-Type: application/json" \
        -d '{"walletAddress":"0xUserB"}'
   # Should return 403 or only user A's gallery
   ```

---

## Deployment Checklist

- [ ] CORS restricted in production
- [ ] All secrets rotated (if they were in git)
- [ ] User info endpoint requires auth or limits data
- [ ] Gallery endpoints verify ownership
- [ ] Admin auth strengthened
- [ ] SSRF protection added
- [ ] JWT expiration reduced
- [ ] CSRF protection added
- [ ] Rate limiting improved
- [ ] Request timeouts added
- [ ] All changes tested
- [ ] Security audit re-run
- [ ] Monitoring/alerts configured

---

## After Deployment

1. Monitor logs for:
   - Failed authentication attempts
   - Rate limit violations
   - SSRF attempts
   - Admin access attempts

2. Set up alerts for:
   - Multiple failed admin logins
   - Unusual API usage patterns
   - CORS violations

3. Regular security reviews:
   - Monthly dependency audits (`npm audit`)
   - Quarterly penetration testing
   - Annual full security audit

