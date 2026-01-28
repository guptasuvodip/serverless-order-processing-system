#!/bin/bash

# Script to get JWT token for testing

STACK_NAME="order-processing-dev"
USER_EMAIL="testuser@example.com"
PASSWORD="MySecurePass123!"

echo "==================================="
echo "Getting authentication token"
echo "==================================="

# Get User Pool Client ID
CLIENT_ID=$(aws cloudformation describe-stacks \
  --stack-name $STACK_NAME \
  --query 'Stacks[0].Outputs[?OutputKey==`UserPoolClientId`].OutputValue' \
  --output text)

echo "Client ID: $CLIENT_ID"

# Authenticate and get tokens
AUTH_RESPONSE=$(aws cognito-idp initiate-auth \
  --auth-flow USER_PASSWORD_AUTH \
  --client-id $CLIENT_ID \
  --auth-parameters USERNAME=$USER_EMAIL,PASSWORD=$PASSWORD \
  --output json)

# Extract tokens
ID_TOKEN=$(echo $AUTH_RESPONSE | jq -r '.AuthenticationResult.IdToken')
ACCESS_TOKEN=$(echo $AUTH_RESPONSE | jq -r '.AuthenticationResult.AccessToken')
REFRESH_TOKEN=$(echo $AUTH_RESPONSE | jq -r '.AuthenticationResult.RefreshToken')

echo ""
echo "✅ Authentication successful!"
echo ""
echo "ID Token (use for API calls):"
echo $ID_TOKEN
echo ""
echo "Access Token:"
echo $ACCESS_TOKEN
echo ""
echo "Refresh Token (valid for 30 days):"
echo $REFRESH_TOKEN
echo ""

# Save to file for easy reuse
cat > .auth-tokens << EOF
export ID_TOKEN="$ID_TOKEN"
export ACCESS_TOKEN="$ACCESS_TOKEN"
export REFRESH_TOKEN="$REFRESH_TOKEN"
EOF

echo "Tokens saved to .auth-tokens file"
echo "Run: source .auth-tokens"
