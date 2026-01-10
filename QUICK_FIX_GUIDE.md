# Quick Fix Guide - Critical Security Issues

This guide provides step-by-step instructions to fix the **5 critical vulnerabilities** identified in the security audit.

---

## 🔴 Priority 1: Fix Immediately

### Fix 1: Remove Admin Secret from Request Body

**File:** `backend/routes/admin.ts`

**Change:**
```typescript
// BEFORE (line 51):
const providedSecret = authHeader?.replace('Bearer ', '') || (req.body as { adminSecret?: string }).adminSecret;

// AFTER:
const authHeader = req.headers.authorization;
const providedSecret = authHeader?.replace('Bearer ', '');

// Remove adminSecret from body completely
if (!providedSecret || providedSecret !== ADMIN_SECRET) {
  logger.warn('Failed admin authentication attempt', { 
    ip: req.ip,
    path: req.path 
  });
  res.status(403).json({ success: false, error: 'Unauthorized' });
  return;
}
```

**Test:**
```bash
# Should fail (403):
curl -X POST http://localhost:3001/api/admin/add-credits \
  -H "Content-Type: application/json" \
  -d '{"adminSecret": "test", "userId": "test", "credits": 1}'

# Should work (with proper header):
curl -X POST http://localhost:3001/api/admin/add-credits \
  -H "Authorization: Bearer YOUR_ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"userId": "test", "credits": 1}'
```

---

### Fix 2: Enforce CORS in Production

**File:** `backend/server-modular.ts`

**Change:**
```typescript
// BEFORE (lines 113-128):
const parseAllowedOrigins = (): string[] | true => {
  const originsEnv = config.ALLOWED_ORIGINS;
  
  if (config.isProduction && (!originsEnv || originsEnv.trim() === '' || originsEnv === '*')) {
    logger.error('SECURITY WARNING: CORS is permissive in production!');
    // Still allows it
  }
  
  if (!originsEnv || originsEnv.trim() === '' || originsEnv === '*') {
    return true; // Permissive
  }
  return originsEnv.split(',').map(o => o.trim()).filter(o => o.length > 0);
};

// AFTER:
const parseAllowedOrigins = (): string[] => {
  const originsEnv = config.ALLOWED_ORIGINS;
  
  // CRITICAL: Fail in production if CORS is not configured
  if (config.isProduction && (!originsEnv || originsEnv.trim() === '' || originsEnv === '*')) {
    logger.error('SECURITY ERROR: ALLOWED_ORIGINS must be set in production!');
    logger.error('Set ALLOWED_ORIGINS=https://yourapp.com,https://www.yourapp.com');
    process.exit(1); // Fail startup
  }
  
  // In development, allow all if not set
  if (!originsEnv || originsEnv.trim() === '' || originsEnv === '*') {
    if (config.isDevelopment) {
      logger.warn('CORS is permissive in development mode');
      return ['*'] as any; // Type workaround
    }
    // Production should have exited above, but double-check
    logger.error('CORS configuration error');
    process.exit(1);
  }
  
  return originsEnv.split(',').map(o => o.trim()).filter(o => o.length > 0);
};
```

**Also update CORS config:**
```typescript
// Change return type
const allowedOrigins = parseAllowedOrigins();
// Remove the 'true' case handling since we now always return string[]
```

**Environment Variable:**
```bash
# In production environment (Railway, Heroku, etc.):
ALLOWED_ORIGINS=https://seisoai.com,https://www.seisoai.com

# In backend.env (development only):
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
```

---

### Fix 3: Rotate All Secrets

**⚠️ CRITICAL: Do this immediately if `backend.env` was ever committed to git!**

**Steps:**

1. **Generate new secrets:**
```bash
# Generate new JWT_SECRET (64 hex chars)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate new ADMIN_SECRET (64 hex chars)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate new ENCRYPTION_KEY (64 hex chars)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate new SESSION_SECRET (32+ chars)
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

2. **Update `backend.env`:**
```bash
# Replace all old secrets with new ones
JWT_SECRET=<new-secret-64-chars>
ADMIN_SECRET=<new-secret-64-chars>
ENCRYPTION_KEY=<new-secret-64-chars>
SESSION_SECRET=<new-secret-32-chars>
```

3. **Update production environment variables** (Railway, Heroku, etc.)

4. **⚠️ IMPORTANT:** If secrets were leaked:
   - All existing JWT tokens become invalid (users must re-login)
   - All encrypted data needs re-encryption (if ENCRYPTION_KEY changed)
   - All admin sessions invalidated

5. **Verify `backend.env` is not in git:**
```bash
# Check if backend.env is tracked
git ls-files | grep backend.env

# If it shows up, remove it from git history:
git rm --cached backend.env
git commit -m "Remove backend.env from version control"

# Verify it's in .gitignore (it should be)
grep backend.env .gitignore
```

---

### Fix 4: Implement Persistent Token Blacklist

**File:** `backend/middleware/auth.ts`

**Change:**
```typescript
// BEFORE (line 32):
const tokenBlacklist = new LRUCache<string, TokenBlacklistEntry>(CACHE.TOKEN_BLACKLIST_SIZE);

// AFTER:
import { getRedisClient } from '../services/redis';

// Use Redis for persistent blacklist
const getTokenBlacklistKey = (tokenHash: string): string => {
  return `token:blacklist:${tokenHash}`;
};

export const isTokenBlacklisted = async (token: string | undefined): Promise<boolean> => {
  if (!token) return false;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex').substring(0, 32);
  
  try {
    const redis = getRedisClient();
    if (redis) {
      const exists = await redis.exists(getTokenBlacklistKey(tokenHash));
      return exists === 1;
    }
  } catch (error) {
    logger.error('Redis blacklist check failed', { error: (error as Error).message });
  }
  
  // Fallback to in-memory cache if Redis unavailable
  return tokenBlacklist.has(tokenHash);
};

export const blacklistToken = async (token: string | undefined, expiresAt: number | null = null): Promise<void> => {
  if (!token) return;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex').substring(0, 32);
  
  try {
    const redis = getRedisClient();
    if (redis) {
      const ttl = expiresAt ? Math.max(0, Math.floor((expiresAt - Date.now()) / 1000)) : 86400 * 30; // 30 days default
      await redis.setex(getTokenBlacklistKey(tokenHash), ttl, Date.now().toString());
      logger.debug('Token blacklisted in Redis', { tokenHash: tokenHash.substring(0, 8) + '...' });
      return;
    }
  } catch (error) {
    logger.error('Redis blacklist failed', { error: (error as Error).message });
  }
  
  // Fallback to in-memory cache
  tokenBlacklist.set(tokenHash, { blacklistedAt: Date.now(), expiresAt });
  logger.debug('Token blacklisted in memory', { tokenHash: tokenHash.substring(0, 8) + '...' });
};
```

**Update authentication middleware to use async:**
```typescript
// Update createAuthenticateToken to handle async blacklist check
if (await isTokenBlacklisted(token)) {
  res.status(401).json({
    success: false,
    error: 'Token has been revoked. Please sign in again.'
  });
  return;
}
```

**Update logout route:**
```typescript
// In backend/routes/auth.ts, make blacklistToken calls await
await blacklistToken(accessToken, decoded.exp ? decoded.exp * 1000 : null);
```

---

### Fix 5: Add CSRF Protection

**Install dependency:**
```bash
npm install csurf
npm install --save-dev @types/csurf
```

**File:** `backend/server-modular.ts`

**Add:**
```typescript
import csrf from 'csurf';

// Configure CSRF protection
const csrfProtection = csrf({
  cookie: {
    httpOnly: true,
    secure: config.isProduction, // HTTPS only in production
    sameSite: 'strict',
    maxAge: 3600000 // 1 hour
  }
});

// Apply CSRF to all state-changing routes (except webhooks)
app.use('/api/', (req: Request, res: Response, next: NextFunction) => {
  // Skip CSRF for:
  // - GET/HEAD/OPTIONS requests
  // - Stripe webhook (has its own signature verification)
  // - Public endpoints
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next();
  }
  
  if (req.path.startsWith('/stripe/webhook')) {
    return next(); // Stripe webhook has signature verification
  }
  
  // Apply CSRF to all other POST/PUT/DELETE/PATCH
  csrfProtection(req, res, next);
});

// Add CSRF token endpoint
app.get('/api/csrf-token', (req: Request, res: Response) => {
  res.json({ csrfToken: req.csrfToken() });
});
```

**Update frontend to include CSRF token:**
```typescript
// In frontend API calls:
const csrfToken = await fetch('/api/csrf-token').then(r => r.json()).then(d => d.csrfToken);

fetch('/api/endpoint', {
  method: 'POST',
  headers: {
    'X-CSRF-Token': csrfToken,
    'Content-Type': 'application/json'
  },
  credentials: 'include',
  body: JSON.stringify(data)
});
```

**Alternative (simpler): Use SameSite cookies + Origin verification:**
```typescript
// In server-modular.ts, add middleware:
app.use('/api/', (req: Request, res: Response, next: NextFunction) => {
  // Skip for GET/HEAD/OPTIONS
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }
  
  // Skip for webhooks (have their own verification)
  if (req.path.includes('/webhook')) {
    return next();
  }
  
  // Verify Origin header matches allowed origins
  const origin = req.headers.origin;
  if (origin && allowedOrigins !== true) {
    const allowed = Array.isArray(allowedOrigins) ? allowedOrigins : [];
    if (!allowed.includes(origin)) {
      logger.warn('CSRF: Origin mismatch', { origin, path: req.path });
      res.status(403).json({ success: false, error: 'Invalid origin' });
      return;
    }
  }
  
  next();
});
```

---

## Testing After Fixes

Run these tests to verify fixes:

```bash
# Test 1: Admin secret in body should fail
curl -X POST http://localhost:3001/api/admin/add-credits \
  -H "Content-Type: application/json" \
  -d '{"adminSecret": "test", "userId": "test", "credits": 1}'
# Expected: 403 Unauthorized

# Test 2: CORS from unauthorized origin should fail
curl -X GET http://localhost:3001/api/auth/me \
  -H "Origin: https://evil.com" \
  -H "Authorization: Bearer valid-token" \
  -v
# Expected: No Access-Control-Allow-Origin header for evil.com

# Test 3: Token blacklist persists after restart
# 1. Login and get token
# 2. Logout (token blacklisted)
# 3. Restart server
# 4. Try to use token → should fail

# Test 4: CSRF protection
curl -X POST http://localhost:3001/api/stripe/verify-payment \
  -H "Content-Type: application/json" \
  -H "Origin: https://evil.com" \
  -d '{"paymentIntentId": "test"}'
# Expected: 403 if Origin verification enabled
```

---

## Deployment Checklist

Before deploying to production:

- [ ] All secrets rotated
- [ ] `backend.env` removed from git history (if it was committed)
- [ ] `ALLOWED_ORIGINS` set in production environment
- [ ] Admin secret only accepted in Authorization header
- [ ] Token blacklist using Redis
- [ ] CSRF protection implemented
- [ ] All tests passing
- [ ] Security audit re-run

---

## Rollback Plan

If fixes cause issues:

1. **CORS:** Temporarily set `ALLOWED_ORIGINS=*` (not recommended, but allows rollback)
2. **Token blacklist:** Falls back to in-memory cache if Redis fails
3. **CSRF:** Can be disabled by commenting out middleware
4. **Admin secret:** Keep old code as backup

---

## Next Steps

After fixing critical issues, address high-severity issues:
1. Account lockout mechanism
2. Reduce request body limits
3. Stricter admin rate limiting
4. Error message sanitization

See `SECURITY_AUDIT_REPORT.md` for full details.

