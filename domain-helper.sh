#!/bin/bash

# 🌐 Quick Domain Configuration Helper
# Simple script to configure domain for AI Image Generator

echo "🌐 AI Image Generator - Domain Setup Helper"
echo "=========================================="
echo ""

# Get domain information
read -p "Enter your domain name (e.g., myapp.com): " DOMAIN
read -p "Enter your server IP address: " SERVER_IP
read -p "Enter your email for SSL certificate: " EMAIL

echo ""
echo "📋 Domain Configuration Summary:"
echo "Domain: $DOMAIN"
echo "Server IP: $SERVER_IP"
echo "Email: $EMAIL"
echo ""

# Generate DNS records
echo "🔧 DNS Configuration:"
echo "Add these DNS records to your domain registrar:"
echo ""
echo "Type    Name                    Value"
echo "----    ----                    -----"
echo "A       $DOMAIN                 $SERVER_IP"
echo "A       www.$DOMAIN             $SERVER_IP"
echo "CNAME   api.$DOMAIN             $DOMAIN"
echo ""

# Generate Nginx config
echo "⚙️  Nginx Configuration:"
echo "Create file: /etc/nginx/sites-available/$DOMAIN"
echo ""
cat << EOF
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name $DOMAIN www.$DOMAIN;

    # SSL Configuration (will be updated by Certbot)
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
EOF

echo ""
echo "🚀 Deployment Commands:"
echo "======================="
echo ""
echo "# 1. Update environment variables"
echo "sed -i 's|VITE_API_URL=.*|VITE_API_URL=https://$DOMAIN|g' .env"
echo ""
echo "# 2. Build frontend"
echo "npm run build"
echo ""
echo "# 3. Copy to web directory"
echo "sudo mkdir -p /var/www/ai-image-generator"
echo "sudo cp -r dist/* /var/www/ai-image-generator/"
echo ""
echo "# 4. Configure Nginx"
echo "sudo cp nginx.conf /etc/nginx/sites-available/$DOMAIN"
echo "sudo ln -s /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/"
echo "sudo nginx -t"
echo "sudo systemctl restart nginx"
echo ""
echo "# 5. Install SSL certificate"
echo "sudo certbot --nginx -d $DOMAIN -d www.$DOMAIN --email $EMAIL"
echo ""
echo "# 6. Test deployment"
echo "curl -I https://$DOMAIN"
echo "curl -I https://$DOMAIN/api/health"
echo ""

echo "✅ Domain setup instructions generated!"
echo ""
echo "📝 Next steps:"
echo "1. Add DNS records to your domain registrar"
echo "2. Wait for DNS propagation (up to 48 hours)"
echo "3. Run the deployment commands above"
echo "4. Test your application"
echo ""
echo "🆘 Need help? Check DOMAIN_SETUP.md for detailed instructions"
