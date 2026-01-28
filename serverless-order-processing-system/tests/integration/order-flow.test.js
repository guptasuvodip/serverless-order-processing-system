const AWS = require('aws-sdk');
const https = require('https');
const { v4: uuidv4 } = require('uuid');

// Configure AWS SDK for integration tests
AWS.config.update({ region: process.env.AWS_REGION || 'us-east-1' });

const dynamodb = new AWS.DynamoDB.DocumentClient();
const sqs = new AWS.SQS();
const cognito = new AWS.CognitoIdentityServiceProvider();

// These should be set in CI/CD or locally for integration tests
const STACK_NAME = process.env.STACK_NAME || 'order-processing-dev';
const API_ENDPOINT = process.env.API_ENDPOINT;
const USER_POOL_ID = process.env.USER_POOL_ID;
const CLIENT_ID = process.env.CLIENT_ID;

describe('Order Processing Flow - Integration Tests', () => {
  let authToken;
  let testUser;

  beforeAll(async () => {
    // Create test user and get auth token
    testUser = {
      username: `test-${uuidv4()}@example.com`,
      password: 'TestPass123!',
      email: `test-${uuidv4()}@example.com`
    };

    try {
      // Create user
      await cognito.adminCreateUser({
        UserPoolId: USER_POOL_ID,
        Username: testUser.username,
        UserAttributes: [
          { Name: 'email', Value: testUser.email },
          { Name: 'email_verified', Value: 'true' }
        ],
        TemporaryPassword: testUser.password,
        MessageAction: 'SUPPRESS'
      }).promise();

      // Set permanent password
      await cognito.adminSetUserPassword({
        UserPoolId: USER_POOL_ID,
        Username: testUser.username,
        Password: testUser.password,
        Permanent: true
      }).promise();

      // Authenticate
      const authResponse = await cognito.initiateAuth({
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: CLIENT_ID,
        AuthParameters: {
          USERNAME: testUser.username,
          PASSWORD: testUser.password
        }
      }).promise();

      authToken = authResponse.AuthenticationResult.IdToken;
    } catch (error) {
      console.error('Setup error:', error);
      throw error;
    }
  }, 30000);

  afterAll(async () => {
    // Cleanup test user
    if (testUser) {
      try {
        await cognito.adminDeleteUser({
          UserPoolId: USER_POOL_ID,
          Username: testUser.username
        }).promise();
      } catch (error) {
        console.error('Cleanup error:', error);
      }
    }
  });

  test('Complete order flow: Create -> Process -> Notify', async () => {
    // Step 1: Create order via API
    const orderRequest = {
      items: [
        { productId: 'INTEGRATION-TEST-001', quantity: 2, price: 25.50 },
        { productId: 'INTEGRATION-TEST-002', quantity: 1, price: 49.99 }
      ]
    };

    const createResponse = await makeApiRequest('POST', '/orders', orderRequest, authToken);
    
    expect(createResponse.statusCode).toBe(202);
    const orderId = createResponse.body.orderId;
    expect(orderId).toBeDefined();

    console.log('Order created:', orderId);

    // Step 2: Wait for order to be processed (async)
    await sleep(10000); // Wait 10 seconds for processing

    // Step 3: Verify order in DynamoDB
    const orderFromDb = await dynamodb.get({
      TableName: `orders-dev`,
      Key: { orderId }
    }).promise();

    expect(orderFromDb.Item).toBeDefined();
    expect(orderFromDb.Item.status).toBe('CONFIRMED');
    expect(orderFromDb.Item.paymentId).toBeDefined();
    expect(orderFromDb.Item.totalAmount).toBe(100.99);

    console.log('Order verified in DynamoDB:', orderFromDb.Item.status);
  }, 60000);

  test('Order validation: Should reject invalid order', async () => {
    const invalidOrder = {
      items: [] // Empty items
    };

    const response = await makeApiRequest('POST', '/orders', invalidOrder, authToken);
    
    expect(response.statusCode).toBe(400);
    expect(response.body.error).toBeDefined();
  });

  test('Authentication: Should reject request without token', async () => {
    const orderRequest = {
      items: [{ productId: 'TEST', quantity: 1, price: 10 }]
    };

    const response = await makeApiRequest('POST', '/orders', orderRequest, null);
    
    expect(response.statusCode).toBe(401);
  });

  test('Get user info endpoint', async () => {
    const response = await makeApiRequest('GET', '/user/info', null, authToken);
    
    expect(response.statusCode).toBe(200);
    expect(response.body.email).toBe(testUser.email);
    expect(response.body.userId).toBeDefined();
  });
});

// Helper functions
function makeApiRequest(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_ENDPOINT);
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            statusCode: res.statusCode,
            body: JSON.parse(data)
          });
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            body: data
          });
        }
      });
    });

    req.on('error', reject);
    
    if (body) {
      req.write(JSON.stringify(body));
    }
    
    req.end();
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

