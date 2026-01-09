# Encryption Audit and Fixes

## Overview
This document summarizes the encryption audit performed to ensure all sensitive data in the database is properly encrypted.

## Sensitive Fields Identified

### Currently Encrypted Fields ✅
1. **User.email** - Encrypted with AES-256-GCM, uses `emailHash` (blind index) for lookups
2. **Generation.prompt** - Encrypted (user-generated content)
3. **GalleryItem.prompt** - Encrypted (user-generated content)
4. **User.generationHistory[].prompt** - Encrypted (embedded array)
5. **User.gallery[].prompt** - Encrypted (embedded array)

### Properly Hashed (Not Encrypted) ✅
1. **User.password** - Hashed with bcrypt (correct approach for passwords)

### Fields That Don't Need Encryption
- **walletAddress** - Public blockchain data, not considered sensitive
- **Payment identifiers** - Stripe payment IDs are tokens, not sensitive data
- **Transaction hashes** - Public blockchain data

## Issues Found and Fixed

### Issue 1: Gallery Route Bypassing Encryption
**Location:** `backend/routes/gallery.ts` (line 252-262)

**Problem:** The `/api/gallery/save` endpoint used `findOneAndUpdate` with `$push` to directly add items to the gallery array. This bypassed Mongoose pre-save hooks, so prompts were saved in plain text.

**Fix:** Added manual encryption of prompts before saving:
```typescript
// Encrypt prompt if encryption is configured (findOneAndUpdate bypasses pre-save hooks)
let encryptedPrompt = prompt;
if (prompt && isEncryptionConfigured()) {
  const isEncrypted = prompt.includes(':') && prompt.split(':').length === 3;
  if (!isEncrypted) {
    encryptedPrompt = encrypt(prompt);
  }
}
```

### Issue 2: Generation History Route Bypassing Encryption
**Location:** `backend/routes/generate.ts` (line 2553-2563)

**Problem:** The `/api/generations/add` endpoint used `findOneAndUpdate` with `$push` to directly add items to the generationHistory array. This bypassed Mongoose pre-save hooks, so prompts were saved in plain text.

**Fix:** Added manual encryption of prompts before saving (same approach as Issue 1).

## Verification Scripts

### 1. `scripts/verify-encryption.ts`
Basic verification script that checks:
- User emails
- Generation prompts
- Gallery item prompts
- Embedded prompts in User documents

### 2. `scripts/audit-encryption.ts` (NEW)
Comprehensive audit script that checks:
- All fields checked by verify-encryption.ts
- Password hashing status (ensures passwords are hashed, not encrypted)
- Configuration validation
- Detailed recommendations

### 3. `scripts/migrate-to-encryption.ts`
Migration script to encrypt existing plain text data:
- User emails
- Generation prompts
- Gallery item prompts
- Embedded prompts in User documents

## How to Use

### 1. Run Audit
```bash
cd backend
npx tsx scripts/audit-encryption.ts
```

This will show:
- Current encryption status
- Any unencrypted data found
- Password hashing status
- Configuration issues

### 2. Encrypt Existing Data (if needed)
```bash
# Dry run first (recommended)
npx tsx scripts/migrate-to-encryption.ts

# Actually perform migration
npx tsx scripts/migrate-to-encryption.ts --execute
```

### 3. Verify After Migration
```bash
npx tsx scripts/verify-encryption.ts
```

## Encryption Configuration

### Required Environment Variable
```bash
ENCRYPTION_KEY=<64-character hex string>
```

### Generate a New Key
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Important Notes
- **CRITICAL:** Back up your `ENCRYPTION_KEY` securely
- **NEVER** change the key after data is encrypted (data will be unrecoverable)
- The key must be exactly 64 hex characters (256 bits)
- Store the key securely (environment variable, secrets manager, etc.)

## Encryption Implementation Details

### Algorithm
- **Encryption:** AES-256-GCM (authenticated encryption)
- **IV Length:** 12 bytes (GCM recommended)
- **Auth Tag Length:** 16 bytes
- **Format:** `iv:authTag:ciphertext` (all base64)

### Blind Indexes
- **Purpose:** Allow searching encrypted emails without decrypting
- **Algorithm:** HMAC-SHA256
- **Key:** Derived from encryption key
- **Usage:** `emailHash` field for email lookups

### Mongoose Hooks
- **Pre-save:** Encrypts emails and prompts before saving
- **Post-find:** Decrypts emails and prompts when reading
- **Note:** Direct MongoDB operations (findOneAndUpdate, etc.) bypass hooks and require manual encryption

## Security Best Practices

1. ✅ All sensitive user data is encrypted at rest
2. ✅ Passwords are hashed (bcrypt), not encrypted
3. ✅ Encryption keys are stored securely (environment variables)
4. ✅ Blind indexes allow searching without decryption
5. ✅ Automatic encryption on save via Mongoose hooks
6. ✅ Manual encryption for direct MongoDB operations

## Testing

After making changes, verify:
1. New data is encrypted on save
2. Existing data can be decrypted on read
3. Search by emailHash still works
4. No plain text sensitive data in database

## Future Considerations

- Consider encrypting IP addresses in `IPFreeImage` model (if required by regulations)
- Monitor for any new routes that bypass Mongoose hooks
- Regular audits to ensure no unencrypted data accumulates

