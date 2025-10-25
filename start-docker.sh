#!/bin/bash

# AI Image Generator - Docker Startup Script
echo "🚀 Starting AI Image Generator with Docker Compose..."

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

# Create necessary directories
echo "📁 Creating necessary directories..."
mkdir -p logs backup ssl

# Set proper permissions
chmod 755 logs backup ssl

# Load environment variables
if [ -f "docker.env" ]; then
    echo "📋 Loading environment variables from docker.env..."
    export $(cat docker.env | grep -v '^#' | xargs)
else
    echo "⚠️  docker.env file not found. Using default values."
fi

# Start the services
echo "🐳 Starting Docker services..."
docker-compose --env-file docker.env up -d

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 10

# Check MongoDB health
echo "🔍 Checking MongoDB connection..."
docker-compose exec mongodb mongosh --eval "db.adminCommand('ping')" > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "✅ MongoDB is running and accessible"
else
    echo "❌ MongoDB is not responding"
fi

# Check application health
echo "🔍 Checking application health..."
sleep 5
curl -f http://localhost:3001/api/health > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "✅ Application is running and healthy"
    echo ""
    echo "🎉 AI Image Generator is now running!"
    echo "📱 Frontend: http://localhost:3001"
    echo "🔧 API: http://localhost:3001/api"
    echo "📊 Grafana: http://localhost:3000 (admin/admin)"
    echo "📈 Prometheus: http://localhost:9090"
    echo ""
    echo "📋 To view logs: docker-compose logs -f"
    echo "🛑 To stop: docker-compose down"
else
    echo "❌ Application is not responding"
    echo "📋 Check logs with: docker-compose logs app"
fi
