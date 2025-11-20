# Fix Signup 500 Error on Railway

## Problem
Signup is returning a 500 error on Railway production: `seisoai-prod.up.railway.app/api/auth/signup`

## Root Cause
The error is likely due to missing environment variables on Railway. The `backend.env` file we created is **local only** and doesn't exist on Railway.

## Required Environment Variables on Railway

You **MUST** set these in Railway's environment variables:

### 1. Database (CRITICAL for signup)
```
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/ai-image-generator?retryWrites=true&w=majority
```
**OR** if using MongoDB Atlas:
- Get connection string from MongoDB Atlas dashboard
- Format: `mongodb+srv://<username>:<password>@<cluster>.mongodb.net/<database>?retryWrites=true&w=majority`

### 2. Security (CRITICAL for signup)
```
JWT_SECRET=<generate-a-secure-random-32-character-minimum-string>
SESSION_SECRET=<generate-a-secure-random-string>
```

Generate secure secrets:
```bash
# Generate JWT_SECRET (32+ characters)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate SESSION_SECRET
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

### 3. Server Configuration
```
NODE_ENV=production
PORT=3001
```

## How to Set Environment Variables on Railway

1. Go to your Railway project dashboard
2. Click on your backend service
3. Go to the **Variables** tab
4. Add each environment variable:
   - Click **+ New Variable**
   - Enter variable name (e.g., `MONGODB_URI`)
   - Enter value
   - Click **Add**

## Quick Checklist

- [ ] `MONGODB_URI` is set (MongoDB connection string)
- [ ] `JWT_SECRET` is set (32+ character random string)
- [ ] `SESSION_SECRET` is set (random string)
- [ ] `NODE_ENV=production` is set
- [ ] Railway service has been redeployed after setting variables

## Verify Fix

After setting environment variables and redeploying:

1. Check Railway logs for:
   - ✅ "MongoDB connected successfully"
   - ✅ No "MONGODB_URI not provided" warnings
   - ✅ No "JWT_SECRET" errors

2. Test signup endpoint:
   ```bash
   curl -X POST https://seisoai-prod.up.railway.app/api/auth/signup \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","password":"test123456"}'
   ```

3. Should return:
   ```json
   {
     "success": true,
     "token": "...",
     "user": {
       "userId": "email_...",
       "email": "test@example.com",
       "credits": 0
     }
   }
   ```

## Common Issues

### Issue: "MongoDB connection timeout"
**Solution**: Check that `MONGODB_URI` is correct and MongoDB Atlas network access allows Railway IPs (or 0.0.0.0/0 for all IPs)

### Issue: "JWT_SECRET is missing"
**Solution**: Set `JWT_SECRET` environment variable on Railway

### Issue: "Failed to create account" (generic error)
**Solution**: Check Railway logs for the actual error. The error message is sanitized in production, but logs will show the real issue.

## Testing Locally vs Production

- **Local**: Uses `backend.env` file (we created this)
- **Railway**: Uses environment variables set in Railway dashboard
- These are **separate** - setting one doesn't affect the other

## Next Steps

1. Set all required environment variables on Railway
2. Redeploy the service
3. Check logs to verify MongoDB connects
4. Test signup again

