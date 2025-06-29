const { ipcMain, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const os = require('os');
const { spawn, exec } = require('child_process');

class GameDownloadService {
  constructor() {
    this.activeDownloads = new Map();
    this.downloadLocation = '';
    this.tempDirectory = '';
    this.setupIpcHandlers();
    this.loadDownloadLocation();
    this.initializeTempDirectory();
  }

  // Initialize temp directory for downloads
  initializeTempDirectory() {
    try {
      const { app } = require('electron');
      
      // Create temp directory in user's temp folder
      this.tempDirectory = path.join(os.tmpdir(), 'game-manager-downloads');
      
      if (!fs.existsSync(this.tempDirectory)) {
        fs.mkdirSync(this.tempDirectory, { recursive: true });
      }
      
      console.log(`📁 Temp download directory initialized: ${this.tempDirectory}`);
    } catch (error) {
      console.error('Failed to initialize temp directory:', error);
    }
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
      console.log(`📁 Final destination: ${downloadPath}`);
      console.log(`🔗 URL: ${url}`);

      // Validate inputs
      if (!url || !filename || !downloadPath || !downloadId) {
        throw new Error('Missing required download parameters');
      }

      // Check if final destination exists
      if (!fs.existsSync(downloadPath)) {
        throw new Error(`Download location does not exist: ${downloadPath}`);
      }

      // Create temp file path for download
      const tempFilename = `${Date.now()}_${filename}`;
      const tempFilePath = path.join(this.tempDirectory, tempFilename);
      
      console.log(`📁 Temp download path: ${tempFilePath}`);

      // Initialize download status
      const downloadStatus = {
        id: downloadId,
        url,
        filename: filename,
        tempFilePath: tempFilePath,
        finalDestination: downloadPath,
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
          const writeStream = fs.createWriteStream(downloadStatus.tempFilePath);
          let downloadedBytes = 0;
          let lastUpdate = Date.now();

          response.on('data', (chunk) => {
            downloadedBytes += chunk.length;
            downloadStatus.downloadedBytes = downloadedBytes;

            // Calculate progress and speed
            const now = Date.now();
            if (now - lastUpdate > 500) { // Update every 500ms for real-time progress
              const elapsed = (now - downloadStatus.startTime) / 1000;
              downloadStatus.speed = downloadedBytes / elapsed;
              downloadStatus.progress = totalBytes > 0 ? (downloadedBytes / totalBytes) * 100 : 0;
              
              this.activeDownloads.set(downloadStatus.id, downloadStatus);
              lastUpdate = now;
              
              console.log(`📈 Download progress: ${downloadStatus.filename} - ${downloadStatus.progress.toFixed(1)}%`);
            }
          });

          // Pipe response to file
          response.pipe(writeStream);

          writeStream.on('finish', async () => {
            downloadStatus.status = 'download_complete';
            downloadStatus.progress = 100;
            downloadStatus.endTime = Date.now();
            this.activeDownloads.set(downloadStatus.id, downloadStatus);
            
            console.log(`✅ Download completed: ${downloadStatus.filename}`);

            // Auto-extract if enabled
            if (downloadStatus.autoExtract && downloadStatus.gameInfo) {
              try {
                const needsExtraction = this.needsExtraction(downloadStatus.tempFilePath);
                
                if (needsExtraction) {
                  console.log(`🔧 Starting automatic extraction for: ${downloadStatus.filename}`);
                  
                  downloadStatus.status = 'extracting';
                  downloadStatus.extractionProgress = 0;
                  this.activeDownloads.set(downloadStatus.id, downloadStatus);

                  const extractionResult = await this.extractFile(downloadStatus);
                  
                  if (extractionResult.success) {
                    downloadStatus.status = 'extraction_complete';
                    downloadStatus.extractionProgress = 100;
                    downloadStatus.extractedPath = extractionResult.extractedPath;
                    
                    // Clean up downloaded archive after successful extraction
                    try {
                      fs.unlinkSync(downloadStatus.tempFilePath);
                      console.log(`🗑️ Cleaned up archive: ${downloadStatus.filename}`);
                    } catch (cleanupError) {
                      console.warn('Failed to cleanup archive:', cleanupError.message);
                    }
                  } else {
                    downloadStatus.status = 'error';
                    downloadStatus.error = `Extraction failed: ${extractionResult.error}`;
                  }
                  
                  this.activeDownloads.set(downloadStatus.id, downloadStatus);
                } else {
                  // File doesn't need extraction, move from temp to final destination
                  try {
                    const finalFilePath = path.join(downloadStatus.finalDestination, downloadStatus.filename);
                    
                    // Ensure destination directory exists
                    if (!fs.existsSync(downloadStatus.finalDestination)) {
                      fs.mkdirSync(downloadStatus.finalDestination, { recursive: true });
                    }
                    
                    // Move file from temp to final destination
                    fs.renameSync(downloadStatus.tempFilePath, finalFilePath);
                    console.log(`📁 Moved file to: ${finalFilePath}`);
                    
                    downloadStatus.status = 'complete';
                    downloadStatus.finalPath = finalFilePath;
                  } catch (moveError) {
                    console.error('Failed to move file:', moveError);
                    downloadStatus.status = 'error';
                    downloadStatus.error = `Failed to move file: ${moveError.message}`;
                  }
                  this.activeDownloads.set(downloadStatus.id, downloadStatus);
                }
              } catch (extractionError) {
                console.error('Auto-extraction failed:', extractionError);
                downloadStatus.status = 'error';
                downloadStatus.error = `Extraction failed: ${extractionError.message}`;
                this.activeDownloads.set(downloadStatus.id, downloadStatus);
              }
            } else {
              // No extraction needed, move from temp to final destination  
              try {
                const finalFilePath = path.join(downloadStatus.finalDestination, downloadStatus.filename);
                
                // Ensure destination directory exists
                if (!fs.existsSync(downloadStatus.finalDestination)) {
                  fs.mkdirSync(downloadStatus.finalDestination, { recursive: true });
                }
                
                // Move file from temp to final destination
                fs.renameSync(downloadStatus.tempFilePath, finalFilePath);
                console.log(`📁 Moved file to: ${finalFilePath}`);
                
                downloadStatus.status = 'complete';
                downloadStatus.finalPath = finalFilePath;
              } catch (moveError) {
                console.error('Failed to move file:', moveError);
                downloadStatus.status = 'error';
                downloadStatus.error = `Failed to move file: ${moveError.message}`;
              }
              this.activeDownloads.set(downloadStatus.id, downloadStatus);
            }
            
            resolve(downloadStatus);
          });

          writeStream.on('error', (error) => {
            downloadStatus.status = 'failed';
            downloadStatus.error = error.message;
            this.activeDownloads.set(downloadStatus.id, downloadStatus);
            
            // Clean up partial file
            try {
              fs.unlinkSync(downloadStatus.tempFilePath);
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
        downloadPath: download.finalDestination,
        downloadId: download.id,
        gameInfo: download.gameInfo,
        autoExtract: download.autoExtract
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
      if (fs.existsSync(download.tempFilePath)) {
        fs.unlinkSync(download.tempFilePath);
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

  // Check if file needs extraction based on extension
  needsExtraction(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const extractableExtensions = ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz'];
    return extractableExtensions.includes(ext);
  }

  // Extract file using built-in extraction or external tools
  async extractFile(downloadStatus) {
    try {
      const { tempFilePath, gameInfo, finalDestination } = downloadStatus;
      const ext = path.extname(tempFilePath).toLowerCase();
      
      // Create extraction directory
      const gameName = gameInfo.gameName.replace(/[<>:"/\\|?*]/g, '_');
      const extractionPath = path.join(finalDestination, gameName);
      
      // Ensure extraction directory exists
      if (!fs.existsSync(extractionPath)) {
        fs.mkdirSync(extractionPath, { recursive: true });
      }
      
      console.log(`📦 Extracting ${tempFilePath} to ${extractionPath}`);
      
      // Update extraction progress
      downloadStatus.extractionProgress = 10;
      this.activeDownloads.set(downloadStatus.id, downloadStatus);
      
      let extractionResult;
      
      if (ext === '.zip') {
        extractionResult = await this.extractZip(tempFilePath, extractionPath, downloadStatus);
      } else if (ext === '.rar') {
        extractionResult = await this.extractRar(tempFilePath, extractionPath, downloadStatus);
      } else if (ext === '.7z') {
        extractionResult = await this.extract7z(tempFilePath, extractionPath, downloadStatus);
      } else {
        throw new Error(`Unsupported archive format: ${ext}`);
      }
      
      if (extractionResult.success) {
        console.log(`✅ Successfully extracted to: ${extractionPath}`);
        return {
          success: true,
          extractedPath: extractionPath
        };
      } else {
        throw new Error(extractionResult.error);
      }
      
    } catch (error) {
      console.error('Extraction failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Extract ZIP files using built-in modules
  async extractZip(zipPath, extractPath, downloadStatus) {
    try {
      const yauzl = require('yauzl');
      
      return new Promise((resolve, reject) => {
        yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
          if (err) {
            return reject({ success: false, error: err.message });
          }
          
          let entryCount = 0;
          let extractedCount = 0;
          
          // Count total entries first
          zipfile.on('entry', () => {
            entryCount++;
          });
          
          zipfile.readEntry();
          
          // Reset and start extraction
          setTimeout(() => {
            yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile2) => {
              if (err) {
                return reject({ success: false, error: err.message });
              }
              
              zipfile2.on('entry', (entry) => {
                const fileName = entry.fileName;
                const fullPath = path.join(extractPath, fileName);
                
                if (/\/$/.test(fileName)) {
                  // Directory entry
                  fs.mkdirSync(fullPath, { recursive: true });
                  extractedCount++;
                  this.updateExtractionProgress(downloadStatus, extractedCount, entryCount);
                  zipfile2.readEntry();
                } else {
                  // File entry
                  zipfile2.openReadStream(entry, (err, readStream) => {
                    if (err) {
                      return reject({ success: false, error: err.message });
                    }
                    
                    // Ensure directory exists
                    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
                    
                    const writeStream = fs.createWriteStream(fullPath);
                    readStream.pipe(writeStream);
                    
                    writeStream.on('close', () => {
                      extractedCount++;
                      this.updateExtractionProgress(downloadStatus, extractedCount, entryCount);
                      zipfile2.readEntry();
                    });
                    
                    writeStream.on('error', (error) => {
                      reject({ success: false, error: error.message });
                    });
                  });
                }
              });
              
              zipfile2.on('end', () => {
                resolve({ success: true });
              });
              
              zipfile2.on('error', (error) => {
                reject({ success: false, error: error.message });
              });
              
              zipfile2.readEntry();
            });
          }, 100);
        });
      });
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Find 7-Zip executable path
  find7ZipPath() {
    // Common paths where 7-Zip might be installed
    const commonPaths = [
      'C:\\Program Files\\7-Zip\\7z.exe',
      'C:\\Program Files (x86)\\7-Zip\\7z.exe',
      path.join(process.env.PROGRAMFILES || '', '7-Zip', '7z.exe'),
      path.join(process.env['PROGRAMFILES(X86)'] || '', '7-Zip', '7z.exe')
    ];

    // Check if 7z.exe exists in common paths
    for (const sevenZipPath of commonPaths) {
      if (fs.existsSync(sevenZipPath)) {
        return sevenZipPath;
      }
    }

    // Try to find in PATH
    return '7z'; // Will work if 7z is in PATH, otherwise will fail with ENOENT
  }

  // Extract RAR files using 7-Zip or WinRAR
  async extractRar(rarPath, extractPath, downloadStatus) {
    try {
      return new Promise((resolve, reject) => {
        // Try 7-Zip first (more commonly available)
        const sevenZipPath = this.find7ZipPath();
        
        let extractProcess;
        try {
          extractProcess = spawn(sevenZipPath, ['x', rarPath, `-o${extractPath}`, '-y'], {
            stdio: 'pipe'
          });
        } catch (e) {
          // Try WinRAR as fallback
          try {
            extractProcess = spawn('winrar', ['x', '-y', rarPath, extractPath], {
              stdio: 'pipe'
            });
          } catch (e2) {
            return reject({ success: false, error: 'RAR extraction requires 7-Zip or WinRAR to be installed' });
          }
        }
        
        let progress = 20;
        const progressInterval = setInterval(() => {
          if (progress < 90) {
            progress += 10;
            downloadStatus.extractionProgress = progress;
            this.activeDownloads.set(downloadStatus.id, downloadStatus);
          }
        }, 1000);
        
        extractProcess.on('close', (code) => {
          clearInterval(progressInterval);
          if (code === 0) {
            resolve({ success: true });
          } else {
            reject({ success: false, error: `RAR extraction failed with code ${code}` });
          }
        });
        
        extractProcess.on('error', (error) => {
          clearInterval(progressInterval);
          if (error.code === 'ENOENT') {
            reject({ success: false, error: '7-Zip not found. Please install 7-Zip for RAR file support.' });
          } else {
            reject({ success: false, error: error.message });
          }
        });
      });
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Extract 7z files using 7-Zip
  async extract7z(archivePath, extractPath, downloadStatus) {
    try {
      return new Promise((resolve, reject) => {
        const sevenZipPath = this.find7ZipPath();
        
        const extractProcess = spawn(sevenZipPath, ['x', archivePath, `-o${extractPath}`, '-y'], {
          stdio: 'pipe'
        });
        
        let progress = 20;
        const progressInterval = setInterval(() => {
          if (progress < 90) {
            progress += 10;
            downloadStatus.extractionProgress = progress;
            this.activeDownloads.set(downloadStatus.id, downloadStatus);
          }
        }, 1000);
        
        extractProcess.on('close', (code) => {
          clearInterval(progressInterval);
          if (code === 0) {
            resolve({ success: true });
          } else {
            reject({ success: false, error: `7z extraction failed with code ${code}` });
          }
        });
        
        extractProcess.on('error', (error) => {
          clearInterval(progressInterval);
          if (error.code === 'ENOENT') {
            reject({ success: false, error: '7-Zip not found. Please install 7-Zip for .7z file support.' });
          } else {
            reject({ success: false, error: error.message });
          }
        });
      });
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Update extraction progress
  updateExtractionProgress(downloadStatus, completed, total) {
    if (total > 0) {
      const progress = Math.min(95, 20 + (completed / total) * 75); // 20% to 95%
      downloadStatus.extractionProgress = progress;
      this.activeDownloads.set(downloadStatus.id, downloadStatus);
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