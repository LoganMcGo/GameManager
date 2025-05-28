const axios = require('axios');
const Store = require('electron-store').default || require('electron-store');
const { ipcMain } = require('electron');
const os = require('os');
const crypto = require('crypto');

// Cloud function URLs
const KEY_GENERATOR_URL = 'https://us-central1-gamemanagerproxy.cloudfunctions.net/key-generator';

// Declare store variable
let store;

// Token cache with expiration
let tokenCache = {
  token: null,
  expiresAt: null
};

// Initialize the JWT service
function initJwtService() {
  try {
    // Create a secure store for JWT tokens
    store = new Store({
      name: 'jwt-tokens',
      encryptionKey: 'gamemanager-jwt-key-2024',
    });

    // Register IPC handlers
    ipcMain.handle('jwt:get-token', getJwtToken);
    ipcMain.handle('jwt:refresh-token', refreshJwtToken);
    ipcMain.handle('jwt:clear-token', clearJwtToken);
    
    console.log('JWT service initialized');
  } catch (error) {
    console.warn('Failed to initialize JWT service:', error.message);
  }
}

// Generate a unique machine identifier
function generateMachineId() {
  try {
    // Collect system information for fingerprinting
    const systemInfo = {
      platform: os.platform(),
      arch: os.arch(),
      hostname: os.hostname(),
      cpus: os.cpus().length,
      totalmem: os.totalmem(),
      userInfo: os.userInfo().username,
      release: os.release()
    };
    
    // Create a hash of the system information
    const machineData = JSON.stringify(systemInfo);
    const machineId = crypto.createHash('sha256').update(machineData).digest('hex');
    
    console.log('Generated machine ID:', machineId.substring(0, 16) + '...');
    return machineId;
  } catch (error) {
    console.error('Error generating machine ID:', error);
    // Fallback to a random ID if system info fails
    return crypto.randomBytes(32).toString('hex');
  }
}

// Check if token is expired
function isTokenExpired(token) {
  if (!token) return true;
  
  try {
    // Decode JWT payload (simple base64 decode, no verification needed here)
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    const now = Math.floor(Date.now() / 1000);
    
    // Add 5 minute buffer before expiry
    const bufferTime = 5 * 60; // 5 minutes
    return now >= (payload.exp - bufferTime);
  } catch (error) {
    console.warn('Error checking token expiry:', error);
    return true;
  }
}

// Get a valid JWT token (from cache or request new one)
async function getJwtToken() {
  try {
    // Check cache first
    if (tokenCache.token && !isTokenExpired(tokenCache.token)) {
      console.log('Using cached JWT token');
      return { success: true, token: tokenCache.token };
    }
    
    // Check persistent storage
    const storedToken = store.get('jwtToken');
    if (storedToken && !isTokenExpired(storedToken)) {
      console.log('Using stored JWT token');
      tokenCache.token = storedToken;
      return { success: true, token: storedToken };
    }
    
    // Request new token
    console.log('Requesting new JWT token...');
    return await requestNewToken();
  } catch (error) {
    console.error('Error getting JWT token:', error);
    return { success: false, error: error.message };
  }
}

// Request a new JWT token from the cloud function
async function requestNewToken() {
  try {
    const machineId = generateMachineId();
    
    const response = await axios.post(KEY_GENERATOR_URL, {
      machine_id: machineId,
      app_name: 'GameManager'
    }, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 10000 // 10 second timeout
    });
    
    if (response.data && response.data.token) {
      const token = response.data.token;
      
      // Cache the token
      tokenCache.token = token;
      
      // Store the token persistently
      store.set('jwtToken', token);
      
      console.log('Successfully obtained new JWT token');
      return { success: true, token: token };
    } else {
      throw new Error('Invalid response from key generator');
    }
  } catch (error) {
    console.error('Error requesting new token:', error);
    
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;
      
      switch (status) {
        case 400:
          throw new Error('Invalid request parameters');
        case 429:
          throw new Error('Rate limited. Please try again later.');
        case 500:
          throw new Error('Server error. Please try again later.');
        default:
          throw new Error(`HTTP ${status}: ${data?.error || 'Unknown error'}`);
      }
    }
    
    if (error.code === 'ECONNABORTED') {
      throw new Error('Request timeout. Please check your internet connection.');
    }
    
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      throw new Error('Cannot connect to authentication server. Please check your internet connection.');
    }
    
    throw new Error(`Failed to get authentication token: ${error.message}`);
  }
}

// Refresh the JWT token
async function refreshJwtToken() {
  try {
    console.log('Refreshing JWT token...');
    
    // Clear cache and request new token
    tokenCache.token = null;
    store.delete('jwtToken');
    
    return await requestNewToken();
  } catch (error) {
    console.error('Error refreshing JWT token:', error);
    return { success: false, error: error.message };
  }
}

// Clear the JWT token
function clearJwtToken() {
  try {
    tokenCache.token = null;
    store.delete('jwtToken');
    console.log('JWT token cleared');
    return { success: true };
  } catch (error) {
    console.error('Error clearing JWT token:', error);
    return { success: false, error: error.message };
  }
}

// Make an authenticated request to a proxy function
async function makeProxyRequest(url, options = {}) {
  try {
    // Get a valid JWT token
    const tokenResult = await getJwtToken();
    if (!tokenResult.success) {
      throw new Error(`Authentication failed: ${tokenResult.error}`);
    }
    
    // Add authorization header
    const headers = {
      ...options.headers,
      'Authorization': `Bearer ${tokenResult.token}`
    };
    
    // Make the request
    return await axios({
      ...options,
      url,
      headers,
      timeout: options.timeout || 30000 // 30 second default timeout
    });
  } catch (error) {
    // If we get a 401, try refreshing the token once
    if (error.response && error.response.status === 401) {
      console.log('Token expired, attempting refresh...');
      
      const refreshResult = await refreshJwtToken();
      if (refreshResult.success) {
        // Retry the request with new token
        const headers = {
          ...options.headers,
          'Authorization': `Bearer ${refreshResult.token}`
        };
        
        return await axios({
          ...options,
          url,
          headers,
          timeout: options.timeout || 30000
        });
      }
    }
    
    throw error;
  }
}

module.exports = {
  initJwtService,
  getJwtToken,
  refreshJwtToken,
  clearJwtToken,
  makeProxyRequest,
  generateMachineId
};
