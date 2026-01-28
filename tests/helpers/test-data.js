const https = require('https');

const API_ENDPOINT = process.env.API_ENDPOINT;
let authToken;

describe('Rate Limiting - Integration Tests', () => {
  
  beforeAll(async () => {
    // Get auth token (reuse from previous test or set up)
    authToken = process.env.TEST_AUTH_TOKEN;
  });

  test('Should throttle after exceeding rate limit', async () => {
    const requests = [];
    const numRequests = 60; // Exceed the 50 RPS limit

    // Send burst of requests
    for (let i = 0; i < numRequests; i++) {
      requests.push(
        makeApiRequest('POST', '/orders', {
          items: [{ productId: 'RATE-TEST', quantity: 1, price: 1 }]
        }, authToken)
      );
    }

    const responses = await Promise.allSettled(requests);
    
    const successful = responses.filter(r => r.value?.statusCode === 202).length;
    const throttled = responses.filter(r => r.value?.statusCode === 429).length;

    console.log(`Successful: ${successful}, Throttled: ${throttled}`);

    // Should have some throttled requests
    expect(throttled).toBeGreaterThan(0);
    expect(successful).toBeLessThan(numRequests);
  }, 30000);
});

function makeApiRequest(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_ENDPOINT);
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    };

    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          body: data
        });
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

