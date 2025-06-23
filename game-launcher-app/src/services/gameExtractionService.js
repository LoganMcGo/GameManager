const { ipcMain, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');
const { createReadStream, createWriteStream } = require('fs');
const { pipeline } = require('stream');
const { promisify } = require('util');

class GameExtractionService {
  constructor() {
    this.activeExtractions = new Map();
    this.tempDirectory = '';
    this.setupIpcHandlers();
    this.initializeTempDirectorySync();
  }

  initializeTempDirectorySync() {
    try {
      const { app } = require('electron');
      const os = require('os');
      
      // Create temp directory in user's temp folder
      this.tempDirectory = path.join(os.tmpdir(), 'game-manager-temp');
      
      if (!fs.existsSync(this.tempDirectory)) {
        fs.mkdirSync(this.tempDirectory, { recursive: true });
      }
      
      console.log(`📁 Temp directory initialized: ${this.tempDirectory}`);
    } catch (error) {
      console.error('Failed to initialize temp directory:', error);
    }
  }

  setupIpcHandlers() {
    // Extract downloaded file
    ipcMain.handle('extraction:extract-file', async (event, extractionInfo) => {
      return await this.extractFile(extractionInfo);
    });

    // Get extraction status
    ipcMain.handle('extraction:get-status', async (event, extractionId) => {
      return this.getExtractionStatus(extractionId);
    });

    // Cancel extraction
    ipcMain.handle('extraction:cancel', async (event, extractionId) => {
      return await this.cancelExtraction(extractionId);
    });

    // Check if file needs extraction
    ipcMain.handle('extraction:needs-extraction', async (event, filePath) => {
      return this.needsExtraction(filePath);
    });

    // Install game (for repacks and installers)
    ipcMain.handle('extraction:install-game', async (event, installInfo) => {
      return await this.installGame(installInfo);
    });

    // Clean temp directory
    ipcMain.handle('extraction:clean-temp', async () => {
      return await this.cleanTempDirectory();
    });
  }

  needsExtraction(filePath) {
    const extractableExtensions = ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz', '.iso'];
    const fileExtension = path.extname(filePath).toLowerCase();
    return extractableExtensions.includes(fileExtension);
  }

  async extractFile(extractionInfo) {
    try {
      const { filePath, gameId, gameName, destinationPath } = extractionInfo;
      const extractionId = `extract_${gameId}_${Date.now()}`;
      
      console.log(`🔧 Starting extraction: ${gameName}`);
      console.log(`📁 Source: ${filePath}`);
      console.log(`📁 Destination: ${destinationPath}`);

      // Validate inputs
      if (!fs.existsSync(filePath)) {
        throw new Error(`Source file does not exist: ${filePath}`);
      }

      if (!fs.existsSync(destinationPath)) {
        fs.mkdirSync(destinationPath, { recursive: true });
      }

      // Create temp extraction directory
      const tempExtractionPath = path.join(this.tempDirectory, `extraction_${extractionId}`);
      if (!fs.existsSync(tempExtractionPath)) {
        fs.mkdirSync(tempExtractionPath, { recursive: true });
      }

      // Initialize extraction status
      const extractionStatus = {
        id: extractionId,
        gameId,
        gameName,
        filePath,
        tempPath: tempExtractionPath,
        destinationPath,
        status: 'starting',
        progress: 0,
        startTime: Date.now(),
        error: null,
        process: null
      };

      this.activeExtractions.set(extractionId, extractionStatus);

      // Start extraction based on file type
      const fileExtension = path.extname(filePath).toLowerCase();
      await this.performExtraction(extractionStatus, fileExtension);

      return { success: true, extractionId };

    } catch (error) {
      console.error(`❌ Error starting extraction:`, error);
      return { success: false, error: error.message };
    }
  }

  async performExtraction(extractionStatus, fileExtension) {
    return new Promise((resolve, reject) => {
      try {
        extractionStatus.status = 'extracting';
        this.activeExtractions.set(extractionStatus.id, extractionStatus);

        let command, args;

        // Determine extraction command based on file type
        switch (fileExtension) {
          case '.zip':
            // Use built-in Node.js solution or 7-Zip if available
            this.extractZip(extractionStatus, resolve, reject);
            return;
          
          case '.rar':
            // Try WinRAR or 7-Zip
            command = 'UnRAR.exe';
            args = ['x', '-y', extractionStatus.filePath, extractionStatus.tempPath + '\\'];
            break;
          
          case '.7z':
            // Use 7-Zip
            command = '7z.exe';
            args = ['x', `-o${extractionStatus.tempPath}`, '-y', extractionStatus.filePath];
            break;
          
          case '.iso':
            // For ISO files, we might need to mount or use 7-Zip
            command = '7z.exe';
            args = ['x', `-o${extractionStatus.tempPath}`, '-y', extractionStatus.filePath];
            break;
          
          default:
            throw new Error(`Unsupported file format: ${fileExtension}`);
        }

        // Try to find the extraction tool
        this.findExtractionTool(command, (toolPath) => {
          if (!toolPath) {
            // Fallback to built-in extraction for supported formats
            if (fileExtension === '.zip') {
              this.extractZip(extractionStatus, resolve, reject);
              return;
            }
            
            extractionStatus.status = 'failed';
            extractionStatus.error = `Extraction tool not found for ${fileExtension} files`;
            this.activeExtractions.set(extractionStatus.id, extractionStatus);
            reject(new Error(extractionStatus.error));
            return;
          }

          // Execute extraction
          const process = spawn(toolPath, args);
          extractionStatus.process = process;

          let output = '';
          let errorOutput = '';

          process.stdout.on('data', (data) => {
            output += data.toString();
            // Try to parse progress from output
            this.parseExtractionProgress(extractionStatus, data.toString());
          });

          process.stderr.on('data', (data) => {
            errorOutput += data.toString();
          });

          process.on('close', (code) => {
            if (code === 0) {
              // Extraction successful, move files to destination
              this.moveExtractedFiles(extractionStatus, resolve, reject);
            } else {
              extractionStatus.status = 'failed';
              extractionStatus.error = `Extraction failed with code ${code}: ${errorOutput}`;
              this.activeExtractions.set(extractionStatus.id, extractionStatus);
              reject(new Error(extractionStatus.error));
            }
          });

          process.on('error', (error) => {
            extractionStatus.status = 'failed';
            extractionStatus.error = error.message;
            this.activeExtractions.set(extractionStatus.id, extractionStatus);
            reject(error);
          });
        });

      } catch (error) {
        extractionStatus.status = 'failed';
        extractionStatus.error = error.message;
        this.activeExtractions.set(extractionStatus.id, extractionStatus);
        reject(error);
      }
    });
  }

  // Built-in ZIP extraction using Node.js
  async extractZip(extractionStatus, resolve, reject) {
    try {
      const AdmZip = require('adm-zip');
      const zip = new AdmZip(extractionStatus.filePath);
      const entries = zip.getEntries();
      
      let processed = 0;
      const total = entries.length;

      for (const entry of entries) {
        const entryPath = path.join(extractionStatus.tempPath, entry.entryName);
        
        if (entry.isDirectory) {
          if (!fs.existsSync(entryPath)) {
            fs.mkdirSync(entryPath, { recursive: true });
          }
        } else {
          const entryDir = path.dirname(entryPath);
          if (!fs.existsSync(entryDir)) {
            fs.mkdirSync(entryDir, { recursive: true });
          }
          
          fs.writeFileSync(entryPath, entry.getData());
        }
        
        processed++;
        extractionStatus.progress = Math.round((processed / total) * 100);
        this.activeExtractions.set(extractionStatus.id, extractionStatus);
      }

      // Move files to destination
      this.moveExtractedFiles(extractionStatus, resolve, reject);

    } catch (error) {
      extractionStatus.status = 'failed';
      extractionStatus.error = error.message;
      this.activeExtractions.set(extractionStatus.id, extractionStatus);
      reject(error);
    }
  }

  findExtractionTool(toolName, callback) {
    // Common paths where extraction tools might be installed
    const commonPaths = [
      `C:\\Program Files\\7-Zip\\${toolName}`,
      `C:\\Program Files (x86)\\7-Zip\\${toolName}`,
      `C:\\Program Files\\WinRAR\\${toolName}`,
      `C:\\Program Files (x86)\\WinRAR\\${toolName}`,
      path.join(process.env.PROGRAMFILES || '', '7-Zip', toolName),
      path.join(process.env['PROGRAMFILES(X86)'] || '', '7-Zip', toolName),
      path.join(process.env.PROGRAMFILES || '', 'WinRAR', toolName),
      path.join(process.env['PROGRAMFILES(X86)'] || '', 'WinRAR', toolName)
    ];

    // Check if tool exists in common paths
    for (const toolPath of commonPaths) {
      if (fs.existsSync(toolPath)) {
        callback(toolPath);
        return;
      }
    }

    // Try to find in PATH
    exec(`where ${toolName}`, (error, stdout) => {
      if (!error && stdout.trim()) {
        callback(stdout.trim().split('\n')[0]);
      } else {
        callback(null);
      }
    });
  }

  parseExtractionProgress(extractionStatus, output) {
    // Try to parse progress from different tool outputs
    const progressMatches = output.match(/(\d+)%/);
    if (progressMatches) {
      const progress = parseInt(progressMatches[1]);
      if (!isNaN(progress)) {
        extractionStatus.progress = progress;
        this.activeExtractions.set(extractionStatus.id, extractionStatus);
      }
    }
  }

  async moveExtractedFiles(extractionStatus, resolve, reject) {
    try {
      extractionStatus.status = 'moving';
      extractionStatus.progress = 90;
      this.activeExtractions.set(extractionStatus.id, extractionStatus);

      // Create game directory in destination
      const gameDir = path.join(extractionStatus.destinationPath, extractionStatus.gameName);
      if (!fs.existsSync(gameDir)) {
        fs.mkdirSync(gameDir, { recursive: true });
      }

      // Move all extracted files to game directory
      await this.moveDirectory(extractionStatus.tempPath, gameDir);

      // Clean up temp directory
      await this.deleteTempDirectory(extractionStatus.tempPath);

      extractionStatus.status = 'completed';
      extractionStatus.progress = 100;
      extractionStatus.finalPath = gameDir;
      this.activeExtractions.set(extractionStatus.id, extractionStatus);

      console.log(`✅ Extraction completed: ${extractionStatus.gameName}`);
      resolve(extractionStatus);

    } catch (error) {
      extractionStatus.status = 'failed';
      extractionStatus.error = error.message;
      this.activeExtractions.set(extractionStatus.id, extractionStatus);
      reject(error);
    }
  }

  async moveDirectory(source, destination) {
    const items = fs.readdirSync(source);
    
    for (const item of items) {
      const sourcePath = path.join(source, item);
      const destPath = path.join(destination, item);
      
      const stat = fs.statSync(sourcePath);
      
      if (stat.isDirectory()) {
        if (!fs.existsSync(destPath)) {
          fs.mkdirSync(destPath, { recursive: true });
        }
        await this.moveDirectory(sourcePath, destPath);
      } else {
        fs.renameSync(sourcePath, destPath);
      }
    }
  }

  async deleteTempDirectory(dirPath) {
    if (fs.existsSync(dirPath)) {
      const items = fs.readdirSync(dirPath);
      
      for (const item of items) {
        const itemPath = path.join(dirPath, item);
        const stat = fs.statSync(itemPath);
        
        if (stat.isDirectory()) {
          await this.deleteTempDirectory(itemPath);
        } else {
          fs.unlinkSync(itemPath);
        }
      }
      
      fs.rmdirSync(dirPath);
    }
  }

  async installGame(installInfo) {
    try {
      const { gameId, gameName, gameDirectory, installationType } = installInfo;
      
      console.log(`🔧 Starting installation: ${gameName}`);
      console.log(`📁 Game directory: ${gameDirectory}`);
      console.log(`🎮 Installation type: ${installationType}`);

      // Look for installer executable
      const installerPath = await this.findInstaller(gameDirectory);
      
      if (!installerPath) {
        return {
          success: false,
          error: 'No installer found in the extracted files',
          needsManualInstall: true,
          gameDirectory
        };
      }

      return {
        success: true,
        installerFound: true,
        installerPath,
        gameDirectory,
        message: 'Installer found. Please run the installer and follow the prompts.',
        instructions: `After installation, please ensure the game is installed in a subfolder of ${gameDirectory} so the launcher can find the executable.`
      };

    } catch (error) {
      console.error(`❌ Error during installation:`, error);
      return { success: false, error: error.message };
    }
  }

  async findInstaller(gameDirectory) {
    try {
      const installerPatterns = [
        /setup\.exe$/i,
        /install\.exe$/i,
        /installer\.exe$/i,
        /.*setup.*\.exe$/i,
        /.*install.*\.exe$/i,
        /.*installer.*\.exe$/i
      ];

      const files = this.getAllFiles(gameDirectory);
      
      for (const file of files) {
        const fileName = path.basename(file);
        for (const pattern of installerPatterns) {
          if (pattern.test(fileName)) {
            return file;
          }
        }
      }

      return null;
    } catch (error) {
      console.error('Error finding installer:', error);
      return null;
    }
  }

  getAllFiles(dirPath, fileList = []) {
    const files = fs.readdirSync(dirPath);
    
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stat = fs.statSync(filePath);
      
      if (stat.isDirectory()) {
        this.getAllFiles(filePath, fileList);
      } else {
        fileList.push(filePath);
      }
    }
    
    return fileList;
  }

  getExtractionStatus(extractionId) {
    return this.activeExtractions.get(extractionId) || null;
  }

  async cancelExtraction(extractionId) {
    try {
      const extraction = this.activeExtractions.get(extractionId);
      if (!extraction) {
        return { success: false, error: 'Extraction not found' };
      }

      if (extraction.process) {
        extraction.process.kill();
      }

      // Clean up temp directory
      if (extraction.tempPath && fs.existsSync(extraction.tempPath)) {
        await this.deleteTempDirectory(extraction.tempPath);
      }

      extraction.status = 'cancelled';
      this.activeExtractions.set(extractionId, extraction);

      return { success: true };
    } catch (error) {
      console.error('Error cancelling extraction:', error);
      return { success: false, error: error.message };
    }
  }

  async cleanTempDirectory() {
    try {
      if (fs.existsSync(this.tempDirectory)) {
        const items = fs.readdirSync(this.tempDirectory);
        
        for (const item of items) {
          const itemPath = path.join(this.tempDirectory, item);
          await this.deleteTempDirectory(itemPath);
        }
      }
      
      console.log(`🧹 Temp directory cleaned: ${this.tempDirectory}`);
      return { success: true };
    } catch (error) {
      console.error('Error cleaning temp directory:', error);
      return { success: false, error: error.message };
    }
  }

  cleanup() {
    // Clean up any active extractions
    for (const extraction of this.activeExtractions.values()) {
      if (extraction.process) {
        extraction.process.kill();
      }
    }
    
    this.activeExtractions.clear();
  }
}

// Initialize and export the service
function initGameExtractionService() {
  console.log('🔧 Initializing Game Extraction Service...');
  return new GameExtractionService();
}

module.exports = { initGameExtractionService }; 