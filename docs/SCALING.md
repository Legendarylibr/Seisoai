# SeisoAI Scaling Guide

This guide covers how to scale SeisoAI for production traffic.

## Architecture Overview

```
                    ┌─────────────────────────────────────────────────────────┐
                    │                     Cloudflare CDN                       │
                    │  (Static assets, DDoS protection, WAF, SSL termination)  │
                    └─────────────────────────┬───────────────────────────────┘
                                              │
                    ┌─────────────────────────▼───────────────────────────────┐
                    │                    Load Balancer                         │
                    │              (Nginx / Railway / K8s Ingress)             │
                    └─────────────────────────┬───────────────────────────────┘
                                              │
              ┌───────────────────────────────┼───────────────────────────────┐
              │                               │                               │
              ▼                               ▼                               ▼
    ┌─────────────────┐             ┌─────────────────┐             ┌─────────────────┐
    │   App Replica 1  │             │   App Replica 2  │             │   App Replica N  │
    │   (Node.js)      │             │   (Node.js)      │             │   (Node.js)      │
    └────────┬────────┘             └────────┬────────┘             └────────┬────────┘
              │                               │                               │
              └───────────────────────────────┼───────────────────────────────┘
                                              │
                    ┌─────────────────────────┴───────────────────────────────┐
                    │                                                         │
              ┌─────▼─────┐                                           ┌───────▼───────┐
              │  MongoDB   │                                           │    Redis       │
              │  (Atlas)   │                                           │   (Sentinel)   │
              │  Replica   │                                           │   Cluster      │
              │   Set      │                                           │                │
              └───────────┘                                           └────────────────┘
```

## Deployment Options

### Option 1: Railway (Recommended for Startups)

Railway handles infrastructure automatically. We've configured:

- **2+ replicas** in `railway.toml`
- **Health checks** on `/api/health`
- **Auto-restart** on failure

```bash
# Deploy to Railway
railway up
```

For more replicas, update `railway.toml`:
```toml
numReplicas = 3  # or more
```

### Option 2: Docker Compose (Self-Hosted)

Use `docker-compose.prod.yml` for a production-ready setup:

```bash
# Start production stack
docker-compose -f docker-compose.prod.yml up -d

# Scale app replicas
docker-compose -f docker-compose.prod.yml up -d --scale app=5
```

### Option 3: Kubernetes (Enterprise Scale)

Apply the K8s manifests in the `k8s/` directory:

```bash
# Create namespace
kubectl apply -f k8s/namespace.yaml

# Apply all configs
kubectl apply -f k8s/

# Check status
kubectl get pods -n seisoai
kubectl get hpa -n seisoai
```

The HPA (Horizontal Pod Autoscaler) will automatically scale based on:
- CPU utilization (target: 70%)
- Memory utilization (target: 80%)
- Min replicas: 3
- Max replicas: 20

---

## CDN Configuration (Cloudflare)

### Step 1: Add Your Domain

1. Sign up at [Cloudflare](https://cloudflare.com)
2. Add your domain (e.g., `seisoai.com`)
3. Update your domain's nameservers to Cloudflare's

### Step 2: Configure DNS

```
Type    Name    Content              Proxy
A       @       <your-server-ip>     ✓ (orange cloud)
A       www     <your-server-ip>     ✓ (orange cloud)
CNAME   api     <your-server>        ✓ (orange cloud)
```

### Step 3: SSL/TLS Settings

1. Go to **SSL/TLS** → **Overview**
2. Set mode to **Full (strict)**
3. Enable **Always Use HTTPS**
4. Enable **Automatic HTTPS Rewrites**

### Step 4: Caching Rules

Go to **Caching** → **Cache Rules** and create:

**Rule 1: Cache Static Assets**
```
If: URI Path contains /assets/ OR 
    URI Path ends with .js OR
    URI Path ends with .css OR
    URI Path ends with .png OR
    URI Path ends with .jpg OR
    URI Path ends with .woff2
Then: 
  - Cache eligibility: Eligible for cache
  - Edge TTL: 1 month
  - Browser TTL: 1 year
```

**Rule 2: Bypass API Cache**
```
If: URI Path starts with /api/
Then:
  - Cache eligibility: Bypass cache
```

### Step 5: Page Rules (Optional)

Create page rules for fine-grained control:

1. `*seisoai.com/api/*` → Cache Level: Bypass
2. `*seisoai.com/*.js` → Cache Level: Cache Everything, Edge TTL: 1 month
3. `*seisoai.com/*.css` → Cache Level: Cache Everything, Edge TTL: 1 month

### Step 6: Security Settings

1. **WAF** → Enable managed rulesets
2. **DDoS** → Enabled by default
3. **Bot Fight Mode** → Enable
4. **Rate Limiting** → Create rules for `/api/auth/*` (5 req/10s)

---

## Database Scaling

### MongoDB Atlas (Recommended)

1. Create a cluster at [MongoDB Atlas](https://cloud.mongodb.com)
2. Choose **M10** or higher for production
3. Enable **Auto-scaling** for storage
4. Use **Read replicas** for read-heavy workloads

Connection string example:
```
mongodb+srv://user:pass@cluster.mongodb.net/seisoai?retryWrites=true&w=majority&readPreference=secondaryPreferred
```

### Redis (Upstash or Redis Cloud)

For managed Redis with automatic failover:

1. [Upstash](https://upstash.com) - Serverless Redis
2. [Redis Cloud](https://redis.com/try-free/) - Managed Redis

---

## Monitoring

### Prometheus + Grafana

The metrics endpoint is available at `/api/metrics`. Prometheus scrapes this endpoint.

Access Grafana dashboards to monitor:
- Request rate and latency
- Error rates
- Memory/CPU usage
- Circuit breaker status
- Database connections

### Alerting

Alerts are configured in `prometheus/alerts.yml`:
- App down
- High error rate (>5%)
- High response time (>2s P95)
- Memory usage (>85%)
- Circuit breaker open

---

## Performance Checklist

### Before Scaling

- [ ] Use managed databases (Atlas, Upstash)
- [ ] Configure CDN (Cloudflare)
- [ ] Enable gzip/brotli compression
- [ ] Optimize images (WebP, AVIF)
- [ ] Add proper cache headers

### At Scale

- [ ] Increase replica count (3+)
- [ ] Configure HPA for auto-scaling
- [ ] Use read replicas for databases
- [ ] Implement connection pooling
- [ ] Monitor with Prometheus/Grafana

### High Scale (1000+ RPS)

- [ ] Multi-region deployment
- [ ] Database sharding
- [ ] Dedicated Redis clusters
- [ ] Edge caching for API responses
- [ ] Consider serverless for spiky loads

---

## Quick Commands

```bash
# Check health
curl https://seisoai.com/api/health

# Check metrics
curl https://seisoai.com/api/metrics

# Check circuit breakers
curl https://seisoai.com/api/circuit-stats

# Docker: Scale to 5 replicas
docker-compose -f docker-compose.prod.yml up -d --scale app=5

# K8s: Check HPA status
kubectl get hpa seisoai-app-hpa -n seisoai

# K8s: Manual scale
kubectl scale deployment seisoai-app -n seisoai --replicas=10
```

---

## Support

For scaling assistance or performance optimization, check the logs:

```bash
# Docker logs
docker-compose logs -f app

# K8s logs
kubectl logs -f -l app=seisoai -n seisoai
```

