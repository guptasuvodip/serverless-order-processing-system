#!/bin/bash

# Test with API Key authentication

STACK_NAME="order-processing-dev"

# Get API endpoint
API_URL=$(aws cloudformation describe-stacks \
  --stack-name $STACK_NAME \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiEndpoint`].OutputValue' \
  --output text)

# Get API Key
API_KEY_ID=$(aws cloudformation describe-stacks \
  --stack-name $STACK_NAME \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiKeyId`].OutputValue' \
  --output text)

API_KEY=$(aws apigateway get-api-key \
  --api-key $API_KEY_ID \
  --include-value \
  --query 'value' \
  --output text)

echo "API Key: $API_KEY"

echo ""
echo "==================================="
echo "Create Order with API Key"
echo "==================================="
curl -X POST "$API_URL/orders/api-key" \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {
        "productId": "PROD-999",
        "quantity": 1,
        "price": 9.99
      }
    ]
  }' | jq
