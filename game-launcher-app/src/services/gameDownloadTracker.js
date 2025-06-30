const { ipcMain } = require('electron');
const Store = require('electron-store');
const { getOptimizedMonitor } = require('./optimizedDownloadMonitor');

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
  NEEDS_SETUP: 'needs_setup',
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
  [DOWNLOAD_STATUS.NEEDS_SETUP]: 'Needs Installation',
  [DOWNLOAD_STATUS.FINDING_EXECUTABLE]: 'Setting up game...',
  [DOWNLOAD_STATUS.COMPLETE]: 'Game is ready',
  [DOWNLOAD_STATUS.ERROR]: 'Error'
};

// Optimized monitor instance
let optimizedMonitor = null;

// Initialize the service
function initGameDownloadTracker() {
  // Initialize optimized monitor
  optimizedMonitor = getOptimizedMonitor();
  
  // Set up optimized monitor event handlers
  optimizedMonitor.on('start-local-download', startLocalDownload);
  optimizedMonitor.on('find-executable', findAndSetupExecutable);
  
  // Start optimized monitoring
  optimizedMonitor.startMonitoring();
  
  // Register IPC handlers
  ipcMain.handle('download-tracker:get-downloads', getTrackedDownloads);
  ipcMain.handle('download-tracker:remove-download', removeTrackedDownload);
  ipcMain.handle('download-tracker:clear-completed', clearCompletedDownloads);
  ipcMain.handle('download-tracker:start-tracking', handleStartTracking);
  ipcMain.handle('download-tracker:update-status', handleUpdateStatus);
  
  // Add new IPC handlers for optimized monitoring
  ipcMain.handle('download-tracker:get-statistics', () => optimizedMonitor.getStatistics());
  ipcMain.handle('download-tracker:update-config', (event, config) => optimizedMonitor.updateConfig(config));
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
  
  // Monitoring is handled by the optimized monitor automatically
  
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
  const { BrowserWindow } = require('electron');
  let mainWindow = global.mainWindow;
  
  if (!mainWindow) {
    // Try to get the main window from BrowserWindow
    const allWindows = BrowserWindow.getAllWindows();
    mainWindow = allWindows.find(win => !win.isDestroyed()) || allWindows[0];
  }
  
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('download-tracker:update', download);
  }
}

// Note: Old monitoring functions have been replaced by the OptimizedDownloadMonitor
// All monitoring is now handled centrally by the optimized monitoring service

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

// Note: stopMonitoring is now handled automatically by the OptimizedDownloadMonitor
// when downloads reach complete/error status

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
  
  // Monitoring cleanup is handled automatically by OptimizedDownloadMonitor
  
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
    }
    // Monitoring cleanup is handled automatically by OptimizedDownloadMonitor
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