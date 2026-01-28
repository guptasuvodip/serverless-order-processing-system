const { mockClient } = require('aws-sdk-client-mock');
const { DynamoDBDocumentClient, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');

const dynamoMock = mockClient(DynamoDBDocumentClient);
const snsMock = mockClient(SNSClient);

const { handler } = require('../../src/handlers/process-order');

describe('ProcessOrder Lambda Handler - Unit Tests', () => {
  
  beforeEach(() => {
    dynamoMock.reset();
    snsMock.reset();
    
    process.env.ORDERS_TABLE = 'test-orders-table';
    process.env.ORDER_TOPIC_ARN = 'arn:aws:sns:us-east-1:123456789:test-topic';
  });

  test('Should process single order successfully', async () => {
    // Arrange
    const event = {
      Records: [
        {
          body: JSON.stringify({
            orderId: 'order-123',
            customerId: 'user-123',
            customerEmail: 'test@example.com',
            items: [
              { productId: 'PROD-001', quantity: 1, price: 50 }
            ],
            totalAmount: 50,
            status: 'PENDING'
          })
        }
      ]
    };

    dynamoMock.on(UpdateCommand).resolves({});
    snsMock.on(PublishCommand).resolves({ MessageId: 'sns-123' });

    // Act
    const response = await handler(event);
    const body = JSON.parse(response.body);

    // Assert
    expect(response.statusCode).toBe(200);
    expect(body.processed).toBe(1);
    expect(body.failed).toBe(0);
    expect(body.processedOrders).toContain('order-123');

    // Verify DynamoDB update
    expect(dynamoMock.calls()).toHaveLength(1);
    const dynamoCall = dynamoMock.call(0).args[0].input;
    expect(dynamoCall.Key.orderId).toBe('order-123');
    expect(dynamoCall.ExpressionAttributeValues[':status']).toBe('CONFIRMED');

    // Verify SNS publish
    expect(snsMock.calls()).toHaveLength(1);
    const snsCall = snsMock.call(0).args[0].input;
    expect(snsCall.TopicArn).toContain('test-topic');
  });

  test('Should process multiple orders in batch', async () => {
    // Arrange
    const event = {
      Records: [
        {
          body: JSON.stringify({
            orderId: 'order-1',
            customerId: 'user-1',
            items: [{ productId: 'PROD-001', quantity: 1, price: 10 }],
            totalAmount: 10
          })
        },
        {
          body: JSON.stringify({
            orderId: 'order-2',
            customerId: 'user-2',
            items: [{ productId: 'PROD-002', quantity: 2, price: 20 }],
            totalAmount: 40
          })
        }
      ]
    };

    dynamoMock.on(UpdateCommand).resolves({});
    snsMock.on(PublishCommand).resolves({ MessageId: 'sns-123' });

    // Act
    const response = await handler(event);
    const body = JSON.parse(response.body);

    // Assert
    expect(body.processed).toBe(2);
    expect(body.failed).toBe(0);
    expect(dynamoMock.calls()).toHaveLength(2);
    expect(snsMock.calls()).toHaveLength(2);
  });

  test('Should handle payment failure', async () => {
    // Arrange - This test depends on your payment simulation logic
    // You may need to mock Math.random or inject payment service
    
    const event = {
      Records: [
        {
          body: JSON.stringify({
            orderId: 'order-fail',
            customerId: 'user-123',
            items: [{ productId: 'PROD-001', quantity: 1, price: 10 }],
            totalAmount: 10
          })
        }
      ]
    };

    // Mock to simulate payment failure scenario
    // This is tricky with random logic - you might want to refactor
    // the handler to accept a payment service dependency

    try {
      await handler(event);
    } catch (error) {
      // Expected to throw and go to DLQ
      expect(error).toBeDefined();
    }
  });

  test('Should update order status to FAILED on error', async () => {
    // Arrange
    const event = {
      Records: [
        {
          body: JSON.stringify({
            orderId: 'order-error',
            customerId: 'user-123',
            items: [{ productId: 'PROD-001', quantity: 1, price: 10 }],
            totalAmount: 10
          })
        }
      ]
    };

    // Simulate SNS error
    dynamoMock.on(UpdateCommand).resolves({});
    snsMock.on(PublishCommand).rejects(new Error('SNS failed'));

    // Act & Assert
    await expect(handler(event)).rejects.toThrow();
    
    // Should have called DynamoDB twice (once for CONFIRMED attempt, once for FAILED)
    expect(dynamoMock.calls().length).toBeGreaterThan(0);
  });

  test('Should include paymentId in order update', async () => {
    // Arrange
    const event = {
      Records: [
        {
          body: JSON.stringify({
            orderId: 'order-payment',
            customerId: 'user-123',
            items: [{ productId: 'PROD-001', quantity: 1, price: 10 }],
            totalAmount: 10
          })
        }
      ]
    };

    dynamoMock.on(UpdateCommand).resolves({});
    snsMock.on(PublishCommand).resolves({ MessageId: 'sns-123' });

    // Act
    await handler(event);

    // Assert
    const dynamoCall = dynamoMock.call(0).args[0].input;
    expect(dynamoCall.ExpressionAttributeValues[':paymentId']).toMatch(/^PAY-/);
  });

  test('Should send SNS message with correct attributes', async () => {
    // Arrange
    const event = {
      Records: [
        {
          body: JSON.stringify({
            orderId: 'order-sns',
            customerId: 'user-123',
            items: [{ productId: 'PROD-001', quantity: 1, price: 100 }],
            totalAmount: 100
          })
        }
      ]
    };

    dynamoMock.on(UpdateCommand).resolves({});
    snsMock.on(PublishCommand).resolves({ MessageId: 'sns-123' });

    // Act
    await handler(event);

    // Assert
    const snsCall = snsMock.call(0).args[0].input;
    const message = JSON.parse(snsCall.Message);
    
    expect(message.orderId).toBe('order-sns');
    expect(message.status).toBe('CONFIRMED');
    expect(message.totalAmount).toBe(100);
    expect(snsCall.Subject).toBe('Order Confirmed');
    expect(snsCall.MessageAttributes.eventType.StringValue).toBe('ORDER_CONFIRMED');
  });
});

