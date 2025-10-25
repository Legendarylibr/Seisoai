#!/bin/bash

echo "🚀 Seiso AI Frontend - Build and Serve"

# Find the correct directory
if [ -f "/app/package.json" ]; then
    echo "✅ Found package.json in /app"
    cd /app
elif [ -f "/workspace/package.json" ]; then
    echo "✅ Found package.json in /workspace"
    cd /workspace
elif [ -f "./package.json" ]; then
    echo "✅ Found package.json in current directory"
else
    echo "❌ package.json not found anywhere"
    echo "📁 Current directory contents:"
    ls -la
    echo "📁 /app contents:"
    ls -la /app 2>/dev/null || echo "No /app directory"
    echo "📁 /workspace contents:"
    ls -la /workspace 2>/dev/null || echo "No /workspace directory"
    exit 1
fi

echo "📁 Working directory: $(pwd)"
echo "📁 Directory contents:"
ls -la

# Check if dist directory exists
if [ -d "dist" ]; then
    echo "✅ dist directory found"
else
    echo "❌ dist directory not found, building..."
    
    # Install dependencies
    echo "📦 Installing dependencies..."
    npm install
    
    # Build the frontend
    echo "🔨 Building frontend..."
    npm run build
fi

# Check if dist directory exists after build
if [ -d "dist" ]; then
    echo "✅ dist directory ready"
    echo "📁 dist contents:"
    ls -la dist/
else
    echo "❌ dist directory still not found after build"
    exit 1
fi

# Start the static server
echo "🚀 Starting static server..."
node serve-static.js
