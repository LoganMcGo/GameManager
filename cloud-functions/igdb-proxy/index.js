const functions = require('@google-cloud/functions-framework');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');

const secretClient = new SecretManagerServiceClient();

// Cache for credentials and tokens
let jwtSecret = null;
let igdbClientId = null;
let igdbClientSecret = null;
let igdbAccessToken = null;
let tokenExpiresAt = null;

// IGDB API URLs
const IGDB_BASE_URL = 'https://api.igdb.com/v4';
const TWITCH_OAUTH_URL = 'https://id.twitch.tv/oauth2/token';

// Rate limiting per machine
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_MACHINE = 60; // 60 requests per minute per machine

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
 * Get IGDB credentials from Secret Manager (cached)
 */
async function getIgdbCredentials() {
  if (igdbClientId && igdbClientSecret) {
    return { clientId: igdbClientId, clientSecret: igdbClientSecret };
  }
  
  try {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT || 'gamemanagerproxy';
    
    const [clientIdVersion] = await secretClient.accessSecretVersion({
      name: `projects/${projectId}/secrets/igdb-client-id/versions/latest`,
    });
    
    const [clientSecretVersion] = await secretClient.accessSecretVersion({
      name: `projects/${projectId}/secrets/igdb-client-secret/versions/latest`,
    });
    
    igdbClientId = clientIdVersion.payload.data.toString();
    igdbClientSecret = clientSecretVersion.payload.data.toString();
    
    return { clientId: igdbClientId, clientSecret: igdbClientSecret };
  } catch (error) {
    console.error('Failed to get IGDB credentials:', error);
    throw new Error('IGDB configuration error');
  }
}

/**
 * Generate IGDB access token using client credentials flow
 */
async function generateIgdbAccessToken() {
  try {
    const { clientId, clientSecret } = await getIgdbCredentials();
    
    console.log('Generating new IGDB access token...');
    
    const response = await axios.post(TWITCH_OAUTH_URL, null, {
      params: {
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'client_credentials'
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      timeout: 10000
    });
    
    igdbAccessToken = response.data.access_token;
    const expiresIn = response.data.expires_in;
    
    // Set expiry with 5 minute buffer
    tokenExpiresAt = Date.now() + ((expiresIn - 300) * 1000);
    
    console.log('IGDB access token generated successfully');
    return igdbAccessToken;
    
  } catch (error) {
    console.error('Failed to generate IGDB access token:', error);
    throw new Error('Failed to authenticate with IGDB');
  }
}

/**
 * Get valid IGDB access token (generates new if expired)
 */
async function getValidIgdbToken() {
  if (igdbAccessToken && tokenExpiresAt && Date.now() < tokenExpiresAt) {
    return igdbAccessToken;
  }
  
  return await generateIgdbAccessToken();
}

/**
 * Check rate limit for machine
 */
function checkRateLimit(machineId) {
  const now = Date.now();
  const requests = rateLimitMap.get(machineId) || [];
  
  // Clean old requests
  const validRequests = requests.filter(time => (now - time) < RATE_LIMIT_WINDOW);
  
  if (validRequests.length >= MAX_REQUESTS_PER_MACHINE) {
    return false;
  }
  
  validRequests.push(now);
  rateLimitMap.set(machineId, validRequests);
  return true;
}

/**
 * Forward request to IGDB API
 */
async function forwardToIgdb(endpoint, method, data, params) {
  try {
    const accessToken = await getValidIgdbToken();
    const { clientId } = await getIgdbCredentials();
    const url = `${IGDB_BASE_URL}/${endpoint}`;
    
    console.log(`Forwarding ${method} request to IGDB: /${endpoint}`);
    
    const config = {
      method: method.toLowerCase(),
      url: url,
      headers: {
        'Client-ID': clientId,
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      },
      timeout: 30000 // 30 seconds timeout
    };
    
    // Add query parameters if present
    if (params && Object.keys(params).length > 0) {
      config.params = params;
    }
    
    // Handle request body for POST requests
    if (method === 'POST' && data) {
      if (typeof data === 'string') {
        // APIcalypse query as plain text
        config.headers['Content-Type'] = 'text/plain';
        config.data = data;
      } else {
        // JSON data
        config.headers['Content-Type'] = 'application/json';
        config.data = data;
      }
    }
    
    const response = await axios(config);
    
    return {
      success: true,
      status: response.status,
      data: response.data,
      headers: response.headers
    };
    
  } catch (error) {
    console.error('IGDB API error:', error.message);
    
    if (error.response) {
      return {
        success: false,
        status: error.response.status,
        data: error.response.data,
        error: error.response.data?.message || 'IGDB API error'
      };
    }
    
    return {
      success: false,
      status: 500,
      error: 'Network error communicating with IGDB'
    };
  }
}

/**
 * Main Cloud Function entry point
 */
functions.http('igdbProxy', async (req, res) => {
  setCorsHeaders(res);
  
  try {
    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
      return handleOptions(req, res);
    }
    
    // Verify JWT token
    const token = extractToken(req);
    const decoded = await verifyToken(token);
    const machineId = decoded.machine_id;
    
    // Check rate limit
    if (!checkRateLimit(machineId)) {
      console.warn(`Rate limit exceeded for machine: ${machineId}`);
      return res.status(429).json({
        success: false,
        error: 'Rate limit exceeded',
        message: 'Too many requests. Please slow down.'
      });
    }
    
    // Extract endpoint from URL
    // URL format: /igdb-proxy/games or /igdb-proxy/search
    const urlPath = req.path || req.url || '';
    const endpoint = urlPath.replace(/^\/[^\/]*\//, '') || 'games'; // Remove function name, default to games
    
    console.log(`Processing IGDB request for machine ${machineId.substring(0, 8)}... endpoint: ${endpoint}`);
    
    // Forward the request to IGDB
    const result = await forwardToIgdb(
      endpoint,
      req.method,
      req.body,
      req.query
    );
    
    // Return the result
    if (result.success) {
      res.status(result.status).json(result.data);
    } else {
      res.status(result.status).json({
        success: false,
        error: result.error,
        details: result.data
      });
    }
    
  } catch (error) {
    console.error('IGDB Proxy error:', error);
    
    let errorMessage = 'Internal server error';
    let statusCode = 500;
    
    if (error.message.includes('Invalid or expired token')) {
      errorMessage = 'Unauthorized';
      statusCode = 401;
    } else if (error.message.includes('Missing') || error.message.includes('Invalid')) {
      errorMessage = error.message;
      statusCode = 400;
    } else if (error.message.includes('configuration') || error.message.includes('IGDB')) {
      errorMessage = 'IGDB service configuration error';
      statusCode = 503;
    }
    
    res.status(statusCode).json({
      success: false,
      error: errorMessage
    });
  }
});
