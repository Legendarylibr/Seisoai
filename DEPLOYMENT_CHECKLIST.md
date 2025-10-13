# 🚀 Production Deployment Checklist

## ✅ **Pre-Deployment Requirements**

### **1. Environment Variables Setup**

#### **Frontend (.env)**
```bash
# Required API Configuration
VITE_FAL_API_KEY=your_actual_fal_api_key
VITE_API_URL=https://your-domain.com

# Payment Wallets (REQUIRED - replace with your actual addresses)
VITE_ETH_PAYMENT_WALLET=0x1234567890123456789012345678901234567890
VITE_POLYGON_PAYMENT_WALLET=0x1234567890123456789012345678901234567890
VITE_ARBITRUM_PAYMENT_WALLET=0x1234567890123456789012345678901234567890
VITE_OPTIMISM_PAYMENT_WALLET=0x1234567890123456789012345678901234567890
VITE_BASE_PAYMENT_WALLET=0x1234567890123456789012345678901234567890
VITE_SOLANA_PAYMENT_WALLET=So11111111111111111111111111111111111111112

# Monitoring (Optional)
VITE_SENTRY_DSN=your_sentry_dsn_here
```

#### **Backend (.env)**
```bash
# Database (REQUIRED)
MONGODB_URI=mongodb://username:password@host:port/database

# Server Configuration
PORT=3001
NODE_ENV=production

# CORS (REQUIRED)
ALLOWED_ORIGINS=https://your-domain.com,https://www.your-domain.com

# Payment Wallets (same as frontend)
ETH_PAYMENT_WALLET=0x1234567890123456789012345678901234567890
POLYGON_PAYMENT_WALLET=0x1234567890123456789012345678901234567890
ARBITRUM_PAYMENT_WALLET=0x1234567890123456789012345678901234567890
OPTIMISM_PAYMENT_WALLET=0x1234567890123456789012345678901234567890
BASE_PAYMENT_WALLET=0x1234567890123456789012345678901234567890
SOLANA_PAYMENT_WALLET=So11111111111111111111111111111111111111112

# RPC Endpoints (REQUIRED)
ETH_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY
POLYGON_RPC_URL=https://polygon-mainnet.g.alchemy.com/v2/YOUR_API_KEY
ARBITRUM_RPC_URL=https://arb-mainnet.g.alchemy.com/v2/YOUR_API_KEY
OPTIMISM_RPC_URL=https://opt-mainnet.g.alchemy.com/v2/YOUR_API_KEY
BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_API_KEY

# Data Encryption (REQUIRED - must be exactly 32 characters)
ENCRYPTION_KEY=your-32-character-encryption-key-here

# Monitoring
SENTRY_DSN=your_sentry_dsn_here

# Security
JWT_SECRET=your-super-secret-jwt-key-here
SESSION_SECRET=your-session-secret-here
```

### **2. Infrastructure Requirements**

#### **Server Specifications**
- **CPU**: 2+ cores (4+ recommended)
- **RAM**: 4GB+ (8GB+ recommended)
- **Storage**: 50GB+ SSD
- **OS**: Ubuntu 20.04+ or CentOS 8+

#### **Software Dependencies**
- **Node.js**: 18+ (LTS recommended)
- **MongoDB**: 7.0+
- **Nginx**: Latest stable
- **PM2**: Process manager
- **SSL Certificate**: Let's Encrypt or commercial

### **3. External Services Setup**

#### **Blockchain RPC Providers**
- **Alchemy** (recommended): https://alchemy.com
- **Infura**: https://infura.io
- **QuickNode**: https://quicknode.com
- **Moralis**: https://moralis.io

#### **Monitoring Services**
- **Sentry**: Error tracking and performance monitoring
- **Prometheus + Grafana**: Metrics and dashboards (optional)

## 🚀 **Deployment Options**

### **Option 1: Traditional Server Deployment**

```bash
# 1. Clone and setup
git clone <your-repo>
cd ai-image-generator

# 2. Run deployment script
chmod +x deploy.sh
./deploy.sh

# 3. Configure Nginx
sudo cp nginx.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/nginx.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# 4. Setup SSL
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com

# 5. Start application
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### **Option 2: Docker Deployment**

```bash
# 1. Setup environment variables
cp env.example .env
# Edit .env with your values

# 2. Start with Docker Compose
docker-compose up -d

# 3. Monitor deployment
docker-compose logs -f

# 4. Setup SSL (if using reverse proxy)
# Configure SSL certificates in ./ssl/ directory
```

### **Option 3: Cloud Platform Deployment**

#### **AWS EC2 + RDS**
```bash
# 1. Launch EC2 instance (t3.medium+)
# 2. Setup RDS MongoDB instance
# 3. Configure security groups
# 4. Deploy using deploy.sh script
```

#### **DigitalOcean Droplet**
```bash
# 1. Create droplet (4GB+ RAM)
# 2. Setup MongoDB Atlas or managed database
# 3. Deploy using Docker or traditional method
```

#### **Railway/Render/Vercel**
```bash
# 1. Connect GitHub repository
# 2. Set environment variables
# 3. Deploy automatically
```

## 🔧 **Post-Deployment Configuration**

### **1. Database Setup**
```bash
# Connect to MongoDB and create indexes
mongo your-mongodb-uri
db.users.createIndex({ "walletAddress": 1 })
db.users.createIndex({ "createdAt": 1 })
db.users.createIndex({ "expiresAt": 1 })
```

### **2. SSL Certificate Setup**
```bash
# Using Let's Encrypt
sudo certbot --nginx -d your-domain.com -d www.your-domain.com

# Or manually configure SSL in nginx.conf
```

### **3. Monitoring Setup**
```bash
# Setup Sentry
# 1. Create account at sentry.io
# 2. Create new project
# 3. Copy DSN to environment variables

# Setup Prometheus + Grafana (optional)
docker-compose -f monitoring.yml up -d
```

### **4. Backup Configuration**
```bash
# Setup automated backups
crontab -e
# Add: 0 2 * * * /path/to/backup-script.sh
```

## 🔒 **Security Checklist**

### **✅ Required Security Measures**
- [ ] **SSL Certificate** installed and configured
- [ ] **Environment variables** properly secured
- [ ] **Database** access restricted
- [ ] **Firewall** configured (ports 80, 443, 22 only)
- [ ] **Rate limiting** enabled
- [ ] **CORS** properly configured
- [ ] **Encryption key** generated and secured
- [ ] **Payment wallets** configured with real addresses
- [ ] **RPC endpoints** secured with API keys

### **✅ Optional Security Enhancements**
- [ ] **WAF** (Web Application Firewall)
- [ ] **DDoS protection**
- [ ] **Database encryption at rest**
- [ ] **Backup encryption**
- [ ] **Multi-factor authentication** for admin access

## 📊 **Performance Optimization**

### **1. Database Optimization**
```bash
# Create additional indexes for performance
db.users.createIndex({ "lastActive": 1 })
db.users.createIndex({ "gallery.timestamp": 1 })
db.metrics.createIndex({ "timestamp": 1 })
```

### **2. Caching Setup**
```bash
# Install Redis (optional)
sudo apt install redis-server
# Configure Redis in application
```

### **3. CDN Configuration**
```bash
# Setup CloudFlare or AWS CloudFront
# Configure static asset caching
# Optimize image delivery
```

## 🧪 **Testing & Validation**

### **1. Health Checks**
```bash
# Test backend health
curl https://your-domain.com/api/health

# Test frontend
curl https://your-domain.com/

# Test payment endpoints
curl -X POST https://your-domain.com/api/payments/verify
```

### **2. Load Testing**
```bash
# Install artillery
npm install -g artillery

# Run load test
artillery run load-test.yml
```

### **3. Security Testing**
```bash
# Run security scan
npm audit
npm audit fix

# Test SSL configuration
ssl-test your-domain.com
```

## 📈 **Monitoring & Maintenance**

### **1. Log Monitoring**
```bash
# Monitor application logs
pm2 logs
tail -f logs/combined.log

# Monitor Nginx logs
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log
```

### **2. Performance Monitoring**
- **Sentry**: Error tracking and performance
- **Prometheus**: Metrics collection
- **Grafana**: Dashboards and visualization

### **3. Regular Maintenance**
```bash
# Update dependencies
npm update
npm audit fix

# Database maintenance
mongo --eval "db.runCommand({compact: 'users'})"

# Log rotation
logrotate /etc/logrotate.d/ai-image-generator
```

## 🆘 **Troubleshooting**

### **Common Issues**
1. **Port conflicts**: Check if ports 80, 443, 3001 are available
2. **Database connection**: Verify MongoDB URI and credentials
3. **CORS errors**: Check ALLOWED_ORIGINS configuration
4. **SSL issues**: Verify certificate installation
5. **Payment failures**: Check RPC endpoints and API keys

### **Emergency Procedures**
```bash
# Restart application
pm2 restart all

# Rollback deployment
git checkout previous-commit
pm2 restart all

# Database backup
mongodump --uri="your-mongodb-uri" --out=backup-$(date +%Y%m%d)
```

## 📞 **Support & Resources**

- **Documentation**: Check PRODUCTION_DEPLOYMENT.md
- **Security**: Review SECURITY_CHECKLIST.md
- **Monitoring**: Setup Sentry and Prometheus
- **Backups**: Configure automated backups
- **Updates**: Regular dependency updates

---

**🎉 Your AI Image Generator is now production-ready!**
