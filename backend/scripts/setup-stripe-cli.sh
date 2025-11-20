#!/bin/bash
# Setup Stripe products using Stripe CLI
# Usage: ./setup-stripe-cli.sh [STRIPE_SECRET_KEY]

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Setting up Stripe subscription products using Stripe CLI...${NC}\n"

# Get Stripe secret key from argument or environment
if [ -n "$1" ]; then
    STRIPE_SECRET_KEY="$1"
elif [ -n "$STRIPE_SECRET_KEY" ]; then
    echo -e "${YELLOW}Using STRIPE_SECRET_KEY from environment${NC}"
else
    echo -e "${RED}❌ ERROR: STRIPE_SECRET_KEY not provided${NC}"
    echo "Usage: $0 [STRIPE_SECRET_KEY]"
    echo "Or set STRIPE_SECRET_KEY environment variable"
    exit 1
fi

# Validate key format
if [[ ! "$STRIPE_SECRET_KEY" =~ ^sk_(live|test)_ ]]; then
    echo -e "${RED}❌ ERROR: Invalid Stripe secret key format${NC}"
    echo "Key should start with sk_live_ or sk_test_"
    exit 1
fi

# Export for Stripe CLI
export STRIPE_API_KEY="$STRIPE_SECRET_KEY"

echo -e "${GREEN}Creating products...${NC}\n"

# Function to create product and price
create_product() {
    local name="$1"
    local description="$2"
    local price="$3"
    local lookup_key="$4"
    
    echo -e "${YELLOW}📦 Creating: $name ($$price/month)${NC}"
    
    # Create product
    PRODUCT_OUTPUT=$(stripe products create \
        --name "$name" \
        --description "$description" \
        --api-key "$STRIPE_SECRET_KEY" 2>&1)
    
    if [ $? -ne 0 ]; then
        # Check if product already exists
        if echo "$PRODUCT_OUTPUT" | grep -q "already exists"; then
            echo -e "   ${YELLOW}⚠️  Product already exists, searching for it...${NC}"
            PRODUCT_ID=$(stripe products list --name "$name" --limit 1 --api-key "$STRIPE_SECRET_KEY" | grep -o '"id": "[^"]*' | head -1 | cut -d'"' -f4)
        else
            echo -e "   ${RED}❌ Error: $PRODUCT_OUTPUT${NC}"
            return 1
        fi
    else
        PRODUCT_ID=$(echo "$PRODUCT_OUTPUT" | grep -o '"id": "[^"]*' | head -1 | cut -d'"' -f4)
        echo -e "   ${GREEN}✓ Created product: $PRODUCT_ID${NC}"
    fi
    
    # Check if price with lookup_key already exists
    EXISTING_PRICE=$(stripe prices list --lookup-keys "$lookup_key" --limit 1 --api-key "$STRIPE_SECRET_KEY" 2>&1)
    
    if echo "$EXISTING_PRICE" | grep -q '"id"'; then
        PRICE_ID=$(echo "$EXISTING_PRICE" | grep -o '"id": "[^"]*' | head -1 | cut -d'"' -f4)
        echo -e "   ${YELLOW}⚠️  Price with lookup_key '$lookup_key' already exists: $PRICE_ID${NC}"
    else
        # Create price
        PRICE_CENTS=$((price * 100))
        PRICE_OUTPUT=$(stripe prices create \
            --product "$PRODUCT_ID" \
            --unit-amount "$PRICE_CENTS" \
            --currency usd \
            --recurring interval=month \
            --lookup-key "$lookup_key" \
            --api-key "$STRIPE_SECRET_KEY" 2>&1)
        
        if [ $? -eq 0 ]; then
            PRICE_ID=$(echo "$PRICE_OUTPUT" | grep -o '"id": "[^"]*' | head -1 | cut -d'"' -f4)
            echo -e "   ${GREEN}✓ Created price: $PRICE_ID (lookup_key: $lookup_key)${NC}"
        else
            echo -e "   ${RED}❌ Error creating price: $PRICE_OUTPUT${NC}"
            return 1
        fi
    fi
    
    echo ""
    return 0
}

# Create all products
create_product "Starter Pack" "Perfect for trying out Seiso AI" 10 "starter_pack_monthly"
create_product "Creator Pack" "Great for regular creators" 20 "creator_pack_monthly"
create_product "Pro Pack" "Best value for power users" 40 "pro_pack_monthly"
create_product "Studio Pack" "For professional studios" 80 "studio_pack_monthly"

echo -e "${GREEN}✅ Stripe products setup complete!${NC}\n"
echo -e "${YELLOW}💡 Next steps:${NC}"
echo "   1. Verify products in Stripe Dashboard: https://dashboard.stripe.com/products"
echo "   2. Set up webhook endpoint (see RAILWAY_STRIPE_SETUP.md)"
echo "   3. Test the checkout flow in your application"

