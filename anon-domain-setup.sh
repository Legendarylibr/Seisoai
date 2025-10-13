#!/bin/bash

# 🌐 Anonymous Domain Setup for AI Image Generator
# No personal info required - just domain and server details

echo "🌐 Anonymous Domain Setup"
echo "========================"
echo ""
echo "This setup requires NO personal information."
echo "We only need your domain and server details."
echo ""

# Get minimal required info
read -p "Enter your domain (e.g., myapp.com): " DOMAIN
read -p "Enter your server IP address: " SERVER_IP

echo ""
echo "📋 Configuration:"
echo "Domain: $DOMAIN"
echo "Server IP: $SERVER_IP"
echo ""

# Generate anonymous email for SSL
SSL_EMAIL="admin@$DOMAIN"

echo "🔧 DNS Configuration:"
echo "Add these DNS records to your domain registrar:"
echo ""
echo "Type    Name                    Value"
echo "----    ----                    -----"
echo "A       $DOMAIN                 $SERVER_IP"
echo "A       www.$DOMAIN             $SERVER_IP"
echo ""

echo "⚙️  Quick Setup Commands:"
echo "========================="
echo ""

echo "# 1. Update your app's API URL"
echo "sed -i 's|VITE_API_URL=.*|VITE_API_URL=https://$DOMAIN|g' .env"
echo ""

echo "# 2. Build and deploy frontend"
echo "npm run build"
echo "sudo mkdir -p /var/www/ai-image-generator"
echo "sudo cp -r dist/* /var/www/ai-image-generator/"
echo ""

echo "# 3. Create Nginx config"
cat << EOF
sudo tee /etc/nginx/sites-available/$DOMAIN > /dev/null << 'NGINX_EOF'
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name $DOMAIN www.$DOMAIN;

    # SSL will be added by Certbot
    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;

    # Frontend
    location / {
        root /var/www/ai-image-generator/dist;
        try_files \$uri \$uri/ /index.html;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:3001;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINX_EOF
EOF

echo ""
echo "# 4. Enable site and test"
echo "sudo ln -s /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/"
echo "sudo rm -f /etc/nginx/sites-enabled/default"
echo "sudo nginx -t"
echo "sudo systemctl restart nginx"
echo ""

echo "# 5. Install SSL certificate (anonymous)"
echo "sudo certbot --nginx -d $DOMAIN -d www.$DOMAIN --email $SSL_EMAIL --agree-tos --non-interactive"
echo ""

echo "# 6. Test your site"
echo "curl -I https://$DOMAIN"
echo "curl -I https://$DOMAIN/api/health"
echo ""

echo "🎯 One-Line Setup (if you have everything ready):"
echo "================================================="
echo ""
echo "sed -i 's|VITE_API_URL=.*|VITE_API_URL=https://$DOMAIN|g' .env && npm run build && sudo mkdir -p /var/www/ai-image-generator && sudo cp -r dist/* /var/www/ai-image-generator/ && sudo tee /etc/nginx/sites-available/$DOMAIN > /dev/null << 'NGINX_EOF'
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
NGINX_EOF
&& sudo ln -s /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/ && sudo rm -f /etc/nginx/sites-enabled/default && sudo nginx -t && sudo systemctl restart nginx && sudo certbot --nginx -d $DOMAIN -d www.$DOMAIN --email $SSL_EMAIL --agree-tos --non-interactive"
echo ""

echo "✅ Setup complete!"
echo ""
echo "📝 What happens:"
echo "1. Your app will be available at https://$DOMAIN"
echo "2. All HTTP traffic redirects to HTTPS"
echo "3. SSL certificate auto-renews"
echo "4. No personal data collected"
echo ""
echo "🆘 Need help? The commands above will set everything up automatically."
