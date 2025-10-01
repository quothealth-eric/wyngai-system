#!/bin/bash

# Deploy Wyng-lite with WyngAI integration to Vercel
set -e

echo "🚀 Deploying Wyng-lite with WyngAI integration to Vercel"

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Please run this script from the wyng-lite directory"
    exit 1
fi

# Check if Vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "📦 Installing Vercel CLI..."
    npm install -g vercel
fi

echo "📋 Step 1: Preparing for deployment"

# Check for required environment variables
if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_ANON_KEY" ]; then
    echo "⚠️  Environment variables not set. Please set:"
    echo "   export SUPABASE_URL='your-supabase-url'"
    echo "   export SUPABASE_ANON_KEY='your-supabase-key'"
    echo ""
    echo "You can also set these in Vercel dashboard after deployment."
fi

# Get WyngAI RAG endpoint
if [ -z "$WYNGAI_RAG_ENDPOINT" ]; then
    echo "📝 WyngAI RAG endpoint not set."
    read -p "Enter your WyngAI RAG service URL (e.g., https://rag.yourdomain.com): " WYNGAI_RAG_ENDPOINT
    export WYNGAI_RAG_ENDPOINT
fi

echo "📋 Step 2: Building and deploying to Vercel"

# Deploy to Vercel with environment variables
vercel --prod \
  --env USE_WYNGAI_PRIMARY=true \
  --env WYNGAI_RAG_ENDPOINT="$WYNGAI_RAG_ENDPOINT" \
  --env NODE_ENV=production \
  --env SUPABASE_URL="$SUPABASE_URL" \
  --env SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY" \
  --env RESEND_API_KEY="$RESEND_API_KEY" \
  --env STRIPE_SECRET_KEY="$STRIPE_SECRET_KEY" \
  --env ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
  --env OPENAI_API_KEY="$OPENAI_API_KEY"

echo "📋 Step 3: Testing deployment"

# Get the deployed URL
DEPLOYED_URL=$(vercel --scope="$VERCEL_ORG_ID" ls | grep wyng-lite | head -1 | awk '{print $2}')

if [ -z "$DEPLOYED_URL" ]; then
    echo "⚠️  Could not determine deployed URL. Please check Vercel dashboard."
    echo "Manual test: Check https://your-app.vercel.app/api/health"
else
    echo "🧪 Testing deployment at: https://$DEPLOYED_URL"

    # Test health endpoint
    if curl -f "https://$DEPLOYED_URL/api/health" > /dev/null 2>&1; then
        echo "✅ Health check passed"
    else
        echo "❌ Health check failed"
    fi

    # Test chat endpoint
    echo "🧪 Testing chat integration..."
    CHAT_RESPONSE=$(curl -s -X POST "https://$DEPLOYED_URL/api/chat" \
      -H "Content-Type: application/json" \
      -d '{"message": "Test WyngAI integration", "benefits": {}}')

    if echo "$CHAT_RESPONSE" | grep -q "problem_summary"; then
        echo "✅ Chat integration test passed"
        echo "🎉 Deployment successful!"
        echo ""
        echo "🌐 Your website is live at: https://$DEPLOYED_URL"
        echo "🤖 Now using WyngAI instead of OpenAI/Anthropic!"
    else
        echo "❌ Chat integration test failed"
        echo "Response: $CHAT_RESPONSE"
        echo ""
        echo "🔧 Troubleshooting:"
        echo "1. Check that WyngAI RAG service is running at: $WYNGAI_RAG_ENDPOINT"
        echo "2. Verify environment variables in Vercel dashboard"
        echo "3. Check Vercel function logs"
    fi
fi

echo ""
echo "📊 Next steps:"
echo "1. Update your domain DNS to point to Vercel"
echo "2. Set up custom domain in Vercel dashboard"
echo "3. Test with real healthcare questions"
echo "4. Monitor performance and citations quality"

echo ""
echo "🎯 Vercel deployment complete!"