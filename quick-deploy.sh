#!/bin/bash

# Seiso AI - Quick Railway Deployment Script
echo "🚀 Seiso AI - Railway Deployment Helper"
echo "======================================"

# Check if user is logged into Railway CLI
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI not found. Installing..."
    npm install -g @railway/cli
fi

# Check if user is logged in
if ! railway whoami &> /dev/null; then
    echo "🔐 Please log in to Railway first:"
    echo "   railway login"
    exit 1
fi

echo "✅ Railway CLI is ready"

# Check if we're in a git repository
if [ ! -d ".git" ]; then
    echo "❌ Not in a git repository. Please initialize git first:"
    echo "   git init"
    echo "   git add ."
    echo "   git commit -m 'Initial commit'"
    exit 1
fi

echo "✅ Git repository detected"

# Check if we have a Railway project
if [ ! -f "railway.json" ]; then
    echo "❌ railway.json not found. Creating..."
    cat > railway.json << 'EOF'
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "Dockerfile"
  },
  "deploy": {
    "startCommand": "node backend/server.js",
    "healthcheckPath": "/api/health",
    "healthcheckTimeout": 30,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3,
    "runtime": "V2"
  }
}
EOF
fi

echo "✅ Railway configuration ready"

# Check if we have environment files
if [ ! -f "backend/.env" ]; then
    echo "❌ Backend .env file not found. Creating from template..."
    cp backend.env backend/.env
    echo "⚠️  Please update backend/.env with your actual values before deploying"
fi

echo "✅ Environment files ready"

# Check if we have a Dockerfile
if [ ! -f "Dockerfile" ]; then
    echo "❌ Dockerfile not found. Creating..."
    cat > Dockerfile << 'EOF'
# Multi-stage Docker build for AI Image Generator

# Stage 1: Build frontend
FROM node:18-alpine AS frontend-builder

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Stage 2: Backend build
FROM node:18-alpine AS backend-builder

WORKDIR /app/backend

# Copy backend package files
COPY backend/package*.json ./
RUN npm ci

# Copy backend source
COPY backend/ .

# Stage 3: Production image
FROM node:18-alpine AS production

# Install system dependencies
RUN apk add --no-cache \
    dumb-init \
    curl \
    && addgroup -g 1001 -S nodejs \
    && adduser -S nodejs -u 1001

# Create app directory
WORKDIR /app

# Copy backend dependencies and source
COPY --from=backend-builder --chown=nodejs:nodejs /app/backend ./backend

# Copy frontend build
COPY --from=frontend-builder --chown=nodejs:nodejs /app/dist ./dist

# Create logs directory
RUN mkdir -p logs && chown nodejs:nodejs logs

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3001/api/health || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
WORKDIR /app
CMD ["node", "backend/server.js"]
EOF
fi

echo "✅ Dockerfile ready"

# Check if we have a .gitignore
if [ ! -f ".gitignore" ]; then
    echo "❌ .gitignore not found. Creating..."
    cat > .gitignore << 'EOF'
# Dependencies
node_modules/
backend/node_modules/

# Environment files
.env
.env.local
.env.production
backend/.env

# Build outputs
dist/
build/

# Logs
logs/
*.log

# OS files
.DS_Store
Thumbs.db

# IDE files
.vscode/
.idea/
*.swp
*.swo

# Temporary files
*.tmp
*.temp
EOF
fi

echo "✅ .gitignore ready"

echo ""
echo "🎯 Ready to deploy! Next steps:"
echo ""
echo "1. 📝 Update environment variables:"
echo "   - Edit backend/.env with your MongoDB URI"
echo "   - Add your RPC endpoints and API keys"
echo ""
echo "2. 🚀 Deploy to Railway:"
echo "   - Go to https://railway.app"
echo "   - Create new project"
echo "   - Connect your GitHub repository"
echo "   - Set environment variables (see DEPLOY_NOW.md)"
echo ""
echo "3. 🔗 Or use Railway CLI:"
echo "   railway up"
echo ""
echo "📖 For detailed instructions, see DEPLOY_NOW.md"
echo ""
echo "✨ Happy deploying!"