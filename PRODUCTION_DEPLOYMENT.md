# Production Deployment Guide

## 🚀 Complete Production Setup

This guide covers all the enhancements added to make your AI Image Generator production-ready.

## 📋 Prerequisites

- Node.js 18+ and npm
- MongoDB 7.0+
- Redis (optional, for caching)
- Nginx (for reverse proxy)
- SSL certificate (Let's Encrypt recommended)
- Domain name with DNS configured

## 🔧 Environment Setup

### 1. Frontend Environment Variables

Create `.env` file in the root directory:

```bash
# Required
VITE_FAL_API_KEY=your_actual_fal_api_key
VITE_API_URL=https://your-domain.com

# Payment Wallets (REQUIRED - replace with actual addresses)
VITE_ETH_PAYMENT_WALLET=0x1234567890123456789012345678901234567890
VITE_POLYGON_PAYMENT_WALLET=0x1234567890123456789012345678901234567890
VITE_ARBITRUM_PAYMENT_WALLET=0x1234567890123456789012345678901234567890
VITE_OPTIMISM_PAYMENT_WALLET=0x1234567890123456789012345678901234567890
VITE_BASE_PAYMENT_WALLET=0x1234567890123456789012345678901234567890
VITE_SOLANA_PAYMENT_WALLET=So11111111111111111111111111111111111111112

# CDN Configuration (optional)
VITE_CDN_URL=https://your-cdn-domain.com

# Monitoring
VITE_SENTRY_DSN=your_sentry_dsn_here

# Feature Flags
VITE_ENABLE_ANALYTICS=true
VITE_ENABLE_ERROR_REPORTING=true
VITE_ENABLE_PERFORMANCE_MONITORING=true
```

### 2. Backend Environment Variables

Create `.env` file in the `backend` directory:

```bash
# Database
MONGODB_URI=mongodb://username:password@localhost:27017/ai-image-generator

# Server
PORT=3001
NODE_ENV=production

# CORS
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

# Monitoring
SENTRY_DSN=your_sentry_dsn_here

# Security
JWT_SECRET=your-super-secret-jwt-key-here
SESSION_SECRET=your-session-secret-here

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
PAYMENT_RATE_LIMIT_WINDOW_MS=300000
PAYMENT_RATE_LIMIT_MAX_REQUESTS=10

# Logging
LOG_LEVEL=info
LOG_FILE_PATH=logs/

# Backup
BACKUP_SCHEDULE=0 2 * * *
BACKUP_RETENTION_DAYS=30

# Performance
MAX_REQUEST_SIZE=10mb
REQUEST_TIMEOUT=30000
```

## 🚀 Deployment Options

### Option 1: Traditional Server Deployment

1. **Run the deployment script:**
   ```bash
   chmod +x deploy.sh
   ./deploy.sh
   ```

2. **Follow the post-deployment steps:**
   - Copy nginx.conf to `/etc/nginx/sites-available/`
   - Enable the site: `sudo ln -s /etc/nginx/sites-available/nginx.conf /etc/nginx/sites-enabled/`
   - Test Nginx: `sudo nginx -t`
   - Restart Nginx: `sudo systemctl restart nginx`
   - Start the app: `pm2 start ecosystem.config.js`
   - Setup SSL: `./ssl-setup.sh`

### Option 2: Docker Deployment

1. **Build and start with Docker Compose:**
   ```bash
   docker-compose up -d
   ```

2. **Monitor the deployment:**
   ```bash
   docker-compose logs -f
   ```

### Option 3: Kubernetes Deployment

1. **Apply Kubernetes manifests:**
   ```bash
   kubectl apply -f k8s/
   ```

2. **Check deployment status:**
   ```bash
   kubectl get pods
   kubectl get services
   ```

## 📊 Monitoring Setup

### 1. Sentry Integration

- Sign up at [Sentry.io](https://sentry.io)
- Create a new project
- Copy the DSN to your environment variables
- Errors and performance data will be automatically sent

### 2. Prometheus & Grafana

- Prometheus runs on port 9090
- Grafana runs on port 3000
- Default Grafana credentials: admin/admin
- Import dashboards from `grafana/dashboards/`

### 3. Health Checks

- Backend health: `GET /api/health`
- Metrics: `GET /api/metrics`
- Database status included in health checks

## 🔒 Security Features

### 1. Content Safety

- **CSAM Protection**: Zero-tolerance policy with comprehensive filtering
- **Content Filtering**: Multi-layer keyword and pattern detection
- **Violation Logging**: All attempts logged and monitored

### 2. Rate Limiting

- **General API**: 100 requests per 15 minutes per IP
- **Payment Endpoints**: 10 requests per 5 minutes per IP
- **Health Checks**: Excluded from rate limiting

### 3. Security Headers

- **CSP**: Content Security Policy configured
- **HSTS**: HTTP Strict Transport Security
- **X-Frame-Options**: Clickjacking protection
- **X-Content-Type-Options**: MIME sniffing protection

### 4. Input Validation

- **Sanitization**: All inputs sanitized
- **Size Limits**: Request size limited to 10MB
- **Type Validation**: Strict input type checking

## 💾 Database & Backup

### 1. MongoDB Configuration

- **Encryption**: Enabled in production
- **Indexes**: Optimized for performance
- **Connection Pooling**: Configured for high concurrency

### 2. Automated Backups

- **Daily Backups**: Runs at 2 AM daily
- **Retention**: 30 days of backups
- **S3 Upload**: Optional S3 integration
- **Compression**: Backups are compressed

### 3. Data Cleanup

- **Expired Users**: Cleaned up after 30 days
- **Old Gallery Items**: Removed after 30 days
- **Old Metrics**: Cleaned up after 30 days

## ⚡ Performance Optimizations

### 1. Caching

- **Redis Integration**: Optional Redis caching
- **Response Caching**: API responses cached
- **Static Asset Caching**: CDN integration

### 2. Database Optimization

- **Indexes**: Strategic database indexes
- **Query Optimization**: Optimized database queries
- **Connection Pooling**: Efficient connection management

### 3. Frontend Optimization

- **Code Splitting**: Automatic code splitting
- **Tree Shaking**: Dead code elimination
- **Minification**: Production builds minified
- **CDN Integration**: Static assets served via CDN

## 🔧 Maintenance

### 1. Log Management

- **Centralized Logging**: Winston-based logging
- **Log Rotation**: Automatic log rotation
- **Log Levels**: Configurable log levels
- **MongoDB Logging**: Optional MongoDB log storage

### 2. Monitoring

- **Health Checks**: Automated health monitoring
- **Performance Metrics**: Real-time performance data
- **Error Tracking**: Comprehensive error tracking
- **Alerting**: Configurable alerting system

### 3. Updates

- **Dependency Updates**: Regular dependency updates
- **Security Patches**: Automated security patch application
- **Database Migrations**: Safe database migration process

## 🆘 Troubleshooting

### Common Issues

1. **Environment Variables Missing**
   - Check all required variables are set
   - Verify variable names match exactly
   - Ensure no trailing spaces

2. **Database Connection Issues**
   - Verify MongoDB is running
   - Check connection string format
   - Ensure network connectivity

3. **Rate Limiting Issues**
   - Check rate limit configuration
   - Verify IP whitelist settings
   - Monitor rate limit logs

4. **Performance Issues**
   - Check database indexes
   - Monitor memory usage
   - Review query performance

### Support

- **Logs**: Check application logs in `logs/` directory
- **Monitoring**: Use Prometheus/Grafana dashboards
- **Health Checks**: Monitor `/api/health` endpoint
- **Error Tracking**: Check Sentry dashboard

## 📈 Scaling Considerations

### Horizontal Scaling

- **Load Balancers**: Use multiple app instances
- **Database Sharding**: Consider MongoDB sharding
- **CDN**: Implement CDN for static assets
- **Microservices**: Consider service decomposition

### Vertical Scaling

- **Memory**: Increase Node.js memory limits
- **CPU**: Use multi-core processors
- **Storage**: SSD storage for database
- **Network**: High-bandwidth network connections

## 🔐 Security Checklist

- [ ] All environment variables set correctly
- [ ] SSL certificates installed and configured
- [ ] Security headers enabled
- [ ] Rate limiting configured
- [ ] Content safety filters active
- [ ] Database encryption enabled
- [ ] Backup system operational
- [ ] Monitoring systems active
- [ ] Error tracking configured
- [ ] Log management setup
- [ ] Firewall rules configured
- [ ] Access controls implemented

## 📞 Emergency Contacts

- **Technical Support**: [your-support-email]
- **Security Issues**: [your-security-email]
- **Infrastructure**: [your-infrastructure-email]

---

**Last Updated**: December 2024
**Version**: 2.0
**Next Review**: March 2025
