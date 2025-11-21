#!/bin/bash
# Verify seisiai.com domain configuration

echo "🌐 Seisiai.com Domain Verification"
echo "===================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Railway CLI is installed
if command -v railway &> /dev/null; then
    echo -e "${GREEN}✅ Railway CLI found${NC}"
    
    # Check if linked to project
    if railway status &> /dev/null; then
        echo -e "${GREEN}✅ Railway project linked${NC}"
        
        echo ""
        echo "📋 Current Environment Variables:"
        railway variables 2>/dev/null | grep -E "ALLOWED_ORIGINS|FRONTEND_URL" || echo "  (Run 'railway variables' to see all)"
        
        echo ""
        echo "🔍 Checking domain configuration..."
        
        # Check ALLOWED_ORIGINS
        ALLOWED=$(railway variables get ALLOWED_ORIGINS 2>/dev/null)
        if [[ $ALLOWED == *"seisiai.com"* ]]; then
            echo -e "${GREEN}✅ ALLOWED_ORIGINS includes seisiai.com${NC}"
        else
            echo -e "${YELLOW}⚠️  ALLOWED_ORIGINS may not include seisiai.com${NC}"
            echo "   Current value: $ALLOWED"
            echo "   Should include: https://www.seisiai.com,https://seisiai.com"
        fi
        
        # Check FRONTEND_URL
        FRONTEND=$(railway variables get FRONTEND_URL 2>/dev/null)
        if [[ $FRONTEND == *"seisiai.com"* ]]; then
            echo -e "${GREEN}✅ FRONTEND_URL includes seisiai.com${NC}"
        else
            echo -e "${YELLOW}⚠️  FRONTEND_URL may not be set to seisiai.com${NC}"
            echo "   Current value: $FRONTEND"
            echo "   Should be: https://www.seisiai.com"
        fi
    else
        echo -e "${YELLOW}⚠️  Not linked to Railway project${NC}"
        echo "   Run: railway link"
    fi
else
    echo -e "${YELLOW}⚠️  Railway CLI not installed${NC}"
    echo "   Install: npm i -g @railway/cli"
fi

echo ""
echo "🌐 DNS Verification:"
echo "===================="

# Check DNS resolution
if command -v dig &> /dev/null; then
    echo "Checking www.seisiai.com..."
    DIG_RESULT=$(dig +short www.seisiai.com 2>/dev/null)
    if [ -n "$DIG_RESULT" ]; then
        echo -e "${GREEN}✅ DNS resolves: $DIG_RESULT${NC}"
    else
        echo -e "${RED}❌ DNS does not resolve${NC}"
    fi
    
    echo "Checking seisiai.com (root)..."
    DIG_ROOT=$(dig +short seisiai.com 2>/dev/null)
    if [ -n "$DIG_ROOT" ]; then
        echo -e "${GREEN}✅ DNS resolves: $DIG_ROOT${NC}"
    else
        echo -e "${YELLOW}⚠️  Root domain may not resolve${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  'dig' command not found (install bind-utils or dnsutils)${NC}"
fi

echo ""
echo "🔒 SSL Verification:"
echo "==================="

# Check SSL
if command -v openssl &> /dev/null; then
    echo "Checking SSL certificate for www.seisiai.com..."
    SSL_CHECK=$(echo | openssl s_client -connect www.seisiai.com:443 -servername www.seisiai.com 2>/dev/null | grep -o "Verify return code: [0-9]*")
    if [[ $SSL_CHECK == *"0"* ]]; then
        echo -e "${GREEN}✅ SSL certificate is valid${NC}"
    else
        echo -e "${YELLOW}⚠️  SSL certificate may have issues${NC}"
        echo "   $SSL_CHECK"
    fi
else
    echo -e "${YELLOW}⚠️  'openssl' command not found${NC}"
fi

echo ""
echo "📋 Next Steps:"
echo "=============="
echo "1. Set Railway environment variables:"
echo "   railway variables set ALLOWED_ORIGINS='https://www.seisiai.com,https://seisiai.com'"
echo "   railway variables set FRONTEND_URL='https://www.seisiai.com'"
echo ""
echo "2. Add custom domain in Railway Dashboard:"
echo "   - Go to Settings → Domains"
echo "   - Add: www.seisiai.com"
echo "   - Configure DNS as shown"
echo ""
echo "3. Wait for DNS propagation (5-60 minutes)"
echo ""
echo "4. SSL will be automatically provisioned by Railway"
echo ""
echo "📖 See SEISIAI_DOMAIN_SETUP.md for detailed instructions"

