#!/bin/bash

# WyngAI Production Deployment Script for www.getwyng.co

set -e

echo "🚀 WyngAI Production Deployment"
echo "================================"

# Check environment
if [ "$NODE_ENV" != "production" ]; then
    echo "⚠️  Warning: NODE_ENV is not set to 'production'"
fi

# Verify required environment variables
if [ -z "$POSTGRES_PASSWORD" ]; then
    echo "❌ Error: POSTGRES_PASSWORD environment variable not set"
    exit 1
fi

# Create necessary directories
echo "📁 Creating directories..."
mkdir -p warehouse/{bronze,silver,gold}
mkdir -p rag/index
mkdir -p data/registry
mkdir -p ssl

# Build Docker images
echo "🔨 Building Docker images..."
docker-compose -f docker-compose.prod.yml build

# Download/update data if needed
echo "📥 Updating data sources..."
if [ ! -f "data/registry/wyng_llm_training_sources.xlsx" ]; then
    echo "📊 Creating source registry..."
    docker-compose -f docker-compose.prod.yml run --rm wyngai-rag wyngai write-excel
fi

# Check if we have any data to process
if [ ! -d "warehouse/bronze/ecfr" ] || [ -z "$(ls -A warehouse/bronze/ecfr)" ]; then
    echo "📋 Fetching sample eCFR data..."
    docker-compose -f docker-compose.prod.yml run --rm wyngai-rag wyngai fetch-ecfr --sections="title-45/part-147/section-147.136"
fi

# Process data pipeline
echo "⚙️  Running data pipeline..."
docker-compose -f docker-compose.prod.yml run --rm wyngai-rag wyngai pipeline

# Start services
echo "🎯 Starting production services..."
docker-compose -f docker-compose.prod.yml up -d

# Wait for services to be ready
echo "⏳ Waiting for services to start..."
sleep 10

# Health check
echo "🔍 Running health checks..."
max_attempts=30
attempt=1

while [ $attempt -le $max_attempts ]; do
    if curl -f http://localhost:8000/health > /dev/null 2>&1; then
        echo "✅ WyngAI RAG service is healthy"
        break
    else
        echo "⏳ Attempt $attempt/$max_attempts - waiting for service..."
        sleep 2
        ((attempt++))
    fi
done

if [ $attempt -gt $max_attempts ]; then
    echo "❌ Health check failed - service not responding"
    docker-compose -f docker-compose.prod.yml logs wyngai-rag
    exit 1
fi

# Test API endpoint
echo "🧪 Testing API endpoints..."
if curl -f -X POST http://localhost:8000/ask \
    -H "Content-Type: application/json" \
    -d '{"question": "What are ERISA appeal deadlines?", "max_results": 3}' > /dev/null 2>&1; then
    echo "✅ API endpoint test passed"
else
    echo "⚠️  API endpoint test failed (may be expected if no data indexed)"
fi

echo ""
echo "🎉 WyngAI Production Deployment Complete!"
echo ""
echo "📊 Service Status:"
echo "  • RAG API: http://localhost:8000"
echo "  • Health Check: http://localhost:8000/health"
echo "  • API Docs: http://localhost:8000/docs"
echo "  • PostgreSQL: localhost:5432"
echo ""
echo "🔧 Management Commands:"
echo "  • View logs: docker-compose -f docker-compose.prod.yml logs -f"
echo "  • Stop services: docker-compose -f docker-compose.prod.yml down"
echo "  • Update data: docker-compose -f docker-compose.prod.yml run --rm wyngai-rag wyngai fetch-all"
echo ""
echo "🌐 Ready for integration with www.getwyng.co!"

# Integration instructions
echo ""
echo "🔗 Website Integration:"
echo "================================"
echo ""
echo "Add this to your Next.js frontend (www.getwyng.co):"
echo ""
cat << 'EOF'
// utils/wyngai.js
const WYNGAI_API_BASE = process.env.NODE_ENV === 'production'
  ? 'https://api.getwyng.co'
  : 'http://localhost:8000';

export async function askWyngAI(question, maxResults = 5) {
  try {
    const response = await fetch(`${WYNGAI_API_BASE}/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        question,
        max_results: maxResults,
        include_citations: true
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('WyngAI API error:', error);
    throw error;
  }
}

// Example usage in a React component:
// const result = await askWyngAI("What are the ERISA appeal deadlines?");
// console.log(result.answer, result.sources);
EOF

echo ""
echo "🎯 Next Steps:"
echo "1. Update DNS to point api.getwyng.co to this server"
echo "2. Install SSL certificate in ./ssl/ directory"
echo "3. Add WyngAI integration to www.getwyng.co frontend"
echo "4. Set up monitoring and log aggregation"
echo "5. Configure data refresh schedule"