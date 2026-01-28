const { handler } = require('../../src/handlers/get-user-info');

describe('GetUserInfo Lambda Handler - Unit Tests', () => {
  
  test('Should return user info from Cognito claims', async () => {
    // Arrange
    const event = {
      requestContext: {
        authorizer: {
          claims: {
            sub: 'user-789',
            email: 'john@example.com',
            name: 'John Doe',
            email_verified: 'true',
            auth_time: 1640000000,
            iat: 1640000000,
            exp: 1640003600
          }
        }
      }
    };

    // Act
    const response = await handler(event);
    const body = JSON.parse(response.body);

    // Assert
    expect(response.statusCode).toBe(200);
    expect(body.userId).toBe('user-789');
    expect(body.email).toBe('john@example.com');
    expect(body.name).toBe('John Doe');
    expect(body.emailVerified).toBe(true);
  });

  test('Should return 401 if no claims present', async () => {
    // Arrange
    const event = {
      requestContext: {}
    };

    // Act
    const response = await handler(event);
    const body = JSON.parse(response.body);

    // Assert
    expect(response.statusCode).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });

  test('Should handle missing name gracefully', async () => {
    // Arrange
    const event = {
      requestContext: {
        authorizer: {
          claims: {
            sub: 'user-123',
            email: 'test@example.com',
            email_verified: 'false',
            auth_time: 1640000000,
            iat: 1640000000,
            exp: 1640003600
          }
        }
      }
    };

    // Act
    const response = await handler(event);
    const body = JSON.parse(response.body);

    // Assert
    expect(response.statusCode).toBe(200);
    expect(body.userId).toBe('user-123');
    expect(body.name).toBeUndefined();
  });
});
