#!/bin/bash

# Setup script for WyngAI integration with Wyng-lite
set -e

echo "🚀 Setting up WyngAI integration for Wyng-lite"

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Please run this script from the wyng-lite directory"
    exit 1
fi

# Check if parent WyngAI directory exists
if [ ! -d "../src/wyngai" ]; then
    echo "❌ WyngAI infrastructure not found in parent directory"
    echo "Please run this from Claude/wyng-lite/ with WyngAI in Claude/"
    exit 1
fi

echo "📋 Step 1: Setting up environment variables"

# Create .env.local if it doesn't exist
if [ ! -f ".env.local" ]; then
    cp .env.local.example .env.local
    echo "✅ Created .env.local from example"
    echo "⚠️  Please update .env.local with your actual values"
else
    echo "✅ .env.local already exists"
fi

echo "📋 Step 2: Installing dependencies"
npm install

echo "📋 Step 3: Building WyngAI RAG service"
cd ..
if [ ! -f "pyproject.toml" ]; then
    echo "❌ WyngAI pyproject.toml not found"
    exit 1
fi

echo "Installing Python dependencies..."
if command -v poetry &> /dev/null; then
    poetry install
    echo "✅ Installed with Poetry"
elif command -v pip &> /dev/null; then
    pip install -e .
    echo "✅ Installed with pip"
else
    echo "❌ Neither Poetry nor pip found. Please install Python dependencies manually."
    exit 1
fi

echo "📋 Step 4: Generating source registry"
if command -v poetry &> /dev/null; then
    poetry run python -c "from src.wyngai.registry import write_sources_excel; from pathlib import Path; write_sources_excel(Path('data/registry'))"
else
    python -c "from src.wyngai.registry import write_sources_excel; from pathlib import Path; write_sources_excel(Path('data/registry'))"
fi
echo "✅ Generated source registry Excel"

echo "📋 Step 5: Starting services"
cd wyng-lite

echo "Starting WyngAI RAG service in background..."
cd ..
if command -v poetry &> /dev/null; then
    poetry run python -m rag.api &
else
    python -m rag.api &
fi
WYNGAI_PID=$!
echo "WyngAI RAG service started with PID: $WYNGAI_PID"

echo "Waiting for WyngAI service to be ready..."
sleep 10

cd wyng-lite
echo "Starting Wyng-lite development server..."
npm run dev &
NEXT_PID=$!

echo "✅ Setup complete!"
echo ""
echo "🌐 Services running:"
echo "  - WyngAI RAG API: http://localhost:8000"
echo "  - Wyng-lite App: http://localhost:3000"
echo ""
echo "🧪 Test the integration:"
echo "  1. Open http://localhost:3000 in your browser"
echo "  2. Try asking a healthcare question"
echo "  3. Check that responses come from WyngAI (not OpenAI/Anthropic)"
echo ""
echo "To stop services:"
echo "  kill $WYNGAI_PID $NEXT_PID"
echo ""
echo "📝 Check logs:"
echo "  - WyngAI logs in terminal"
echo "  - Next.js logs in terminal"
echo "  - Browser network tab should show calls to localhost:8000"

# Save PIDs for cleanup
echo "$WYNGAI_PID" > .wyngai.pid
echo "$NEXT_PID" > .next.pid

echo ""
echo "🎉 Ready to test your internal LLM integration!"