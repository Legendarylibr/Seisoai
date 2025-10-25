#!/bin/bash

# Quick Deploy Script for AI Image Generator
echo "🚀 Quick Deploy - AI Image Generator"
echo "====================================="

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null; then
    echo "❌ docker-compose is not installed. Please install it first."
    exit 1
fi

echo "✅ Docker is running"

# Check if docker.env exists
if [ ! -f "docker.env" ]; then
    echo "❌ docker.env file not found. Creating from template..."
    cp docker.env docker.env.backup 2>/dev/null || true
fi

echo "📋 Current environment configuration:"
echo "====================================="
echo "MongoDB URI: $(grep MONGODB_URI docker.env | cut -d'=' -f2)"
echo "Node Environment: $(grep NODE_ENV docker.env | cut -d'=' -f2)"
echo "Port: $(grep PORT docker.env | cut -d'=' -f2)"
echo ""

# Ask if user wants to proceed
read -p "🤔 Do you want to proceed with Docker deployment? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Deployment cancelled"
    exit 1
fi

echo "🐳 Starting Docker deployment..."

# Create necessary directories
mkdir -p logs backup ssl

# Load environment variables
export $(cat docker.env | grep -v '^#' | xargs)

# Start the services
echo "📦 Starting services..."
docker-compose --env-file docker.env up -d

# Wait for services to be ready
echo "⏳ Waiting for services to start..."
sleep 15

# Check MongoDB health
echo "🔍 Checking MongoDB..."
if docker-compose exec -T mongodb mongosh --eval "db.adminCommand('ping')" > /dev/null 2>&1; then
    echo "✅ MongoDB is running"
else
    echo "⚠️  MongoDB is starting up (this may take a moment)"
fi

# Check application health
echo "🔍 Checking application..."
sleep 10
if curl -f http://localhost:3001/api/health > /dev/null 2>&1; then
    echo "✅ Application is running and healthy"
    echo ""
    echo "🎉 DEPLOYMENT SUCCESSFUL!"
    echo "========================="
    echo "📱 Frontend: http://localhost:3001"
    echo "🔧 API: http://localhost:3001/api"
    echo "📊 Grafana: http://localhost:3000 (admin/admin)"
    echo "📈 Prometheus: http://localhost:9090"
    echo ""
    echo "📋 Useful commands:"
    echo "   View logs: docker-compose logs -f"
    echo "   Stop: docker-compose down"
    echo "   Restart: docker-compose restart"
    echo ""
    echo "🔍 Test your deployment:"
    echo "   curl http://localhost:3001/api/health"
else
    echo "❌ Application is not responding"
    echo "📋 Check logs with: docker-compose logs app"
    echo "🔄 Try restarting with: docker-compose restart app"
fi