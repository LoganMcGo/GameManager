// Preload script runs in the renderer process before the web page is loaded
// It has access to both Node.js APIs and DOM APIs
const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
  'api', {
    // Window controls API
    window: {
      minimize: () => ipcRenderer.invoke('window:minimize'),
      maximize: () => ipcRenderer.invoke('window:maximize'),
      close: () => ipcRenderer.invoke('window:close'),
      isMaximized: () => ipcRenderer.invoke('window:is-maximized')
    },
    
    // Folder selection API
    selectFolder: () => ipcRenderer.invoke('dialog:select-folder'),
    selectExecutable: () => ipcRenderer.invoke('dialog:select-executable'),
    
    // Real-Debrid API
    realDebrid: {
      // Status (always returns authenticated since it's automatic)
      getAuthStatus: () => ipcRenderer.invoke('real-debrid:get-auth-status'),
      
      // User API
      getUserInfo: () => ipcRenderer.invoke('real-debrid:get-user-info'),
      
      // Unrestrict API
      checkLink: (link) => ipcRenderer.invoke('real-debrid:check-link', link),
      unrestrictLink: (link, password = null) => ipcRenderer.invoke('real-debrid:unrestrict-link', link, password),
      unrestrictFolder: (link) => ipcRenderer.invoke('real-debrid:unrestrict-folder', link),
      
      // Downloads API
      getDownloads: (offset = 0, limit = 50) => ipcRenderer.invoke('real-debrid:get-downloads', offset, limit),
      deleteDownload: (id) => ipcRenderer.invoke('real-debrid:delete-download', id),
      
      // Torrents API
      getTorrents: (offset = 0, limit = 50, filter = null) => ipcRenderer.invoke('real-debrid:get-torrents', offset, limit, filter),
      getTorrentInfo: (id) => ipcRenderer.invoke('real-debrid:get-torrent-info', id),
      addMagnet: (magnet) => ipcRenderer.invoke('real-debrid:add-magnet', magnet),
      addMagnetAndStart: (magnet) => ipcRenderer.invoke('real-debrid:add-magnet-and-start', magnet),
      selectFiles: (id, files) => ipcRenderer.invoke('real-debrid:select-files', id, files),
      deleteTorrent: (id) => ipcRenderer.invoke('real-debrid:delete-torrent', id),
      getActiveTorrentsCount: () => ipcRenderer.invoke('real-debrid:get-active-count'),
      getAvailableHosts: () => ipcRenderer.invoke('real-debrid:get-available-hosts'),
      
      // Hosts API
      getHosts: () => ipcRenderer.invoke('real-debrid:get-hosts'),
      getHostsStatus: () => ipcRenderer.invoke('real-debrid:get-hosts-status'),
      
      // Traffic API
      getTraffic: () => ipcRenderer.invoke('real-debrid:get-traffic'),
      getTrafficDetails: () => ipcRenderer.invoke('real-debrid:get-traffic-details')
    },
    
    // IGDB API
    igdb: {
      // Credentials API
      getCredentials: () => ipcRenderer.invoke('igdb:get-credentials'),
      setCredentials: (credentials) => ipcRenderer.invoke('igdb:set-credentials', credentials),
      testCredentials: () => ipcRenderer.invoke('igdb:test-credentials'),
      
      // Games API
      searchGames: (query, limit = 20) => ipcRenderer.invoke('igdb:search-games', query, limit),
      getGameDetails: (gameId) => ipcRenderer.invoke('igdb:get-game-details', gameId),
      getFeaturedGames: (limit = 5) => ipcRenderer.invoke('igdb:get-featured-games', limit),
      getPopularNewGames: (limit = 20, offset = 0) => ipcRenderer.invoke('igdb:get-popular-new-games', limit, offset),
      getGamesByGenre: (genre, limit = 20, offset = 0, subCategory) => ipcRenderer.invoke('igdb:get-games-by-genre', genre, limit, offset, subCategory),
      clearCache: () => ipcRenderer.invoke('igdb:clear-cache')
    },
    
    // Download Service API
    download: {
      startDownload: (downloadInfo) => ipcRenderer.invoke('download:start', downloadInfo),
      pauseDownload: (downloadId) => ipcRenderer.invoke('download:pause', downloadId),
      resumeDownload: (downloadId) => ipcRenderer.invoke('download:resume', downloadId),
      cancelDownload: (downloadId) => ipcRenderer.invoke('download:cancel', downloadId),
      getActiveDownloads: () => ipcRenderer.invoke('download:get-active'),
      getDownloadStatus: (downloadId) => ipcRenderer.invoke('download:status', downloadId),
      getDownloadLocation: () => ipcRenderer.invoke('download:get-location'),
      setDownloadLocation: (path) => ipcRenderer.invoke('download:set-location', path),
      openDownloadLocation: () => ipcRenderer.invoke('download:open-location'),
      startWithExtraction: (downloadInfo) => ipcRenderer.invoke('download:start-with-extraction', downloadInfo),
      onDownloadUpdate: (callback) => {
        const wrappedCallback = (event, ...args) => callback(...args);
        ipcRenderer.on('download:update', wrappedCallback);
        return () => ipcRenderer.removeListener('download:update', wrappedCallback);
      },
      onDownloadComplete: (callback) => {
        const wrappedCallback = (event, ...args) => callback(...args);
        ipcRenderer.on('download:complete', wrappedCallback);
        return () => ipcRenderer.removeListener('download:complete', wrappedCallback);
      },
      onDownloadError: (callback) => {
        const wrappedCallback = (event, ...args) => callback(...args);
        ipcRenderer.on('download:error', wrappedCallback);
        return () => ipcRenderer.removeListener('download:error', wrappedCallback);
      }
    },
    
    // Game Download Tracker API
    downloadTracker: {
      getDownloads: () => ipcRenderer.invoke('download-tracker:get-downloads'),
      removeDownload: (downloadId) => ipcRenderer.invoke('download-tracker:remove-download', downloadId),
      clearCompleted: () => ipcRenderer.invoke('download-tracker:clear-completed'),
      startTracking: (trackingData) => ipcRenderer.invoke('download-tracker:start-tracking', trackingData),
      updateStatus: (downloadId, status, data) => ipcRenderer.invoke('download-tracker:update-status', downloadId, status, data),
      onDownloadUpdate: (callback) => {
        const wrappedCallback = (event, ...args) => callback(...args);
        ipcRenderer.on('download-tracker:update', wrappedCallback);
        return () => ipcRenderer.removeListener('download-tracker:update', wrappedCallback);
      }
    },
    
    // Game Launcher API
    launcher: {
      launchGame: (gameInfo) => ipcRenderer.invoke('launcher:launch-game', gameInfo),
      stopGame: (gameId) => ipcRenderer.invoke('launcher:stop-game', gameId),
      getGameStatus: (gameId) => ipcRenderer.invoke('launcher:get-game-status', gameId),
      getRunningGames: () => ipcRenderer.invoke('launcher:get-running-games'),
      findExecutable: (gameInfo) => ipcRenderer.invoke('launcher:find-executable', gameInfo),
      scanDirectory: (directoryPath) => ipcRenderer.invoke('launcher:scan-directory', directoryPath),
      setExecutablePath: (gameId, executablePath) => ipcRenderer.invoke('launcher:set-executable-path', gameId, executablePath),
      isGameReady: (gameInfo) => ipcRenderer.invoke('launcher:is-game-ready', gameInfo),
      onGameClosed: (callback) => {
        const wrappedCallback = (event, ...args) => callback(...args);
        ipcRenderer.on('launcher:game-closed', wrappedCallback);
        return () => ipcRenderer.removeListener('launcher:game-closed', wrappedCallback);
      }
    },
    
    // Game Extraction API
    extraction: {
      extractFile: (extractionInfo) => ipcRenderer.invoke('extraction:extract-file', extractionInfo),
      getStatus: (extractionId) => ipcRenderer.invoke('extraction:get-status', extractionId),
      cancel: (extractionId) => ipcRenderer.invoke('extraction:cancel', extractionId),
      needsExtraction: (filePath) => ipcRenderer.invoke('extraction:needs-extraction', filePath),
      installGame: (installInfo) => ipcRenderer.invoke('extraction:install-game', installInfo),
      cleanTemp: () => ipcRenderer.invoke('extraction:clean-temp')
    },
    
    // JWT Service API
    jwt: {
      getToken: () => ipcRenderer.invoke('jwt:get-token'),
      refreshToken: () => ipcRenderer.invoke('jwt:refresh-token'),
      clearToken: () => ipcRenderer.invoke('jwt:clear-token')
    },
    
    // App API  
    app: {
      getVersion: () => ipcRenderer.invoke('app:get-version'),
      checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
      restartAndUpdate: () => ipcRenderer.invoke('restart-and-update'),
      onUpdateAvailable: (callback) => {
        const wrappedCallback = (event, ...args) => callback(...args);
        ipcRenderer.on('update-available', wrappedCallback);
        return () => ipcRenderer.removeListener('update-available', wrappedCallback);
      },
      onUpdateDownloaded: (callback) => {
        const wrappedCallback = (event, ...args) => callback(...args);
        ipcRenderer.on('update-downloaded', wrappedCallback);
        return () => ipcRenderer.removeListener('update-downloaded', wrappedCallback);
      },
      onUpdateProgress: (callback) => {
        const wrappedCallback = (event, ...args) => callback(...args);
        ipcRenderer.on('update-progress', wrappedCallback);
        return () => ipcRenderer.removeListener('update-progress', wrappedCallback);
      },
      onUpdateError: (callback) => {
        const wrappedCallback = (event, ...args) => callback(...args);
        ipcRenderer.on('update-error', wrappedCallback);
        return () => ipcRenderer.removeListener('update-error', wrappedCallback);
      }
    }
  }
);

contextBridge.exposeInMainWorld('electronAPI', {
  // ... existing API methods ...
  
  // Update methods
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  onUpdateAvailable: (callback) => ipcRenderer.on('update-available', callback),
  onUpdateProgress: (callback) => ipcRenderer.on('update-progress', callback),
  onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', callback),
  onUpdateError: (callback) => ipcRenderer.on('update-error', callback),
  restartAndUpdate: () => ipcRenderer.invoke('restart-and-update'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  
  // Remove listeners
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});

// You can expose specific Node.js functionality to the renderer process
window.addEventListener('DOMContentLoaded', () => {
  const replaceText = (selector, text) => {
    const element = document.getElementById(selector);
    if (element) element.innerText = text;
  };

  for (const dependency of ['chrome', 'node', 'electron']) {
    replaceText(`${dependency}-version`, process.versions[dependency]);
  }
});
