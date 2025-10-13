# 🌐 Anonymous Domain Setup - Super Simple

## 🎯 **What You Need:**
- Your domain name (e.g., `myapp.com`)
- Your server IP address
- That's it! No personal info required.

## 🚀 **Super Quick Setup:**

### **Step 1: DNS Records**
Add these to your domain registrar:
```
A    yourdomain.com        → YOUR_SERVER_IP
A    www.yourdomain.com    → YOUR_SERVER_IP
```

### **Step 2: Run This Command**
```bash
# Replace YOURDOMAIN and YOURIP with your actual values
DOMAIN="yourdomain.com"
IP="YOUR_SERVER_IP"

# Update API URL
sed -i "s|VITE_API_URL=.*|VITE_API_URL=https://$DOMAIN|g" .env

# Build and deploy
npm run build
sudo mkdir -p /var/www/ai-image-generator
sudo cp -r dist/* /var/www/ai-image-generator/

# Create Nginx config
sudo tee /etc/nginx/sites-available/$DOMAIN > /dev/null << EOF
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;
    return 301 https://\$server_name\$request_uri;
}
server {
    listen 443 ssl http2;
    server_name $DOMAIN www.$DOMAIN;
    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    location / {
        root /var/www/ai-image-generator/dist;
        try_files \$uri \$uri/ /index.html;
    }
    location /api {
        proxy_pass http://localhost:3001;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

# Enable site
sudo ln -s /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx

# Install SSL (anonymous)
sudo certbot --nginx -d $DOMAIN -d www.$DOMAIN --email admin@$DOMAIN --agree-tos --non-interactive

# Test
curl -I https://$DOMAIN
```

## 🎉 **Done!**
Your app is now live at `https://yourdomain.com`

## 🔧 **Even Simpler - One Command:**
```bash
# Just run this and follow prompts:
./anon-domain-setup.sh
```

## 💡 **Pro Tips:**
- **No email required** - uses `admin@yourdomain.com`
- **No personal data** collected
- **SSL auto-renews** automatically
- **Works with any domain** registrar

## 🆘 **Need Help?**
1. Make sure your app is running on port 3001
2. Ensure ports 80 and 443 are open
3. Wait for DNS propagation (up to 48 hours)
4. Check `sudo nginx -t` for config errors
