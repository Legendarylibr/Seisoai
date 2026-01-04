# 🌐 Domain Configuration Guide

## 🎯 **Domain Setup Options**

### **Option 1: Custom Domain (Recommended)**

#### **Step 1: Domain Registration**
- **Registrars**: Namecheap, GoDaddy, Cloudflare, Google Domains
- **Cost**: $10-15/year for .com domains
- **DNS Management**: Use registrar's DNS or Cloudflare (free)

#### **Step 2: DNS Configuration**
```bash
# A Records (point to your server IP)
yourdomain.com        A    YOUR_SERVER_IP
www.yourdomain.com    A    YOUR_SERVER_IP

# CNAME Records (if using subdomains)
api.yourdomain.com    CNAME    yourdomain.com
app.yourdomain.com    CNAME    yourdomain.com
```

#### **Step 3: SSL Certificate Setup**
```bash
# Using Let's Encrypt (Free)
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Or using Cloudflare SSL (Free)
# Enable "Full (strict)" SSL mode in Cloudflare dashboard
```

### **Option 2: Subdomain Setup**

#### **Using Cloudflare (Free)**
```bash
# DNS Records
app.yourdomain.com    A    YOUR_SERVER_IP
api.yourdomain.com    A    YOUR_SERVER_IP

# SSL: Automatic with Cloudflare
# CDN: Automatic with Cloudflare
```

#### **Using Vercel/Netlify (Frontend Only)**
```bash
# Connect GitHub repo
# Set custom domain in dashboard
# SSL: Automatic
# CDN: Automatic
```

### **Option 3: IP Address (Development)**
```bash
# For testing only
# Use your server's public IP
# No SSL (HTTP only)
# Not recommended for production
```

## 🔧 **Nginx Configuration**

### **Complete Nginx Config**
```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    # Security Headers (configured for in-app browser compatibility - Instagram, Twitter, etc.)
    # Note: X-Frame-Options removed - CSP frame-ancestors handles framing restrictions
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'; frame-ancestors 'self' https: http:" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Frontend (React App)
    location / {
        root /var/www/ai-image-generator/dist;
        try_files $uri $uri/ /index.html;
        
        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Rate limiting
        limit_req zone=api burst=20 nodelay;
    }

    # Health check
    location /health {
        proxy_pass http://localhost:3001/api/health;
        access_log off;
    }

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;
}
```

## 🚀 **Quick Domain Setup Script**

### **Automated Domain Configuration**
```bash
#!/bin/bash

# Domain Setup Script
set -e

DOMAIN=""
SERVER_IP=""

# Get domain and IP from user
read -p "Enter your domain (e.g., myapp.com): " DOMAIN
read -p "Enter your server IP: " SERVER_IP

echo "🌐 Setting up domain: $DOMAIN"
echo "🖥️  Server IP: $SERVER_IP"

# Update Nginx config
sed -i "s/yourdomain.com/$DOMAIN/g" nginx.conf
sed -i "s/YOUR_SERVER_IP/$SERVER_IP/g" nginx.conf

# Copy Nginx config
sudo cp nginx.conf /etc/nginx/sites-available/$DOMAIN
sudo ln -s /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test Nginx config
sudo nginx -t

# Install SSL certificate
sudo certbot --nginx -d $DOMAIN -d www.$DOMAIN --non-interactive --agree-tos --email admin@$DOMAIN

# Restart Nginx
sudo systemctl restart nginx

echo "✅ Domain setup complete!"
echo "🌐 Your app is now available at: https://$DOMAIN"
```

## 📋 **Domain Checklist**

### **✅ Pre-Setup Requirements**
- [ ] **Domain registered** and DNS management access
- [ ] **Server provisioned** with public IP
- [ ] **Ports 80, 443** open in firewall
- [ ] **Nginx installed** on server
- [ ] **Application deployed** and running

### **✅ DNS Configuration**
- [ ] **A Record**: `yourdomain.com` → `YOUR_SERVER_IP`
- [ ] **A Record**: `www.yourdomain.com` → `YOUR_SERVER_IP`
- [ ] **CNAME** (optional): `api.yourdomain.com` → `yourdomain.com`
- [ ] **DNS propagation** verified (can take up to 48 hours)

### **✅ SSL Certificate**
- [ ] **Let's Encrypt** certificate installed
- [ ] **Auto-renewal** configured
- [ ] **HTTP redirect** to HTTPS
- [ ] **SSL grade** checked (A+ recommended)

### **✅ Nginx Configuration**
- [ ] **Virtual host** configured
- [ ] **SSL settings** optimized
- [ ] **Security headers** enabled
- [ ] **Rate limiting** configured
- [ ] **Gzip compression** enabled

## 🔍 **Domain Testing**

### **DNS Propagation Check**
```bash
# Check DNS propagation
dig yourdomain.com
nslookup yourdomain.com

# Test from different locations
# Use online tools: whatsmydns.net
```

### **SSL Certificate Check**
```bash
# Check SSL certificate
openssl s_client -connect yourdomain.com:443 -servername yourdomain.com

# Online SSL checker
# Use: ssllabs.com/ssltest/
```

### **Application Testing**
```bash
# Test frontend
curl -I https://yourdomain.com

# Test API
curl -I https://yourdomain.com/api/health

# Test SSL redirect
curl -I http://yourdomain.com
# Should return 301 redirect to HTTPS
```

## 🆘 **Common Domain Issues**

### **DNS Not Propagating**
```bash
# Wait up to 48 hours
# Check with different DNS servers
# Verify DNS records are correct
```

### **SSL Certificate Issues**
```bash
# Check certificate files exist
ls -la /etc/letsencrypt/live/yourdomain.com/

# Renew certificate manually
sudo certbot renew --dry-run
```

### **Nginx Configuration Errors**
```bash
# Test configuration
sudo nginx -t

# Check error logs
sudo tail -f /var/log/nginx/error.log
```

## 💰 **Domain Costs**

### **Basic Setup**
- **Domain**: $10-15/year
- **SSL**: Free (Let's Encrypt)
- **DNS**: Free (registrar or Cloudflare)
- **Total**: $10-15/year

### **Premium Setup**
- **Domain**: $10-15/year
- **SSL**: Free (Let's Encrypt)
- **CDN**: Free (Cloudflare) or $20+/month
- **Monitoring**: $10+/month
- **Total**: $20-50+/month

---

**🎯 Tell me your domain name and I'll help you configure it!**
