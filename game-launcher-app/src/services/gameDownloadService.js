const { ipcMain, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');

class GameDownloadService {
  constructor() {
    this.activeDownloads = new Map();
    this.downloadLocation = '';
    this.setupIpcHandlers();
    this.loadDownloadLocation();
  }

  // Load download location from persistent storage
  loadDownloadLocation() {
    try {
      // In Electron main process, we need to use a different approach to access localStorage
      // We'll use a simple file-based storage for now
      const { app } = require('electron');
      const path = require('path');
      const fs = require('fs');
      
      const configPath = path.join(app.getPath('userData'), 'download-config.json');
      
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (config.downloadLocation && fs.existsSync(config.downloadLocation)) {
          this.downloadLocation = config.downloadLocation;
          console.log(`📁 Loaded download location: ${this.downloadLocation}`);
        }
      }
    } catch (error) {
      console.warn('Failed to load download location:', error.message);
    }
  }

  // Save download location to persistent storage
  saveDownloadLocation() {
    try {
      const { app } = require('electron');
      const path = require('path');
      const fs = require('fs');
      
      const configPath = path.join(app.getPath('userData'), 'download-config.json');
      const config = { downloadLocation: this.downloadLocation };
      
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      console.log(`💾 Saved download location: ${this.downloadLocation}`);
    } catch (error) {
      console.warn('Failed to save download location:', error.message);
    }
  }

  setupIpcHandlers() {
    // Start download
    ipcMain.handle('download:start', async (event, downloadInfo) => {
      return await this.startDownload(downloadInfo);
    });

    // Pause download
    ipcMain.handle('download:pause', async (event, downloadId) => {
      return await this.pauseDownload(downloadId);
    });

    // Resume download
    ipcMain.handle('download:resume', async (event, downloadId) => {
      return await this.resumeDownload(downloadId);
    });

    // Cancel download
    ipcMain.handle('download:cancel', async (event, downloadId) => {
      return await this.cancelDownload(downloadId);
    });

    // Get download status
    ipcMain.handle('download:status', async (event, downloadId) => {
      return this.getDownloadStatus(downloadId);
    });

    // Get active downloads
    ipcMain.handle('download:get-active', async () => {
      return Array.from(this.activeDownloads.values());
    });

    // Set download location
    ipcMain.handle('download:set-location', async (event, location) => {
      return this.setDownloadLocation(location);
    });

    // Get download location
    ipcMain.handle('download:get-location', async () => {
      return this.getDownloadLocation();
    });

    // Open download location
    ipcMain.handle('download:open-location', async () => {
      return this.openDownloadLocation();
    });

    // Start download with extraction
    ipcMain.handle('download:start-with-extraction', async (event, downloadInfo) => {
      return await this.startDownloadWithExtraction(downloadInfo);
    });
  }

  async startDownload(downloadInfo) {
    try {
      const { url, filename, downloadPath, downloadId } = downloadInfo;
      
      console.log(`🔄 Starting download: ${filename}`);
      console.log(`📁 Download path: ${downloadPath}`);
      console.log(`🔗 URL: ${url}`);

      // Validate inputs
      if (!url || !filename || !downloadPath || !downloadId) {
        throw new Error('Missing required download parameters');
      }

      // Check if download location exists
      if (!fs.existsSync(downloadPath)) {
        throw new Error(`Download location does not exist: ${downloadPath}`);
      }

      // Create full file path
      const fullPath = path.join(downloadPath, filename);
      
      // Check if file already exists
      if (fs.existsSync(fullPath)) {
        const timestamp = Date.now();
        const ext = path.extname(filename);
        const name = path.basename(filename, ext);
        const newFilename = `${name}_${timestamp}${ext}`;
        const newFullPath = path.join(downloadPath, newFilename);
        
        console.log(`⚠️ File exists, using new name: ${newFilename}`);
        downloadInfo.filename = newFilename;
        downloadInfo.fullPath = newFullPath;
      } else {
        downloadInfo.fullPath = fullPath;
      }

      // Initialize download status
      const downloadStatus = {
        id: downloadId,
        url,
        filename: downloadInfo.filename,
        fullPath: downloadInfo.fullPath,
        status: 'starting',
        progress: 0,
        downloadedBytes: 0,
        totalBytes: 0,
        speed: 0,
        startTime: Date.now(),
        error: null,
        gameInfo: downloadInfo.gameInfo || null, // Store game info for extraction
        autoExtract: downloadInfo.autoExtract || false
      };

      this.activeDownloads.set(downloadId, downloadStatus);

      // Start the actual download
      this.performDownload(downloadStatus);

      return { success: true, downloadId };

    } catch (error) {
      console.error(`❌ Error starting download:`, error);
      return { success: false, error: error.message };
    }
  }

  async startDownloadWithExtraction(downloadInfo) {
    downloadInfo.autoExtract = true;
    return await this.startDownload(downloadInfo);
  }

  async performDownload(downloadStatus) {
    return new Promise((resolve, reject) => {
      try {
        const urlObj = new URL(downloadStatus.url);
        const protocol = urlObj.protocol === 'https:' ? https : http;

        // Update status to downloading
        downloadStatus.status = 'downloading';
        this.activeDownloads.set(downloadStatus.id, downloadStatus);

        const request = protocol.get(downloadStatus.url, (response) => {
          // Handle redirects
          if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
            console.log(`🔄 Redirecting to: ${response.headers.location}`);
            downloadStatus.url = response.headers.location;
            return this.performDownload(downloadStatus);
          }

          if (response.statusCode !== 200) {
            const error = `HTTP ${response.statusCode}: ${response.statusMessage}`;
            downloadStatus.status = 'failed';
            downloadStatus.error = error;
            this.activeDownloads.set(downloadStatus.id, downloadStatus);
            return reject(new Error(error));
          }

          // Get file size
          const totalBytes = parseInt(response.headers['content-length'], 10) || 0;
          downloadStatus.totalBytes = totalBytes;

          // Create write stream
          const writeStream = fs.createWriteStream(downloadStatus.fullPath);
          let downloadedBytes = 0;
          let lastUpdate = Date.now();

          response.on('data', (chunk) => {
            downloadedBytes += chunk.length;
            downloadStatus.downloadedBytes = downloadedBytes;

            // Calculate progress and speed
            const now = Date.now();
            if (now - lastUpdate > 1000) { // Update every second
              const elapsed = (now - downloadStatus.startTime) / 1000;
              downloadStatus.speed = downloadedBytes / elapsed;
              downloadStatus.progress = totalBytes > 0 ? (downloadedBytes / totalBytes) * 100 : 0;
              
              this.activeDownloads.set(downloadStatus.id, downloadStatus);
              lastUpdate = now;
            }
          });

          // Pipe response to file
          response.pipe(writeStream);

          writeStream.on('finish', async () => {
            downloadStatus.status = 'completed';
            downloadStatus.progress = 100;
            downloadStatus.endTime = Date.now();
            this.activeDownloads.set(downloadStatus.id, downloadStatus);
            
            console.log(`✅ Download completed: ${downloadStatus.filename}`);

            // Auto-extract if enabled and extraction service is available
            if (downloadStatus.autoExtract && downloadStatus.gameInfo && global.extractionService) {
              try {
                const needsExtraction = global.extractionService.needsExtraction(downloadStatus.fullPath);
                
                if (needsExtraction) {
                  console.log(`🔧 Starting automatic extraction for: ${downloadStatus.filename}`);
                  
                  downloadStatus.status = 'extracting';
                  downloadStatus.extractionStarted = true;
                  this.activeDownloads.set(downloadStatus.id, downloadStatus);

                  const extractionInfo = {
                    filePath: downloadStatus.fullPath,
                    gameId: downloadStatus.gameInfo.gameId,
                    gameName: downloadStatus.gameInfo.gameName,
                    destinationPath: this.downloadLocation
                  };

                  const extractionResult = await global.extractionService.extractFile(extractionInfo);
                  
                  if (extractionResult.success) {
                    downloadStatus.status = 'extracted';
                    downloadStatus.extractionId = extractionResult.extractionId;
                    downloadStatus.extractionCompleted = true;
                  } else {
                    downloadStatus.status = 'extraction_failed';
                    downloadStatus.extractionError = extractionResult.error;
                  }
                  
                  this.activeDownloads.set(downloadStatus.id, downloadStatus);
                }
              } catch (extractionError) {
                console.error('Auto-extraction failed:', extractionError);
                downloadStatus.status = 'extraction_failed';
                downloadStatus.extractionError = extractionError.message;
                this.activeDownloads.set(downloadStatus.id, downloadStatus);
              }
            }
            
            resolve(downloadStatus);
          });

          writeStream.on('error', (error) => {
            downloadStatus.status = 'failed';
            downloadStatus.error = error.message;
            this.activeDownloads.set(downloadStatus.id, downloadStatus);
            
            // Clean up partial file
            try {
              fs.unlinkSync(downloadStatus.fullPath);
            } catch (e) {
              console.warn('Failed to clean up partial file:', e.message);
            }
            
            console.error(`❌ Download failed: ${error.message}`);
            reject(error);
          });

        });

        request.on('error', (error) => {
          downloadStatus.status = 'failed';
          downloadStatus.error = error.message;
          this.activeDownloads.set(downloadStatus.id, downloadStatus);
          
          console.error(`❌ Request error: ${error.message}`);
          reject(error);
        });

        // Store request for potential cancellation
        downloadStatus.request = request;

      } catch (error) {
        downloadStatus.status = 'failed';
        downloadStatus.error = error.message;
        this.activeDownloads.set(downloadStatus.id, downloadStatus);
        
        console.error(`❌ Download error: ${error.message}`);
        reject(error);
      }
    });
  }

  async pauseDownload(downloadId) {
    const download = this.activeDownloads.get(downloadId);
    if (!download) {
      return { success: false, error: 'Download not found' };
    }

    if (download.status === 'downloading' && download.request) {
      download.request.destroy();
      download.status = 'paused';
      this.activeDownloads.set(downloadId, download);
      return { success: true };
    }

    return { success: false, error: 'Download cannot be paused' };
  }

  async resumeDownload(downloadId) {
    const download = this.activeDownloads.get(downloadId);
    if (!download) {
      return { success: false, error: 'Download not found' };
    }

    if (download.status === 'paused') {
      // For simplicity, restart the download
      // In a more advanced implementation, you'd use Range headers for resuming
      return this.startDownload({
        url: download.url,
        filename: download.filename,
        downloadPath: path.dirname(download.fullPath),
        downloadId: download.id
      });
    }

    return { success: false, error: 'Download cannot be resumed' };
  }

  async cancelDownload(downloadId) {
    const download = this.activeDownloads.get(downloadId);
    if (!download) {
      return { success: false, error: 'Download not found' };
    }

    // Cancel the request if it's active
    if (download.request) {
      download.request.destroy();
    }

    // Clean up partial file
    try {
      if (fs.existsSync(download.fullPath)) {
        fs.unlinkSync(download.fullPath);
      }
    } catch (error) {
      console.warn('Failed to clean up file:', error.message);
    }

    // Remove from active downloads
    this.activeDownloads.delete(downloadId);

    return { success: true };
  }

  getDownloadStatus(downloadId) {
    const download = this.activeDownloads.get(downloadId);
    if (!download) {
      return { success: false, error: 'Download not found' };
    }

    // Return a clean copy without the request object
    const { request, ...cleanDownload } = download;
    return { success: true, download: cleanDownload };
  }

  setDownloadLocation(location) {
    try {
      if (!fs.existsSync(location)) {
        return { success: false, error: 'Location does not exist' };
      }

      this.downloadLocation = location;
      this.saveDownloadLocation(); // Persist the location
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  getDownloadLocation() {
    return this.downloadLocation;
  }

  async openDownloadLocation() {
    try {
      if (this.downloadLocation && fs.existsSync(this.downloadLocation)) {
        await shell.openPath(this.downloadLocation);
        return { success: true };
      } else {
        return { success: false, error: 'Download location not set or does not exist' };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Clean up completed downloads older than 24 hours
  cleanup() {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    
    for (const [id, download] of this.activeDownloads.entries()) {
      if (download.status === 'completed' && download.endTime && download.endTime < oneDayAgo) {
        this.activeDownloads.delete(id);
      }
    }
  }
}

// Initialize and export the service
function initGameDownloadService() {
  const gameDownloadService = new GameDownloadService();
  
  // Cleanup on app termination
  process.on('exit', () => {
    gameDownloadService.cleanup();
  });

  return gameDownloadService;
}

module.exports = { initGameDownloadService }; 