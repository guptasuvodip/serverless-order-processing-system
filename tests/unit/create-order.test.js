const { mockClient } = require('aws-sdk-client-mock');
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');

// Mock AWS SDK clients
const sqsMock = mockClient(SQSClient);
const dynamoMock = mockClient(DynamoDBDocumentClient);

// Import handler (you'll need to export it properly)
const { handler } = require('../../src/handlers/create-order');

describe('CreateOrder Lambda Handler - Unit Tests', () => {
  
  beforeEach(() => {
    // Reset mocks before each test
    sqsMock.reset();
    dynamoMock.reset();
    
    // Set environment variables
    process.env.ORDERS_TABLE = 'test-orders-table';
    process.env.ORDER_QUEUE_URL = 'https://sqs.us-east-1.amazonaws.com/123456789/test-queue';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('Should create order successfully with valid input', async () => {
    // Arrange
    const event = {
      body: JSON.stringify({
        items: [
          { productId: 'PROD-001', quantity: 2, price: 29.99 },
          { productId: 'PROD-002', quantity: 1, price: 49.99 }
        ]
      }),
      requestContext: {
        authorizer: {
          claims: {
            sub: 'user-123',
            email: 'test@example.com',
            name: 'Test User'
          }
        },
        identity: {
          sourceIp: '192.168.1.1'
        }
      },
      headers: {
        'User-Agent': 'test-agent'
      }
    };

    // Mock successful AWS calls
    dynamoMock.on(PutCommand).resolves({});
    sqsMock.on(SendMessageCommand).resolves({ MessageId: 'msg-123' });

    // Act
    const response = await handler(event);
    const body = JSON.parse(response.body);

    // Assert
    expect(response.statusCode).toBe(202);
    expect(body.orderId).toBeDefined();
    expect(body.status).toBe('PENDING');
    expect(body.message).toContain('Order received');

    // Verify DynamoDB was called
    expect(dynamoMock.calls()).toHaveLength(1);
    const dynamoCall = dynamoMock.call(0).args[0].input;
    expect(dynamoCall.TableName).toBe('test-orders-table');
    expect(dynamoCall.Item.customerId).toBe('user-123');
    expect(dynamoCall.Item.totalAmount).toBe(109.97);

    // Verify SQS was called
    expect(sqsMock.calls()).toHaveLength(1);
    const sqsCall = sqsMock.call(0).args[0].input;
    expect(sqsCall.QueueUrl).toContain('test-queue');
  });

  test('Should return 400 for invalid order (missing items)', async () => {
    // Arrange
    const event = {
      body: JSON.stringify({
        items: []
      }),
      requestContext: {
        authorizer: {
          claims: {
            sub: 'user-123',
            email: 'test@example.com'
          }
        }
      }
    };

    // Act
    const response = await handler(event);
    const body = JSON.parse(response.body);

    // Assert
    expect(response.statusCode).toBe(400);
    expect(body.error).toContain('items');
    expect(dynamoMock.calls()).toHaveLength(0);
    expect(sqsMock.calls()).toHaveLength(0);
  });

  test('Should return 400 for invalid item (negative price)', async () => {
    // Arrange
    const event = {
      body: JSON.stringify({
        items: [
          { productId: 'PROD-001', quantity: 1, price: -10 }
        ]
      }),
      requestContext: {
        authorizer: {
          claims: { sub: 'user-123', email: 'test@example.com' }
        }
      }
    };

    // Act
    const response = await handler(event);
    const body = JSON.parse(response.body);

    // Assert
    expect(response.statusCode).toBe(400);
    expect(body.error).toContain('positive');
  });

  test('Should return 400 for order exceeding maximum amount', async () => {
    // Arrange
    const event = {
      body: JSON.stringify({
        items: [
          { productId: 'PROD-001', quantity: 100, price: 200 }
        ]
      }),
      requestContext: {
        authorizer: {
          claims: { sub: 'user-123', email: 'test@example.com' }
        }
      }
    };

    // Act
    const response = await handler(event);
    const body = JSON.parse(response.body);

    // Assert
    expect(response.statusCode).toBe(400);
    expect(body.error).toContain('exceeds maximum');
  });

  test('Should handle DynamoDB error gracefully', async () => {
    // Arrange
    const event = {
      body: JSON.stringify({
        items: [{ productId: 'PROD-001', quantity: 1, price: 10 }]
      }),
      requestContext: {
        authorizer: {
          claims: { sub: 'user-123', email: 'test@example.com' }
        }
      }
    };

    dynamoMock.on(PutCommand).rejects(new Error('DynamoDB error'));

    // Act
    const response = await handler(event);
    const body = JSON.parse(response.body);

    // Assert
    expect(response.statusCode).toBe(500);
    expect(body.error).toBe('Internal server error');
  });

  test('Should handle SQS error gracefully', async () => {
    // Arrange
    const event = {
      body: JSON.stringify({
        items: [{ productId: 'PROD-001', quantity: 1, price: 10 }]
      }),
      requestContext: {
        authorizer: {
          claims: { sub: 'user-123', email: 'test@example.com' }
        }
      }
    };

    dynamoMock.on(PutCommand).resolves({});
    sqsMock.on(SendMessageCommand).rejects(new Error('SQS error'));

    // Act
    const response = await handler(event);
    const body = JSON.parse(response.body);

    // Assert
    expect(response.statusCode).toBe(500);
  });

  test('Should calculate total amount correctly', async () => {
    // Arrange
    const event = {
      body: JSON.stringify({
        items: [
          { productId: 'PROD-001', quantity: 2, price: 10.50 },
          { productId: 'PROD-002', quantity: 3, price: 15.25 },
          { productId: 'PROD-003', quantity: 1, price: 99.99 }
        ]
      }),
      requestContext: {
        authorizer: {
          claims: { sub: 'user-123', email: 'test@example.com' }
        }
      }
    };

    dynamoMock.on(PutCommand).resolves({});
    sqsMock.on(SendMessageCommand).resolves({ MessageId: 'msg-123' });

    // Act
    const response = await handler(event);

    // Assert
    expect(response.statusCode).toBe(202);
    
    const dynamoCall = dynamoMock.call(0).args[0].input;
    // 2*10.50 + 3*15.25 + 1*99.99 = 21 + 45.75 + 99.99 = 166.74
    expect(dynamoCall.Item.totalAmount).toBe(166.74);
  });

  test('Should extract user info from Cognito claims', async () => {
    // Arrange
    const event = {
      body: JSON.stringify({
        items: [{ productId: 'PROD-001', quantity: 1, price: 10 }]
      }),
      requestContext: {
        authorizer: {
          claims: {
            sub: 'cognito-user-456',
            email: 'cognito@example.com',
            name: 'Cognito User'
          }
        }
      }
    };

    dynamoMock.on(PutCommand).resolves({});
    sqsMock.on(SendMessageCommand).resolves({ MessageId: 'msg-123' });

    // Act
    await handler(event);

    // Assert
    const dynamoCall = dynamoMock.call(0).args[0].input;
    expect(dynamoCall.Item.customerId).toBe('cognito-user-456');
    expect(dynamoCall.Item.customerEmail).toBe('cognito@example.com');
  });

  test('Should add metadata to order', async () => {
    // Arrange
    const event = {
      body: JSON.stringify({
        items: [{ productId: 'PROD-001', quantity: 1, price: 10 }]
      }),
      requestContext: {
        authorizer: {
          claims: { sub: 'user-123', email: 'test@example.com' }
        },
        identity: {
          sourceIp: '203.0.113.1'
        }
      },
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    };

    dynamoMock.on(PutCommand).resolves({});
    sqsMock.on(SendMessageCommand).resolves({ MessageId: 'msg-123' });

    // Act
    await handler(event);

    // Assert
    const dynamoCall = dynamoMock.call(0).args[0].input;
    expect(dynamoCall.Item.metadata.sourceIp).toBe('203.0.113.1');
    expect(dynamoCall.Item.metadata.userAgent).toBe('Mozilla/5.0');
  });
});

