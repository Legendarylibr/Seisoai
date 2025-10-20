#!/bin/bash

# Quick Deployment Script for Seiso AI
# This script provides multiple deployment options

set -e

echo "🚀 Seiso AI Quick Deployment"
echo "============================"
echo ""

# Check if Docker is installed
check_docker() {
    if ! command -v docker &> /dev/null; then
        echo "❌ Docker is not installed. Please install Docker first:"
        echo "   curl -fsSL https://get.docker.com -o get-docker.sh && sh get-docker.sh"
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        echo "❌ Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi
    
    echo "✅ Docker and Docker Compose are installed"
}

# Check if environment files exist
check_env_files() {
    if [ ! -f ".env" ]; then
        echo "📝 Creating .env file from template..."
        cp env.example .env
        echo "⚠️  Please edit .env file with your actual values before continuing"
        echo "   nano .env"
        read -p "Press Enter when you've configured .env file..."
    fi
    
    if [ ! -f "backend/.env" ]; then
        echo "📝 Creating backend/.env file from template..."
        cp backend/env.example backend/.env
        echo "⚠️  Please edit backend/.env file with your actual values before continuing"
        echo "   nano backend/.env"
        read -p "Press Enter when you've configured backend/.env file..."
    fi
    
    echo "✅ Environment files are ready"
}

# Deploy with Docker Compose
deploy_docker() {
    echo "🐳 Deploying with Docker Compose..."
    
    # Build and start services
    docker-compose up -d --build
    
    echo "✅ Docker deployment completed!"
    echo ""
    echo "🌐 Your application is now running:"
    echo "   Frontend: http://localhost:80"
    echo "   Backend:  http://localhost:3001"
    echo "   Grafana:  http://localhost:3000 (admin/admin)"
    echo ""
    echo "📊 Monitor with: docker-compose logs -f"
    echo "🛑 Stop with: docker-compose down"
}

# Deploy to cloud platform
deploy_cloud() {
    echo "☁️  Cloud Deployment Options:"
    echo ""
    echo "1. Railway (Recommended for beginners)"
    echo "   - Connect GitHub repo"
    echo "   - Set environment variables"
    echo "   - Deploy automatically"
    echo "   - Cost: $5-20/month"
    echo ""
    echo "2. Render"
    echo "   - Connect GitHub repo"
    echo "   - Configure build settings"
    echo "   - Set environment variables"
    echo "   - Cost: $7-25/month"
    echo ""
    echo "3. DigitalOcean App Platform"
    echo "   - Connect GitHub repo"
    echo "   - Configure app spec"
    echo "   - Set environment variables"
    echo "   - Cost: $12-24/month"
    echo ""
    echo "4. AWS Amplify + EC2"
    echo "   - Deploy frontend to Amplify"
    echo "   - Deploy backend to EC2"
    echo "   - Cost: $15-30/month"
    echo ""
    echo "For detailed instructions, see DEPLOYMENT_GUIDE.md"
}

# Deploy to VPS
deploy_vps() {
    echo "🖥️  VPS Deployment (DigitalOcean, Linode, etc.)"
    echo ""
    echo "1. Create a VPS (4GB RAM minimum)"
    echo "2. Install Docker:"
    echo "   curl -fsSL https://get.docker.com -o get-docker.sh && sh get-docker.sh"
    echo "3. Clone your repository"
    echo "4. Run this script: ./quick-deploy.sh"
    echo ""
    echo "For detailed instructions, see DEPLOYMENT_GUIDE.md"
}

# Show deployment options
show_options() {
    echo "Choose your deployment method:"
    echo ""
    echo "1. 🐳 Docker Compose (Local/Development)"
    echo "2. ☁️  Cloud Platform (Railway, Render, etc.)"
    echo "3. 🖥️  VPS Deployment (DigitalOcean, Linode, etc.)"
    echo "4. 📖 View detailed deployment guide"
    echo "5. ❌ Exit"
    echo ""
    read -p "Enter your choice (1-5): " choice
    
    case $choice in
        1)
            check_docker
            check_env_files
            deploy_docker
            ;;
        2)
            deploy_cloud
            ;;
        3)
            deploy_vps
            ;;
        4)
            echo "📖 Opening deployment guide..."
            if command -v code &> /dev/null; then
                code DEPLOYMENT_GUIDE.md
            elif command -v nano &> /dev/null; then
                nano DEPLOYMENT_GUIDE.md
            else
                cat DEPLOYMENT_GUIDE.md
            fi
            ;;
        5)
            echo "👋 Goodbye!"
            exit 0
            ;;
        *)
            echo "❌ Invalid choice. Please try again."
            show_options
            ;;
    esac
}

# Main function
main() {
    echo "Welcome to Seiso AI deployment!"
    echo ""
    
    # Check if we're in the right directory
    if [ ! -f "package.json" ] || [ ! -f "docker-compose.yml" ]; then
        echo "❌ Please run this script from the Seiso AI project root directory"
        exit 1
    fi
    
    show_options
}

# Run main function
main "$@"
