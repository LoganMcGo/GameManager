// Preload script runs in the renderer process before the web page is loaded
// It has access to both Node.js APIs and DOM APIs
const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
  'api', {
    // Real-Debrid API
    realDebrid: {
      // Authentication
      getAuthStatus: () => ipcRenderer.invoke('real-debrid:get-auth-status'),
      startAuthFlow: () => ipcRenderer.invoke('real-debrid:start-auth-flow'),
      checkAuthStatus: () => ipcRenderer.invoke('real-debrid:check-auth-status'),
      disconnect: () => ipcRenderer.invoke('real-debrid:disconnect'),
      
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
      getCredentials: () => ipcRenderer.invoke('igdb:get-credentials'),
      setCredentials: (clientId, clientSecret) => ipcRenderer.invoke('igdb:set-credentials', clientId, clientSecret),
      testCredentials: (clientId, clientSecret) => ipcRenderer.invoke('igdb:test-credentials', clientId, clientSecret),
      getPopularNewGames: (limit, offset) => ipcRenderer.invoke('igdb:get-popular-new-games', limit, offset),
      getGamesByGenre: (genre, limit, offset, subCategory) => ipcRenderer.invoke('igdb:get-games-by-genre', genre, limit, offset, subCategory),
      getFeaturedGames: (limit) => ipcRenderer.invoke('igdb:get-featured-games', limit),
      getGameDetails: (gameId) => ipcRenderer.invoke('igdb:get-game-details', gameId),
      searchGames: (query, limit) => ipcRenderer.invoke('igdb:search-games', query, limit)
    },
    
    // Download API
    download: {
      startDownload: (downloadInfo) => ipcRenderer.invoke('download:start', downloadInfo),
      pauseDownload: (downloadId) => ipcRenderer.invoke('download:pause', downloadId),
      resumeDownload: (downloadId) => ipcRenderer.invoke('download:resume', downloadId),
      cancelDownload: (downloadId) => ipcRenderer.invoke('download:cancel', downloadId),
      getDownloadStatus: (downloadId) => ipcRenderer.invoke('download:status', downloadId),
      getActiveDownloads: () => ipcRenderer.invoke('download:get-active'),
      setDownloadLocation: (location) => ipcRenderer.invoke('download:set-location', location),
      getDownloadLocation: () => ipcRenderer.invoke('download:get-location'),
      openDownloadLocation: () => ipcRenderer.invoke('download:open-location')
    },
    
    // Window controls
    window: {
      minimize: () => ipcRenderer.invoke('window:minimize'),
      maximize: () => ipcRenderer.invoke('window:maximize'),
      close: () => ipcRenderer.invoke('window:close'),
      isMaximized: () => ipcRenderer.invoke('window:is-maximized')
    }
  }
);

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
