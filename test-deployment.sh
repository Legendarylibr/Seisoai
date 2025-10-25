#!/bin/bash

echo "🧪 Testing Railway Deployment..."
echo "================================"
echo ""

# Test health endpoint
echo "Testing: https://seisoai-prod.up.railway.app/api/health"
response=$(curl -s -w "\n%{http_code}" https://seisoai-prod.up.railway.app/api/health)
http_code=$(echo "$response" | tail -n 1)
body=$(echo "$response" | sed '$d')

echo "HTTP Code: $http_code"
echo "Response: $body"
echo ""

if [ "$http_code" = "200" ]; then
    echo "✅ SUCCESS! API is responding"
    echo ""
    echo "$body" | jq . 2>/dev/null || echo "$body"
    echo ""
    echo "🎉 Deployment is working!"
elif [ "$http_code" = "502" ]; then
    echo "❌ FAILED: Getting 502 Bad Gateway"
    echo ""
    echo "This means the app is deployed but not accessible."
    echo ""
    echo "🔧 FIX NEEDED:"
    echo "1. Go to: https://railway.app/project/ee55e7fa-b010-4946-a87b-013e15e329a8"
    echo "2. Click 'Seisoai' service → 'Variables'"
    echo "3. DELETE the 'PORT' variable"
    echo "4. Wait 30 seconds and run this script again"
else
    echo "⚠️  Unexpected response code: $http_code"
    echo "Response: $body"
fi

echo ""
echo "View logs: railway logs"
echo "Open dashboard: https://railway.app/project/ee55e7fa-b010-4946-a87b-013e15e329a8"

