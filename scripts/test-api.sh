#!/bin/bash

# Test script for authenticated API calls

STACK_NAME="order-processing-dev"

# Get API endpoint
API_URL=$(aws cloudformation describe-stacks \
  --stack-name $STACK_NAME \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiEndpoint`].OutputValue' \
  --output text)

echo "API Endpoint: $API_URL"

# Check if token exists
if [ -z "$ID_TOKEN" ]; then
  echo "❌ ID_TOKEN not set. Run: source .auth-tokens"
  exit 1
fi

echo ""
echo "==================================="
echo "Test 1: Get User Info"
echo "==================================="
curl -X GET "$API_URL/user/info" \
  -H "Authorization: Bearer $ID_TOKEN" \
  -H "Content-Type: application/json" | jq

echo ""
echo "==================================="
echo "Test 2: Create Order (Authenticated)"
echo "==================================="
ORDER_RESPONSE=$(curl -X POST "$API_URL/orders" \
  -H "Authorization: Bearer $ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {
        "productId": "PROD-001",
        "quantity": 2,
        "price": 29.99
      },
      {
        "productId": "PROD-002",
        "quantity": 1,
        "price": 49.99
      }
    ]
  }')

echo $ORDER_RESPONSE | jq

ORDER_ID=$(echo $ORDER_RESPONSE | jq -r '.orderId')
echo "Order ID: $ORDER_ID"

echo ""
echo "==================================="
echo "Test 3: Test Rate Limiting"
echo "==================================="
echo "Sending 30 rapid requests..."
for i in {1..30}; do
  curl -s -X POST "$API_URL/orders" \
    -H "Authorization: Bearer $ID_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"items":[{"productId":"TEST","quantity":1,"price":1}]}' \
    -w "\nStatus: %{http_code}\n" &
done
wait

echo ""
echo "✅ Tests completed!"
