#!/bin/bash

# Quick Setup Script for AI Image Generator
# Generates secure encryption key and validates environment

set -e

echo "🔧 AI Image Generator - Quick Setup"
echo "=================================="

# Generate encryption key
generate_encryption_key() {
    echo "🔑 Generating secure encryption key..."
    
    if command -v node &> /dev/null; then
        ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(16).toString('hex'))")
        echo "✅ Generated encryption key: $ENCRYPTION_KEY"
        echo ""
        echo "📝 Add this to your backend/.env file:"
        echo "ENCRYPTION_KEY=$ENCRYPTION_KEY"
        echo ""
    else
        echo "❌ Node.js not found. Please install Node.js first."
        echo "Or generate manually: openssl rand -hex 16"
        exit 1
    fi
}

# Check Node.js version
check_node_version() {
    echo "🔍 Checking Node.js version..."
    
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node --version | cut -d'v' -f2)
        MAJOR_VERSION=$(echo $NODE_VERSION | cut -d'.' -f1)
        
        if [ "$MAJOR_VERSION" -ge 16 ]; then
            echo "✅ Node.js version $NODE_VERSION is compatible"
        else
            echo "❌ Node.js version $NODE_VERSION is too old. Please upgrade to 16+"
            exit 1
        fi
    else
        echo "❌ Node.js not found. Please install Node.js 16+ first."
        exit 1
    fi
}

# Check MongoDB
check_mongodb() {
    echo "🔍 Checking MongoDB connection..."
    
    if command -v mongosh &> /dev/null; then
        echo "✅ MongoDB client found"
    elif command -v mongo &> /dev/null; then
        echo "✅ MongoDB client found (legacy)"
    else
        echo "⚠️  MongoDB client not found. Make sure MongoDB is installed and accessible."
    fi
}

# Install dependencies
install_dependencies() {
    echo "📦 Installing dependencies..."
    
    # Frontend dependencies
    if [ -f "package.json" ]; then
        echo "Installing frontend dependencies..."
        npm install
    fi
    
    # Backend dependencies
    if [ -d "backend" ] && [ -f "backend/package.json" ]; then
        echo "Installing backend dependencies..."
        cd backend
        npm install
        cd ..
    fi
    
    echo "✅ Dependencies installed"
}

# Create environment files
create_env_files() {
    echo "📝 Creating environment files..."
    
    # Frontend .env
    if [ ! -f ".env" ]; then
        echo "Creating frontend .env file..."
        cp env.example .env
        echo "✅ Frontend .env created (please edit with your values)"
    else
        echo "✅ Frontend .env already exists"
    fi
    
    # Backend .env
    if [ ! -f "backend/.env" ]; then
        echo "Creating backend .env file..."
        cp backend/env.example backend/.env
        echo "✅ Backend .env created (please edit with your values)"
    else
        echo "✅ Backend .env already exists"
    fi
}

# Main setup function
main() {
    echo ""
    check_node_version
    echo ""
    check_mongodb
    echo ""
    generate_encryption_key
    echo ""
    install_dependencies
    echo ""
    create_env_files
    echo ""
    echo "🎉 Setup complete!"
    echo ""
    echo "📋 Next steps:"
    echo "1. Edit .env files with your actual values"
    echo "2. Set up your payment wallet addresses"
    echo "3. Configure RPC endpoints"
    echo "4. Run: npm run dev (frontend) and npm start (backend)"
    echo ""
    echo "🚀 For production deployment, see DEPLOYMENT_CHECKLIST.md"
}

# Run main function
main