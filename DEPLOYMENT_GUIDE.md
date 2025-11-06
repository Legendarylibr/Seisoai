# 🚀 Seiso AI Deployment Guide

## Quick Start (5 minutes)

### Option 1: Docker Compose (Easiest)

1. **Set up environment variables:**
   ```bash
   # Copy the example files
   cp env.example .env
   cp backend/env.example backend/.env
   
   # Edit both files with your actual values
   nano .env
   nano backend/.env
   ```

2. **Deploy with Docker:**
   ```bash
   # Start all services
   docker-compose up -d
   
   # Check status
   docker-compose ps
   
   # View logs
   docker-compose logs -f
   ```

3. **Access your app:**
   - Frontend: http://localhost:80
   - Backend API: http://localhost:3001
   - Grafana: http://localhost:3000 (admin/admin)
   - Prometheus: http://localhost:9090

### Option 2: Traditional Server Deployment

1. **Run the deployment script:**
   ```bash
   chmod +x deploy.sh
   ./deploy.sh
   ```

2. **Follow the post-deployment steps shown in the script output**

## Required Environment Variables

### Frontend (.env)
```bash
VITE_FAL_API_KEY=your_actual_fal_api_key
VITE_API_URL=https://your-domain.com
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_your_stripe_key
# ... (see env.example for complete list)
```

### Backend (backend/.env)
```bash
MONGODB_URI=mongodb://username:password@host:port/database
STRIPE_SECRET_KEY=sk_live_your_stripe_secret
ENCRYPTION_KEY=your-32-character-encryption-key
# ... (see backend/env.example for complete list)
```

## Deployment Platforms

### 1. DigitalOcean Droplet
- **Cost**: $12-24/month
- **Setup**: 1-click Docker deployment
- **Steps**:
  1. Create a Droplet (4GB RAM minimum)
  2. Install Docker: `curl -fsSL https://get.docker.com -o get-docker.sh && sh get-docker.sh`
  3. Clone your repo and run `docker-compose up -d`

### 2. AWS EC2
- **Cost**: $15-30/month
- **Setup**: EC2 + RDS MongoDB
- **Steps**:
  1. Launch EC2 instance (t3.medium)
  2. Setup RDS MongoDB instance
  3. Deploy using traditional method

### 3. Railway
- **Cost**: $5-20/month
- **Setup**: Git-based deployment
- **Steps**:
  1. Connect GitHub repo
  2. Set environment variables
  3. Deploy automatically

### 4. Render
- **Cost**: $7-25/month
- **Setup**: Git-based deployment
- **Steps**:
  1. Connect GitHub repo
  2. Configure build settings
  3. Set environment variables

### 5. Vercel (Frontend) + Railway (Backend)
- **Cost**: $0-20/month
- **Setup**: Split deployment
- **Steps**:
  1. Deploy frontend to Vercel
  2. Deploy backend to Railway
  3. Configure CORS

## Domain Setup

### 1. Buy a Domain
- **Recommended**: Namecheap, GoDaddy, Cloudflare
- **Cost**: $10-15/year

### 2. Configure DNS
```bash
# A record pointing to your server IP
your-domain.com -> YOUR_SERVER_IP
www.your-domain.com -> YOUR_SERVER_IP
```

### 3. SSL Certificate
```bash
# Using Let's Encrypt (free)
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## Payment Setup

### 1. Stripe Configuration
1. Create account at [stripe.com](https://stripe.com)
2. Get API keys from dashboard
3. Add to environment variables
4. Set up webhook endpoint: `https://your-domain.com/api/stripe/webhook`

### 2. Crypto Payment Wallets
1. Create wallets for each supported chain
2. Add addresses to environment variables
3. Fund wallets for receiving payments

### 3. RPC Endpoints
1. Sign up with [Alchemy](https://alchemy.com) (recommended)
2. Create projects for each chain
3. Add API keys to environment variables

## Monitoring Setup

### 1. Sentry (Error Tracking)
1. Sign up at [sentry.io](https://sentry.io)
2. Create new project
3. Add DSN to environment variables

### 2. Grafana (Metrics)
- Access: http://your-domain.com:3000
- Username: admin
- Password: admin (change in production)

## Security Checklist

- [ ] SSL certificate installed
- [ ] Environment variables secured
- [ ] Database access restricted
- [ ] Firewall configured
- [ ] Rate limiting enabled
- [ ] CORS properly configured
- [ ] Encryption keys generated
- [ ] Payment wallets configured
- [ ] RPC endpoints secured

## Troubleshooting

### Common Issues

1. **Port conflicts**: Check if ports 80, 443, 3001 are available
2. **Database connection**: Verify MongoDB URI and credentials
3. **CORS errors**: Check ALLOWED_ORIGINS configuration
4. **SSL issues**: Verify certificate installation
5. **Payment failures**: Check RPC endpoints and API keys

### Health Checks

```bash
# Check backend health
curl https://your-domain.com/api/health

# Check frontend
curl https://your-domain.com/

# Check Docker containers
docker-compose ps
```

### Logs

```bash
# Docker logs
docker-compose logs -f

# PM2 logs (traditional deployment)
pm2 logs

# Nginx logs
tail -f /var/log/nginx/access.log
```

## Scaling

### Horizontal Scaling
- Use multiple app instances behind load balancer
- Implement database sharding
- Use CDN for static assets

### Vertical Scaling
- Increase server resources
- Optimize database queries
- Implement caching (Redis)

## Backup Strategy

### Automated Backups
- Daily MongoDB backups
- 30-day retention
- S3 upload (optional)

### Manual Backups
```bash
# Database backup
mongodump --uri="your-mongodb-uri" --out=backup-$(date +%Y%m%d)

# Application backup
tar -czf app-backup-$(date +%Y%m%d).tar.gz /path/to/app
```

## Support

- **Documentation**: Check PRODUCTION_DEPLOYMENT.md
- **Security**: Review SECURITY_CHECKLIST.md
- **Issues**: Check logs and monitoring dashboards
- **Updates**: Regular dependency updates recommended

---

**🎉 Your Seiso AI app is now production-ready!**
