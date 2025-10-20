#!/bin/bash

# Railway build script for Seiso AI
echo "🚀 Building Seiso AI for Railway..."

# Install frontend dependencies
echo "📦 Installing frontend dependencies..."
npm install

# Build frontend
echo "🏗️ Building frontend..."
npm run build

# Install backend dependencies
echo "📦 Installing backend dependencies..."
cd backend
npm install
cd ..

echo "✅ Build completed successfully!"
