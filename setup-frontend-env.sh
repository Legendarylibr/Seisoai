#!/bin/bash

# Frontend Environment Setup Script for Seiso AI
echo "🔧 Setting up frontend environment variables..."

# Create .env file if it doesn't exist
if [ ! -f ".env" ]; then
    echo "📝 Creating .env file..."
    cat > .env << 'EOF'
# FAL.ai API Configuration
# Get your API key from https://fal.ai
VITE_FAL_API_KEY=your_fal_api_key_here

# API Configuration
VITE_API_URL=https://seisoai-prod.up.railway.app

# Payment Wallet Addresses (USDC payments only)
EVM_PAYMENT_WALLET_ADDRESS=0xa0aE05e2766A069923B2a51011F270aCadFf023a
SOLANA_PAYMENT_WALLET_ADDRESS=CkhFmeUNxdr86SZEPg6bLgagFkRyaDMTmFzSVL69oadA

# Feature Flags
VITE_ENABLE_ANALYTICS=false
VITE_ENABLE_ERROR_REPORTING=false
VITE_ENABLE_PERFORMANCE_MONITORING=false
EOF
    echo "✅ .env file created"
else
    echo "✅ .env file already exists"
fi

echo ""
echo "🎯 Next steps:"
echo "1. Get your FAL API key from https://fal.ai"
echo "2. Edit .env file and replace 'your_fal_api_key_here' with your actual API key"
echo "3. Run 'npm run dev' to start the development server"
echo ""
echo "📖 The app will show a helpful error message if the API key is missing"
