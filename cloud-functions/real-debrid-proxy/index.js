const functions = require('@google-cloud/functions-framework');
const jwt = require('jsonwebtoken');
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');

const secretClient = new SecretManagerServiceClient();

// Cache for JWT secret to avoid repeated Secret Manager calls
let jwtSecret = null;

/**
 * Get JWT secret from Secret Manager (cached)
 */
async function getJwtSecret() {
  if (jwtSecret) {
    return jwtSecret;
  }
  
  try {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT || 'gamemanagerproxy';
    const [version] = await secretClient.accessSecretVersion({
      name: `projects/${projectId}/secrets/jwt-secret/versions/latest`,
    });
    
    jwtSecret = version.payload.data.toString();
    return jwtSecret;
  } catch (error) {
    console.error('Failed to get JWT secret:', error);
    throw new Error('Authentication configuration error');
  }
}

/**
 * Verify JWT token
 */
async function verifyToken(token) {
  try {
    const secret = await getJwtSecret();
    const decoded = jwt.verify(token, secret);
    return decoded;
  } catch (error) {
    console.error('Token verification failed:', error);
    throw new Error('Invalid or expired token');
  }
}

/**
 * CORS headers for all responses
 */
function setCorsHeaders(res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.set('Access-Control-Max-Age', '3600');
}

/**
 * Handle preflight OPTIONS requests
 */
function handleOptions(req, res) {
  setCorsHeaders(res);
  res.status(204).send('');
}

/**
 * Extract token from Authorization header
 */
function extractToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or invalid Authorization header');
  }
  return authHeader.substring(7);
}

/**
 * Make request to Real-Debrid API
 */
async function makeRealDebridRequest(endpoint, options = {}) {
  const baseUrl = 'https://api.real-debrid.com/rest/1.0';
  const url = `${baseUrl}${endpoint}`;
  
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Real-Debrid API error: ${response.status} ${errorText}`);
  }
  
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return await response.json();
  } else {
    return await response.text();
  }
}

/**
 * Main Cloud Function entry point
 */
functions.http('realDebridProxy', async (req, res) => {
  setCorsHeaders(res);
  
  try {
    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
      return handleOptions(req, res);
    }
    
    // Verify JWT token
    const token = extractToken(req);
    await verifyToken(token);
    
    // Extract Real-Debrid API token from request
    const { apiToken, endpoint, method = 'GET', body } = req.body;
    
    if (!apiToken) {
      return res.status(400).json({
        error: 'Missing Real-Debrid API token'
      });
    }
    
    if (!endpoint) {
      return res.status(400).json({
        error: 'Missing API endpoint'
      });
    }
    
    console.log(`Proxying Real-Debrid request: ${method} ${endpoint}`);
    
    // Make request to Real-Debrid API
    const result = await makeRealDebridRequest(endpoint, {
      method,
      headers: {
        'Authorization': `Bearer ${apiToken}`
      },
      body
    });
    
    res.status(200).json({
      success: true,
      data: result
    });
    
  } catch (error) {
    console.error('Real-Debrid proxy error:', error);
    
    let statusCode = 500;
    let errorMessage = 'Internal server error';
    
    if (error.message.includes('Invalid or expired token')) {
      statusCode = 401;
      errorMessage = 'Unauthorized';
    } else if (error.message.includes('Missing') || error.message.includes('Invalid')) {
      statusCode = 400;
      errorMessage = error.message;
    } else if (error.message.includes('Real-Debrid API error')) {
      statusCode = 502;
      errorMessage = 'Real-Debrid API error';
    }
    
    res.status(statusCode).json({
      success: false,
      error: errorMessage
    });
  }
});
