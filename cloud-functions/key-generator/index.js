const functions = require('@google-cloud/functions-framework');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');

const secretClient = new SecretManagerServiceClient();

// Cache for JWT secret to avoid repeated Secret Manager calls
let jwtSecret = null;

// Rate limiting: track recent requests per IP
const recentRequests = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 5; // 5 requests per minute per IP

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
 * Clean up old rate limit entries
 */
function cleanupRateLimit() {
  const now = Date.now();
  for (const [ip, requests] of recentRequests.entries()) {
    const validRequests = requests.filter(time => (now - time) < RATE_LIMIT_WINDOW);
    if (validRequests.length === 0) {
      recentRequests.delete(ip);
    } else {
      recentRequests.set(ip, validRequests);
    }
  }
}

/**
 * Check rate limit for IP
 */
function checkRateLimit(ip) {
  cleanupRateLimit();
  
  const now = Date.now();
  const requests = recentRequests.get(ip) || [];
  const recentRequestsCount = requests.filter(time => (now - time) < RATE_LIMIT_WINDOW).length;
  
  if (recentRequestsCount >= MAX_REQUESTS_PER_WINDOW) {
    return false;
  }
  
  requests.push(now);
  recentRequests.set(ip, requests);
  return true;
}

/**
 * Generate a machine fingerprint from request data
 */
function generateMachineId(requestData) {
  const {
    hostname,
    username,
    platform,
    arch,
    appPath,
    timestamp
  } = requestData;
  
  // Create a unique but deterministic machine ID
  const fingerprint = [
    hostname || 'unknown',
    username || 'unknown', 
    platform || 'unknown',
    arch || 'unknown',
    appPath || 'unknown',
    Math.floor((timestamp || Date.now()) / (24 * 60 * 60 * 1000)) // Day-based to allow daily rotation
  ].join('|');
  
  return crypto
    .createHash('sha256')
    .update(fingerprint)
    .digest('hex')
    .substring(0, 32);
}

/**
 * Validate request data
 */
function validateRequest(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid request data');
  }
  
  // Check for required fields
  const requiredFields = ['hostname', 'username', 'platform', 'arch'];
  for (const field of requiredFields) {
    if (!data[field] || typeof data[field] !== 'string') {
      throw new Error(`Missing or invalid field: ${field}`);
    }
  }
  
  // Validate app version if provided
  if (data.appVersion && typeof data.appVersion !== 'string') {
    throw new Error('Invalid app version');
  }
  
  return true;
}

/**
 * Main Cloud Function entry point
 */
functions.http('generateKey', async (req, res) => {
  setCorsHeaders(res);
  
  try {
    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
      return handleOptions(req, res);
    }
    
    // Only allow POST requests
    if (req.method !== 'POST') {
      return res.status(405).json({ 
        error: 'Method not allowed',
        message: 'Only POST requests are supported'
      });
    }
    
    // Check rate limit
    const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';
    if (!checkRateLimit(clientIp)) {
      console.warn(`Rate limit exceeded for IP: ${clientIp}`);
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: 'Too many requests. Please try again later.'
      });
    }
    
    // Validate request data
    validateRequest(req.body);
    
    console.log('Generating key for new installation:', {
      hostname: req.body.hostname,
      platform: req.body.platform,
      arch: req.body.arch,
      appVersion: req.body.appVersion || '1.0.0'
    });
    
    // Generate machine ID
    const machineId = generateMachineId({
      ...req.body,
      timestamp: Date.now()
    });
    
    // Generate JWT token
    const tokenData = await generateJwtToken(
      machineId, 
      req.body.appVersion || '1.0.0'
    );
    
    console.log(`Generated token for machine: ${machineId.substring(0, 8)}...`);
    
    // Return the token
    res.status(200).json({
      success: true,
      api_key: tokenData.token,
      expires_at: tokenData.expires_at,
      machine_id: tokenData.machine_id,
      message: 'API key generated successfully'
    });
    
  } catch (error) {
    console.error('Error generating key:', error);
    
    // Don't expose internal errors to clients
    let errorMessage = 'Internal server error';
    let statusCode = 500;
    
    if (error.message.includes('Invalid') || error.message.includes('Missing')) {
      errorMessage = error.message;
      statusCode = 400;
    } else if (error.message.includes('Rate limit')) {
      errorMessage = error.message;
      statusCode = 429;
    }
    
    res.status(statusCode).json({
      success: false,
      error: errorMessage
    });
  }
});
