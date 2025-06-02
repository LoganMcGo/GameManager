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
 * Validate JWT token from request headers
 */
async function validateJwtToken(req) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or invalid authorization header');
  }
  
  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  
  try {
    const secret = await getJwtSecret();
    const decoded = jwt.verify(token, secret);
    
    // Check if token is expired
    const now = Math.floor(Date.now() / 1000);
    if (decoded.exp && decoded.exp < now) {
      throw new Error('Token expired');
    }
    
    return decoded;
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      throw new Error('Invalid token');
    } else if (error.name === 'TokenExpiredError') {
      throw new Error('Token expired');
    }
    throw error;
  }
}

/**
 * Generate a new JWT token for a machine
 */
async function generateJwtToken(machineId, appVersion = '1.0.0') {
  try {
    const secret = await getJwtSecret();
    const now = Math.floor(Date.now() / 1000);
    const oneYear = 365 * 24 * 60 * 60; // 1 year in seconds
    
    const payload = {
      sub: 'game-manager-client',
      iat: now,
      exp: now + oneYear,
      machine_id: machineId,
      app_version: appVersion,
      installation_id: `gm-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`
    };
    
    const token = jwt.sign(payload, secret);
    
    return {
      token,
      expires_at: new Date((now + oneYear) * 1000).toISOString(),
      machine_id: machineId
    };
  } catch (error) {
    console.error('Failed to generate JWT token:', error);
    throw new Error('Token generation failed');
  }
}

/**
 * Middleware for Cloud Functions to validate JWT
 */
async function requireAuth(req, res, next) {
  try {
    const decoded = await validateJwtToken(req);
    req.user = decoded;
    next();
  } catch (error) {
    console.error('Authentication failed:', error.message);
    res.status(401).json({ 
      error: 'Authentication failed', 
      message: error.message 
    });
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

module.exports = {
  validateJwtToken,
  generateJwtToken,
  requireAuth,
  setCorsHeaders,
  handleOptions,
  getJwtSecret
};
