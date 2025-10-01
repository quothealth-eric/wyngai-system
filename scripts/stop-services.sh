#!/bin/bash

# Stop WyngAI and Next.js services
echo "🛑 Stopping WyngAI services..."

if [ -f ".wyngai.pid" ]; then
    WYNGAI_PID=$(cat .wyngai.pid)
    if ps -p $WYNGAI_PID > /dev/null; then
        kill $WYNGAI_PID
        echo "✅ Stopped WyngAI RAG service (PID: $WYNGAI_PID)"
    else
        echo "⚠️  WyngAI process not found (PID: $WYNGAI_PID)"
    fi
    rm .wyngai.pid
fi

if [ -f ".next.pid" ]; then
    NEXT_PID=$(cat .next.pid)
    if ps -p $NEXT_PID > /dev/null; then
        kill $NEXT_PID
        echo "✅ Stopped Next.js development server (PID: $NEXT_PID)"
    else
        echo "⚠️  Next.js process not found (PID: $NEXT_PID)"
    fi
    rm .next.pid
fi

# Kill any remaining processes on the ports
echo "🔍 Checking for processes on ports 3000 and 8000..."

NEXT_PROC=$(lsof -ti:3000)
if [ ! -z "$NEXT_PROC" ]; then
    kill $NEXT_PROC
    echo "✅ Killed process on port 3000"
fi

WYNGAI_PROC=$(lsof -ti:8000)
if [ ! -z "$WYNGAI_PROC" ]; then
    kill $WYNGAI_PROC
    echo "✅ Killed process on port 8000"
fi

echo "🎉 All services stopped"