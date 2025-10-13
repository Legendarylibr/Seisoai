#!/bin/bash

# 🌐 Automated Domain Setup Script
# Configures domain, SSL, and Nginx for AI Image Generator

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration variables
DOMAIN=""
SERVER_IP=""
EMAIL=""
NGINX_CONFIG="/etc/nginx/sites-available"
NGINX_ENABLED="/etc/nginx/sites-enabled"

echo -e "${BLUE}🌐 AI Image Generator - Domain Setup${NC}"
echo "=================================="

# Function to get user input
get_user_input() {
    echo ""
    echo -e "${YELLOW}📝 Domain Configuration${NC}"
    echo "-------------------"
    
    read -p "Enter your domain (e.g., myapp.com): " DOMAIN
    read -p "Enter your server IP address: " SERVER_IP
    read -p "Enter your email for SSL certificate: " EMAIL
    
    # Validate inputs
    if [[ -z "$DOMAIN" || -z "$SERVER_IP" || -z "$EMAIL" ]]; then
        echo -e "${RED}❌ All fields are required!${NC}"
        exit 1
    fi
    
    echo ""
    echo -e "${GREEN}✅ Configuration:${NC}"
    echo "Domain: $DOMAIN"
    echo "Server IP: $SERVER_IP"
    echo "Email: $EMAIL"
    echo ""
    
    read -p "Continue with this configuration? (y/n): " confirm
    if [[ $confirm != [yY] ]]; then
        echo "Setup cancelled."
        exit 0
    fi
}

# Function to check prerequisites
check_prerequisites() {
    echo -e "${YELLOW}🔍 Checking prerequisites...${NC}"
    
    # Check if running as root or with sudo
    if [[ $EUID -eq 0 ]]; then
        echo -e "${RED}❌ Don't run this script as root. Use sudo when needed.${NC}"
        exit 1
    fi
    
    # Check if Nginx is installed
    if ! command -v nginx &> /dev/null; then
        echo -e "${RED}❌ Nginx is not installed. Please install it first:${NC}"
        echo "sudo apt update && sudo apt install nginx"
        exit 1
    fi
    
    # Check if Certbot is installed
    if ! command -v certbot &> /dev/null; then
        echo -e "${YELLOW}⚠️  Certbot not found. Installing...${NC}"
        sudo apt update
        sudo apt install -y certbot python3-certbot-nginx
    fi
    
    # Check if application is running
    if ! curl -s http://localhost:3001/api/health > /dev/null; then
        echo -e "${RED}❌ Backend application is not running on port 3001${NC}"
        echo "Please start your application first:"
        echo "cd backend && npm start"
        exit 1
    fi
    
    echo -e "${GREEN}✅ Prerequisites check passed${NC}"
}

# Function to create Nginx configuration
create_nginx_config() {
    echo -e "${YELLOW}⚙️  Creating Nginx configuration...${NC}"
    
    # Create Nginx config file
    cat > /tmp/nginx_${DOMAIN}.conf << EOF
# Rate limiting zones
limit_req_zone \$binary_remote_addr zone=api:10m rate=10r/s;
limit_req_zone \$binary_remote_addr zone=general:10m rate=30r/s;

# HTTP to HTTPS redirect
server {
    listen 80;
    server_name ${DOMAIN} www.${DOMAIN};
    return 301 https://\$server_name\$request_uri;
}

# HTTPS server
server {
    listen 443 ssl http2;
    server_name ${DOMAIN} www.${DOMAIN};

    # SSL Configuration (will be updated by Certbot)
    ssl_certificate /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline' 'unsafe-eval'" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Frontend (React App)
    location / {
        root /var/www/ai-image-generator/dist;
        try_files \$uri \$uri/ /index.html;
        
        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
        
        # Rate limiting
        limit_req zone=general burst=50 nodelay;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        
        # Rate limiting
        limit_req zone=api burst=20 nodelay;
        
        # Timeouts
        proxy_connect_timeout 30s;
        proxy_send_timeout 30s;
        proxy_read_timeout 30s;
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
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json application/xml application/rss+xml application/atom+xml image/svg+xml;
}
EOF

    # Copy config to Nginx sites-available
    sudo cp /tmp/nginx_${DOMAIN}.conf ${NGINX_CONFIG}/${DOMAIN}
    
    # Enable the site
    sudo ln -sf ${NGINX_CONFIG}/${DOMAIN} ${NGINX_ENABLED}/${DOMAIN}
    
    # Remove default site
    sudo rm -f ${NGINX_ENABLED}/default
    
    echo -e "${GREEN}✅ Nginx configuration created${NC}"
}

# Function to test Nginx configuration
test_nginx_config() {
    echo -e "${YELLOW}🧪 Testing Nginx configuration...${NC}"
    
    if sudo nginx -t; then
        echo -e "${GREEN}✅ Nginx configuration is valid${NC}"
    else
        echo -e "${RED}❌ Nginx configuration test failed${NC}"
        exit 1
    fi
}

# Function to install SSL certificate
install_ssl_certificate() {
    echo -e "${YELLOW}🔒 Installing SSL certificate...${NC}"
    
    # Install SSL certificate using Certbot
    sudo certbot --nginx -d ${DOMAIN} -d www.${DOMAIN} \
        --non-interactive \
        --agree-tos \
        --email ${EMAIL} \
        --redirect \
        --hsts \
        --staple-ocsp
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ SSL certificate installed successfully${NC}"
    else
        echo -e "${RED}❌ SSL certificate installation failed${NC}"
        echo "Please check your domain DNS settings and try again."
        exit 1
    fi
}

# Function to setup auto-renewal
setup_auto_renewal() {
    echo -e "${YELLOW}🔄 Setting up SSL auto-renewal...${NC}"
    
    # Add cron job for auto-renewal
    (crontab -l 2>/dev/null; echo "0 12 * * * /usr/bin/certbot renew --quiet") | crontab -
    
    echo -e "${GREEN}✅ SSL auto-renewal configured${NC}"
}

# Function to create web directory
create_web_directory() {
    echo -e "${YELLOW}📁 Creating web directory...${NC}"
    
    # Create web directory
    sudo mkdir -p /var/www/ai-image-generator
    
    # Set permissions
    sudo chown -R $USER:$USER /var/www/ai-image-generator
    
    echo -e "${GREEN}✅ Web directory created${NC}"
}

# Function to build and deploy frontend
build_frontend() {
    echo -e "${YELLOW}🏗️  Building frontend...${NC}"
    
    # Update environment variables
    if [ -f ".env" ]; then
        sed -i "s|VITE_API_URL=.*|VITE_API_URL=https://${DOMAIN}|g" .env
    fi
    
    # Build frontend
    npm run build
    
    # Copy to web directory
    sudo cp -r dist/* /var/www/ai-image-generator/
    sudo chown -R www-data:www-data /var/www/ai-image-generator
    
    echo -e "${GREEN}✅ Frontend built and deployed${NC}"
}

# Function to restart services
restart_services() {
    echo -e "${YELLOW}🔄 Restarting services...${NC}"
    
    # Restart Nginx
    sudo systemctl restart nginx
    
    # Enable Nginx to start on boot
    sudo systemctl enable nginx
    
    echo -e "${GREEN}✅ Services restarted${NC}"
}

# Function to test deployment
test_deployment() {
    echo -e "${YELLOW}🧪 Testing deployment...${NC}"
    
    # Wait a moment for services to start
    sleep 5
    
    # Test HTTP redirect
    echo "Testing HTTP to HTTPS redirect..."
    if curl -s -I http://${DOMAIN} | grep -q "301\|302"; then
        echo -e "${GREEN}✅ HTTP redirect working${NC}"
    else
        echo -e "${RED}❌ HTTP redirect not working${NC}"
    fi
    
    # Test HTTPS
    echo "Testing HTTPS..."
    if curl -s -I https://${DOMAIN} | grep -q "200"; then
        echo -e "${GREEN}✅ HTTPS working${NC}"
    else
        echo -e "${RED}❌ HTTPS not working${NC}"
    fi
    
    # Test API
    echo "Testing API..."
    if curl -s https://${DOMAIN}/api/health | grep -q "success"; then
        echo -e "${GREEN}✅ API working${NC}"
    else
        echo -e "${RED}❌ API not working${NC}"
    fi
}

# Function to show final information
show_final_info() {
    echo ""
    echo -e "${GREEN}🎉 Domain setup complete!${NC}"
    echo "========================"
    echo ""
    echo -e "${BLUE}🌐 Your application is now available at:${NC}"
    echo "Frontend: https://${DOMAIN}"
    echo "API: https://${DOMAIN}/api"
    echo "Health: https://${DOMAIN}/health"
    echo ""
    echo -e "${YELLOW}📋 Next steps:${NC}"
    echo "1. Update your DNS records to point to ${SERVER_IP}"
    echo "2. Wait for DNS propagation (up to 48 hours)"
    echo "3. Test your application thoroughly"
    echo "4. Setup monitoring and backups"
    echo ""
    echo -e "${BLUE}🔧 Useful commands:${NC}"
    echo "Check SSL: sudo certbot certificates"
    echo "Renew SSL: sudo certbot renew"
    echo "Nginx status: sudo systemctl status nginx"
    echo "Nginx logs: sudo tail -f /var/log/nginx/error.log"
    echo ""
    echo -e "${GREEN}✅ Setup complete!${NC}"
}

# Main execution
main() {
    get_user_input
    check_prerequisites
    create_web_directory
    create_nginx_config
    test_nginx_config
    install_ssl_certificate
    setup_auto_renewal
    build_frontend
    restart_services
    test_deployment
    show_final_info
}

# Run main function
main
