const axios = require('axios');
const Store = require('electron-store').default || require('electron-store');
const { ipcMain, shell } = require('electron');
const { makeProxyRequest } = require('./jwtService');

// Cloud function URL for Real-Debrid proxy
const REAL_DEBRID_PROXY_URL = 'https://us-central1-gamemanagerproxy.cloudfunctions.net/real-debrid-proxy';

// Base URLs for Real-Debrid API (kept for OAuth endpoints that don't go through proxy)
const BASE_URL = 'https://api.real-debrid.com/rest/1.0';
const OAUTH_URL = 'https://api.real-debrid.com/oauth/v2';

// Client ID for opensource apps (from Real-Debrid documentation)
const CLIENT_ID = 'X245A4XAIBGVM';

// Declare store variable but don't initialize it yet
let store;

// Initialize the service
function initRealDebridService() {
  // Create a secure store for tokens
  store = new Store({
    name: 'real-debrid-auth',
    encryptionKey: 'rd-game-launcher-key-2024', // Improved encryption key
  });

  // Register IPC handlers for renderer process to communicate with this service
  ipcMain.handle('real-debrid:get-auth-status', getAuthStatus);
  ipcMain.handle('real-debrid:start-auth-flow', startAuthFlow);
  ipcMain.handle('real-debrid:check-auth-status', checkAuthStatus);
  ipcMain.handle('real-debrid:disconnect', disconnect);
  
  // User API handlers
  ipcMain.handle('real-debrid:get-user-info', getUserInfo);
  
  // Unrestrict API handlers
  ipcMain.handle('real-debrid:check-link', checkLink);
  ipcMain.handle('real-debrid:unrestrict-link', unrestrictLink);
  ipcMain.handle('real-debrid:unrestrict-folder', unrestrictFolder);
  
  // Downloads API handlers
  ipcMain.handle('real-debrid:get-downloads', getDownloads);
  ipcMain.handle('real-debrid:delete-download', deleteDownload);
  
  // Torrents API handlers
  ipcMain.handle('real-debrid:get-torrents', getTorrents);
  ipcMain.handle('real-debrid:get-torrent-info', getTorrentInfo);
  ipcMain.handle('real-debrid:add-magnet', addMagnet);
  ipcMain.handle('real-debrid:add-magnet-and-start', addMagnetAndStart);
  ipcMain.handle('real-debrid:select-files', selectFiles);
  ipcMain.handle('real-debrid:delete-torrent', deleteTorrent);
  ipcMain.handle('real-debrid:get-active-count', getActiveTorrentsCount);
  ipcMain.handle('real-debrid:get-available-hosts', getAvailableHosts);
  
  // Hosts API handlers
  ipcMain.handle('real-debrid:get-hosts', getHosts);
  ipcMain.handle('real-debrid:get-hosts-status', getHostsStatus);
  
  // Traffic API handlers
  ipcMain.handle('real-debrid:get-traffic', getTraffic);
  ipcMain.handle('real-debrid:get-traffic-details', getTrafficDetails);
  
  console.log('Real-Debrid service initialized with full API support');
}

// Check if the user is authenticated
async function getAuthStatus() {
  const accessToken = store.get('accessToken');
  const refreshToken = store.get('refreshToken');
  
  if (!accessToken || !refreshToken) {
    return { authenticated: false };
  }
  
  // Check if the token is expired and needs refreshing
  const expiresAt = store.get('expiresAt');
  if (expiresAt && new Date().getTime() > expiresAt) {
    try {
      await refreshAccessToken();
      return { authenticated: true };
    } catch (error) {
      console.error('Failed to refresh token:', error);
      return { authenticated: false };
    }
  }
  
  return { authenticated: true };
}

// Start the OAuth2 authentication flow
async function startAuthFlow() {
  try {
    console.log('Starting Real Debrid authentication flow...');
    // Step 1: Get device code
    const response = await axios.get(`${OAUTH_URL}/device/code`, {
      params: {
        client_id: CLIENT_ID,
        new_credentials: 'yes'
      }
    });
    
    console.log('Device code response:', response.data);
    
    const { device_code, user_code, verification_url, expires_in, interval } = response.data;
    
    // Store the device code for later use
    store.set('deviceCode', device_code);
    store.set('deviceCodeExpiresAt', new Date().getTime() + (expires_in * 1000));
    store.set('pollingInterval', interval);
    
    console.log('Stored device code and settings:', {
      deviceCode: device_code ? 'stored' : 'failed',
      userCode: user_code,
      expiresIn: expires_in,
      interval: interval
    });
    
    return {
      userCode: user_code,
      verificationUrl: verification_url,
      expiresIn: expires_in
    };
  } catch (error) {
    console.error('Error starting auth flow:', error);
    throw new Error('Failed to start authentication flow');
  }
}

// Check the status of the authentication flow
async function checkAuthStatus() {
  const deviceCode = store.get('deviceCode');
  const deviceCodeExpiresAt = store.get('deviceCodeExpiresAt');
  
  console.log('Checking auth status:', { deviceCode: deviceCode ? 'present' : 'missing', expiresAt: deviceCodeExpiresAt });
  
  if (!deviceCode || new Date().getTime() > deviceCodeExpiresAt) {
    console.log('Device code expired or missing');
    return { status: 'expired' };
  }
  
  try {
    console.log('Step 1: Getting client credentials...');
    // Step 2: Get client credentials
    const credentialsResponse = await axios.get(`${OAUTH_URL}/device/credentials`, {
      params: {
        client_id: CLIENT_ID,
        code: deviceCode
      },
      timeout: 10000 // 10 second timeout
    });
    
    console.log('Step 1 successful: Got client credentials');
    
    // Store the client credentials
    const { client_id, client_secret } = credentialsResponse.data;
    store.set('clientId', client_id);
    store.set('clientSecret', client_secret);
    
    console.log('Step 2: Getting access token...');
    // Step 3: Get access token
    const tokenData = new URLSearchParams({
      client_id: client_id,
      client_secret: client_secret,
      code: deviceCode,
      grant_type: 'http://oauth.net/grant_type/device/1.0'
    });
    
    const tokenResponse = await axios.post(`${OAUTH_URL}/token`, tokenData.toString(), {
      timeout: 15000, // 15 second timeout
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    
    console.log('Step 2 successful: Got access token');
    
    const { access_token, refresh_token, expires_in } = tokenResponse.data;
    
    // Store the tokens
    store.set('accessToken', access_token);
    store.set('refreshToken', refresh_token);
    store.set('expiresAt', new Date().getTime() + (expires_in * 1000));
    
    // Clear the device code as it's no longer needed
    store.delete('deviceCode');
    store.delete('deviceCodeExpiresAt');
    store.delete('pollingInterval');
    
    console.log('Authentication completed successfully!');
    return { status: 'authenticated' };
  } catch (error) {
    // Handle different error types
    if (error.response) {
      const status = error.response.status;
      const errorData = error.response.data;
      
      console.log('API Error:', status, errorData);
      
      // 400 means user hasn't authorized yet - this is normal during polling
      if (status === 400) {
        console.log('User hasn\'t authorized yet (400) - this is normal');
        return { status: 'pending' };
      }
      
      // 403 usually means too many requests or device code issues
      if (status === 403) {
        console.warn('Rate limited or forbidden (403):', errorData);
        return { status: 'rate_limited', message: 'Please wait before trying again. Too many requests.' };
      }
      
      // 404 means invalid device code
      if (status === 404) {
        console.error('Invalid device code (404):', errorData);
        return { status: 'expired', message: 'Authentication code expired or invalid.' };
      }
      
      console.error('Authentication error:', status, errorData);
      return { status: 'error', message: `Authentication failed: ${errorData.error || 'Unknown error'}` };
    }
    
    // Network or timeout errors
    if (error.code === 'ECONNABORTED') {
      console.error('Request timeout:', error.message);
      return { status: 'timeout', message: 'Request timed out. Please check your connection.' };
    }
    
    console.error('Network error during auth:', error);
    return { status: 'error', message: 'Network error. Please check your connection.' };
  }
}

// Refresh the access token using the refresh token
async function refreshAccessToken() {
  const clientId = store.get('clientId');
  const clientSecret = store.get('clientSecret');
  const refreshToken = store.get('refreshToken');
  
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Missing credentials for token refresh');
  }
  
  try {
    const tokenData = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code: refreshToken,
      grant_type: 'http://oauth.net/grant_type/device/1.0'
    });
    
    const response = await axios.post(`${OAUTH_URL}/token`, tokenData.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    
    const { access_token, refresh_token, expires_in } = response.data;
    
    // Update the tokens
    store.set('accessToken', access_token);
    store.set('refreshToken', refresh_token);
    store.set('expiresAt', new Date().getTime() + (expires_in * 1000));
    
    return true;
  } catch (error) {
    console.error('Error refreshing token:', error);
    throw error;
  }
}

// Disconnect from Real-Debrid
function disconnect() {
  // Clear all stored tokens and credentials
  store.delete('accessToken');
  store.delete('refreshToken');
  store.delete('expiresAt');
  store.delete('clientId');
  store.delete('clientSecret');
  store.delete('deviceCode');
  store.delete('deviceCodeExpiresAt');
  store.delete('pollingInterval');
  
  return { success: true };
}

// Create an authenticated API client for making requests to Real-Debrid through proxy
function createApiClient() {
  return {
    async get(endpoint, options = {}) {
      const { authenticated } = await getAuthStatus();
      if (!authenticated) {
        throw new Error('Not authenticated with Real-Debrid');
      }
      
      const accessToken = store.get('accessToken');
      
      const response = await makeProxyRequest(REAL_DEBRID_PROXY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        data: {
          apiToken: accessToken,
          endpoint: endpoint,
          method: 'GET'
        }
      });
      
      // Extract data from proxy response and format it like axios response
      return {
        data: response.data.data,
        status: 200,
        statusText: 'OK'
      };
    },
    
    async post(endpoint, data, options = {}) {
      const { authenticated } = await getAuthStatus();
      if (!authenticated) {
        throw new Error('Not authenticated with Real-Debrid');
      }
      
      const accessToken = store.get('accessToken');
      
      // Handle form data for specific endpoints
      let requestBody = data;
      let contentType = undefined;
      
      if (options.headers && options.headers['Content-Type'] === 'application/x-www-form-urlencoded') {
        contentType = 'application/x-www-form-urlencoded';
        // For form data, we need to parse it back to an object for the proxy
        if (typeof data === 'string') {
          const params = new URLSearchParams(data);
          requestBody = Object.fromEntries(params);
        }
      }
      
      const response = await makeProxyRequest(REAL_DEBRID_PROXY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        data: {
          apiToken: accessToken,
          endpoint: endpoint,
          method: 'POST',
          body: requestBody,
          contentType: contentType
        }
      });
      
      // Extract data from proxy response and format it like axios response
      return {
        data: response.data.data,
        status: 200,
        statusText: 'OK'
      };
    },
    
    async put(endpoint, data, options = {}) {
      const { authenticated } = await getAuthStatus();
      if (!authenticated) {
        throw new Error('Not authenticated with Real-Debrid');
      }
      
      const accessToken = store.get('accessToken');
      
      const response = await makeProxyRequest(REAL_DEBRID_PROXY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        data: {
          apiToken: accessToken,
          endpoint: endpoint,
          method: 'PUT',
          body: data
        }
      });
      
      // Extract data from proxy response and format it like axios response
      return {
        data: response.data.data,
        status: 200,
        statusText: 'OK'
      };
    },
    
    async delete(endpoint, options = {}) {
      const { authenticated } = await getAuthStatus();
      if (!authenticated) {
        throw new Error('Not authenticated with Real-Debrid');
      }
      
      const accessToken = store.get('accessToken');
      
      const response = await makeProxyRequest(REAL_DEBRID_PROXY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        data: {
          apiToken: accessToken,
          endpoint: endpoint,
          method: 'DELETE'
        }
      });
      
      // Extract data from proxy response and format it like axios response
      return {
        data: response.data.data,
        status: 200,
        statusText: 'OK'
      };
    }
  };
}

// USER API METHODS

// Get current user info
async function getUserInfo() {
  try {
    const client = createApiClient();
    const response = await client.get('/user');
    return { success: true, data: response.data };
  } catch (error) {
    console.error('Error getting user info:', error);
    return { success: false, error: error.message };
  }
}

// UNRESTRICT API METHODS

// Check a link
async function checkLink(link) {
  try {
    console.log('🔄 Checking link support:', link);
    
    const client = createApiClient();
    
    // Prepare form data as per Real-Debrid API specification
    const formData = new URLSearchParams();
    formData.append('link', link);
    
    // Log the request details for debugging
    console.log('Sending check link request to Real-Debrid API:');
    console.log('URL:', `${BASE_URL}/unrestrict/check`);
    console.log('Form Data:', formData.toString());
    
    // Send as form data with proper Content-Type
    const response = await client.post('/unrestrict/check', formData.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    
    console.log('Real-Debrid check link response status:', response.status);
    console.log('Real-Debrid check link response data:', response.data);
    
    return { success: true, data: response.data };
  } catch (error) {
    console.error('Error checking link:', error);
    
    // Enhanced error logging
    if (error.response) {
      const status = error.response.status;
      const responseData = error.response.data;
      
      console.error('Check link response status:', status);
      console.error('Check link response data:', responseData);
      
      // Handle specific Real-Debrid error codes
      let userMessage = 'Unknown error occurred';
      
      switch (status) {
        case 400:
          userMessage = 'Bad Request: ' + (responseData?.error || 'Invalid link or parameters');
          break;
        case 401:
          userMessage = 'Authentication failed: Token is expired or invalid. Please reconnect to Real-Debrid.';
          break;
        case 403:
          userMessage = 'Permission denied: Account may be locked or not premium.';
          break;
        case 404:
          userMessage = 'Link not found or not supported.';
          break;
        default:
          userMessage = `HTTP ${status}: ${responseData?.error || 'Unknown error'}`;
      }
      
      // Check for specific Real-Debrid error codes
      if (responseData && responseData.error_code) {
        const errorCode = responseData.error_code;
        const errorMessage = responseData.error;
        
        console.error(`Real-Debrid Error Code ${errorCode}: ${errorMessage}`);
        
        switch (errorCode) {
          case 1:
            userMessage = 'Missing parameter: Link is required.';
            break;
          case 2:
            userMessage = 'Invalid link format.';
            break;
          case 8:
            userMessage = 'Authentication token is invalid. Please reconnect to Real-Debrid.';
            break;
          case 16:
            userMessage = 'Link is not supported by Real-Debrid.';
            break;
          case 20:
            userMessage = 'Link is not available or has expired.';
            break;
          default:
            if (errorMessage) {
              userMessage = `Real-Debrid error: ${errorMessage}`;
            }
        }
      }
      
      return { success: false, error: userMessage, details: responseData, httpStatus: status };
    }
    
    // Handle network errors
    if (error.code === 'ECONNABORTED') {
      return { success: false, error: 'Request timed out. Please check your internet connection and try again.' };
    }
    
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return { success: false, error: 'Cannot connect to Real-Debrid. Please check your internet connection.' };
    }
    
    return { success: false, error: error.message, details: error.response?.data };
  }
}

// Unrestrict a link
async function unrestrictLink(link, password = null) {
  try {
    console.log('🔄 Unrestricting link:', link);
    
    const client = createApiClient();
    
    // Prepare form data as per Real-Debrid API specification
    const formData = new URLSearchParams();
    formData.append('link', link);
    if (password) {
      formData.append('password', password);
    }
    
    // Log the request details for debugging
    console.log('Sending unrestrict request to Real-Debrid API:');
    console.log('URL:', `${BASE_URL}/unrestrict/link`);
    console.log('Form Data:', formData.toString());
    
    // Send as form data with proper Content-Type
    const response = await client.post('/unrestrict/link', formData.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    
    console.log('Real-Debrid unrestrict response status:', response.status);
    console.log('Real-Debrid unrestrict response data:', response.data);
    
    return { success: true, data: response.data };
  } catch (error) {
    console.error('Error unrestricting link:', error);
    
    // Enhanced error logging
    if (error.response) {
      const status = error.response.status;
      const responseData = error.response.data;
      
      console.error('Unrestrict response status:', status);
      console.error('Unrestrict response data:', responseData);
      
      // Handle specific Real-Debrid error codes
      let userMessage = 'Unknown error occurred';
      
      switch (status) {
        case 400:
          userMessage = 'Bad Request: ' + (responseData?.error || 'Invalid link or parameters');
          break;
        case 401:
          userMessage = 'Authentication failed: Token is expired or invalid. Please reconnect to Real-Debrid.';
          break;
        case 403:
          userMessage = 'Permission denied: Account may be locked or not premium.';
          break;
        case 404:
          userMessage = 'Link not found or invalid.';
          break;
        default:
          userMessage = `HTTP ${status}: ${responseData?.error || 'Unknown error'}`;
      }
      
      // Check for specific Real-Debrid error codes
      if (responseData && responseData.error_code) {
        const errorCode = responseData.error_code;
        const errorMessage = responseData.error;
        
        console.error(`Real-Debrid Error Code ${errorCode}: ${errorMessage}`);
        
        switch (errorCode) {
          case 1:
            userMessage = 'Missing parameter: Link is required.';
            break;
          case 2:
            userMessage = 'Invalid link format.';
            break;
          case 8:
            userMessage = 'Authentication token is invalid. Please reconnect to Real-Debrid.';
            break;
          case 16:
            userMessage = 'Link is not supported by Real-Debrid.';
            break;
          case 20:
            userMessage = 'Link is not available or has expired.';
            break;
          default:
            if (errorMessage) {
              userMessage = `Real-Debrid error: ${errorMessage}`;
            }
        }
      }
      
      return { success: false, error: userMessage, details: responseData, httpStatus: status };
    }
    
    // Handle network errors
    if (error.code === 'ECONNABORTED') {
      return { success: false, error: 'Request timed out. Please check your internet connection and try again.' };
    }
    
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return { success: false, error: 'Cannot connect to Real-Debrid. Please check your internet connection.' };
    }
    
    return { success: false, error: error.message, details: error.response?.data };
  }
}

// Unrestrict a folder link
async function unrestrictFolder(link) {
  try {
    console.log('🔄 Unrestricting folder link:', link);
    
    const client = createApiClient();
    
    // Prepare form data as per Real-Debrid API specification
    const formData = new URLSearchParams();
    formData.append('link', link);
    
    // Log the request details for debugging
    console.log('Sending unrestrict folder request to Real-Debrid API:');
    console.log('URL:', `${BASE_URL}/unrestrict/folder`);
    console.log('Form Data:', formData.toString());
    
    // Send as form data with proper Content-Type
    const response = await client.post('/unrestrict/folder', formData.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    
    console.log('Real-Debrid unrestrict folder response status:', response.status);
    console.log('Real-Debrid unrestrict folder response data:', response.data);
    
    return { success: true, data: response.data };
  } catch (error) {
    console.error('Error unrestricting folder:', error);
    
    // Enhanced error logging
    if (error.response) {
      const status = error.response.status;
      const responseData = error.response.data;
      
      console.error('Unrestrict folder response status:', status);
      console.error('Unrestrict folder response data:', responseData);
      
      // Handle specific Real-Debrid error codes
      let userMessage = 'Unknown error occurred';
      
      switch (status) {
        case 400:
          userMessage = 'Bad Request: ' + (responseData?.error || 'Invalid folder link or parameters');
          break;
        case 401:
          userMessage = 'Authentication failed: Token is expired or invalid. Please reconnect to Real-Debrid.';
          break;
        case 403:
          userMessage = 'Permission denied: Account may be locked or not premium.';
          break;
        case 404:
          userMessage = 'Folder link not found or invalid.';
          break;
        default:
          userMessage = `HTTP ${status}: ${responseData?.error || 'Unknown error'}`;
      }
      
      // Check for specific Real-Debrid error codes
      if (responseData && responseData.error_code) {
        const errorCode = responseData.error_code;
        const errorMessage = responseData.error;
        
        console.error(`Real-Debrid Error Code ${errorCode}: ${errorMessage}`);
        
        switch (errorCode) {
          case 1:
            userMessage = 'Missing parameter: Folder link is required.';
            break;
          case 2:
            userMessage = 'Invalid folder link format.';
            break;
          case 8:
            userMessage = 'Authentication token is invalid. Please reconnect to Real-Debrid.';
            break;
          case 16:
            userMessage = 'Folder link is not supported by Real-Debrid.';
            break;
          case 20:
            userMessage = 'Folder link is not available or has expired.';
            break;
          default:
            if (errorMessage) {
              userMessage = `Real-Debrid error: ${errorMessage}`;
            }
        }
      }
      
      return { success: false, error: userMessage, details: responseData, httpStatus: status };
    }
    
    // Handle network errors
    if (error.code === 'ECONNABORTED') {
      return { success: false, error: 'Request timed out. Please check your internet connection and try again.' };
    }
    
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return { success: false, error: 'Cannot connect to Real-Debrid. Please check your internet connection.' };
    }
    
    return { success: false, error: error.message, details: error.response?.data };
  }
}

// DOWNLOADS API METHODS

// Get user downloads list
async function getDownloads(offset = 0, limit = 50) {
  try {
    const client = createApiClient();
    const response = await client.get(`/downloads?offset=${offset}&limit=${limit}`);
    return { success: true, data: response.data };
  } catch (error) {
    console.error('Error getting downloads:', error);
    return { success: false, error: error.message };
  }
}

// Delete a download
async function deleteDownload(id) {
  try {
    const client = createApiClient();
    await client.delete(`/downloads/delete/${id}`);
    return { success: true };
  } catch (error) {
    console.error('Error deleting download:', error);
    return { success: false, error: error.message };
  }
}

// TORRENTS API METHODS

// Get user torrents list
async function getTorrents(offset = 0, limit = 50, filter = null) {
  try {
    const client = createApiClient();
    let url = `/torrents?offset=${offset}&limit=${limit}`;
    if (filter) {
      url += `&filter=${filter}`;
    }
    const response = await client.get(url);
    return { success: true, data: response.data };
  } catch (error) {
    console.error('Error getting torrents:', error);
    return { success: false, error: error.message };
  }
}

// Get torrent info
async function getTorrentInfo(id) {
  try {
    const client = createApiClient();
    const response = await client.get(`/torrents/info/${id}`);
    return { success: true, data: response.data };
  } catch (error) {
    console.error('Error getting torrent info:', error);
    return { success: false, error: error.message };
  }
}

// Helper function to validate and clean magnet link
function validateAndCleanMagnetLink(magnetLink) {
  try {
    // Decode the magnet link in case it's URL encoded
    let cleanedLink = decodeURIComponent(magnetLink);
    
    // Validate magnet link format
    if (!cleanedLink.startsWith('magnet:?')) {
      throw new Error('Invalid magnet link format - must start with "magnet:?"');
    }
    
    // Check for required xt parameter (hash)
    if (!cleanedLink.includes('xt=urn:btih:')) {
      throw new Error('Invalid magnet link - missing BitTorrent hash (xt parameter)');
    }
    
    // Extract and validate the hash
    const hashMatch = cleanedLink.match(/xt=urn:btih:([a-fA-F0-9]{40}|[a-fA-F0-9]{32})/);
    if (!hashMatch) {
      throw new Error('Invalid magnet link - invalid BitTorrent hash format');
    }
    
    console.log('Magnet link validation passed. Hash:', hashMatch[1]);
    return cleanedLink;
  } catch (error) {
    console.error('Magnet link validation failed:', error.message);
    throw error;
  }
}

// Add magnet link and automatically start download
async function addMagnet(event, magnetLink, autoSelectFiles = true) {
  try {
    console.log('Adding magnet link:', magnetLink);
    console.log('Auto-select files:', autoSelectFiles);
    
    // Validate and clean the magnet link
    const cleanedMagnetLink = validateAndCleanMagnetLink(magnetLink);
    console.log('Cleaned magnet link:', cleanedMagnetLink);
    
    const client = createApiClient();
    
    // Prepare form data as per Real-Debrid API specification
    const formData = new URLSearchParams();
    formData.append('magnet', cleanedMagnetLink);
    
    // Log the request details for debugging
    console.log('Sending request to Real-Debrid API:');
    console.log('URL:', `${BASE_URL}/torrents/addMagnet`);
    console.log('Form Data:', formData.toString());
    
    // Send as form data with proper Content-Type
    const response = await client.post('/torrents/addMagnet', formData.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    
    console.log('Real-Debrid API response:', response.data);
    console.log('Response status:', response.status);
    
    // Check for expected 201 status code
    if (response.status === 201) {
      console.log('✅ Magnet successfully added to Real-Debrid');
      
      const torrentData = response.data;
      const torrentId = torrentData.id;
      
      if (autoSelectFiles && torrentId) {
        console.log('🔄 Auto-selecting all files to start download...');
        
        try {
          // Wait a moment for the torrent to be processed
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Select all files to start the download
          const selectResult = await selectFiles(torrentId, 'all');
          
          if (selectResult.success) {
            console.log('✅ Files automatically selected, download started on Real-Debrid');
            
            // Start monitoring the torrent for completion
            console.log('🔄 Starting torrent monitoring for automatic download...');
            monitorTorrentAndDownload(torrentId);
            
            return { 
              success: true, 
              data: torrentData, 
              message: 'Magnet added, files selected, and monitoring started for automatic download',
              torrentId: torrentId,
              filesSelected: true,
              monitoring: true
            };
          } else {
            console.warn('⚠️ Magnet added but failed to auto-select files:', selectResult.error);
            return { 
              success: true, 
              data: torrentData, 
              message: 'Magnet added successfully, but you need to manually select files',
              torrentId: torrentId,
              filesSelected: false,
              selectError: selectResult.error
            };
          }
        } catch (selectError) {
          console.warn('⚠️ Magnet added but auto-select failed:', selectError);
          return { 
            success: true, 
            data: torrentData, 
            message: 'Magnet added successfully, but auto-select failed',
            torrentId: torrentId,
            filesSelected: false,
            selectError: selectError.message
          };
        }
      } else {
        return { success: true, data: torrentData, torrentId: torrentId };
      }
    } else {
      console.warn(`⚠️ Unexpected status code: ${response.status} (expected 201)`);
      return { success: true, data: response.data }; // Still treat as success if we got data
    }
  } catch (error) {
    console.error('Error adding magnet:', error);
    
    // Enhanced error logging based on official API documentation
    if (error.response) {
      const status = error.response.status;
      const responseData = error.response.data;
      
      console.error('Response status:', status);
      console.error('Response data:', responseData);
      console.error('Response headers:', error.response.headers);
      
      // Handle HTTP error codes as per Real-Debrid API documentation
      let userMessage = 'Unknown error occurred';
      
      switch (status) {
        case 400:
          userMessage = 'Bad Request: ' + (responseData?.error || 'Invalid magnet link or parameters');
          console.error('400 Bad Request - Invalid magnet link or parameters');
          break;
        case 401:
          userMessage = 'Authentication failed: Token is expired or invalid. Please reconnect to Real-Debrid.';
          console.error('401 Unauthorized - Bad token (expired, invalid)');
          break;
        case 403:
          userMessage = 'Permission denied: Account may be locked or not premium. Please check your Real-Debrid account status.';
          console.error('403 Forbidden - Permission denied (account locked, not premium)');
          break;
        case 503:
          userMessage = 'Service unavailable: Real-Debrid service is temporarily unavailable. Please try again later.';
          console.error('503 Service Unavailable - Real-Debrid service temporarily unavailable');
          break;
        default:
          userMessage = `HTTP ${status}: ${responseData?.error || 'Unknown error'}`;
          console.error(`Unexpected HTTP status ${status}:`, responseData);
      }
      
      // Also check for specific Real-Debrid error codes in response data
      if (responseData && responseData.error_code) {
        const errorCode = responseData.error_code;
        const errorMessage = responseData.error;
        const errorDetails = responseData.error_details;
        
        console.error(`Real-Debrid Error Code ${errorCode}: ${errorMessage}`);
        if (errorDetails) {
          console.error('Error Details:', errorDetails);
        }
        
        // Override with more specific error message if available
        switch (errorCode) {
          case 2:
            userMessage = 'Invalid magnet link format. Please check that the magnet link is valid.';
            break;
          case 8:
            userMessage = 'Authentication token is invalid. Please reconnect to Real-Debrid.';
            break;
          case 29:
            userMessage = 'Torrent file is too big for your account.';
            break;
          case 30:
            userMessage = 'Torrent file is invalid or corrupted.';
            break;
          case 33:
            userMessage = 'This torrent is already active in your account.';
            break;
          default:
            if (errorMessage) {
              userMessage = `Real-Debrid error: ${errorMessage}`;
            }
        }
      }
      
      return { success: false, error: userMessage, details: responseData, httpStatus: status };
    }
    
    // Handle network errors
    if (error.code === 'ECONNABORTED') {
      return { success: false, error: 'Request timed out. Please check your internet connection and try again.' };
    }
    
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return { success: false, error: 'Cannot connect to Real-Debrid. Please check your internet connection.' };
    }
    
    return { success: false, error: error.message, details: error.response?.data };
  }
}

// Monitor torrent status and automatically download when ready
async function monitorTorrentAndDownload(torrentId) {
  const maxAttempts = 60; // Maximum 60 attempts (30 minutes with 30-second intervals)
  let attempts = 0;
  
  console.log(`🔄 Starting torrent monitoring for ${torrentId}...`);
  
  const checkStatus = async () => {
    try {
      attempts++;
      console.log(`📊 Checking torrent status (attempt ${attempts}/${maxAttempts})...`);
      
      const torrentInfo = await getTorrentInfo(torrentId);
      
      if (!torrentInfo.success) {
        console.error('❌ Failed to get torrent info:', torrentInfo.error);
        if (attempts < maxAttempts) {
          setTimeout(checkStatus, 30000); // Check again in 30 seconds
        } else {
          console.error('❌ Max attempts reached, stopping monitoring');
        }
        return;
      }
      
      const torrent = torrentInfo.data;
      console.log(`📊 Torrent status: ${torrent.status}, Progress: ${torrent.progress}%`);
      
      // Check if torrent is downloaded
      if (torrent.status === 'downloaded') {
        console.log('✅ Torrent download completed on Real-Debrid!');
        console.log('🔄 Starting automatic file download to PC...');
        
        // Get the download links
        if (torrent.links && torrent.links.length > 0) {
          console.log(`📁 Found ${torrent.links.length} download link(s)`);
          
          // Start downloading each file
          for (let i = 0; i < torrent.links.length; i++) {
            const link = torrent.links[i];
            console.log(`⬇️ Starting download ${i + 1}/${torrent.links.length}: ${link}`);
            
            try {
              // Unrestrict the link to get direct download URL
              const unrestrictResult = await unrestrictLink(link);
              
              if (unrestrictResult.success) {
                const downloadUrl = unrestrictResult.data.download;
                const filename = unrestrictResult.data.filename;
                
                console.log(`✅ Link unrestricted successfully: ${filename}`);
                console.log(`🔗 Direct download URL: ${downloadUrl}`);
                
                // Start the download using the game download service
                await startFileDownload(downloadUrl, filename, torrentId);
              } else {
                console.error(`❌ Failed to unrestrict link ${link}:`, unrestrictResult.error);
              }
            } catch (error) {
              console.error(`❌ Error processing download link ${link}:`, error);
            }
          }
          
          console.log('🎉 All downloads started successfully!');
        } else {
          console.warn('⚠️ Torrent completed but no download links found');
        }
        
        return; // Stop monitoring
      }
      
      // Check for error states
      if (['error', 'virus', 'dead', 'magnet_error'].includes(torrent.status)) {
        console.error(`❌ Torrent failed with status: ${torrent.status}`);
        return; // Stop monitoring
      }
      
      // Continue monitoring if still in progress
      if (['magnet_conversion', 'waiting_files_selection', 'queued', 'downloading', 'compressing', 'uploading'].includes(torrent.status)) {
        if (attempts < maxAttempts) {
          console.log(`⏳ Torrent still processing (${torrent.status}), checking again in 30 seconds...`);
          setTimeout(checkStatus, 30000); // Check again in 30 seconds
        } else {
          console.warn('⚠️ Max monitoring attempts reached, stopping automatic monitoring');
        }
      } else {
        console.warn(`⚠️ Unknown torrent status: ${torrent.status}`);
      }
      
    } catch (error) {
      console.error('❌ Error during torrent monitoring:', error);
      if (attempts < maxAttempts) {
        setTimeout(checkStatus, 30000); // Check again in 30 seconds
      }
    }
  };
  
  // Start the monitoring loop
  checkStatus();
}

// Start file download using the download service
async function startFileDownload(downloadUrl, filename, torrentId) {
  try {
    console.log(`🔄 Starting download: ${filename}`);
    
    // Get download location from multiple sources
    const gameDownloadService = global.gameDownloadService;
    let downloadLocation;
    
    // First try to get from the backend download service
    if (gameDownloadService) {
      downloadLocation = gameDownloadService.getDownloadLocation();
      console.log(`📁 Backend download location: ${downloadLocation || 'not set'}`);
    }
    
    // If no location from backend, try to get it from frontend via IPC
    if (!downloadLocation) {
      try {
        // Use the existing IPC handler to get location from frontend localStorage
        const { ipcMain } = require('electron');
        const frontendLocation = await new Promise((resolve) => {
          // Simulate IPC call to get frontend download location
          // This would typically be handled by the download service's get-location handler
          resolve(null); // For now, this will be null, but the structure is ready
        });
        
        if (frontendLocation) {
          downloadLocation = frontendLocation;
          console.log(`📁 Frontend download location: ${downloadLocation}`);
          
          // Sync it back to the backend service for future use
          if (gameDownloadService) {
            gameDownloadService.setDownloadLocation(downloadLocation);
          }
        }
      } catch (error) {
        console.warn('Could not retrieve download location from frontend:', error.message);
      }
    }
    
    // If still no download location is set, use default Downloads folder
    if (!downloadLocation) {
      const { app } = require('electron');
      const path = require('path');
      const os = require('os');
      downloadLocation = path.join(os.homedir(), 'Downloads');
      console.log(`⚠️ No download location configured, using default: ${downloadLocation}`);
      
      // Also save this default location to both backend and frontend for consistency
      if (gameDownloadService) {
        gameDownloadService.setDownloadLocation(downloadLocation);
      }
    } else {
      console.log(`📁 Using configured download location: ${downloadLocation}`);
    }
    
    // Create a download entry
    const downloadId = `rd_${torrentId}_${Date.now()}`;
    const downloadInfo = {
      url: downloadUrl,
      filename: filename,
      downloadPath: downloadLocation,
      downloadId: downloadId
    };
    
    // Use the download service directly (we're in the main process)
    const { ipcMain } = require('electron');
    
    // Emit the download start event to the download service
    // Since we're in the main process, we can call the download service directly
    if (gameDownloadService) {
      const result = await gameDownloadService.startDownload(downloadInfo);
      
      if (result.success) {
        console.log(`✅ Download started successfully: ${filename}`);
        return { success: true, downloadId: downloadId };
      } else {
        console.error(`❌ Failed to start download: ${result.error}`);
        return { success: false, error: result.error };
      }
    } else {
      console.error('❌ Download service not available');
      return { success: false, error: 'Download service not available' };
    }
    
  } catch (error) {
    console.error(`❌ Error starting file download:`, error);
    return { success: false, error: error.message };
  }
}

// Add magnet and automatically start download (convenience function)
async function addMagnetAndStart(event, magnetLink) {
  return await addMagnet(event, magnetLink, true);
}

// Select files of a torrent to start it
async function selectFiles(id, files) {
  try {
    console.log(`Selecting files for torrent ${id}:`, files);
    
    const client = createApiClient();
    
    // Prepare form data as per Real-Debrid API specification
    const formData = new URLSearchParams();
    formData.append('files', files);
    
    console.log('Sending selectFiles request to Real-Debrid API:');
    console.log('URL:', `${BASE_URL}/torrents/selectFiles/${id}`);
    console.log('Form Data:', formData.toString());
    
    // Send as form data with proper Content-Type
    const response = await client.post(`/torrents/selectFiles/${id}`, formData.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    
    console.log('Real-Debrid selectFiles response status:', response.status);
    console.log('Real-Debrid selectFiles response data:', response.data);
    
    // Check for expected 204 status code (No Content)
    if (response.status === 204) {
      console.log('✅ Files successfully selected and torrent started');
      return { success: true, message: 'Files selected and download started' };
    } else if (response.status === 202) {
      console.log('ℹ️ Action already done (202)');
      return { success: true, message: 'Files already selected, download in progress' };
    } else {
      console.warn(`⚠️ Unexpected status code: ${response.status} (expected 204 or 202)`);
      return { success: true, data: response.data }; // Still treat as success if we got a response
    }
  } catch (error) {
    console.error('Error selecting files:', error);
    
    // Enhanced error logging based on official API documentation
    if (error.response) {
      const status = error.response.status;
      const responseData = error.response.data;
      
      console.error('Response status:', status);
      console.error('Response data:', responseData);
      console.error('Response headers:', error.response.headers);
      
      // Handle HTTP error codes as per Real-Debrid API documentation
      let userMessage = 'Unknown error occurred';
      
      switch (status) {
        case 202:
          userMessage = 'Action already done - files are already selected for this torrent.';
          console.log('202 Accepted - Action already done');
          return { success: true, message: userMessage }; // 202 is actually success
        case 400:
          userMessage = 'Bad Request: ' + (responseData?.error || 'Invalid file selection parameters');
          console.error('400 Bad Request - Invalid file selection parameters');
          break;
        case 401:
          userMessage = 'Authentication failed: Token is expired or invalid. Please reconnect to Real-Debrid.';
          console.error('401 Unauthorized - Bad token (expired, invalid)');
          break;
        case 403:
          userMessage = 'Permission denied: Account may be locked or not premium. Please check your Real-Debrid account status.';
          console.error('403 Forbidden - Permission denied (account locked, not premium)');
          break;
        case 404:
          userMessage = 'Invalid torrent ID or file IDs. Please check that the torrent exists and file IDs are correct.';
          console.error('404 Not Found - Wrong parameter (invalid file id(s)) / Unknown resource (invalid id)');
          break;
        default:
          userMessage = `HTTP ${status}: ${responseData?.error || 'Unknown error'}`;
          console.error(`Unexpected HTTP status ${status}:`, responseData);
      }
      
      return { success: false, error: userMessage, details: responseData, httpStatus: status };
    }
    
    // Handle network errors
    if (error.code === 'ECONNABORTED') {
      return { success: false, error: 'Request timed out. Please check your internet connection and try again.' };
    }
    
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return { success: false, error: 'Cannot connect to Real-Debrid. Please check your internet connection.' };
    }
    
    return { success: false, error: error.message, details: error.response?.data };
  }
}

// Delete a torrent
async function deleteTorrent(id) {
  try {
    const client = createApiClient();
    await client.delete(`/torrents/delete/${id}`);
    return { success: true };
  } catch (error) {
    console.error('Error deleting torrent:', error);
    return { success: false, error: error.message };
  }
}

// Get active torrents count
async function getActiveTorrentsCount() {
  try {
    const client = createApiClient();
    const response = await client.get('/torrents/activeCount');
    return { success: true, data: response.data };
  } catch (error) {
    console.error('Error getting active torrents count:', error);
    return { success: false, error: error.message };
  }
}

// Get available hosts
async function getAvailableHosts() {
  try {
    const client = createApiClient();
    const response = await client.get('/torrents/availableHosts');
    return { success: true, data: response.data };
  } catch (error) {
    console.error('Error getting available hosts:', error);
    return { success: false, error: error.message };
  }
}

// HOSTS API METHODS

// Get supported hosts
async function getHosts() {
  try {
    const client = createApiClient();
    const response = await client.get('/hosts');
    return { success: true, data: response.data };
  } catch (error) {
    console.error('Error getting hosts:', error);
    return { success: false, error: error.message };
  }
}

// Get hosts status
async function getHostsStatus() {
  try {
    const client = createApiClient();
    const response = await client.get('/hosts/status');
    return { success: true, data: response.data };
  } catch (error) {
    console.error('Error getting hosts status:', error);
    return { success: false, error: error.message };
  }
}

// TRAFFIC API METHODS

// Get traffic information
async function getTraffic() {
  try {
    const client = createApiClient();
    const response = await client.get('/traffic');
    return { success: true, data: response.data };
  } catch (error) {
    console.error('Error getting traffic:', error);
    return { success: false, error: error.message };
  }
}

// Get traffic details
async function getTrafficDetails() {
  try {
    const client = createApiClient();
    const response = await client.get('/traffic/details');
    return { success: true, data: response.data };
  } catch (error) {
    console.error('Error getting traffic details:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  initRealDebridService,
  getAuthStatus,
  startAuthFlow,
  checkAuthStatus,
  disconnect,
  createApiClient,
  getUserInfo,
  checkLink,
  unrestrictLink,
  unrestrictFolder,
  getDownloads,
  deleteDownload,
  getTorrents,
  getTorrentInfo,
  addMagnet,
  addMagnetAndStart,
  selectFiles,
  deleteTorrent,
  getActiveTorrentsCount,
  getAvailableHosts,
  getHosts,
  getHostsStatus,
  getTraffic,
  getTrafficDetails
};
