#!/bin/bash

# Deploy Line Items Schema to Production
# This script sets up the enhanced line items table for OCR extraction storage

echo "🚀 Deploying Enhanced Line Items Schema..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if we're in the correct directory
if [[ ! -f "package.json" ]]; then
    echo -e "${RED}❌ Error: Must run from project root directory${NC}"
    exit 1
fi

echo -e "${YELLOW}📦 Step 1: Building project...${NC}"
npm run build
if [[ $? -ne 0 ]]; then
    echo -e "${RED}❌ Build failed. Aborting deployment.${NC}"
    exit 1
fi

echo -e "${YELLOW}🔧 Step 2: Setting up database schema...${NC}"

# Note: In production, you would typically run these SQL files manually in Supabase dashboard
# or use a proper migration system. For now, we'll commit the files so they can be run manually.

echo -e "${GREEN}✅ Schema files prepared:${NC}"
echo "   - sql/enhanced_line_items_schema.sql"
echo "   - sql/exec_sql_function.sql"

echo -e "${YELLOW}📝 Step 3: Manual steps required in Supabase dashboard:${NC}"
echo "   1. Run sql/exec_sql_function.sql in Supabase SQL editor"
echo "   2. Run sql/enhanced_line_items_schema.sql in Supabase SQL editor"
echo "   3. Verify tables are created by visiting the Table Editor"

echo -e "${YELLOW}🔄 Step 4: Testing endpoints available after deployment:${NC}"
echo "   - GET  /api/admin/setup-enhanced-line-items (check table status)"
echo "   - POST /api/admin/setup-enhanced-line-items (setup schema via API)"
echo "   - GET  /api/debug/test-line-items (health check)"
echo "   - POST /api/debug/test-line-items (run extraction test)"

echo -e "${GREEN}✅ Deployment preparation complete!${NC}"
echo -e "${YELLOW}⚠️  Remember to add GOOGLE_APPLICATION_CREDENTIALS to Vercel environment variables${NC}"

exit 0