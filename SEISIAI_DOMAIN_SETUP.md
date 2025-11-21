# 🌐 Seisiai.com Domain Setup Guide

## ✅ Quick Checklist

### 1. **Railway Environment Variables**
Set these in your Railway backend service:

```bash
ALLOWED_ORIGINS=https://www.seisiai.com,https://seisiai.com
FRONTEND_URL=https://www.seisiai.com
NODE_ENV=production
```

### 2. **Frontend Environment Variables**
If deploying frontend separately, set:

```bash
VITE_API_URL=https://your-backend.up.railway.app
```

### 3. **Domain DNS Configuration**

#### **Option A: Railway Custom Domain (Recommended)**
1. Go to Railway Dashboard → Your Project → Your Service
2. Click on **Settings** → **Domains**
3. Click **Add Domain**
4. Enter: `www.seisiai.com`
5. Railway will provide DNS records to add:
   - **CNAME**: `www.seisiai.com` → `your-app.up.railway.app`
   - Or **A Record** if provided

6. For root domain (`seisiai.com`):
   - Add **A Record**: `seisiai.com` → Railway IP (if provided)
   - Or use **CNAME**: `seisiai.com` → `www.seisiai.com` (if your DNS supports CNAME on root)

#### **Option B: External DNS Provider**
If using external DNS (Cloudflare, Namecheap, etc.):

```dns
# A Record (if Railway provides IP)
seisiai.com        A    RAILWAY_IP

# CNAME Record
www.seisiai.com    CNAME    your-app.up.railway.app
```

### 4. **SSL Certificate**
Railway automatically provides SSL certificates for custom domains. No manual setup needed!

### 5. **Verify Configuration**

#### **Test CORS Configuration**
```bash
# Test from browser console on https://www.seisiai.com
fetch('https://your-backend.up.railway.app/api/cors-info', {
  headers: { 'Origin': 'https://www.seisiai.com' }
})
  .then(r => r.json())
  .then(data => console.log('CORS Info:', data));
```

#### **Test API Endpoint**
```bash
curl https://your-backend.up.railway.app/api/health
```

#### **Test Frontend**
```bash
curl -I https://www.seisiai.com
# Should return 200 OK
```

## 🔧 Railway Setup Steps

### Step 1: Add Custom Domain in Railway

1. **Go to Railway Dashboard**
   - Navigate to your project
   - Select your backend service

2. **Add Domain**
   - Click **Settings** tab
   - Scroll to **Domains** section
   - Click **Add Domain**
   - Enter: `www.seisiai.com`
   - Railway will generate DNS records

3. **Configure DNS**
   - Copy the CNAME or A record from Railway
   - Add it to your DNS provider (where you registered seisiai.com)
   - Wait for DNS propagation (5-60 minutes)

### Step 2: Set Environment Variables

In Railway backend service, add/update:

```bash
ALLOWED_ORIGINS=https://www.seisiai.com,https://seisiai.com
FRONTEND_URL=https://www.seisiai.com
```

**Important**: Include both `www` and non-`www` versions!

### Step 3: Verify SSL

Railway automatically provisions SSL certificates. After DNS propagates:
- Visit `https://www.seisiai.com`
- Check browser shows 🔒 (secure connection)
- SSL should be valid and trusted

## 🐛 Troubleshooting

### Issue: CORS Errors

**Symptoms**: Browser console shows CORS errors

**Solution**:
1. Verify `ALLOWED_ORIGINS` includes both:
   - `https://www.seisiai.com`
   - `https://seisiai.com`
2. Check for trailing slashes (should NOT have trailing slash)
3. Restart Railway service after updating env vars
4. Test with: `https://your-backend.up.railway.app/api/cors-info`

### Issue: Domain Not Resolving

**Symptoms**: Browser shows "This site can't be reached"

**Solution**:
1. Check DNS records are correct
2. Wait for DNS propagation (can take up to 48 hours)
3. Use `dig www.seisiai.com` or `nslookup www.seisiai.com` to verify
4. Verify Railway domain is active in dashboard

### Issue: SSL Certificate Errors

**Symptoms**: Browser shows "Not Secure" or certificate errors

**Solution**:
1. Wait 5-10 minutes after DNS propagation (SSL provisioning takes time)
2. Check Railway dashboard shows domain as "Active"
3. Clear browser cache and try again
4. Verify DNS is pointing to Railway

### Issue: API Not Working

**Symptoms**: Frontend loads but API calls fail

**Solution**:
1. Check `VITE_API_URL` in frontend is correct
2. Verify backend `ALLOWED_ORIGINS` includes frontend domain
3. Check Railway backend service is running
4. Test backend directly: `https://your-backend.up.railway.app/api/health`

## 📋 Complete Environment Variables Checklist

### Backend (Railway)
```bash
✅ MONGODB_URI=mongodb://...
✅ JWT_SECRET=...
✅ SESSION_SECRET=...
✅ STRIPE_SECRET_KEY=sk_live_...
✅ STRIPE_WEBHOOK_SECRET=whsec_...
✅ ALLOWED_ORIGINS=https://www.seisiai.com,https://seisiai.com
✅ FRONTEND_URL=https://www.seisiai.com
✅ NODE_ENV=production
```

### Frontend (if separate deployment)
```bash
✅ VITE_API_URL=https://your-backend.up.railway.app
```

## 🔍 Verification Commands

### Check DNS
```bash
# Check if domain resolves
dig www.seisiai.com
nslookup www.seisiai.com

# Check SSL certificate
openssl s_client -connect www.seisiai.com:443 -servername www.seisiai.com
```

### Check CORS
```bash
# From browser console on https://www.seisiai.com
fetch('https://your-backend.up.railway.app/api/cors-info')
  .then(r => r.json())
  .then(console.log)
```

### Check Backend Health
```bash
curl https://your-backend.up.railway.app/api/health
```

## 🚀 Quick Setup Script

```bash
#!/bin/bash
# Quick setup for seisiai.com

echo "🌐 Setting up seisiai.com domain..."

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI not found. Install: npm i -g @railway/cli"
    exit 1
fi

# Link to project
railway link

# Set environment variables
railway variables set ALLOWED_ORIGINS="https://www.seisiai.com,https://seisiai.com"
railway variables set FRONTEND_URL="https://www.seisiai.com"
railway variables set NODE_ENV="production"

echo "✅ Environment variables set!"
echo "📋 Next steps:"
echo "   1. Go to Railway Dashboard → Settings → Domains"
echo "   2. Add domain: www.seisiai.com"
echo "   3. Configure DNS records as shown in Railway"
echo "   4. Wait for DNS propagation (5-60 minutes)"
echo "   5. SSL will be automatically provisioned"
```

## 📞 Support

If issues persist:
1. Check Railway logs: `railway logs`
2. Test CORS endpoint: `https://your-backend.up.railway.app/api/cors-info`
3. Verify all environment variables are set correctly
4. Check DNS propagation status

---

**✅ Once setup is complete, https://www.seisiai.com should work perfectly!**

