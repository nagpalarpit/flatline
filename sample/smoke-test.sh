#!/usr/bin/env bash
# Flatline — quick API test (requires a running dev server: npm run dev)
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:8787}"
EMAIL="${EMAIL:-smoke-$(date +%s)@example.com}"

echo "=== Flatline API smoke test ==="
echo "Base URL: $BASE_URL"
echo ""

# Test 1: health
echo "[1] GET /health"
curl -sf "$BASE_URL/health" | head -c 200
echo ""

# Test 2: register (mints a free-tier API key)
echo "[2] POST /register"
REGISTER_OUT=$(curl -sf -X POST "$BASE_URL/register" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\"}")
echo "  $REGISTER_OUT"
API_KEY=$(echo "$REGISTER_OUT" | grep -o '"api_key":"[^"]*"' | cut -d'"' -f4)
if [ -z "$API_KEY" ]; then
  echo "  ✗ no api_key in response"
  exit 1
fi
echo "  ✓ got api key"

# Test 3: create a check
echo "[3] POST /checks"
CHECK_OUT=$(curl -sf -X POST "$BASE_URL/checks" \
  -H "Authorization: Bearer $API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"name":"smoke-test-check","period_seconds":300,"grace_seconds":60,"webhook_url":"https://example.com/hook"}')
echo "  $CHECK_OUT"
CHECK_ID=$(echo "$CHECK_OUT" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -z "$CHECK_ID" ]; then
  echo "  ✗ no check id in response"
  exit 1
fi
echo "  ✓ created check $CHECK_ID"

# Test 4: list checks
echo "[4] GET /checks"
curl -sf "$BASE_URL/checks" -H "Authorization: Bearer $API_KEY" | head -c 300
echo ""

# Test 5: get single check
echo "[5] GET /checks/$CHECK_ID"
curl -sf "$BASE_URL/checks/$CHECK_ID" -H "Authorization: Bearer $API_KEY" | head -c 300
echo ""

# Test 6: ping (no API key required — check id is the credential)
echo "[6] GET /ping/$CHECK_ID"
PING_OUT=$(curl -sf "$BASE_URL/ping/$CHECK_ID")
echo "  $PING_OUT"
echo "$PING_OUT" | grep -q '"ok":true'
echo "  ✓ ping accepted"

# Test 7: patch the check
echo "[7] PATCH /checks/$CHECK_ID"
curl -sf -X PATCH "$BASE_URL/checks/$CHECK_ID" \
  -H "Authorization: Bearer $API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"name":"smoke-test-check-renamed"}' | head -c 300
echo ""

# Test 8: delete the check
echo "[8] DELETE /checks/$CHECK_ID"
DELETE_OUT=$(curl -sf -X DELETE "$BASE_URL/checks/$CHECK_ID" -H "Authorization: Bearer $API_KEY")
echo "  $DELETE_OUT"
echo "$DELETE_OUT" | grep -q '"deleted":true'
echo "  ✓ deleted"

echo ""
echo "✓ Smoke test passed"
