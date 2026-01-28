#!/bin/bash

STACK_NAME="order-processing-dev"
API_URL=$(aws cloudformation describe-stacks \
  --stack-name $STACK_NAME \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiEndpoint`].OutputValue' \
  --output text)

if [ -z "$ID_TOKEN" ]; then
  echo "Getting fresh token..."
  ./scripts/get-auth-token.sh
  source .auth-tokens
fi

echo "==================================="
echo "Load Test - Rate Limit Validation"
echo "==================================="
echo "API: $API_URL"
echo "Sending 100 requests in 10 seconds..."
echo ""

SUCCESS=0
THROTTLED=0
ERRORS=0

for i in {1..100}; do
  RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_URL/orders" \
    -H "Authorization: Bearer $ID_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"items\":[{\"productId\":\"TEST-$i\",\"quantity\":1,\"price\":9.99}]}")
  
  STATUS=$(echo "$RESPONSE" | tail -n1)
  
  if [ "$STATUS" = "202" ]; then
    ((SUCCESS++))
  elif [ "$STATUS" = "429" ]; then
    ((THROTTLED++))
    echo "Request $i: THROTTLED (429)"
  else
    ((ERRORS++))
    echo "Request $i: ERROR ($STATUS)"
  fi
  
  # Small delay every 10 requests
  if [ $((i % 10)) -eq 0 ]; then
    echo "Progress: $i/100 | Success: $SUCCESS | Throttled: $THROTTLED | Errors: $ERRORS"
    sleep 0.1
  fi
done

echo ""
echo "==================================="
echo "Load Test Results"
echo "==================================="
echo "Total Requests:  100"
echo "Successful:      $SUCCESS"
echo "Throttled (429): $THROTTLED"
echo "Errors:          $ERRORS"
echo "==================================="
