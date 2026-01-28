const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');

const sqsClient = new SQSClient({});
const ddbClient = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

exports.handler = async (event) => {
  console.log('Received event:', JSON.stringify(event, null, 2));

  try {
    // Extract user information from Cognito authorizer
    const userInfo = extractUserInfo(event);
    console.log('Authenticated user:', userInfo);

    // Parse request body
    const body = JSON.parse(event.body);
    
    // Validate order
    const validationError = validateOrder(body);
    if (validationError) {
      return buildResponse(400, { error: validationError });
    }

    // Create order with user information
    const order = {
      orderId: uuidv4(),
      customerId: userInfo.userId,
      customerEmail: userInfo.email,
      items: body.items,
      totalAmount: calculateTotal(body.items),
      status: 'PENDING',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      metadata: {
        userAgent: event.headers?.['User-Agent'] || 'unknown',
        sourceIp: event.requestContext?.identity?.sourceIp || 'unknown'
      }
    };

    // Store in DynamoDB
    await ddbDocClient.send(new PutCommand({
      TableName: process.env.ORDERS_TABLE,
      Item: order
    }));

    // Send to SQS for async processing
    await sqsClient.send(new SendMessageCommand({
      QueueUrl: process.env.ORDER_QUEUE_URL,
      MessageBody: JSON.stringify(order),
      MessageAttributes: {
        orderType: {
          DataType: 'String',
          StringValue: body.items.length > 5 ? 'BULK' : 'STANDARD'
        },
        priority: {
          DataType: 'String',
          StringValue: order.totalAmount > 1000 ? 'HIGH' : 'NORMAL'
        }
      }
    }));

    console.log(`Order created successfully: ${order.orderId} by ${userInfo.email}`);

    return buildResponse(202, {
      message: 'Order received and processing',
      orderId: order.orderId,
      status: 'PENDING',
      estimatedProcessingTime: '2-5 minutes'
    });

  } catch (error) {
    console.error('Error creating order:', error);
    
    return buildResponse(500, {
      error: 'Internal server error',
      message: error.message
    });
  }
};

// Extract user info from Cognito authorizer context
function extractUserInfo(event) {
  // Check if using Cognito authorizer
  if (event.requestContext?.authorizer?.claims) {
    const claims = event.requestContext.authorizer.claims;
    return {
      userId: claims.sub,
      email: claims.email,
      name: claims.name || claims.email,
      authType: 'cognito'
    };
  }
  
  // Check if using API Key (fallback)
  if (event.requestContext?.identity?.apiKey) {
    return {
      userId: event.requestContext.identity.apiKey,
      email: 'api-key-user@example.com',
      name: 'API Key User',
      authType: 'api-key'
    };
  }

  // Fallback for unauthenticated (shouldn't reach here)
  return {
    userId: 'anonymous',
    email: 'anonymous@example.com',
    name: 'Anonymous',
    authType: 'none'
  };
}

function validateOrder(order) {
  if (!order.items || !Array.isArray(order.items) || order.items.length === 0) {
    return 'items array is required and must not be empty';
  }
  
  for (const item of order.items) {
    if (!item.productId || !item.quantity || !item.price) {
      return 'Each item must have productId, quantity, and price';
    }
    if (item.quantity <= 0 || item.price <= 0) {
      return 'Quantity and price must be positive numbers';
    }
    if (item.quantity > 100) {
      return 'Maximum quantity per item is 100';
    }
  }

  const totalAmount = calculateTotal(order.items);
  if (totalAmount > 10000) {
    return 'Order total exceeds maximum limit of $10,000';
  }

  return null;
}

function calculateTotal(items) {
  return items.reduce((total, item) => {
    return total + (item.quantity * item.price);
  }, 0);
}

function buildResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'X-Request-Id': uuidv4()
    },
    body: JSON.stringify(body)
  };
}

