const { EventEmitter } = require('events');

/**
 * Optimized Download Monitor Service
 * 
 * This service consolidates all download monitoring into a single efficient system:
 * - Batches API requests to reduce backend load
 * - Uses intelligent intervals based on download state
 * - Implements proper resource management
 * - Supports high-frequency updates with minimal overhead
 */
class OptimizedDownloadMonitor extends EventEmitter {
  constructor() {
    super();
    
    // Monitoring state
    this.isMonitoring = false;
    this.monitoringInterval = null;
    this.pendingUpdates = new Map();
    this.lastUpdateTime = new Map();
    
    // Configuration
    this.config = {
      // Base intervals (in milliseconds)
      intervals: {
        torrent_downloading: 2000,    // Faster for torrent phase
        downloading: 300,             // Very fast for active downloads
        extracting: 500,             // Fast for extraction
        idle_states: 3000,           // Moderate for idle states
        error_retry: 10000           // Very slow for errors
      },
      
      // Batch configuration
      batch: {
        maxSize: 15,                 // Larger batches for efficiency
        debounceTime: 10             // Minimal debounce for real-time UI
      },
      
      // Caching
      cache: {
        ttl: 1000,                   // Shorter cache for real-time data
        cleanupInterval: 20000       // More frequent cleanup
      }
    };
    
    // Request cache
    this.requestCache = new Map();
    this.cacheCleanupInterval = null;
    
    // Debounced update emitter
    this.debouncedEmit = this.debounce(this.emitBatchedUpdates.bind(this), this.config.batch.debounceTime);
    
    this.setupCacheCleanup();
  }

  /**
   * Start monitoring all downloads
   */
  startMonitoring() {
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;
    
    // Use a single interval for all monitoring
    this.monitoringInterval = setInterval(() => {
      this.monitorAllDownloads();
    }, 300); // Very high frequency for real-time UI updates
  }

  /**
   * Stop monitoring
   */
  stopMonitoring() {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    if (this.cacheCleanupInterval) {
      clearInterval(this.cacheCleanupInterval);
      this.cacheCleanupInterval = null;
    }
    
    this.pendingUpdates.clear();
    this.lastUpdateTime.clear();
    this.requestCache.clear();
  }

  /**
   * Monitor all downloads intelligently
   */
  async monitorAllDownloads() {
    try {
      const Store = require('electron-store');
      const downloadStore = new Store({ name: 'game-downloads' });
      const downloads = downloadStore.get('downloads', {});
      
      if (Object.keys(downloads).length === 0) {
        return;
      }

      // Group downloads by type for batch processing
      const torrentDownloads = [];
      const localDownloads = [];
      const now = Date.now();

      for (const download of Object.values(downloads)) {
        // Skip completed/error downloads
        if (download.status === 'complete' || download.status === 'error') {
          continue;
        }

        // Check if enough time has passed for this download type
        const lastUpdate = this.lastUpdateTime.get(download.id) || 0;
        const requiredInterval = this.getRequiredInterval(download.status);
        
        if (now - lastUpdate < requiredInterval) {
          continue;
        }

        // Categorize for batch processing
        if (download.torrentId && !download.localDownloadId) {
          torrentDownloads.push(download);
        } else if (download.localDownloadId) {
          localDownloads.push(download);
        }

        this.lastUpdateTime.set(download.id, now);
      }

      // Process in batches
      await Promise.all([
        this.processTorrentBatch(torrentDownloads),
        this.processLocalDownloadBatch(localDownloads)
      ]);

      // Note: All updates are now immediate, batching disabled for real-time UI
      // this.debouncedEmit();

    } catch (error) {
      console.error('Error in optimized monitoring:', error);
    }
  }

  /**
   * Get required interval based on download status
   */
  getRequiredInterval(status) {
    if (status.includes('downloading')) {
      return this.config.intervals.downloading;
    } else if (status.includes('torrent')) {
      return this.config.intervals.torrent_downloading;
    } else if (status.includes('extracting')) {
      return this.config.intervals.extracting;
    } else if (status === 'error') {
      return this.config.intervals.error_retry;
    } else {
      return this.config.intervals.idle_states;
    }
  }

  /**
   * Process torrent downloads in batches
   */
  async processTorrentBatch(downloads) {
    if (downloads.length === 0) return;

    const realDebridService = require('./realDebridService');
    
    // Batch torrent info requests
    const batchSize = this.config.batch.maxSize;
    const batches = [];
    
    for (let i = 0; i < downloads.length; i += batchSize) {
      batches.push(downloads.slice(i, i + batchSize));
    }

    for (const batch of batches) {
      await Promise.all(
        batch.map(download => this.processTorrentDownload(download, realDebridService))
      );
    }
  }

  /**
   * Process a single torrent download with caching
   */
  async processTorrentDownload(download, realDebridService) {
    try {
      // Check cache first
      const cacheKey = `torrent_${download.torrentId}`;
      const cached = this.getCachedResult(cacheKey);
      
      if (cached) {
        this.processDownloadUpdate(download, cached);
        return;
      }

      // Fetch fresh data
      const torrentInfo = await realDebridService.getTorrentInfo(download.torrentId);
      
      if (torrentInfo.success) {
        // Cache the result
        this.setCachedResult(cacheKey, torrentInfo.data);
        this.processDownloadUpdate(download, torrentInfo.data);
      }

    } catch (error) {
      console.error(`Error processing torrent ${download.torrentId}:`, error);
    }
  }

  /**
   * Process local downloads in batches
   */
  async processLocalDownloadBatch(downloads) {
    if (downloads.length === 0) return;

    const downloadService = global.gameDownloadService;
    if (!downloadService) return;

    // Process local downloads (these are fast, no need for complex batching)
    await Promise.all(
      downloads.map(download => this.processLocalDownload(download, downloadService))
    );
  }

  /**
   * Process a single local download
   */
  async processLocalDownload(download, downloadService) {
    try {
      const statusResult = downloadService.getDownloadStatus(download.localDownloadId);
      
      if (statusResult.success) {
        const localProgress = {
          progress: statusResult.download.progress || 0,
          downloadedBytes: statusResult.download.downloadedBytes || 0,
          totalBytes: statusResult.download.totalBytes || 0,
          speed: statusResult.download.speed || 0,
          status: statusResult.download.status
        };
        
        this.processLocalDownloadUpdate(download, localProgress);
      }

    } catch (error) {
      console.error(`Error processing local download ${download.localDownloadId}:`, error);
    }
  }

  /**
   * Process download update and queue for emission
   */
  processDownloadUpdate(download, torrentData) {
    let updateData = { id: download.id };
    let hasUpdate = false;

    switch (torrentData.status) {
      case 'magnet_conversion':
      case 'waiting_files_selection':
        if (download.status !== 'starting_torrent') {
          updateData.status = 'starting_torrent';
          updateData.statusMessage = 'Starting torrent...';
          hasUpdate = true;
        }
        break;
        
      case 'queued':
      case 'downloading':
        if (download.status !== 'torrent_downloading' || 
            Math.abs((download.progress || 0) - (torrentData.progress || 0)) > 0.5) {
          updateData.status = 'torrent_downloading';
          updateData.statusMessage = 'Torrent downloading...';
          updateData.progress = torrentData.progress || 0;
          hasUpdate = true;
        }
        break;
        
      case 'downloaded':
        if (download.status !== 'file_ready') {
          updateData.status = 'file_ready';
          updateData.statusMessage = 'File Ready, Starting Download...';
          hasUpdate = true;
          // Trigger local download start
          this.emit('start-local-download', download.id, torrentData);
        }
        break;
        
      case 'error':
      case 'virus':
      case 'dead':
        if (download.status !== 'error') {
          updateData.status = 'error';
          updateData.statusMessage = 'Error';
          updateData.error = `Torrent failed: ${torrentData.status}`;
          hasUpdate = true;
        }
        break;
    }

    if (hasUpdate) {
      this.pendingUpdates.set(download.id, { ...download, ...updateData });
      
      // For any torrent update, emit immediately to UI
      this.emitImmediateUpdate(download.id, { ...download, ...updateData });
    }
  }

  /**
   * Process local download update
   */
  processLocalDownloadUpdate(download, localProgress) {
    let updateData = { id: download.id };
    let hasUpdate = false;

    switch (localProgress.status) {
      case 'downloading':
        // Update for ANY progress change to ensure real-time UI updates
        if (download.status !== 'downloading' || 
            Math.abs((download.progress || 0) - localProgress.progress) > 0.1) {
          updateData.status = 'downloading';
          updateData.statusMessage = 'Downloading...';
          updateData.progress = localProgress.progress;
          updateData.downloadedBytes = localProgress.downloadedBytes;
          updateData.totalBytes = localProgress.totalBytes;
          updateData.downloadSpeed = localProgress.speed;
          hasUpdate = true;
        }
        break;
        
      case 'download_complete':
        if (download.status !== 'download_complete') {
          updateData.status = 'download_complete';
          updateData.statusMessage = 'Download Complete';
          updateData.progress = 100;
          hasUpdate = true;
        }
        break;
        
      case 'extracting':
        if (download.status !== 'extracting' || 
            Math.abs((download.extractionProgress || 0) - (localProgress.extractionProgress || 0)) > 1) {
          updateData.status = 'extracting';
          updateData.statusMessage = 'Extracting files...';
          updateData.extractionProgress = localProgress.extractionProgress || 0;
          updateData.progress = localProgress.extractionProgress || 0;
          hasUpdate = true;
        }
        break;
        
      case 'extraction_complete':
        if (download.status !== 'extraction_complete') {
          updateData.status = 'extraction_complete';
          updateData.statusMessage = 'Extraction Complete';
          updateData.extractionProgress = 100;
          updateData.progress = 100;
          hasUpdate = true;
          
          // Trigger finding executable after a short delay
          setTimeout(() => {
            this.emit('find-executable', download.id);
          }, 1000);
        }
        break;
        
      case 'needs_setup':
        if (download.status !== 'needs_setup') {
          updateData.status = 'needs_setup';
          updateData.statusMessage = 'Needs Installation';
          updateData.extractionProgress = 100;
          updateData.progress = 100;
          updateData.isRepack = localProgress.isRepack || false;
          updateData.repackType = localProgress.repackType || null;
          updateData.extractedPath = localProgress.extractedPath || null;
          hasUpdate = true;
        }
        break;
        
      case 'complete':
        if (download.status !== 'complete') {
          updateData.status = 'complete';
          updateData.statusMessage = 'Game is ready';
          updateData.progress = 100;
          hasUpdate = true;
        }
        break;
        
      case 'error':
        if (download.status !== 'error') {
          updateData.status = 'error';
          updateData.statusMessage = 'Error';
          updateData.error = localProgress.error || 'Download failed';
          hasUpdate = true;
        }
        break;
    }

    if (hasUpdate) {
      // Add to pending updates
      this.pendingUpdates.set(download.id, { ...download, ...updateData });
      
      // For any status change or progress update, emit immediately to UI
      this.emitImmediateUpdate(download.id, { ...download, ...updateData });
    }
  }

  /**
   * Emit immediate update for real-time progress
   */
  emitImmediateUpdate(downloadId, downloadData) {
    // Update store immediately
    const Store = require('electron-store');
    const downloadStore = new Store({ name: 'game-downloads' });
    const downloads = downloadStore.get('downloads', {});
    
    if (downloads[downloadId]) {
      downloads[downloadId] = { ...downloads[downloadId], ...downloadData, lastUpdated: Date.now() };
      downloadStore.set('downloads', downloads);
      
      // Try multiple ways to get the main window
      const { BrowserWindow } = require('electron');
      let mainWindow = global.mainWindow;
      
      if (!mainWindow) {
        // Try to get the main window from BrowserWindow
        const allWindows = BrowserWindow.getAllWindows();
        mainWindow = allWindows.find(win => !win.isDestroyed()) || allWindows[0];
      }
      
      // Emit to UI immediately
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('download-tracker:update', downloads[downloadId]);
      }
    }
  }

  /**
   * Emit batched updates to reduce UI thrashing
   */
  emitBatchedUpdates() {
    if (this.pendingUpdates.size === 0) return;

    const updates = Array.from(this.pendingUpdates.values());
    this.pendingUpdates.clear();

    // Update store
    const Store = require('electron-store');
    const downloadStore = new Store({ name: 'game-downloads' });
    const downloads = downloadStore.get('downloads', {});

    updates.forEach(update => {
      if (downloads[update.id]) {
        downloads[update.id] = { ...downloads[update.id], ...update, lastUpdated: Date.now() };
      }
    });

    downloadStore.set('downloads', downloads);

    // Note: All updates are now immediate, this method is disabled
    // updates.forEach(update => {
    //   if (global.mainWindow) {
    //     global.mainWindow.webContents.send('download-tracker:update', update);
    //   }
    // });
  }

  /**
   * Cache management
   */
  getCachedResult(key) {
    const cached = this.requestCache.get(key);
    if (cached && Date.now() - cached.timestamp < this.config.cache.ttl) {
      return cached.data;
    }
    return null;
  }

  setCachedResult(key, data) {
    this.requestCache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  setupCacheCleanup() {
    this.cacheCleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, cached] of this.requestCache.entries()) {
        if (now - cached.timestamp > this.config.cache.ttl) {
          this.requestCache.delete(key);
        }
      }
    }, this.config.cache.cleanupInterval);
  }

  /**
   * Utility: Debounce function
   */
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  /**
   * Get monitoring statistics
   */
  getStatistics() {
    return {
      isMonitoring: this.isMonitoring,
      pendingUpdates: this.pendingUpdates.size,
      cachedResults: this.requestCache.size,
      lastUpdateCount: this.lastUpdateTime.size,
      intervals: this.config.intervals
    };
  }

  /**
   * Update configuration at runtime
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    console.log('🔧 Updated monitoring configuration:', this.config);
  }
}

// Singleton instance
let instance = null;

function getOptimizedMonitor() {
  if (!instance) {
    instance = new OptimizedDownloadMonitor();
  }
  return instance;
}

module.exports = {
  OptimizedDownloadMonitor,
  getOptimizedMonitor
}; 