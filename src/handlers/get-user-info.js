exports.handler = async (event) => {
  console.log('Get user info request:', JSON.stringify(event, null, 2));

  try {
    // Extract user from Cognito authorizer
    const claims = event.requestContext?.authorizer?.claims;

    if (!claims) {
      return {
        statusCode: 401,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ error: 'Unauthorized' })
      };
    }

    const userInfo = {
      userId: claims.sub,
      email: claims.email,
      name: claims.name,
      emailVerified: claims.email_verified === 'true',
      authTime: new Date(claims.auth_time * 1000).toISOString(),
      tokenIssued: new Date(claims.iat * 1000).toISOString(),
      tokenExpires: new Date(claims.exp * 1000).toISOString()
    };

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(userInfo)
    };

  } catch (error) {
    console.error('Error getting user info:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message
      })
    };
  }
};

