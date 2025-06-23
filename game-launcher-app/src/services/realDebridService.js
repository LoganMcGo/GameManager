const { ipcMain } = require('electron');
const { makeProxyRequest } = require('./jwtService');

// Cloud function URL for Real-Debrid proxy
const REAL_DEBRID_PROXY_URL = 'https://us-central1-gamemanagerproxy.cloudfunctions.net/real-debrid-proxy';

// Initialize the service
function initRealDebridService() {
  // Register IPC handlers for renderer process to communicate with this service
  ipcMain.handle('real-debrid:get-auth-status', getAuthStatus);
  ipcMain.handle('real-debrid:get-user-info', getUserInfo);
  
  // Unrestrict API handlers
  ipcMain.handle('real-debrid:check-link', (event, link) => checkLink(link));
  ipcMain.handle('real-debrid:unrestrict-link', (event, link, password) => unrestrictLink(link, password));
  ipcMain.handle('real-debrid:unrestrict-folder', (event, link) => unrestrictFolder(link));
  
  // Downloads API handlers
  ipcMain.handle('real-debrid:get-downloads', (event, offset = 0, limit = 50) => getDownloads(offset, limit));
  ipcMain.handle('real-debrid:delete-download', (event, id) => deleteDownload(id));
  
  // Torrents API handlers
  ipcMain.handle('real-debrid:get-torrents', (event, offset = 0, limit = 50, filter = null) => getTorrents(offset, limit, filter));
  ipcMain.handle('real-debrid:get-torrent-info', (event, id) => getTorrentInfo(id));
  ipcMain.handle('real-debrid:add-magnet', (event, magnetLink, autoSelectFiles = true) => addMagnet(event, magnetLink, autoSelectFiles));
  ipcMain.handle('real-debrid:add-magnet-and-start', (event, magnetLink) => addMagnetAndStart(event, magnetLink));
  ipcMain.handle('real-debrid:select-files', (event, id, files) => selectFiles(id, files));
  ipcMain.handle('real-debrid:delete-torrent', (event, id) => deleteTorrent(id));
  ipcMain.handle('real-debrid:get-active-count', getActiveTorrentsCount);
  ipcMain.handle('real-debrid:get-available-hosts', getAvailableHosts);
  
  // Hosts API handlers
  ipcMain.handle('real-debrid:get-hosts', getHosts);
  ipcMain.handle('real-debrid:get-hosts-status', getHostsStatus);
  
  // Traffic API handlers
  ipcMain.handle('real-debrid:get-traffic', getTraffic);
  ipcMain.handle('real-debrid:get-traffic-details', getTrafficDetails);
  
  console.log('Real-Debrid service initialized with automatic proxy authentication');
}

// Always return authenticated since we use proxy with stored token
async function getAuthStatus() {
  return { authenticated: true };
}

// Make a proxy request to Real-Debrid API
async function makeRealDebridRequest(endpoint, method = 'GET', body = null, contentType = null) {
  try {
      const response = await makeProxyRequest(REAL_DEBRID_PROXY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        data: {
          endpoint: endpoint,
        method: method,
        body: body,
          contentType: contentType
        }
      });
      
      return {
      success: true,
      data: response.data.data
    };
  } catch (error) {
    console.error('Real-Debrid proxy request failed:', error);
    
    if (error.response?.status === 503) {
      return { success: false, error: 'Real-Debrid service not configured. Please contact administrator.' };
    }
    
      return {
      success: false, 
      error: error.response?.data?.error || error.message || 'Unknown error occurred' 
      };
    }
}

// Get user info
async function getUserInfo() {
  return await makeRealDebridRequest('/user');
}

// Check a link
async function checkLink(link) {
  const formData = { link: link };
  return await makeRealDebridRequest('/unrestrict/check', 'POST', formData, 'application/x-www-form-urlencoded');
}

// Unrestrict a link
async function unrestrictLink(link, password = null) {
  const formData = { link: link };
    if (password) {
    formData.password = password;
  }
  return await makeRealDebridRequest('/unrestrict/link', 'POST', formData, 'application/x-www-form-urlencoded');
}

// Unrestrict a folder link
async function unrestrictFolder(link) {
  const formData = { link: link };
  return await makeRealDebridRequest('/unrestrict/folder', 'POST', formData, 'application/x-www-form-urlencoded');
}

// Get downloads
async function getDownloads(offset = 0, limit = 50) {
  return await makeRealDebridRequest(`/downloads?offset=${offset}&limit=${limit}`);
}

// Delete download
async function deleteDownload(id) {
  return await makeRealDebridRequest(`/downloads/delete/${id}`, 'DELETE');
}

// Get torrents
async function getTorrents(offset = 0, limit = 50, filter = null) {
    let url = `/torrents?offset=${offset}&limit=${limit}`;
    if (filter) {
      url += `&filter=${filter}`;
    }
  return await makeRealDebridRequest(url);
}

// Get torrent info
async function getTorrentInfo(id) {
  return await makeRealDebridRequest(`/torrents/info/${id}`);
}

// Add magnet
async function addMagnet(event, magnetLink, autoSelectFiles = true) {
  try {
    const formData = { magnet: magnetLink };
    const result = await makeRealDebridRequest('/torrents/addMagnet', 'POST', formData, 'application/x-www-form-urlencoded');
    
    if (!result.success) {
      return result;
    }
    
    const torrentId = result.data.id;
    
    if (autoSelectFiles) {
      // Get torrent info to see available files
      const infoResult = await getTorrentInfo(torrentId);
      if (infoResult.success && infoResult.data.files) {
        // Select all files
        const fileIds = infoResult.data.files.map(file => file.id).join(',');
        await selectFiles(torrentId, fileIds);
      }
    }
    
    return result;
  } catch (error) {
    console.error('Error adding magnet:', error);
    return { success: false, error: error.message };
  }
}

// Add magnet and start
async function addMagnetAndStart(event, magnetLink) {
  return await addMagnet(event, magnetLink, true);
}

// Select files
async function selectFiles(id, files) {
  const formData = { files: files };
  return await makeRealDebridRequest(`/torrents/selectFiles/${id}`, 'POST', formData, 'application/x-www-form-urlencoded');
}

// Delete torrent
async function deleteTorrent(id) {
  return await makeRealDebridRequest(`/torrents/delete/${id}`, 'DELETE');
}

// Get active torrents count
async function getActiveTorrentsCount() {
  return await makeRealDebridRequest('/torrents/activeCount');
}

// Get available hosts
async function getAvailableHosts() {
  return await makeRealDebridRequest('/torrents/availableHosts');
}

// Get hosts
async function getHosts() {
  return await makeRealDebridRequest('/hosts');
}

// Get hosts status
async function getHostsStatus() {
  return await makeRealDebridRequest('/hosts/status');
}

// Get traffic
async function getTraffic() {
  return await makeRealDebridRequest('/traffic');
}

// Get traffic details
async function getTrafficDetails() {
  return await makeRealDebridRequest('/traffic/details');
}

module.exports = {
  initRealDebridService,
  getAuthStatus,
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
