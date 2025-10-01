#!/bin/bash

# Production deployment script for WyngAI + Wyng-lite
set -e

echo "🚀 Deploying WyngAI integrated system to production"

# Check for required environment variables
if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_ANON_KEY" ]; then
    echo "❌ Missing required environment variables:"
    echo "   SUPABASE_URL"
    echo "   SUPABASE_ANON_KEY"
    echo "Please set these before deploying"
    exit 1
fi

echo "📋 Step 1: Building Docker images"

# Build WyngAI image
cd ..
docker build -t wyngai:latest .

# Build Wyng-lite image
cd wyng-lite
docker build -t wyng-lite:latest .

echo "📋 Step 2: Setting up production environment"

# Create production environment file
cat > .env.production << EOF
USE_WYNGAI_PRIMARY=true
WYNGAI_RAG_ENDPOINT=http://wyngai:8000
NODE_ENV=production
NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL:-https://wyng.ai}

# Database
SUPABASE_URL=${SUPABASE_URL}
SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}

# Services
RESEND_API_KEY=${RESEND_API_KEY}
STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY}

# Fallback LLMs (optional but recommended)
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}
OPENAI_API_KEY=${OPENAI_API_KEY:-}
EOF

echo "✅ Created production environment file"

echo "📋 Step 3: Starting production services"

# Use Docker Compose for production
docker-compose -f docker-compose.yml up -d

echo "⏳ Waiting for services to be healthy..."
sleep 30

# Check service health
echo "📋 Step 4: Health checks"

echo "Checking WyngAI RAG service..."
if curl -f http://localhost:8000/health > /dev/null 2>&1; then
    echo "✅ WyngAI RAG service is healthy"
else
    echo "❌ WyngAI RAG service is not responding"
    docker-compose logs wyngai
    exit 1
fi

echo "Checking Wyng-lite application..."
if curl -f http://localhost:3000/api/health > /dev/null 2>&1; then
    echo "✅ Wyng-lite application is healthy"
else
    echo "❌ Wyng-lite application is not responding"
    docker-compose logs wyng-lite
    exit 1
fi

echo "📋 Step 5: Running integration test"
# Test the integration
RESPONSE=$(curl -s -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What are ERISA claims appeal requirements?", "benefits": {}}')

if echo "$RESPONSE" | grep -q "problem_summary"; then
    echo "✅ Integration test passed - WyngAI is responding through Wyng-lite"
else
    echo "❌ Integration test failed"
    echo "Response: $RESPONSE"
    exit 1
fi

echo "🎉 Production deployment complete!"
echo ""
echo "🌐 Services running:"
echo "  - WyngAI RAG API: http://localhost:8000"
echo "  - Wyng-lite App: http://localhost:3000"
echo ""
echo "📊 Monitor services:"
echo "  docker-compose logs -f"
echo ""
echo "🛑 Stop services:"
echo "  docker-compose down"
echo ""
echo "✨ Your website now uses the internal WyngAI LLM instead of OpenAI!"