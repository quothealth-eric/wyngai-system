#!/bin/bash

# WyngAI Production Health Check Script
# Monitors all critical services and endpoints

set -e

echo "🔍 WyngAI Production Health Check"
echo "================================"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Health check results
HEALTH_STATUS=0

# Function to check service health
check_service() {
    local service_name=$1
    local endpoint=$2
    local expected_status=$3

    echo -n "Checking $service_name... "

    if curl -s -o /dev/null -w "%{http_code}" "$endpoint" | grep -q "$expected_status"; then
        echo -e "${GREEN}✅ Healthy${NC}"
        return 0
    else
        echo -e "${RED}❌ Unhealthy${NC}"
        return 1
    fi
}

# Function to check system resources
check_resources() {
    echo -n "Checking system resources... "

    # Check disk space (warn if >80% full)
    DISK_USAGE=$(df -h / | awk 'NR==2 {print $5}' | sed 's/%//')
    if [ "$DISK_USAGE" -lt 80 ]; then
        echo -e "${GREEN}✅ Disk: ${DISK_USAGE}%${NC}"
    else
        echo -e "${YELLOW}⚠️  Disk: ${DISK_USAGE}%${NC}"
        HEALTH_STATUS=1
    fi

    # Check memory usage
    MEMORY_USAGE=$(free | awk 'NR==2 {printf "%.1f", $3*100/$2}')
    echo -e "Memory: ${MEMORY_USAGE}%"

    # Check load average
    LOAD_AVG=$(uptime | awk -F'load average:' '{ print $2 }')
    echo -e "Load average:${LOAD_AVG}"
}

# Main health checks
echo ""
echo "📊 Service Health Checks:"

# WyngAI RAG Service
if check_service "WyngAI RAG" "http://localhost:8000/health" "200"; then

    # Detailed RAG service check
    echo "📋 RAG Service Details:"
    HEALTH_RESPONSE=$(curl -s http://localhost:8000/health)

    # Parse health response
    INDEX_STATUS=$(echo "$HEALTH_RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data['index_stats']['status'])")
    CHUNK_COUNT=$(echo "$HEALTH_RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data['index_stats']['total_chunks'])")
    AVG_AUTHORITY=$(echo "$HEALTH_RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); print(f\"{data['index_stats']['authority_stats']['mean']:.2f}\")")

    echo "  • Index Status: $INDEX_STATUS"
    echo "  • Total Chunks: $CHUNK_COUNT"
    echo "  • Avg Authority: ${AVG_AUTHORITY}"

    if [ "$INDEX_STATUS" = "ready" ] && [ "$CHUNK_COUNT" -gt 0 ]; then
        echo -e "  ${GREEN}✅ Index is healthy${NC}"
    else
        echo -e "  ${RED}❌ Index issues detected${NC}"
        HEALTH_STATUS=1
    fi
else
    HEALTH_STATUS=1
fi

# Test API functionality
echo ""
echo "🧪 API Functionality Tests:"

echo -n "Testing /ask endpoint... "
TEST_RESPONSE=$(curl -s -X POST "http://localhost:8000/ask" \
    -H "Content-Type: application/json" \
    -d '{"question": "What are ERISA appeal deadlines?", "max_results": 2}' \
    -w "%{http_code}")

HTTP_CODE="${TEST_RESPONSE: -3}"
if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✅ Functional${NC}"

    # Parse response to check quality
    RESPONSE_BODY="${TEST_RESPONSE%???}"
    SOURCES_COUNT=$(echo "$RESPONSE_BODY" | python3 -c "import sys, json; data=json.load(sys.stdin); print(len(data.get('sources', [])))" 2>/dev/null || echo "0")
    echo "  • Sources returned: $SOURCES_COUNT"

    if [ "$SOURCES_COUNT" -gt 0 ]; then
        echo -e "  ${GREEN}✅ Quality response generated${NC}"
    else
        echo -e "  ${YELLOW}⚠️  No sources in response${NC}"
        HEALTH_STATUS=1
    fi
else
    echo -e "${RED}❌ Failed (HTTP $HTTP_CODE)${NC}"
    HEALTH_STATUS=1
fi

# System resource checks
echo ""
echo "💻 System Resources:"
check_resources

# Log file checks
echo ""
echo "📝 Log File Checks:"
if [ -f "/var/log/wyngai/application.log" ]; then
    ERROR_COUNT=$(tail -n 100 /var/log/wyngai/application.log | grep -c "ERROR" || echo "0")
    echo "  • Recent errors in log: $ERROR_COUNT"

    if [ "$ERROR_COUNT" -eq 0 ]; then
        echo -e "  ${GREEN}✅ No recent errors${NC}"
    else
        echo -e "  ${YELLOW}⚠️  $ERROR_COUNT errors found${NC}"
        HEALTH_STATUS=1
    fi
else
    echo -e "  ${YELLOW}⚠️  Log file not found${NC}"
fi

# Final status
echo ""
echo "🎯 Overall Health Status:"
if [ $HEALTH_STATUS -eq 0 ]; then
    echo -e "${GREEN}✅ ALL SYSTEMS OPERATIONAL${NC}"
    echo ""
    echo "🌐 Production Ready:"
    echo "  • RAG Service: http://localhost:8000"
    echo "  • API Documentation: http://localhost:8000/docs"
    echo "  • Health Endpoint: http://localhost:8000/health"
    echo "  • Ready for www.getwyng.co integration"
    exit 0
else
    echo -e "${RED}❌ ISSUES DETECTED${NC}"
    echo "Please review the issues above before deploying to production."
    exit 1
fi