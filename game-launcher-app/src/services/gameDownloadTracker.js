const { ipcMain } = require('electron');
const Store = require('electron-store');

// Store for tracking game downloads
const downloadStore = new Store({
  name: 'game-downloads',
  defaults: {
    downloads: {}
  }
});

// Download status constants
const DOWNLOAD_STATUS = {
  ADDING_TO_DEBRID: 'adding_to_debrid',
  STARTING_TORRENT: 'starting_torrent',
  TORRENT_DOWNLOADING: 'torrent_downloading',
  FILE_READY: 'file_ready',
  STARTING_DOWNLOAD: 'starting_download',
  DOWNLOADING: 'downloading',
  COMPLETE: 'complete',
  ERROR: 'error'
};

// Status display messages
const STATUS_MESSAGES = {
  [DOWNLOAD_STATUS.ADDING_TO_DEBRID]: 'Adding to Real-Debrid...',
  [DOWNLOAD_STATUS.STARTING_TORRENT]: 'Starting torrent...',
  [DOWNLOAD_STATUS.TORRENT_DOWNLOADING]: 'Torrent downloading...',
  [DOWNLOAD_STATUS.FILE_READY]: 'File Ready, Starting Download...',
  [DOWNLOAD_STATUS.STARTING_DOWNLOAD]: 'Starting download...',
  [DOWNLOAD_STATUS.DOWNLOADING]: 'Downloading...',
  [DOWNLOAD_STATUS.COMPLETE]: 'Complete',
  [DOWNLOAD_STATUS.ERROR]: 'Error'
};

// Active monitoring intervals
const monitoringIntervals = new Map();

// Initialize the service
function initGameDownloadTracker() {
  // Register IPC handlers
  ipcMain.handle('download-tracker:get-downloads', getTrackedDownloads);
  ipcMain.handle('download-tracker:remove-download', removeTrackedDownload);
  ipcMain.handle('download-tracker:clear-completed', clearCompletedDownloads);
  ipcMain.handle('download-tracker:start-tracking', handleStartTracking);
  ipcMain.handle('download-tracker:update-status', handleUpdateStatus);
  
  console.log('Game Download Tracker service initialized');
}

// IPC handler for starting tracking
function handleStartTracking(event, trackingData) {
  const { game, magnetLink, torrentName } = trackingData;
  return startTracking(game, magnetLink, null, torrentName);
}

// IPC handler for updating status
function handleUpdateStatus(event, downloadId, status, data) {
  updateDownloadStatus(downloadId, status, data);
  return { success: true };
}

// Start tracking a new game download
function startTracking(gameData, magnetLink, torrentId = null, torrentName = null) {
  const downloadId = `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const download = {
    id: downloadId,
    gameId: gameData.id,
    gameName: gameData.name,
    gameImage: gameData.cover?.url || gameData.artworks?.[0]?.url || null,
    magnetLink: magnetLink,
    torrentId: torrentId,
    torrentName: torrentName || gameData.name,
    status: DOWNLOAD_STATUS.ADDING_TO_DEBRID,
    statusMessage: STATUS_MESSAGES[DOWNLOAD_STATUS.ADDING_TO_DEBRID],
    progress: 0,
    downloadedBytes: 0,
    totalBytes: 0,
    downloadSpeed: 0,
    startTime: Date.now(),
    lastUpdated: Date.now(),
    error: null,
    realDebridDownloadId: null,
    localDownloadId: null
  };
  
  // Store the download
  const downloads = downloadStore.get('downloads', {});
  downloads[downloadId] = download;
  downloadStore.set('downloads', downloads);
  
  // Start monitoring this download
  startMonitoring(downloadId);
  
  console.log(`Started tracking download for game: ${gameData.name}`);
  return downloadId;
}

// Update download status
function updateDownloadStatus(downloadId, status, data = {}) {
  const downloads = downloadStore.get('downloads', {});
  const download = downloads[downloadId];
  
  if (!download) {
    console.error(`Download ${downloadId} not found for status update`);
    return;
  }
  
  // Update basic status
  download.status = status;
  download.statusMessage = STATUS_MESSAGES[status] || status;
  download.lastUpdated = Date.now();
  
  // Update additional data
  Object.assign(download, data);
  
  // Save updates
  downloads[downloadId] = download;
  downloadStore.set('downloads', downloads);
  
  console.log(`Updated download ${downloadId} status: ${status}`);
  
  // Emit update to UI
  if (global.mainWindow) {
    global.mainWindow.webContents.send('download-tracker:update', download);
  }
}

// Start monitoring a download
async function startMonitoring(downloadId) {
  if (monitoringIntervals.has(downloadId)) {
    clearInterval(monitoringIntervals.get(downloadId));
  }
  
  const interval = setInterval(async () => {
    await monitorDownloadProgress(downloadId);
  }, 2000); // Check every 2 seconds
  
  monitoringIntervals.set(downloadId, interval);
}

// Monitor download progress
async function monitorDownloadProgress(downloadId) {
  try {
    const downloads = downloadStore.get('downloads', {});
    const download = downloads[downloadId];
    
    if (!download || download.status === DOWNLOAD_STATUS.COMPLETE || download.status === DOWNLOAD_STATUS.ERROR) {
      stopMonitoring(downloadId);
      return;
    }
    
    const realDebridService = require('./realDebridService');
    
    // Check torrent status if we have a torrent ID
    if (download.torrentId && download.status !== DOWNLOAD_STATUS.DOWNLOADING) {
      const torrentInfo = await realDebridService.getTorrentInfo(download.torrentId);
      
      if (torrentInfo.success) {
        const torrent = torrentInfo.data;
        
        switch (torrent.status) {
          case 'magnet_conversion':
            updateDownloadStatus(downloadId, DOWNLOAD_STATUS.STARTING_TORRENT);
            break;
            
          case 'waiting_files_selection':
            updateDownloadStatus(downloadId, DOWNLOAD_STATUS.STARTING_TORRENT);
            break;
            
          case 'queued':
          case 'downloading':
            updateDownloadStatus(downloadId, DOWNLOAD_STATUS.TORRENT_DOWNLOADING, {
              progress: torrent.progress || 0
            });
            break;
            
          case 'downloaded':
            updateDownloadStatus(downloadId, DOWNLOAD_STATUS.FILE_READY);
            // Start local download
            setTimeout(() => startLocalDownload(downloadId, torrent), 1000);
            break;
            
          case 'error':
          case 'virus':
          case 'dead':
            updateDownloadStatus(downloadId, DOWNLOAD_STATUS.ERROR, {
              error: `Torrent failed: ${torrent.status}`
            });
            break;
        }
      }
    }
    
    // Check local download progress if we have a local download ID
    if (download.localDownloadId && download.status === DOWNLOAD_STATUS.DOWNLOADING) {
      // This would integrate with your existing download service
      // For now, we'll simulate progress
      const localProgress = await getLocalDownloadProgress(download.localDownloadId);
      if (localProgress) {
        updateDownloadStatus(downloadId, DOWNLOAD_STATUS.DOWNLOADING, {
          progress: localProgress.progress,
          downloadedBytes: localProgress.downloadedBytes,
          totalBytes: localProgress.totalBytes,
          downloadSpeed: localProgress.speed
        });
        
        if (localProgress.progress >= 100) {
          updateDownloadStatus(downloadId, DOWNLOAD_STATUS.COMPLETE);
        }
      }
    }
    
  } catch (error) {
    console.error(`Error monitoring download ${downloadId}:`, error);
    updateDownloadStatus(downloadId, DOWNLOAD_STATUS.ERROR, {
      error: error.message
    });
  }
}

// Start local download from Real-Debrid
async function startLocalDownload(downloadId, torrentData) {
  try {
    updateDownloadStatus(downloadId, DOWNLOAD_STATUS.STARTING_DOWNLOAD);
    
    if (torrentData.links && torrentData.links.length > 0) {
      const realDebridService = require('./realDebridService');
      
      // Unrestrict the first link to get direct download URL
      const unrestrictResult = await realDebridService.unrestrictLink(torrentData.links[0]);
      
      if (unrestrictResult.success) {
        const directUrl = unrestrictResult.data.download;
        const filename = unrestrictResult.data.filename;
        
        // Start local download using the download service
        const localDownloadId = await startLocalDownloadProcess(downloadId, directUrl, filename);
        
        updateDownloadStatus(downloadId, DOWNLOAD_STATUS.DOWNLOADING, {
          localDownloadId: localDownloadId,
          realDebridDownloadId: unrestrictResult.data.id
        });
      } else {
        throw new Error('Failed to unrestrict download link');
      }
    } else {
      throw new Error('No download links available');
    }
  } catch (error) {
    console.error(`Error starting local download for ${downloadId}:`, error);
    updateDownloadStatus(downloadId, DOWNLOAD_STATUS.ERROR, {
      error: error.message
    });
  }
}

// Start local download process using the download service
async function startLocalDownloadProcess(gameDownloadId, url, filename) {
  try {
    // Get the download info
    const downloads = downloadStore.get('downloads', {});
    const download = downloads[gameDownloadId];
    
    if (!download) {
      throw new Error('Download not found');
    }
    
    // Get download location from the global download service
    const downloadService = global.gameDownloadService;
    if (!downloadService) {
      throw new Error('Download service not initialized');
    }
    
    const downloadLocation = downloadService.getDownloadLocation();
    
    if (!downloadLocation) {
      throw new Error('Download location not set. Please configure in settings.');
    }
    
    // Create local download ID
    const localDownloadId = `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Start the download
    const downloadInfo = {
      url: url,
      filename: filename,
      downloadPath: downloadLocation,
      downloadId: localDownloadId,
      gameInfo: {
        gameId: download.gameId,
        gameName: download.gameName
      },
      autoExtract: true // Enable auto-extraction for game downloads
    };
    
    const result = await downloadService.startDownloadWithExtraction(downloadInfo);
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to start download');
    }
    
    console.log(`Started local download: ${filename} (ID: ${localDownloadId})`);
    return localDownloadId;
    
  } catch (error) {
    console.error('Error starting local download:', error);
    throw error;
  }
}

// Get local download progress from the download service
async function getLocalDownloadProgress(localDownloadId) {
  try {
    const downloadService = global.gameDownloadService;
    if (!downloadService) {
      return null;
    }
    
    const statusResult = downloadService.getDownloadStatus(localDownloadId);
    
    if (!statusResult.success) {
      return null;
    }
    
    const download = statusResult.download;
    
    return {
      progress: download.progress || 0,
      downloadedBytes: download.downloadedBytes || 0,
      totalBytes: download.totalBytes || 0,
      speed: download.speed || 0,
      status: download.status
    };
    
  } catch (error) {
    console.error('Error getting local download progress:', error);
    return null;
  }
}

// Stop monitoring a download
function stopMonitoring(downloadId) {
  if (monitoringIntervals.has(downloadId)) {
    clearInterval(monitoringIntervals.get(downloadId));
    monitoringIntervals.delete(downloadId);
  }
}

// Get all tracked downloads
function getTrackedDownloads() {
  const downloads = downloadStore.get('downloads', {});
  return Object.values(downloads);
}

// Remove a tracked download
function removeTrackedDownload(event, downloadId) {
  const downloads = downloadStore.get('downloads', {});
  delete downloads[downloadId];
  downloadStore.set('downloads', downloads);
  
  stopMonitoring(downloadId);
  
  console.log(`Removed tracked download: ${downloadId}`);
  return { success: true };
}

// Clear completed downloads
function clearCompletedDownloads() {
  const downloads = downloadStore.get('downloads', {});
  const activeDownloads = {};
  
  Object.values(downloads).forEach(download => {
    if (download.status !== DOWNLOAD_STATUS.COMPLETE) {
      activeDownloads[download.id] = download;
    } else {
      stopMonitoring(download.id);
    }
  });
  
  downloadStore.set('downloads', activeDownloads);
  
  console.log('Cleared completed downloads');
  return { success: true };
}

module.exports = {
  initGameDownloadTracker,
  startTracking,
  updateDownloadStatus,
  getTrackedDownloads,
  removeTrackedDownload,
  clearCompletedDownloads,
  DOWNLOAD_STATUS,
  STATUS_MESSAGES
}; 