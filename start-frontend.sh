#!/bin/bash

echo "🚀 Starting Seiso AI Frontend..."

# Ensure we're in the right directory
cd /app || cd /workspace || pwd

# List files to debug
echo "📁 Current directory contents:"
ls -la

# Check if package.json exists
if [ -f "package.json" ]; then
    echo "✅ package.json found"
    cat package.json | head -10
else
    echo "❌ package.json not found in current directory"
    echo "📁 Searching for package.json..."
    find . -name "package.json" -type f 2>/dev/null || echo "No package.json found anywhere"
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Build the frontend
echo "🔨 Building frontend..."
npm run build

# Start the frontend server
echo "🚀 Starting frontend server..."
npm run start:frontend
