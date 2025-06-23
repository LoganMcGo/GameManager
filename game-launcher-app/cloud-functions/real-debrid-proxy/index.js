const functions = require('@google-cloud/functions-framework');
const jwt = require('jsonwebtoken');
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');

const secretClient = new SecretManagerServiceClient();

// Cache for JWT secret and Real-Debrid API token
let jwtSecret = null;
let realDebridApiToken = null;

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
 * Get Real-Debrid API token from Secret Manager (cached)
 */
async function getRealDebridApiToken() {
  if (realDebridApiToken) {
    return realDebridApiToken;
  }
  
  try {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT || 'gamemanagerproxy';
    const [version] = await secretClient.accessSecretVersion({
      name: `projects/${projectId}/secrets/real-debrid-apikey/versions/latest`,
    });
    
    realDebridApiToken = version.payload.data.toString();
    return realDebridApiToken;
  } catch (error) {
    console.error('Failed to get Real-Debrid API token:', error);
    throw new Error('Real-Debrid API token not configured');
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
 * Make request to Real-Debrid API using stored personal API token
 */
async function makeRealDebridRequest(endpoint, options = {}) {
  const apiToken = await getRealDebridApiToken();
  const baseUrl = 'https://api.real-debrid.com/rest/1.0';
  const url = `${baseUrl}${endpoint}`;
  
  let body = undefined;
  let headers = {
    'Authorization': `Bearer ${apiToken}`,
    ...options.headers
  };
  
  // Handle different content types
  if (options.body && options.method !== 'GET') {
    if (options.contentType === 'application/x-www-form-urlencoded') {
      // Convert object to URLSearchParams for form data
      const formData = new URLSearchParams();
      for (const [key, value] of Object.entries(options.body)) {
        formData.append(key, value);
      }
      body = formData.toString();
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
    } else {
      // Default to JSON
      body = JSON.stringify(options.body);
      headers['Content-Type'] = 'application/json';
    }
  }
  
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: headers,
    body: body
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Real-Debrid API error: ${response.status} ${errorText}`);
  }
  
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    const responseText = await response.text();
    
    // Handle empty responses
    if (!responseText || responseText.trim() === '') {
      return []; // Return empty array for empty downloads list
    }
    
    try {
      return JSON.parse(responseText);
    } catch (error) {
      console.error('Failed to parse JSON response:', responseText);
      throw new Error('Invalid JSON response from Real-Debrid API');
    }
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
    const decoded = await verifyToken(token);
    
    // Extract request parameters (no apiToken needed - using stored token)
    const { endpoint, method = 'GET', body, contentType } = req.body;
    
    if (!endpoint) {
      return res.status(400).json({
        error: 'Missing API endpoint'
      });
    }
    
    console.log(`Proxying Real-Debrid request: ${method} ${endpoint}`, contentType ? `(${contentType})` : '');
    console.log(`Machine ID: ${decoded.machine_id}`);
    
    // Make request to Real-Debrid API using stored personal API token
    const result = await makeRealDebridRequest(endpoint, {
      method,
      body,
      contentType
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
    } else if (error.message.includes('Real-Debrid API token not configured')) {
      statusCode = 503;
      errorMessage = 'Service configuration error';
    }
    
    res.status(statusCode).json({
      success: false,
      error: errorMessage
    });
  }
});
