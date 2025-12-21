# 🛡️ Abuse Prevention Measures

This document outlines all the abuse prevention measures implemented to protect the free image feature and overall system.

## Current Protection Measures

### 1. **IP-Based Free Image Tracking** ✅
- **What it does**: Tracks free images used per IP address (not per account)
- **Prevents**: Users creating multiple accounts/wallets from same IP to get unlimited free images
- **Limit**: 2 free images per IP address total
- **Implementation**: `IPFreeImage` MongoDB collection tracks usage

### 2. **Rate Limiting** ✅
- **General API**: 500 requests per 15 minutes per IP (production)
- **Free Image Generation**: 5 attempts per hour per IP+browser fingerprint
- **Payment Endpoints**: 10 requests per 5 minutes per IP
- **Video Generation**: 10 submissions per 5 minutes per IP
- **Implementation**: `express-rate-limit` middleware

### 3. **Disposable Email Blocking** ✅
- **What it does**: Blocks signup and free image usage from temporary email services
- **Prevents**: Users creating multiple accounts with throwaway emails
- **Blocked Services**: 40+ known disposable email providers (tempmail.com, 10minutemail.com, etc.)
- **Implementation**: Checks email domain against blacklist

### 4. **Account Age Requirement** ✅
- **What it does**: Requires accounts to be at least 2 minutes old before using free images
- **Prevents**: Rapid account creation and immediate free image usage
- **Cooldown**: 2 minutes minimum account age
- **Implementation**: Checks `user.createdAt` timestamp

### 5. **Free Image Cooldown** ✅
- **What it does**: Enforces 5-minute cooldown between free image generations
- **Prevents**: Rapid-fire free image generation attempts
- **Cooldown**: 5 minutes between free images from same IP
- **Implementation**: Tracks `lastUsed` timestamp in `IPFreeImage` collection

### 6. **Browser Fingerprinting** ✅
- **What it does**: Creates unique fingerprint from browser headers
- **Prevents**: Users bypassing IP limits by changing IPs (VPN)
- **Tracks**: User-Agent, Accept-Language, Accept-Encoding, etc.
- **Implementation**: SHA-256 hash of browser characteristics

### 7. **Enhanced IP Extraction** ✅
- **What it does**: Properly extracts client IP from various proxy scenarios
- **Handles**: 
  - `x-forwarded-for` header (most proxies)
  - `x-real-ip` (nginx)
  - `cf-connecting-ip` (Cloudflare)
  - Direct connections
- **Prevents**: IP spoofing and incorrect tracking

### 8. **Duplicate Request Prevention** ✅
- **What it does**: Prevents same request from being submitted multiple times
- **Cooldown**: 30 seconds between identical requests
- **Tracks**: Hash of request content + user identifier
- **Implementation**: In-memory cache with TTL

### 9. **Input Validation & Sanitization** ✅
- **What it does**: Validates and sanitizes all user inputs
- **Prevents**: Injection attacks, oversized requests, invalid data
- **Implementation**: Helmet.js, custom validation middleware

### 10. **CORS Protection** ✅
- **What it does**: Only allows requests from whitelisted origins
- **Prevents**: Unauthorized API access from other domains
- **Implementation**: Dynamic origin validation

## Additional Recommendations

### For Production (Consider Adding)

1. **CAPTCHA Integration**
   - Add reCAPTCHA or hCaptcha for free image requests
   - Prevents automated bot abuse
   - **Service**: Google reCAPTCHA v3 or hCaptcha

2. **VPN/Proxy Detection**
   - Use MaxMind GeoIP2 or similar service
   - Detect and limit known VPN/proxy IPs
   - **Service**: MaxMind GeoIP2, IPQualityScore

3. **Device Fingerprinting Service**
   - More advanced than browser fingerprinting
   - Tracks hardware characteristics
   - **Service**: FingerprintJS, Clearbit

4. **Email Verification**
   - Require email verification before free images
   - Prevents throwaway accounts
   - **Implementation**: Send verification email on signup

5. **Phone Verification**
   - Require phone number for free images
   - Stronger identity verification
   - **Service**: Twilio Verify, Authy

6. **Behavioral Analysis**
   - Track user behavior patterns
   - Flag suspicious activity (rapid clicks, automated patterns)
   - **Implementation**: Custom analytics + ML

7. **IP Reputation Service**
   - Check IP reputation scores
   - Block known malicious IPs
   - **Service**: AbuseIPDB, IPQualityScore

8. **Geolocation Restrictions**
   - Limit free images by country/region
   - Block high-risk regions if needed
   - **Service**: MaxMind GeoIP2

9. **Account Linking Detection**
   - Detect if multiple accounts share same device/browser
   - Limit free images per device, not just IP
   - **Implementation**: Browser fingerprinting + account linking

10. **Monitoring & Alerting**
    - Set up alerts for suspicious patterns
    - Monitor free image usage rates
    - Track abuse attempts
    - **Tools**: Prometheus, Grafana, custom dashboards

## Monitoring Metrics

Track these metrics to detect abuse:

- Free images used per IP (should be ≤ 2)
- Account creation rate per IP
- Failed free image attempts
- Disposable email signup attempts
- Rate limit hits
- Cooldown violations
- Browser fingerprint matches across accounts

## Configuration

All abuse prevention settings can be adjusted in:
- `backend/server.js` - Rate limiters, cooldown periods
- `backend/abusePrevention.js` - Disposable email list, validation functions
- Environment variables - Rate limit windows and max requests

## Testing Abuse Prevention

To test if abuse prevention works:

1. **IP Limit Test**: Try to use 3+ free images from same IP (should fail after 2)
2. **Disposable Email Test**: Try signup with tempmail.com (should be blocked)
3. **Rate Limit Test**: Make 6+ free image requests in 1 hour (should be rate limited)
4. **Cooldown Test**: Try 2 free images within 5 minutes (should enforce cooldown)
5. **Account Age Test**: Create account and immediately request free image (should require 2 min wait)

## Notes

- All limits are per IP address, not per user account
- Browser fingerprinting helps track devices even if IP changes
- Cooldown periods prevent rapid-fire abuse
- Disposable email blocking prevents throwaway accounts
- Account age requirement prevents instant abuse after signup

---

**Last Updated**: 2025-01-XX
**Status**: ✅ All core measures implemented
