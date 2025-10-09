#!/usr/bin/env bash
# Wyng Lite — Enhanced Bill Analyzer: combined prompt + Claude (Anthropic) & OpenAI callers
# Copy/paste this whole script into your terminal (or save as run-bill-analyzer.sh && chmod +x).
# Requirements: bash, jq, base64, curl. Optional: 'file' for MIME detection.

set -euo pipefail

# ---------- CONFIG ----------
: "${MODEL_ANTHROPIC:=claude-3-5-sonnet-20241022}"
: "${MODEL_OPENAI:=gpt-4o}"
: "${MAX_TOKENS:=8000}"
: "${TEMPERATURE:=0.1}"
: "${WYNG_API_BASE:=http://localhost:3000}"

# Usage:
#   ANTHROPIC_API_KEY=... OPENAI_API_KEY=... ./run-bill-analyzer.sh context.json page1.jpg [page2.jpg ...]
#   # If you don't have a context JSON, pass "{}" as the first arg or omit it; script will default to {}.
# The script will call BOTH providers if both API keys are set; otherwise it will call whichever is available.

# ---------- ARGS & INPUTS ----------
if [[ $# -lt 1 ]]; then
  echo "Usage: ANTHROPIC_API_KEY=... OPENAI_API_KEY=... $0 <context.json | {}> <image1> [image2 ...]" >&2
  echo ""
  echo "Examples:"
  echo "  $0 '{}' bill-page1.jpg bill-page2.jpg"
  echo "  $0 context.json hospital-bill.png"
  echo "  $0 '{\"state\":\"FL\",\"planType\":\"PPO\"}' bill.jpg"
  exit 1
fi

CONTEXT_ARG="$1"; shift || true
if [[ -f "$CONTEXT_ARG" ]]; then
  CONTEXT_JSON=$(cat "$CONTEXT_ARG")
elif [[ "$CONTEXT_ARG" == "{}" ]] || [[ -z "$CONTEXT_ARG" ]]; then
  CONTEXT_JSON='{}'
else
  # If the first arg is not a file, treat it as literal JSON (e.g., '{"state":"FL"}')
  CONTEXT_JSON="$CONTEXT_ARG"
fi

if [[ $# -lt 1 ]]; then
  echo "Please provide at least one bill image (jpg/png/pdf-rendered-as-image)." >&2
  exit 1
fi

IMAGES=( "$@" )

# ---------- HELPERS ----------
need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing dependency: $1" >&2; exit 1; }; }
need jq
need curl

mime_for() {
  local f="$1"; local ext="${f##*.}"; ext="${ext,,}"
  case "$ext" in
    jpg|jpeg) echo "image/jpeg" ;;
    png) echo "image/png" ;;
    webp) echo "image/webp" ;;
    heic) echo "image/heic" ;;
    pdf) echo "application/pdf" ;; # if you pre-render to images, prefer image/*
    *) { command -v file >/dev/null 2>&1 && file -b --mime-type "$f"; } || echo "image/jpeg" ;;
  esac
}

# ---------- CHECK API AVAILABILITY ----------
echo "→ Checking API availability..."
API_STATUS=$(curl -s "$WYNG_API_BASE/api/analyzer/enhanced" | jq -r '.status // "unknown"')
if [[ "$API_STATUS" != "healthy" ]]; then
  echo "⚠ Warning: API health check failed. Attempting direct API calls..."
fi

# Determine which provider to use
PROVIDER="both"
if [[ -n "${ANTHROPIC_API_KEY:-}" ]] && [[ -n "${OPENAI_API_KEY:-}" ]]; then
  PROVIDER="both"
elif [[ -n "${ANTHROPIC_API_KEY:-}" ]]; then
  PROVIDER="anthropic"
elif [[ -n "${OPENAI_API_KEY:-}" ]]; then
  PROVIDER="openai"
else
  echo "Error: No API keys provided. Set ANTHROPIC_API_KEY or OPENAI_API_KEY." >&2
  exit 1
fi

echo "→ Using provider: $PROVIDER"
echo "→ Context: $CONTEXT_JSON"
echo "→ Images: ${#IMAGES[@]} files"

# ---------- BUILD MULTIPART FORM DATA ----------
BOUNDARY="WyngBillAnalyzer$(date +%s)"
TEMP_FILE=$(mktemp)

# Add context
{
  echo "--$BOUNDARY"
  echo "Content-Disposition: form-data; name=\"context\""
  echo ""
  echo "$CONTEXT_JSON"
} >> "$TEMP_FILE"

# Add provider preference
{
  echo "--$BOUNDARY"
  echo "Content-Disposition: form-data; name=\"provider\""
  echo ""
  echo "$PROVIDER"
} >> "$TEMP_FILE"

# Add images
for i in "${!IMAGES[@]}"; do
  img="${IMAGES[$i]}"
  if [[ ! -f "$img" ]]; then
    echo "Error: Image file not found: $img" >&2
    rm -f "$TEMP_FILE"
    exit 1
  fi

  mime_type=$(mime_for "$img")
  filename=$(basename "$img")

  {
    echo "--$BOUNDARY"
    echo "Content-Disposition: form-data; name=\"image$i\"; filename=\"$filename\""
    echo "Content-Type: $mime_type"
    echo ""
  } >> "$TEMP_FILE"

  cat "$img" >> "$TEMP_FILE"
  echo "" >> "$TEMP_FILE"
done

# Close boundary
echo "--$BOUNDARY--" >> "$TEMP_FILE"

# ---------- CALL API ----------
echo "→ Analyzing with Wyng Enhanced Bill Analyzer..."

# Set environment variables for the API if not using Wyng API
if [[ "$API_STATUS" != "healthy" ]]; then
  export MODEL_ANTHROPIC="$MODEL_ANTHROPIC"
  export MODEL_OPENAI="$MODEL_OPENAI"
  export MAX_TOKENS="$MAX_TOKENS"
  export TEMPERATURE="$TEMPERATURE"
fi

RESPONSE=$(curl -s -X POST \
  -H "Content-Type: multipart/form-data; boundary=$BOUNDARY" \
  --data-binary "@$TEMP_FILE" \
  "$WYNG_API_BASE/api/analyzer/enhanced" \
  || echo '{"error": "API call failed"}')

# Clean up temp file
rm -f "$TEMP_FILE"

# ---------- PROCESS RESPONSE ----------
echo "$RESPONSE" > response.json

# Check if the response is valid JSON
if ! jq empty response.json 2>/dev/null; then
  echo "Error: Invalid JSON response received" >&2
  echo "Raw response:" >&2
  cat response.json >&2
  exit 1
fi

# Check for errors
ERROR=$(echo "$RESPONSE" | jq -r '.error // empty')
if [[ -n "$ERROR" ]]; then
  echo "Error: $ERROR" >&2
  DETAILS=$(echo "$RESPONSE" | jq -r '.details // empty')
  if [[ -n "$DETAILS" ]]; then
    echo "Details: $DETAILS" >&2
  fi
  exit 1
fi

# Extract and display results
SUCCESS=$(echo "$RESPONSE" | jq -r '.success // false')
if [[ "$SUCCESS" == "true" ]]; then
  echo "✓ Analysis completed successfully"

  # Show metadata
  echo ""
  echo "=== Analysis Metadata ==="
  echo "$RESPONSE" | jq -r '.metadata | "Analysis time: \(.analysisTime)ms\nImages processed: \(.imageCount)\nProviders used: \(.providersUsed | join(", "))\nTimestamp: \(.timestamp)"'

  # Extract results for each provider
  echo ""
  echo "=== Results ==="

  # Anthropic results
  if echo "$RESPONSE" | jq -e '.results.anthropic' >/dev/null 2>&1; then
    echo ""
    echo "--- Anthropic Claude Results ---"
    echo "$RESPONSE" | jq '.results.anthropic' > anthropic_result.json
    echo "→ Anthropic analysis saved to anthropic_result.json"

    # Extract and display the markdown report
    ANTHROPIC_REPORT=$(echo "$RESPONSE" | jq -r '.results.anthropic.report_md // empty')
    if [[ -n "$ANTHROPIC_REPORT" ]]; then
      echo "$ANTHROPIC_REPORT" > anthropic_report.md
      echo "→ Anthropic report saved to anthropic_report.md"
    fi
  fi

  # OpenAI results
  if echo "$RESPONSE" | jq -e '.results.openai' >/dev/null 2>&1; then
    echo ""
    echo "--- OpenAI GPT Results ---"
    echo "$RESPONSE" | jq '.results.openai' > openai_result.json
    echo "→ OpenAI analysis saved to openai_result.json"

    # Extract and display the markdown report
    OPENAI_REPORT=$(echo "$RESPONSE" | jq -r '.results.openai.report_md // empty')
    if [[ -n "$OPENAI_REPORT" ]]; then
      echo "$OPENAI_REPORT" > openai_report.md
      echo "→ OpenAI report saved to openai_report.md"
    fi
  fi

  echo ""
  echo "=== Summary ==="

  # Show findings summary
  if echo "$RESPONSE" | jq -e '.results.anthropic.findings' >/dev/null 2>&1; then
    ANTHROPIC_FINDINGS=$(echo "$RESPONSE" | jq -r '.results.anthropic.findings | length')
    echo "Anthropic detected $ANTHROPIC_FINDINGS findings"
  fi

  if echo "$RESPONSE" | jq -e '.results.openai.findings' >/dev/null 2>&1; then
    OPENAI_FINDINGS=$(echo "$RESPONSE" | jq -r '.results.openai.findings | length')
    echo "OpenAI detected $OPENAI_FINDINGS findings"
  fi

  # Show high-severity findings count
  HIGH_SEVERITY_ANTHROPIC=$(echo "$RESPONSE" | jq -r '.results.anthropic.findings // [] | map(select(.severity == "high")) | length')
  HIGH_SEVERITY_OPENAI=$(echo "$RESPONSE" | jq -r '.results.openai.findings // [] | map(select(.severity == "high")) | length')

  if [[ "$HIGH_SEVERITY_ANTHROPIC" -gt 0 ]] || [[ "$HIGH_SEVERITY_OPENAI" -gt 0 ]]; then
    echo "⚠ HIGH SEVERITY findings detected - review recommended"
  fi

else
  echo "Error: Analysis was not successful" >&2
  exit 1
fi

echo ""
echo "Done. Check the generated files for detailed analysis results:"
echo "  - response.json (complete API response)"
echo "  - *_result.json (structured analysis data)"
echo "  - *_report.md (human-readable reports)"