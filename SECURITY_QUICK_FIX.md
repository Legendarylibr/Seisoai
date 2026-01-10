# Security Quick Fix Guide

## 🚨 IMMEDIATE ACTIONS (Do Now)

### 1. Secure Environment Variables

**Problem:** Secrets are in `backend.env` file which might be committed to git.

**Fix:**
```bash
# 1. Check if backend.env is in .gitignore
grep -q "backend.env" .gitignore || echo "backend.env" >> .gitignore

# 2. Check git history for exposed secrets
git log --all --full-history --source -- backend.env

# 3. If secrets were committed, rotate them ALL:
# - JWT_SECRET
# - ENCRYPTION_KEY  
# - ADMIN_SECRET
# - SESSION_SECRET

# 4. Generate new secrets:
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('ADMIN_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('SESSION_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
```

### 2. Fix CORS Configuration

**Problem:** CORS allows all origins in production.

**Fix:**
```bash
# In backend.env or production environment variables:
ALLOWED_ORIGINS=https://seisoai.com,https://www.seisoai.com

# Verify in server-modular.ts that this is being used
```

### 3. Remove Admin Body Authentication

**File:** `backend/routes/admin.ts`

**Change:**
```typescript
// BEFORE (line 51):
const providedSecret = authHeader?.replace('Bearer ', '') || 
  (req.body as { adminSecret?: string }).adminSecret;

// AFTER:
const providedSecret = authHeader?.replace('Bearer ', '');

if (!providedSecret) {
  logger.warn('Admin access attempted without Authorization header', { 
    ip: req.ip,
    path: req.path 
  });
  res.status(403).json({ success: false, error: 'Unauthorized' });
  return;
}
```

### 4. Store Processed Transactions in Database

**File:** `backend/routes/payments.ts`

**Add:**
```typescript
// Create a ProcessedTransaction model or add to existing Payment model
// Then check database instead of just cache:

const existingPayment = await Payment.findOne({ txHash });
if (existingPayment) {
  res.status(400).json({
    success: false,
    error: 'Transaction already processed',
    alreadyProcessed: true
  });
  return;
}
```

---

## 🔒 HIGH PRIORITY FIXES (This Week)

### 5. Implement CSRF Protection

**Install:**
```bash
npm install csurf
npm install --save-dev @types/csurf
```

**Add to server-modular.ts:**
```typescript
import csrf from 'csurf';

const csrfProtection = csrf({ 
  cookie: {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'strict'
  }
});

// Apply to state-changing routes
app.use('/api/payments', csrfProtection);
app.use('/api/stripe', csrfProtection);
app.use('/api/admin', csrfProtection);
```

### 6. Move Token Blacklist to Redis

**File:** `backend/middleware/auth.ts`

**Change:**
```typescript
// Instead of LRUCache, use Redis:
import { getRedisClient } from '../services/redis';

export const isTokenBlacklisted = async (token: string | undefined): Promise<boolean> => {
  if (!token) return false;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex').substring(0, 32);
  const redis = getRedisClient();
  if (redis) {
    const exists = await redis.exists(`blacklist:${tokenHash}`);
    return exists === 1;
  }
  // Fallback to in-memory cache if Redis unavailable
  return tokenBlacklist.has(tokenHash);
};
```

### 7. Add IP Whitelist for Admin Routes

**File:** `backend/routes/admin.ts`

**Add:**
```typescript
const ADMIN_IP_WHITELIST = process.env.ADMIN_IP_WHITELIST?.split(',') || [];

const requireAdmin = (req: Request, res: Response, next: NextFunction): void => {
  // Check IP whitelist
  const clientIp = req.ip || req.socket.remoteAddress;
  if (ADMIN_IP_WHITELIST.length > 0 && !ADMIN_IP_WHITELIST.includes(clientIp)) {
    logger.warn('Admin access attempted from non-whitelisted IP', { 
      ip: clientIp,
      path: req.path 
    });
    res.status(403).json({ success: false, error: 'Unauthorized' });
    return;
  }
  
  // ... rest of admin check
};
```

### 8. Strengthen Password Requirements

**File:** `backend/routes/auth.ts`

**Change:**
```typescript
// BEFORE (line 84):
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{12,}$/;

// AFTER:
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{16,}$/;

// Add check against common passwords
const commonPasswords = ['password', '12345678', 'qwerty', ...]; // Load from file
if (commonPasswords.includes(password.toLowerCase())) {
  res.status(400).json({
    success: false,
    error: 'Password is too common. Please choose a stronger password.'
  });
  return;
}
```

---

## 🛡️ MEDIUM PRIORITY (This Month)

### 9. Add HTTPS Enforcement

**File:** `backend/server-modular.ts`

**Add:**
```typescript
// Force HTTPS in production
if (config.isProduction) {
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.header('x-forwarded-proto') !== 'https') {
      res.redirect(`https://${req.header('host')}${req.url}`);
    } else {
      next();
    }
  });
  
  // Add HSTS header
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  });
}
```

### 10. Implement Audit Logging

**Create:** `backend/services/audit.ts`

```typescript
export function auditLog(action: string, userId: string, details: Record<string, unknown>) {
  logger.info('AUDIT', {
    timestamp: new Date().toISOString(),
    action,
    userId,
    ip: details.ip,
    userAgent: details.userAgent,
    ...details
  });
  
  // Also store in database for compliance
  // AuditLog.create({ action, userId, details, timestamp: new Date() });
}
```

**Use in admin routes:**
```typescript
auditLog('ADMIN_ADD_CREDITS', req.user?.userId || 'unknown', {
  ip: req.ip,
  userAgent: req.headers['user-agent'],
  targetUserId: userId,
  credits: credits
});
```

### 11. Add Rate Limiting with Exponential Backoff

**File:** `backend/middleware/rateLimiter.ts`

**Add:**
```typescript
export const createAdminLimiter = (): RateLimitRequestHandler => {
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5, // Reduced from 10
    message: {
      error: 'Too many admin requests. Please try again later.',
      retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    // Exponential backoff
    handler: (req, res) => {
      const attempts = req.rateLimit?.remaining || 0;
      const delay = Math.min(attempts * 1000, 60000); // Max 60s delay
      res.status(429).json({
        success: false,
        error: 'Too many admin requests',
        retryAfter: delay / 1000
      });
    }
  });
  
  return limiter;
};
```

---

## ✅ Verification Checklist

After implementing fixes, verify:

- [ ] `backend.env` is in `.gitignore`
- [ ] All secrets rotated and in secure storage (not in files)
- [ ] CORS only allows whitelisted origins
- [ ] Admin routes require Authorization header only
- [ ] CSRF protection on state-changing routes
- [ ] Token blacklist in Redis/database
- [ ] Payment transactions stored in database
- [ ] IP whitelist for admin routes (if applicable)
- [ ] Stronger password requirements
- [ ] HTTPS enforced in production
- [ ] HSTS headers present
- [ ] Audit logging implemented
- [ ] Rate limiting with backoff

---

## 🔍 Testing Your Fixes

### Test CORS:
```bash
curl -H "Origin: https://evil.com" \
     -H "Access-Control-Request-Method: POST" \
     -X OPTIONS \
     https://seisoai.com/api/auth/signin
# Should reject if CORS is properly configured
```

### Test Admin Auth:
```bash
# Should fail without Authorization header
curl -X POST https://seisoai.com/api/admin/add-credits \
  -H "Content-Type: application/json" \
  -d '{"adminSecret": "test", "userId": "test", "credits": 1}'
```

### Test CSRF:
```html
<!-- Create test page on different domain -->
<!-- Should fail if CSRF protection works -->
```

---

## 📞 Need Help?

If you need assistance implementing these fixes:

1. Review the full security audit report
2. Test in development environment first
3. Deploy to staging for verification
4. Monitor logs after production deployment

---

**Last Updated:** January 9, 2026

