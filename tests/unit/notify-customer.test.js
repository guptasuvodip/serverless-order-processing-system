const { handler } = require('../../src/handlers/notify-customer');

describe('NotifyCustomer Lambda Handler - Unit Tests', () => {
  
  test('Should process ORDER_CONFIRMED notification', async () => {
    // Arrange
    const event = {
      Records: [
        {
          Sns: {
            Message: JSON.stringify({
              orderId: 'order-123',
              customerId: 'user-123',
              status: 'CONFIRMED',
              totalAmount: 99.99,
              paymentId: 'PAY-123'
            }),
            Subject: 'Order Confirmed',
            MessageAttributes: {
              eventType: {
                Value: 'ORDER_CONFIRMED'
              }
            }
          }
        }
      ]
    };

    // Act
    const response = await handler(event);

    // Assert
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.message).toBe('Notifications processed');
  });

  test('Should handle multiple SNS records', async () => {
    // Arrange
    const event = {
      Records: [
        {
          Sns: {
            Message: JSON.stringify({
              orderId: 'order-1',
              status: 'CONFIRMED'
            }),
            MessageAttributes: {
              eventType: { Value: 'ORDER_CONFIRMED' }
            }
          }
        },
        {
          Sns: {
            Message: JSON.stringify({
              orderId: 'order-2',
              status: 'SHIPPED'
            }),
            MessageAttributes: {
              eventType: { Value: 'ORDER_SHIPPED' }
            }
          }
        }
      ]
    };

    // Act
    const response = await handler(event);

    // Assert
    expect(response.statusCode).toBe(200);
  });

  test('Should not throw error on notification failure', async () => {
    // Arrange
    const event = {
      Records: [
        {
          Sns: {
            Message: 'invalid json',
            MessageAttributes: {}
          }
        }
      ]
    };

    // Act
    const response = await handler(event);

    // Assert
    // Should still return 200 even if notification fails
    expect(response.statusCode).toBe(200);
  });
});

