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
  DOWNLOAD_COMPLETE: 'download_complete',
  EXTRACTING: 'extracting',
  EXTRACTION_COMPLETE: 'extraction_complete',
  FINDING_EXECUTABLE: 'finding_executable',
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
  [DOWNLOAD_STATUS.DOWNLOAD_COMPLETE]: 'Download Complete',
  [DOWNLOAD_STATUS.EXTRACTING]: 'Extracting files...',
  [DOWNLOAD_STATUS.EXTRACTION_COMPLETE]: 'Extraction Complete',
  [DOWNLOAD_STATUS.FINDING_EXECUTABLE]: 'Setting up game...',
  [DOWNLOAD_STATUS.COMPLETE]: 'Ready to Play',
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
  
  // Extract game image from various possible sources
  let gameImage = null;
  if (gameData.imageUrl) {
    gameImage = gameData.imageUrl;
  } else if (gameData.heroImageUrl) {
    gameImage = gameData.heroImageUrl;
  } else if (gameData.cover?.url) {
    gameImage = gameData.cover.url;
  } else if (gameData.artworks?.[0]?.url) {
    gameImage = gameData.artworks[0].url;
  } else if (gameData.screenshots?.[0]) {
    gameImage = gameData.screenshots[0];
  }
  
  const download = {
    id: downloadId,
    gameId: gameData.id || gameData.appId,
    gameName: gameData.name,
    gameImage: gameImage,
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
  
  console.log(`Started tracking download for game: ${gameData.name}${gameImage ? ` with image: ${gameImage}` : ' (no image found)'}`);
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
    
    console.log(`🔍 Monitoring download ${downloadId} - Status: ${download.status}, TorrentID: ${download.torrentId || 'none'}, LocalID: ${download.localDownloadId || 'none'}`);
    
    const realDebridService = require('./realDebridService');
    
    // Check torrent status if we have a torrent ID and we're not yet in local download phase
    if (download.torrentId && !download.localDownloadId && download.status !== DOWNLOAD_STATUS.DOWNLOADING && download.status !== DOWNLOAD_STATUS.EXTRACTING) {
      console.log(`📋 Checking torrent status for ${download.torrentId}`);
      const torrentInfo = await realDebridService.getTorrentInfo(download.torrentId);
      
      if (torrentInfo.success) {
        const torrent = torrentInfo.data;
        console.log(`📊 Torrent ${download.torrentId} status: ${torrent.status}, progress: ${torrent.progress || 0}%`);
        
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
            console.log(`✅ Torrent downloaded! Starting local download for ${download.gameName}`);
            
            // Only start local download if we don't already have one
            if (!download.localDownloadId) {
              updateDownloadStatus(downloadId, DOWNLOAD_STATUS.FILE_READY);
              // Start local download
              setTimeout(() => startLocalDownload(downloadId, torrent), 1000);
            } else {
              console.log(`📋 Local download already exists for ${download.gameName} (ID: ${download.localDownloadId})`);
            }
            break;
            
          case 'error':
          case 'virus':
          case 'dead':
            console.error(`❌ Torrent failed with status: ${torrent.status}`);
            updateDownloadStatus(downloadId, DOWNLOAD_STATUS.ERROR, {
              error: `Torrent failed: ${torrent.status}`
            });
            break;
        }
      } else {
        console.warn(`⚠️ Failed to get torrent info for ${download.torrentId}: ${torrentInfo.error}`);
      }
    }
    
    // Check local download progress if we have a local download ID
    if (download.localDownloadId && (download.status === DOWNLOAD_STATUS.DOWNLOADING || download.status === DOWNLOAD_STATUS.EXTRACTING || download.status === DOWNLOAD_STATUS.DOWNLOAD_COMPLETE || download.status === DOWNLOAD_STATUS.EXTRACTION_COMPLETE)) {
      console.log(`📊 Checking local download progress for ${download.localDownloadId}`);
      const localProgress = await getLocalDownloadProgress(download.localDownloadId);
      if (localProgress) {
        console.log(`📈 Local progress: ${localProgress.progress.toFixed(1)}% Status: ${localProgress.status}`);
        
        // Handle different local download statuses - only update if it's a progression
        switch (localProgress.status) {
          case 'downloading':
            if (download.status === DOWNLOAD_STATUS.DOWNLOADING || download.status === DOWNLOAD_STATUS.STARTING_DOWNLOAD) {
              updateDownloadStatus(downloadId, DOWNLOAD_STATUS.DOWNLOADING, {
                progress: localProgress.progress,
                downloadedBytes: localProgress.downloadedBytes,
                totalBytes: localProgress.totalBytes,
                downloadSpeed: localProgress.speed
              });
            }
            break;
            
          case 'download_complete':
            if (download.status === DOWNLOAD_STATUS.DOWNLOADING || download.status === DOWNLOAD_STATUS.STARTING_DOWNLOAD) {
              console.log(`📦 Download completed for ${download.gameName}, starting extraction...`);
              updateDownloadStatus(downloadId, DOWNLOAD_STATUS.DOWNLOAD_COMPLETE, {
                progress: 100,
                downloadedBytes: localProgress.totalBytes,
                totalBytes: localProgress.totalBytes
              });
            }
            break;
            
          case 'extracting':
            if (download.status === DOWNLOAD_STATUS.DOWNLOADING || download.status === DOWNLOAD_STATUS.DOWNLOAD_COMPLETE || download.status === DOWNLOAD_STATUS.EXTRACTING) {
              updateDownloadStatus(downloadId, DOWNLOAD_STATUS.EXTRACTING, {
                progress: localProgress.extractionProgress || 0,
                extractionProgress: localProgress.extractionProgress || 0
              });
            }
            break;
            
          case 'extraction_complete':
            if (download.status === DOWNLOAD_STATUS.EXTRACTING || download.status === DOWNLOAD_STATUS.DOWNLOAD_COMPLETE) {
              console.log(`🎉 Extraction completed for ${download.gameName}, finding executable...`);
              updateDownloadStatus(downloadId, DOWNLOAD_STATUS.EXTRACTION_COMPLETE);
              // Start finding executable
              setTimeout(() => findAndSetupExecutable(downloadId), 1000);
            }
            break;
            
          case 'complete':
            if (download.status !== DOWNLOAD_STATUS.COMPLETE) {
              console.log(`🎮 Game setup completed for ${download.gameName}!`);
              updateDownloadStatus(downloadId, DOWNLOAD_STATUS.COMPLETE);
            }
            break;
            
          case 'error':
            console.error(`❌ Local download/extraction failed for ${download.gameName}: ${localProgress.error}`);
            updateDownloadStatus(downloadId, DOWNLOAD_STATUS.ERROR, {
              error: localProgress.error || 'Download or extraction failed'
            });
            break;
        }
      } else {
        console.warn(`⚠️ No progress info available for local download ${download.localDownloadId}`);
      }
    }
    
  } catch (error) {
    console.error(`❌ Error monitoring download ${downloadId}:`, error);
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
    console.log(`🚀 Starting local download process for ${filename}`);
    
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
    console.log(`📁 Download location: ${downloadLocation}`);
    
    if (!downloadLocation || downloadLocation.trim() === '') {
      throw new Error('Download location not set. Please configure download location in settings.');
    }
    
    // Verify download location exists
    const fs = require('fs');
    if (!fs.existsSync(downloadLocation)) {
      throw new Error(`Download location does not exist: ${downloadLocation}. Please check settings.`);
    }
    
    // Create local download ID
    const localDownloadId = `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log(`🆔 Created local download ID: ${localDownloadId}`);
    
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
    
    console.log(`📦 Starting download with info:`, {
      filename,
      downloadPath: downloadLocation,
      downloadId: localDownloadId,
      gameName: download.gameName
    });
    
    const result = await downloadService.startDownloadWithExtraction(downloadInfo);
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to start download');
    }
    
    console.log(`✅ Started local download: ${filename} (ID: ${localDownloadId})`);
    return localDownloadId;
    
  } catch (error) {
    console.error(`❌ Error starting local download for ${filename}:`, error);
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

// Find and setup executable for the extracted game
async function findAndSetupExecutable(downloadId) {
  try {
    console.log(`🔍 Finding executable for download ${downloadId}`);
    
    const downloads = downloadStore.get('downloads', {});
    const download = downloads[downloadId];
    
    if (!download) {
      console.error(`Download ${downloadId} not found for executable setup`);
      return;
    }
    
    updateDownloadStatus(downloadId, DOWNLOAD_STATUS.FINDING_EXECUTABLE);
    
    // Get the download service to find the extracted game directory
    const downloadService = global.gameDownloadService;
    if (!downloadService) {
      throw new Error('Download service not available');
    }
    
    // Get the game directory path
    const downloadLocation = downloadService.getDownloadLocation();
    const gameName = download.gameName.replace(/[<>:"/\\|?*]/g, '_'); // Sanitize folder name
    const gameDirectory = require('path').join(downloadLocation, gameName);
    
    console.log(`📁 Looking for executable in: ${gameDirectory}`);
    
    // Check if directory exists
    const fs = require('fs');
    if (!fs.existsSync(gameDirectory)) {
      throw new Error(`Game directory not found: ${gameDirectory}`);
    }
    
    // Try to find executable files
    const executableFiles = await findExecutableFiles(gameDirectory);
    
    if (executableFiles.length === 0) {
      console.warn(`⚠️ No executable files found for ${download.gameName}`);
      // Still mark as complete, user can manually set executable later
      updateDownloadStatus(downloadId, DOWNLOAD_STATUS.COMPLETE, {
        gameDirectory: gameDirectory,
        executablePath: null,
        needsManualSetup: true
      });
    } else {
      // Try to pick the best executable automatically
      const bestExecutable = selectBestExecutable(executableFiles, download.gameName);
      console.log(`🎯 Selected executable: ${bestExecutable}`);
      
      updateDownloadStatus(downloadId, DOWNLOAD_STATUS.COMPLETE, {
        gameDirectory: gameDirectory,
        executablePath: bestExecutable,
        availableExecutables: executableFiles,
        needsManualSetup: false
      });
    }
    
  } catch (error) {
    console.error(`❌ Error finding executable for ${downloadId}:`, error);
    updateDownloadStatus(downloadId, DOWNLOAD_STATUS.ERROR, {
      error: `Failed to setup game: ${error.message}`
    });
  }
}

// Find executable files in a directory recursively
async function findExecutableFiles(directory, maxDepth = 3) {
  const fs = require('fs');
  const path = require('path');
  
  const executableFiles = [];
  
  function searchDirectory(dir, currentDepth = 0) {
    if (currentDepth > maxDepth) return;
    
    try {
      const items = fs.readdirSync(dir);
      
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          // Skip certain directories
          const dirName = item.toLowerCase();
          if (dirName.includes('__macosx') || 
              dirName.includes('.app') ||
              dirName.includes('uninstall') ||
              dirName.includes('redist') ||
              dirName.includes('_commonredist') ||
              dirName.includes('directx')) {
            continue;
          }
          
          searchDirectory(fullPath, currentDepth + 1);
        } else if (stat.isFile()) {
          const fileName = item.toLowerCase();
          const ext = path.extname(fileName);
          
          // Look for executable files
          if (ext === '.exe') {
            // Skip certain common non-game executables
            if (fileName.includes('unins') ||
                fileName.includes('setup') ||
                fileName.includes('install') ||
                fileName.includes('update') ||
                fileName.includes('launcher') ||
                fileName.includes('crash') ||
                fileName.includes('report') ||
                fileName.includes('config') ||
                fileName.includes('setting')) {
              continue;
            }
            
            executableFiles.push(fullPath);
          }
        }
      }
    } catch (error) {
      console.warn(`Failed to read directory ${dir}:`, error.message);
    }
  }
  
  searchDirectory(directory);
  return executableFiles;
}

// Select the best executable from available options
function selectBestExecutable(executableFiles, gameName) {
  if (executableFiles.length === 0) return null;
  if (executableFiles.length === 1) return executableFiles[0];
  
  const path = require('path');
  const gameNameLower = gameName.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  // Score each executable
  const scoredExecutables = executableFiles.map(exe => {
    const fileName = path.basename(exe, '.exe').toLowerCase().replace(/[^a-z0-9]/g, '');
    const dirName = path.basename(path.dirname(exe)).toLowerCase();
    
    let score = 0;
    
    // Higher score for files that match the game name
    if (fileName.includes(gameNameLower) || gameNameLower.includes(fileName)) {
      score += 100;
    }
    
    // Higher score for files in root or bin directories
    if (dirName === 'bin' || dirName === 'binaries') {
      score += 50;
    }
    
    // Higher score for larger files (usually the main game)
    try {
      const fs = require('fs');
      const stats = fs.statSync(exe);
      score += Math.min(stats.size / (1024 * 1024), 50); // Max 50 points for file size
    } catch (e) {
      // Ignore file size errors
    }
    
    // Penalty for common utility executables
    if (fileName.includes('dx') || 
        fileName.includes('redist') || 
        fileName.includes('vcredist') ||
        fileName.includes('dotnet')) {
      score -= 50;
    }
    
    return { path: exe, score, fileName };
  });
  
  // Sort by score and return the best one
  scoredExecutables.sort((a, b) => b.score - a.score);
  
  console.log(`🎯 Executable scoring results:`, scoredExecutables.map(e => ({
    file: e.fileName,
    score: e.score
  })));
  
  return scoredExecutables[0].path;
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