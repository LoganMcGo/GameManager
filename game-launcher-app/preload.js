// Preload script runs in the renderer process before the web page is loaded
// It has access to both Node.js APIs and DOM APIs
const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
  'api', {
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
      searchGames: (query, limit = 20) => ipcRenderer.invoke('igdb:search-games', query, limit),
      getGameDetails: (gameId) => ipcRenderer.invoke('igdb:get-game-details', gameId),
      getPopularGames: (limit = 20, offset = 0) => ipcRenderer.invoke('igdb:get-popular-games', limit, offset),
      getTopRatedGames: (limit = 20, offset = 0) => ipcRenderer.invoke('igdb:get-top-rated-games', limit, offset),
      getRecentGames: (limit = 20, offset = 0) => ipcRenderer.invoke('igdb:get-recent-games', limit, offset),
      getUpcomingGames: (limit = 20, offset = 0) => ipcRenderer.invoke('igdb:get-upcoming-games', limit, offset),
      getGamesByGenre: (genreId, limit = 20, offset = 0) => ipcRenderer.invoke('igdb:get-games-by-genre', genreId, limit, offset),
      getGamesByPlatform: (platformId, limit = 20, offset = 0) => ipcRenderer.invoke('igdb:get-games-by-platform', platformId, limit, offset),
      getGenres: () => ipcRenderer.invoke('igdb:get-genres'),
      getPlatforms: () => ipcRenderer.invoke('igdb:get-platforms'),
      getCompanies: () => ipcRenderer.invoke('igdb:get-companies'),
      getPopularNewGames: (limit = 20, offset = 0) => ipcRenderer.invoke('igdb:get-popular-new-games', limit, offset),
      getTrendingGames: (limit = 20, offset = 0) => ipcRenderer.invoke('igdb:get-trending-games', limit, offset),
      getGameScreenshots: (gameId) => ipcRenderer.invoke('igdb:get-game-screenshots', gameId),
      getSimilarGames: (gameId, limit = 10) => ipcRenderer.invoke('igdb:get-similar-games', gameId, limit),
      getGamesByCompany: (companyId, limit = 20, offset = 0) => ipcRenderer.invoke('igdb:get-games-by-company', companyId, limit, offset),
      getMultipleGames: (gameIds) => ipcRenderer.invoke('igdb:get-multiple-games', gameIds),
      searchAllGames: (query, limit = 50, offset = 0) => ipcRenderer.invoke('igdb:search-all-games', query, limit, offset),
      getGameCollection: (collectionId) => ipcRenderer.invoke('igdb:get-game-collection', collectionId),
      getFranchises: () => ipcRenderer.invoke('igdb:get-franchises'),
      getGamesByFranchise: (franchiseId, limit = 20, offset = 0) => ipcRenderer.invoke('igdb:get-games-by-franchise', franchiseId, limit, offset)
    },
    
    // Download Service API
    download: {
      startDownload: (downloadInfo) => ipcRenderer.invoke('download:start', downloadInfo),
      pauseDownload: (downloadId) => ipcRenderer.invoke('download:pause', downloadId),
      resumeDownload: (downloadId) => ipcRenderer.invoke('download:resume', downloadId),
      cancelDownload: (downloadId) => ipcRenderer.invoke('download:cancel', downloadId),
      getDownloads: () => ipcRenderer.invoke('download:get-all'),
      clearCompleted: () => ipcRenderer.invoke('download:clear-completed'),
      getDownloadLocation: () => ipcRenderer.invoke('download:get-location'),
      setDownloadLocation: (path) => ipcRenderer.invoke('download:set-location', path),
      retryDownload: (downloadId) => ipcRenderer.invoke('download:retry', downloadId),
      getDownloadHistory: () => ipcRenderer.invoke('download:get-history'),
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
    
    // Game Library API
    library: {
      addGame: (gameData) => ipcRenderer.invoke('library:add-game', gameData),
      removeGame: (gameId) => ipcRenderer.invoke('library:remove-game', gameId),
      getGames: () => ipcRenderer.invoke('library:get-games'),
      updateGame: (gameId, updates) => ipcRenderer.invoke('library:update-game', gameId, updates),
      launchGame: (gameId) => ipcRenderer.invoke('library:launch-game', gameId),
      importGame: (gamePath) => ipcRenderer.invoke('library:import-game', gamePath),
      getGameHistory: () => ipcRenderer.invoke('library:get-history'),
      markGameAsPlayed: (gameId) => ipcRenderer.invoke('library:mark-played', gameId)
    },
    
    // App API  
    app: {
      getVersion: () => ipcRenderer.invoke('app:get-version'),
      checkForUpdates: () => ipcRenderer.invoke('app:check-updates'),
      installUpdate: () => ipcRenderer.invoke('app:install-update'),
      onUpdateAvailable: (callback) => {
        const wrappedCallback = (event, ...args) => callback(...args);
        ipcRenderer.on('update-available', wrappedCallback);
        return () => ipcRenderer.removeListener('update-available', wrappedCallback);
      },
      onUpdateDownloaded: (callback) => {
        const wrappedCallback = (event, ...args) => callback(...args);
        ipcRenderer.on('update-downloaded', wrappedCallback);
        return () => ipcRenderer.removeListener('update-downloaded', wrappedCallback);
      }
    },
    
    // System API
    system: {
      openExternal: (url) => ipcRenderer.invoke('system:open-external', url),
      showItemInFolder: (path) => ipcRenderer.invoke('system:show-item-in-folder', path),
      getSystemInfo: () => ipcRenderer.invoke('system:get-info')
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
