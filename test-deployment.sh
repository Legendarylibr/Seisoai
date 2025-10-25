#!/bin/bash

echo "🧪 Testing Seiso AI Deployment"
echo "=============================="

# Test health endpoint
echo "Testing health endpoint..."
HEALTH_RESPONSE=$(curl -s -w "%{http_code}" https://seiso.ai/api/health)
HTTP_CODE="${HEALTH_RESPONSE: -3}"
HEALTH_BODY="${HEALTH_RESPONSE%???}"

if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ Health endpoint working (HTTP $HTTP_CODE)"
    echo "Response: $HEALTH_BODY"
else
    echo "❌ Health endpoint failed (HTTP $HTTP_CODE)"
    echo "Response: $HEALTH_BODY"
fi

echo ""

# Test if the app is running
echo "Testing if app is running..."
APP_RESPONSE=$(curl -s -w "%{http_code}" https://seiso.ai/)
HTTP_CODE="${APP_RESPONSE: -3}"

if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ App is running (HTTP $HTTP_CODE)"
else
    echo "❌ App not responding (HTTP $HTTP_CODE)"
fi

echo ""

# Check Railway status
echo "Checking Railway deployment status..."
railway status

echo ""
echo "🔧 To fix MongoDB connection:"
echo "1. Go to MongoDB Atlas dashboard"
echo "2. Network Access → Add IP Address"
echo "3. Allow Access from Anywhere (0.0.0.0/0)"
echo "4. Redeploy: railway up"
