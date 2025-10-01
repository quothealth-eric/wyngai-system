#!/bin/bash

# Wyng Lite Deployment Script

set -e  # Exit on error

echo "🚀 Starting Wyng Lite deployment..."

# Check required environment variables
required_vars=(
    "ANTHROPIC_API_KEY"
    "SUPABASE_URL"
    "SUPABASE_ANON_KEY"
    "SUPABASE_SERVICE_ROLE"
    "STRIPE_SECRET_KEY"
    "NEXT_PUBLIC_SITE_URL"
)

echo "✅ Checking environment variables..."
for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        echo "❌ Missing required environment variable: $var"
        echo "Please set all required environment variables before deploying."
        exit 1
    fi
done

# Build the application
echo "🔨 Building application..."
npm run build

# Run type check
echo "🔍 Running type check..."
npm run type-check

# Test health endpoint (if in development)
if [ "$NODE_ENV" != "production" ]; then
    echo "🏥 Testing health endpoint..."
    npm run dev &
    DEV_PID=$!
    sleep 5

    if curl -f http://localhost:3000/api/health > /dev/null 2>&1; then
        echo "✅ Health check passed"
    else
        echo "❌ Health check failed"
        kill $DEV_PID
        exit 1
    fi

    kill $DEV_PID
fi

echo "✅ Deployment preparation complete!"
echo "📝 Next steps:"
echo "  1. Deploy to Vercel: vercel --prod"
echo "  2. Run Supabase migrations: See supabase/schema.sql"
echo "  3. Test all functionality on production"
echo "  4. Update DNS if needed"

echo "🎉 Ready for deployment!"