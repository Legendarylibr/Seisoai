#!/bin/bash

# Production Deployment Script for AI Image Generator

set -e  # Exit on any error

echo "🚀 Starting production deployment..."

# Check if required environment variables are set
check_env_vars() {
    echo "🔍 Checking environment variables..."
    
    local required_vars=(
        "MONGODB_URI"
        "ETH_PAYMENT_WALLET"
        "POLYGON_PAYMENT_WALLET"
        "ARBITRUM_PAYMENT_WALLET"
        "OPTIMISM_PAYMENT_WALLET"
        "BASE_PAYMENT_WALLET"
        "SOLANA_PAYMENT_WALLET"
        "ETH_RPC_URL"
        "POLYGON_RPC_URL"
        "ARBITRUM_RPC_URL"
        "OPTIMISM_RPC_URL"
        "BASE_RPC_URL"
        "ENCRYPTION_KEY"
        "SENTRY_DSN"
    )
    
    local missing_vars=()
    
    for var in "${required_vars[@]}"; do
        if [ -z "${!var}" ]; then
            missing_vars+=("$var")
        fi
    done
    
    if [ ${#missing_vars[@]} -ne 0 ]; then
        echo "❌ Missing required environment variables:"
        printf '%s\n' "${missing_vars[@]}"
        echo "Please set these variables before deploying."
        exit 1
    fi
    
    # Validate encryption key length
    if [ ${#ENCRYPTION_KEY} -ne 32 ]; then
        echo "❌ ENCRYPTION_KEY must be exactly 32 characters long for AES-256 encryption"
        echo "Current length: ${#ENCRYPTION_KEY}"
        echo "Generate a secure key with: node -e \"console.log(require('crypto').randomBytes(16).toString('hex'))\""
        exit 1
    fi
    
    echo "✅ All required environment variables are set"
    echo "✅ Encryption key validation passed"
}

# Install dependencies
install_dependencies() {
    echo "📦 Installing dependencies..."
    
    # Install frontend dependencies
    npm install
    
    # Install backend dependencies
    cd backend
    npm install
    cd ..
    
    echo "✅ Dependencies installed successfully"
}

# Build frontend
build_frontend() {
    echo "🏗️ Building frontend..."
    
    # Set production environment
    export NODE_ENV=production
    
    # Build the frontend
    npm run build
    
    echo "✅ Frontend built successfully"
}

# Create logs directory
create_logs_dir() {
    echo "📁 Creating logs directory..."
    
    mkdir -p logs
    chmod 755 logs
    
    echo "✅ Logs directory created"
}

# Setup PM2 for process management
setup_pm2() {
    echo "⚙️ Setting up PM2 process manager..."
    
    # Install PM2 globally if not already installed
    if ! command -v pm2 &> /dev/null; then
        npm install -g pm2
    fi
    
    # Create PM2 ecosystem file
    cat > ecosystem.config.js << EOF
module.exports = {
  apps: [
    {
      name: 'ai-image-generator-backend',
      script: './backend/server.js',
      instances: 'max',
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      error_file: './logs/backend-error.log',
      out_file: './logs/backend-out.log',
      log_file: './logs/backend-combined.log',
      time: true,
      max_memory_restart: '1G',
      node_args: '--max-old-space-size=1024'
    }
  ]
};
EOF
    
    echo "✅ PM2 configuration created"
}

# Setup Nginx configuration
setup_nginx() {
    echo "🌐 Setting up Nginx configuration..."
    
    cat > nginx.conf << EOF
server {
    listen 80;
    server_name your-domain.com;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://api.fal.ai https://api.mainnet-beta.solana.com;" always;
    
    # Rate limiting
    limit_req_zone \$binary_remote_addr zone=api:10m rate=10r/s;
    limit_req_zone \$binary_remote_addr zone=payment:10m rate=2r/s;
    
    # Frontend (React app)
    location / {
        root /var/www/ai-image-generator/dist;
        try_files \$uri \$uri/ /index.html;
        
        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }
    
    # Backend API
    location /api/ {
        limit_req zone=api burst=20 nodelay;
        
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }
    
    # Payment endpoints with stricter rate limiting
    location /api/payments/ {
        limit_req zone=payment burst=5 nodelay;
        
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }
    
    # Health check endpoint
    location /api/health {
        proxy_pass http://localhost:3001;
        access_log off;
    }
}
EOF
    
    echo "✅ Nginx configuration created"
    echo "📝 Please copy nginx.conf to /etc/nginx/sites-available/ and enable the site"
}

# Setup SSL with Let's Encrypt
setup_ssl() {
    echo "🔒 Setting up SSL with Let's Encrypt..."
    
    cat > ssl-setup.sh << EOF
#!/bin/bash

# Install certbot
sudo apt update
sudo apt install -y certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot --nginx -d your-domain.com

# Setup auto-renewal
sudo crontab -e
# Add this line: 0 12 * * * /usr/bin/certbot renew --quiet
EOF
    
    chmod +x ssl-setup.sh
    
    echo "✅ SSL setup script created"
    echo "📝 Run ./ssl-setup.sh after setting up Nginx"
}

# Setup monitoring
setup_monitoring() {
    echo "📊 Setting up monitoring..."
    
    # Create monitoring script
    cat > monitor.sh << EOF
#!/bin/bash

# Health check script
check_health() {
    local response=\$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/health)
    if [ "\$response" = "200" ]; then
        echo "✅ Backend is healthy"
    else
        echo "❌ Backend is unhealthy (HTTP \$response)"
        # Restart PM2 processes
        pm2 restart all
    fi
}

# Check disk space
check_disk_space() {
    local usage=\$(df / | awk 'NR==2 {print \$5}' | sed 's/%//')
    if [ "\$usage" -gt 80 ]; then
        echo "⚠️ Disk usage is high: \$usage%"
        # Clean up old logs
        find logs/ -name "*.log" -mtime +7 -delete
    fi
}

# Check memory usage
check_memory() {
    local usage=\$(free | awk 'NR==2{printf "%.0f", \$3*100/\$2}')
    if [ "\$usage" -gt 80 ]; then
        echo "⚠️ Memory usage is high: \$usage%"
    fi
}

# Run checks
check_health
check_disk_space
check_memory
EOF
    
    chmod +x monitor.sh
    
    # Setup cron job for monitoring
    echo "0 */5 * * * $(pwd)/monitor.sh" | crontab -
    
    echo "✅ Monitoring setup completed"
}

# Setup backup
setup_backup() {
    echo "💾 Setting up backup system..."
    
    cat > backup.sh << EOF
#!/bin/bash

# MongoDB backup script
BACKUP_DIR="/var/backups/ai-image-generator"
DATE=\$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="mongodb_backup_\$DATE"

# Create backup directory
mkdir -p \$BACKUP_DIR

# Create MongoDB backup
mongodump --uri="\$MONGODB_URI" --out="\$BACKUP_DIR/\$BACKUP_FILE"

# Compress backup
tar -czf "\$BACKUP_DIR/\$BACKUP_FILE.tar.gz" -C "\$BACKUP_DIR" "\$BACKUP_FILE"

# Remove uncompressed backup
rm -rf "\$BACKUP_DIR/\$BACKUP_FILE"

# Upload to S3 (if configured)
if [ ! -z "\$AWS_S3_BUCKET" ]; then
    aws s3 cp "\$BACKUP_DIR/\$BACKUP_FILE.tar.gz" "s3://\$AWS_S3_BUCKET/backups/"
fi

# Clean up old backups (keep 30 days)
find \$BACKUP_DIR -name "*.tar.gz" -mtime +30 -delete

echo "✅ Backup completed: \$BACKUP_FILE.tar.gz"
EOF
    
    chmod +x backup.sh
    
    # Setup daily backup cron job
    echo "0 2 * * * $(pwd)/backup.sh" | crontab -
    
    echo "✅ Backup system setup completed"
}

# Main deployment function
main() {
    echo "🎨 AI Image Generator Production Deployment"
    echo "=========================================="
    
    check_env_vars
    install_dependencies
    build_frontend
    create_logs_dir
    setup_pm2
    setup_nginx
    setup_ssl
    setup_monitoring
    setup_backup
    
    echo ""
    echo "🎉 Deployment completed successfully!"
    echo ""
    echo "Next steps:"
    echo "1. Copy nginx.conf to /etc/nginx/sites-available/"
    echo "2. Enable the site: sudo ln -s /etc/nginx/sites-available/nginx.conf /etc/nginx/sites-enabled/"
    echo "3. Test Nginx config: sudo nginx -t"
    echo "4. Restart Nginx: sudo systemctl restart nginx"
    echo "5. Start the application: pm2 start ecosystem.config.js"
    echo "6. Setup SSL: ./ssl-setup.sh"
    echo "7. Monitor logs: pm2 logs"
    echo ""
    echo "🔗 Your application will be available at: http://your-domain.com"
    echo "📊 Monitor with: pm2 monit"
    echo "📝 View logs: pm2 logs ai-image-generator-backend"
}

# Run main function
main "$@"
