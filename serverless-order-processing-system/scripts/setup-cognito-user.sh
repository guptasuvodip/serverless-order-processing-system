#!/bin/bash

# Script to create and configure test user

STACK_NAME="order-processing-dev"
USER_EMAIL="testuser@example.com"
TEMP_PASSWORD="TempPass123!"
NEW_PASSWORD="MySecurePass123!"

echo "==================================="
echo "Setting up Cognito test user"
echo "==================================="

# Get User Pool ID
USER_POOL_ID=$(aws cloudformation describe-stacks \
  --stack-name $STACK_NAME \
  --query 'Stacks[0].Outputs[?OutputKey==`UserPoolId`].OutputValue' \
  --output text)

echo "User Pool ID: $USER_POOL_ID"

# Create user
echo "Creating user: $USER_EMAIL"
aws cognito-idp admin-create-user \
  --user-pool-id $USER_POOL_ID \
  --username $USER_EMAIL \
  --user-attributes Name=email,Value=$USER_EMAIL Name=email_verified,Value=true \
  --temporary-password $TEMP_PASSWORD \
  --message-action SUPPRESS

# Set permanent password
echo "Setting permanent password..."
aws cognito-idp admin-set-user-password \
  --user-pool-id $USER_POOL_ID \
  --username $USER_EMAIL \
  --password $NEW_PASSWORD \
  --permanent

echo "✅ User created successfully!"
echo "Email: $USER_EMAIL"
echo "Password: $NEW_PASSWORD"
