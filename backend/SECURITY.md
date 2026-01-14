# Security Documentation

This document describes the security measures implemented in the SeisoAI backend.

## Table of Contents

- [Authentication](#authentication)
- [Authorization](#authorization)
- [Input Validation](#input-validation)
- [Rate Limiting](#rate-limiting)
- [Cryptographic Security](#cryptographic-security)
- [API Security](#api-security)
- [Payment Security](#payment-security)
- [Security Monitoring](#security-monitoring)
- [Security Headers](#security-headers)
- [Reporting Vulnerabilities](#reporting-vulnerabilities)

---

## Authentication

### JWT Token System

The API uses a dual-token authentication system:

| Token Type | Lifetime | Purpose |
|------------|----------|---------|
| Access Token | 15 minutes | API requests |
| Refresh Token | 7 days | Obtain new access tokens |

```typescript
// Token structure
{
  userId: string;
  walletAddress?: string;
  email?: string;
  iat: number;
  exp: number;
}
```

### Token Blacklisting

Tokens are blacklisted on logout and cannot be reused:

- **Storage**: Redis (production) or in-memory (development)
- **TTL**: Matches token expiration
- **Check**: Every authenticated request

### Account Lockout

Protects against brute-force attacks:

| Attempts | Action |
|----------|--------|
| 1-4 | Warning logged |
| 5 | Account locked for 15 minutes |
| 6+ | Exponential backoff (15min × 2^n) |

### Password Requirements

Passwords must meet all criteria:

- Minimum 12 characters
- At least 1 uppercase letter
- At least 1 lowercase letter
- At least 1 number
- At least 1 special character (`@$!%*?&`)

```regex
^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{12,}$
```

### Password Reset Flow

Secure password reset implementation:

1. User requests reset with email
2. Server generates cryptographic token (32 bytes)
3. Token hash stored in database (SHA-256)
4. Plain token sent via email (expires in 30 min)
5. User submits new password with token
6. Server verifies token hash, updates password
7. Token invalidated, lockout reset

**Security measures:**
- Constant-time token comparison
- Generic response prevents user enumeration
- Rate limited to prevent abuse

---

## Authorization

### Role-Based Access

| Role | Capabilities |
|------|--------------|
| User | Own data access, generation, payments |
| Admin | User management, credit adjustment |
| Bot | Discord integration endpoints |

### Endpoint Protection

```typescript
// JWT required
authenticateToken(req, res, next)

// Optional JWT (flexible)
authenticateFlexible(req, res, next)

// Admin only
requireAdmin(req, res, next)

// Bot API key
requireBotApiKey(req, res, next)
```

---

## Input Validation

### NoSQL Injection Prevention

All inputs are deeply sanitized:

```typescript
// Blocked operators
$eq, $ne, $gt, $gte, $lt, $lte, $in, $nin,
$and, $or, $not, $nor, $exists, $type,
$regex, $where, $expr, $jsonSchema
```

### Prototype Pollution Prevention

Blocked keys in all objects:

```typescript
__proto__, constructor, prototype
```

### Email Validation

- RFC-compliant regex
- Maximum 254 characters
- Disposable domain blocking (100+ domains)

### URL Validation

SSRF prevention for external URLs:

```typescript
// Allowed domains
fal.ai, api.fal.ai, fal.media, queue.fal.run, rest.fal.run

// Blocked
- Private IPs (127.*, 10.*, 192.168.*, 172.16-31.*)
- file:// scheme
- Credentials in URL
```

### Wallet Address Validation

```typescript
// Ethereum (EVM)
/^0x[a-fA-F0-9]{40}$/

// Solana
Base58 format, 32-44 characters
```

---

## Rate Limiting

### Default Limits

| Endpoint Type | Limit | Window |
|---------------|-------|--------|
| General API | 100 req | 15 min |
| Authentication | 5 req | 15 min |
| Password Reset | 3 req | 15 min |
| Image Generation | 10 req | 1 min |
| Free Tier | 5 req | 24 hours |

### IP Extraction

Trusted proxy headers (in order):

1. `cf-connecting-ip` (Cloudflare)
2. `x-real-ip`
3. `x-forwarded-for` (first valid IP)
4. `req.ip` fallback

### Browser Fingerprinting

Additional rate limit key component:

```typescript
hash(userAgent + acceptLanguage + acceptEncoding + ...)
```

---

## Cryptographic Security

### Data Encryption

Sensitive data encrypted at rest:

| Algorithm | Key Size | Mode |
|-----------|----------|------|
| AES | 256-bit | GCM |

### Timing-Safe Comparisons

All secret comparisons use constant-time functions:

```typescript
crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
```

Used for:
- API key validation
- CSRF token validation
- Admin secret validation
- Password reset tokens

### Token Generation

```typescript
// Reset tokens
crypto.randomBytes(32).toString('hex')

// Discord link codes
8 chars from: ABCDEFGHJKLMNPQRSTUVWXYZ23456789
```

### Password Hashing

```typescript
bcrypt.hash(password, 12) // 12 rounds
```

---

## API Security

### CSRF Protection

Double-submit cookie pattern:

1. Server sets `csrf_token` cookie
2. Client sends `X-CSRF-Token` header
3. Server validates match (constant-time)

### RPC Proxy Security

Only read-only methods allowed:

```typescript
// Allowed (whitelist)
eth_blockNumber, eth_getBalance, eth_call, eth_getLogs...

// Blocked
eth_sendTransaction, eth_sign, debug_*, admin_*, miner_*
```

### Redirect Validation

Only allowed domains for OAuth/payment redirects:

```typescript
seisoai.com, *.seisoai.com, localhost (dev)
```

---

## Payment Security

### Stripe Integration

- Webhook signature verification
- Idempotency keys for requests
- Secure checkout sessions

### Blockchain Verification

- On-chain transaction verification
- Duplicate transaction prevention
- Multi-chain support (EVM + Solana)

### Credit System

- Atomic database operations (`$inc` with `$gte`)
- Prevents race conditions
- Audit trail for all transactions

---

## Security Monitoring

### Real-time Alerts

Discord webhook notifications for:

| Event | Severity |
|-------|----------|
| Account lockout | High |
| Password reset request | Medium |
| Admin credit operation | High |
| Rate limit exceeded | Medium |
| Suspicious payment | Critical |

### Logging

Structured JSON logs with:

- Request ID
- User ID
- IP address
- Action performed
- Timestamp

---

## Security Headers

Configured via Helmet.js:

| Header | Value |
|--------|-------|
| Content-Security-Policy | `default-src 'self'` |
| Strict-Transport-Security | `max-age=31536000; includeSubDomains` |
| X-Content-Type-Options | `nosniff` |
| X-Frame-Options | `DENY` |
| X-XSS-Protection | `0` (modern CSP preferred) |
| Referrer-Policy | `strict-origin-when-cross-origin` |
| Cross-Origin-Embedder-Policy | `require-corp` |
| Cross-Origin-Opener-Policy | `same-origin` |
| Cross-Origin-Resource-Policy | `same-origin` |

---

## Reporting Vulnerabilities

If you discover a security vulnerability:

1. **Do NOT** open a public issue
2. Email security concerns privately
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

We aim to respond within 48 hours and will work with you to understand and address the issue.

---

## Security Checklist

Before deployment, verify:

- [ ] All environment variables set
- [ ] JWT secrets are strong (32+ bytes)
- [ ] MongoDB authentication enabled
- [ ] Redis password set (if used)
- [ ] HTTPS enabled
- [ ] Rate limiting configured
- [ ] Security webhook URL set
- [ ] Admin secret is strong
- [ ] Discord bot API key set
- [ ] Stripe webhook secret configured
