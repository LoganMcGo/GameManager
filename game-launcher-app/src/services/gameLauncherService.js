const { ipcMain, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');

class GameLauncherService {
  constructor() {
    this.runningGames = new Map();
    this.gameExecutables = new Map(); // Cache for found executables
    this.setupIpcHandlers();
    this.setupProcessMonitoring();
  }

  setupIpcHandlers() {
    // Launch game
    ipcMain.handle('launcher:launch-game', async (event, gameInfo) => {
      return await this.launchGame(gameInfo);
    });

    // Stop game
    ipcMain.handle('launcher:stop-game', async (event, gameId) => {
      return await this.stopGame(gameId);
    });

    // Get game status
    ipcMain.handle('launcher:get-game-status', async (event, gameId) => {
      return this.getGameStatus(gameId);
    });

    // Get all running games
    ipcMain.handle('launcher:get-running-games', async () => {
      return Array.from(this.runningGames.keys());
    });

    // Find game executable
    ipcMain.handle('launcher:find-executable', async (event, gameInfo) => {
      return await this.findGameExecutable(gameInfo);
    });

    // Find game executable (alternative handler name)
    ipcMain.handle('launcher:find-game-executable', async (event, gameInfo) => {
      return await this.findGameExecutable(gameInfo);
    });

    // Scan for game executables in directory
    ipcMain.handle('launcher:scan-directory', async (event, directoryPath) => {
      return await this.scanDirectoryForExecutables(directoryPath);
    });

    // Set custom executable path for a game
    ipcMain.handle('launcher:set-executable-path', async (event, gameId, executablePath) => {
      return this.setCustomExecutablePath(gameId, executablePath);
    });

    // Check if game is installed/ready to play
    ipcMain.handle('launcher:is-game-ready', async (event, gameInfo) => {
      return await this.isGameReady(gameInfo);
    });

    // Check if directory exists
    ipcMain.handle('launcher:check-directory-exists', async (event, directoryPath) => {
      return this.checkDirectoryExists(directoryPath);
    });

    // Uninstall game
    ipcMain.handle('launcher:uninstall-game', async (event, gameInfo) => {
      return await this.uninstallGame(gameInfo);
    });

    // Repack handling
    ipcMain.handle('launcher:run-repack-installer', async (event, installerInfo) => {
      return await this.runRepackInstaller(installerInfo);
    });

    ipcMain.handle('launcher:check-repack-installation', async (event, gameInfo) => {
      return await this.checkRepackInstallation(gameInfo);
    });

    ipcMain.handle('launcher:add-installed-game', async (event, gameInfo) => {
      return await this.addInstalledGame(gameInfo);
    });
  }

  setupProcessMonitoring() {
    // Monitor running processes every 2 seconds for better responsiveness
    setInterval(() => {
      this.monitorRunningGames();
    }, 2000);
  }

  async launchGame(gameInfo) {
    try {
      const { gameId, gameName, gameDirectory } = gameInfo;

      // Check if game is already running
      if (this.runningGames.has(gameId)) {
        return {
          success: false,
          error: 'Game is already running',
          status: 'already_running'
        };
      }

      // Find the game executable
      const executableInfo = await this.findGameExecutable(gameInfo);
      
      if (!executableInfo.success) {
        return {
          success: false,
          error: executableInfo.error,
          needsManualSetup: true,
          gameDirectory
        };
      }

      const executablePath = executableInfo.executablePath;
      const workingDirectory = path.dirname(executablePath);

      // Launch the game
      const gameProcess = spawn(executablePath, [], {
        cwd: workingDirectory,
        detached: true,
        stdio: ['ignore', 'ignore', 'ignore']
      });

      // Store running game info
      const gameProcessInfo = {
        gameId,
        gameName,
        executablePath,
        workingDirectory,
        process: gameProcess,
        pid: gameProcess.pid,
        startTime: Date.now(),
        status: 'running'
      };

      this.runningGames.set(gameId, gameProcessInfo);

      // Handle process events
      gameProcess.on('exit', (code, signal) => {
        this.runningGames.delete(gameId);
        // Notify UI immediately when process exits
        this.notifyGameClosed(gameId, gameName);
      });

      gameProcess.on('error', (error) => {
        console.error(`Game process error: ${gameName}`, error);
        this.runningGames.delete(gameId);
        // Notify UI about process error
        this.notifyGameClosed(gameId, gameName);
      });

      // Unref to allow the main process to exit
      gameProcess.unref();
      
      return {
        success: true,
        pid: gameProcess.pid,
        executablePath,
        message: `${gameName} has been launched successfully`
      };

    } catch (error) {
      console.error(`Error launching game:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async stopGame(gameId) {
    try {
      const gameProcess = this.runningGames.get(gameId);
      
      if (!gameProcess) {
        return {
          success: false,
          error: 'Game is not running'
        };
      }

      // Try to gracefully terminate the process
      try {
        if (process.platform === 'win32') {
          // On Windows, use taskkill for better process termination
          exec(`taskkill /PID ${gameProcess.pid} /T /F`, (error) => {
            if (error) {
              console.warn(`Warning: Failed to kill process via taskkill: ${error.message}`);
            }
          });
        } else {
          // On Unix-like systems, use SIGTERM then SIGKILL
          gameProcess.process.kill('SIGTERM');
          
          // If process doesn't exit in 5 seconds, force kill
          setTimeout(() => {
            if (this.runningGames.has(gameId)) {
              gameProcess.process.kill('SIGKILL');
            }
          }, 5000);
        }
      } catch (killError) {
        console.warn(`Warning: Failed to kill process: ${killError.message}`);
      }

      // Remove from running games
      this.runningGames.delete(gameId);

      return {
        success: true,
        message: `${gameProcess.gameName} has been stopped`
      };

    } catch (error) {
      console.error(`Error stopping game:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  getGameStatus(gameId) {
    const gameProcess = this.runningGames.get(gameId);
    
    if (!gameProcess) {
      return {
        status: 'not_running',
        isRunning: false
      };
    }

    return {
      status: 'running',
      isRunning: true,
      pid: gameProcess.pid,
      startTime: gameProcess.startTime,
      executablePath: gameProcess.executablePath,
      uptime: Date.now() - gameProcess.startTime
    };
  }

  async findGameExecutable(gameInfo) {
    try {
      const { gameId, gameName, gameDirectory } = gameInfo;

      // Check cache first
      if (this.gameExecutables.has(gameId)) {
        const cachedPath = this.gameExecutables.get(gameId);
        if (fs.existsSync(cachedPath)) {
          return {
            success: true,
            executablePath: cachedPath,
            source: 'cache'
          };
        } else {
          // Remove from cache if file no longer exists
          this.gameExecutables.delete(gameId);
        }
      }

      if (!fs.existsSync(gameDirectory)) {
        return {
          success: false,
          error: `Game directory does not exist: ${gameDirectory}`
        };
      }

      // Get all executable files in the directory
      const executables = await this.scanDirectoryForExecutables(gameDirectory);

      if (executables.length === 0) {
        return {
          success: false,
          error: 'No executable files found in game directory',
          scannedDirectory: gameDirectory
        };
      }

      // Check if this appears to be a repack that needs installation
      const repackInfo = this.detectRepack(executables, gameDirectory);
      if (repackInfo.isRepack) {
        return {
          success: false,
          error: 'This appears to be a repack that needs installation',
          isRepack: true,
          repackInfo: repackInfo,
          needsInstallation: true,
          scannedDirectory: gameDirectory
        };
      }

      // Try to find the most likely executable
      const bestExecutable = this.findBestExecutable(executables, gameName);

      if (bestExecutable) {
        // Cache the result
        this.gameExecutables.set(gameId, bestExecutable);
        
        return {
          success: true,
          executablePath: bestExecutable,
          source: 'auto_detected',
          alternativeExecutables: executables.filter(exe => exe !== bestExecutable)
        };
      }

      // If we can't determine the best executable, return all options
      return {
        success: false,
        error: 'Multiple executables found, please select the correct one',
        needsUserSelection: true,
        availableExecutables: executables,
        scannedDirectory: gameDirectory
      };

    } catch (error) {
      console.error('Error finding game executable:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Detect if this is a repack that needs installation
  detectRepack(executables, gameDirectory) {
    const setupExecutables = [];
    const gameExecutables = [];
    
    for (const exe of executables) {
      const fileName = path.basename(exe).toLowerCase();
      
      // Check for setup/installer executables - be more inclusive to catch install.exe
      if (fileName.includes('setup') || 
          fileName.includes('install') || 
          fileName === 'setup.exe' ||
          fileName === 'install.exe' ||
          fileName === 'installer.exe') {
        setupExecutables.push(exe);
      } else {
        // Check if this looks like a game executable (not system/utility files)
        const badPatterns = [
          'unins', 'updater', 'patcher', 'config', 'settings', 'options', 
          'editor', 'tool', 'utility', 'crack', 'patch', 'keygen', 'trainer',
          'redist', 'vcredist', 'directx', 'dotnet'
        ];
        
        const isUtility = badPatterns.some(pattern => fileName.includes(pattern));
        if (!isUtility) {
          gameExecutables.push(exe);
        }
      }
    }
    
    // It's likely a repack if:
    // 1. There are setup executables AND
    // 2. Very few or no obvious game executables (excluding utilities)
    const isRepack = setupExecutables.length > 0 && gameExecutables.length <= 1;
    
    if (isRepack) {
      // Try to identify the repack type and installer
      const repackType = this.identifyRepackType(gameDirectory, setupExecutables);
      
      return {
        isRepack: true,
        repackType: repackType.type,
        setupExecutables: setupExecutables,
        gameExecutables: gameExecutables,
        installer: repackType.installer,
        installInstructions: repackType.instructions
      };
    }
    
    return { isRepack: false };
  }

  // Identify the type of repack and provide appropriate instructions
  identifyRepackType(gameDirectory, setupExecutables) {
    const dirName = path.basename(gameDirectory).toLowerCase();
    const setupFiles = setupExecutables.map(exe => path.basename(exe).toLowerCase());
    
    // Check for common repack indicators
    if (dirName.includes('fitgirl') || setupFiles.some(f => f.includes('fitgirl'))) {
      return {
        type: 'FitGirl Repack',
        installer: setupExecutables[0],
        instructions: [
          'This is a FitGirl Repack that needs to be installed before playing.',
          'The installation may take 30 minutes to 2+ hours depending on your system.',
          'Make sure you have enough free disk space (usually 2-3x the download size).',
          'Close other applications to free up RAM during installation.',
          'The installer will show where the game will be installed.'
        ]
      };
    }
    
    if (dirName.includes('dodi') || setupFiles.some(f => f.includes('dodi'))) {
      return {
        type: 'DODI Repack',
        installer: setupExecutables[0],
        instructions: [
          'This is a DODI Repack that needs to be installed before playing.',
          'Installation typically takes 15-60 minutes.',
          'Choose your preferred installation directory when prompted.',
          'The installer may offer component selection - choose based on your preferences.'
        ]
      };
    }
    
    if (dirName.includes('masquerade') || setupFiles.some(f => f.includes('masquerade'))) {
      return {
        type: 'Masquerade Repack',
        installer: setupExecutables[0],
        instructions: [
          'This is a Masquerade Repack that needs to be installed.',
          'Follow the installation wizard to complete setup.',
          'Note the installation directory for launching the game later.'
        ]
      };
    }
    
    // Generic repack
    return {
      type: 'Game Repack',
      installer: setupExecutables[0],
      instructions: [
        'This appears to be a repacked game that needs installation.',
        'Run the setup executable to install the game.',
        'Follow the installation wizard instructions.',
        'Remember the installation directory - you\'ll need it to launch the game.',
        'After installation, you can add the installed game to your library.'
      ]
    };
  }

  async scanDirectoryForExecutables(directoryPath) {
    const executables = [];
    
    try {
      const scanDirectory = (dir, depth = 0) => {
        // Limit search depth to avoid scanning too deep
        if (depth > 3) return;
        
        const items = fs.readdirSync(dir);
        
        for (const item of items) {
          const itemPath = path.join(dir, item);
          const stat = fs.statSync(itemPath);
          
          if (stat.isDirectory()) {
            // Skip common non-game directories
            const skipDirs = ['temp', 'tmp', 'cache', 'logs', 'saves', 'screenshots', 'configs', 'redist', 'vcredist', '_commonredist'];
            if (!skipDirs.some(skipDir => item.toLowerCase().includes(skipDir))) {
              scanDirectory(itemPath, depth + 1);
            }
          } else if (stat.isFile()) {
            const ext = path.extname(item).toLowerCase();
            if (ext === '.exe') {
              executables.push(itemPath);
            }
          }
        }
      };
      
      scanDirectory(directoryPath);
      
      // Sort by file size (larger files are more likely to be the main executable)
      executables.sort((a, b) => {
        try {
          const sizeA = fs.statSync(a).size;
          const sizeB = fs.statSync(b).size;
          return sizeB - sizeA;
        } catch {
          return 0;
        }
      });
      
      return executables;
      
    } catch (error) {
      console.error('Error scanning directory for executables:', error);
      return [];
    }
  }

  findBestExecutable(executables, gameName) {
    if (executables.length === 0) return null;
    if (executables.length === 1) return executables[0];

    // Clean game name for comparison
    const cleanGameName = this.cleanGameName(gameName);
    
    // Scoring system to find the best executable
    const scoreExecutable = (executablePath) => {
      const fileName = path.basename(executablePath, '.exe').toLowerCase();
      const directory = path.dirname(executablePath).toLowerCase();
      let score = 0;

      // Prefer executables with game name in filename
      // Apply same cleaning to filename for consistent comparison
      const cleanFileName = fileName.replace(/[^a-z0-9]/g, '');
      if (cleanFileName.includes(cleanGameName)) {
        score += 50;
      }

      // Prefer larger files (main executables are usually larger)
      try {
        const size = fs.statSync(executablePath).size;
        score += Math.min(size / (1024 * 1024), 20); // Max 20 points for size
      } catch {}

      // Penalize obvious non-game executables
      const badPatterns = [
        'unins', 'setup', 'install', 'launcher', 'updater', 'patcher',
        'config', 'settings', 'options', 'editor', 'tool', 'utility',
        'crack', 'patch', 'keygen', 'trainer'
      ];
      
      for (const pattern of badPatterns) {
        if (fileName.includes(pattern)) {
          score -= 30;
        }
      }

      // Prefer executables in root or bin directories
      if (directory.includes('bin') || directory.includes('game')) {
        score += 10;
      }

      // Penalize executables in system/redist directories
      if (directory.includes('redist') || directory.includes('system') || directory.includes('vc')) {
        score -= 40;
      }

      // Prefer 64-bit over 32-bit launchers
      if (fileName.includes('x64') || fileName.includes('64')) {
        score += 5;
      } else if (fileName.includes('x86') || fileName.includes('32')) {
        score -= 5;
      }

      return score;
    };

    // Score all executables and return the highest scoring one
    let bestExecutable = executables[0];
    let bestScore = scoreExecutable(bestExecutable);

    for (let i = 1; i < executables.length; i++) {
      const score = scoreExecutable(executables[i]);
      if (score > bestScore) {
        bestScore = score;
        bestExecutable = executables[i];
      }
    }

    // Only return a result if the score is reasonably high
    return bestScore > 0 ? bestExecutable : null;
  }

  cleanGameName(gameName) {
    return gameName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .replace(/\s+/g, '');
  }

  setCustomExecutablePath(gameId, executablePath) {
    try {
      if (!fs.existsSync(executablePath)) {
        return {
          success: false,
          error: 'Executable file does not exist'
        };
      }

      this.gameExecutables.set(gameId, executablePath);
      
      console.log(`✅ Custom executable set for game ${gameId}: ${executablePath}`);
      
      return {
        success: true,
        message: 'Custom executable path has been set'
      };
      
    } catch (error) {
      console.error('Error setting custom executable path:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async isGameReady(gameInfo) {
    try {
      const { gameDirectory } = gameInfo;
      
      if (!fs.existsSync(gameDirectory)) {
        return {
          ready: false,
          reason: 'Game directory does not exist'
        };
      }

      const executableInfo = await this.findGameExecutable(gameInfo);
      
      return {
        ready: executableInfo.success,
        reason: executableInfo.success ? 'Game is ready to play' : executableInfo.error,
        executablePath: executableInfo.executablePath,
        needsUserSelection: executableInfo.needsUserSelection,
        availableExecutables: executableInfo.availableExecutables
      };
      
    } catch (error) {
      return {
        ready: false,
        reason: error.message
      };
    }
  }

  checkDirectoryExists(directoryPath) {
    try {
      return fs.existsSync(directoryPath) && fs.statSync(directoryPath).isDirectory();
    } catch (error) {
      console.error('Error checking directory exists:', error);
      return false;
    }
  }

  async uninstallGame(gameInfo) {
    try {
      const { gameId, gameName, gameDirectory } = gameInfo;
      
      // Check if directory exists
      if (!fs.existsSync(gameDirectory)) {
        return {
          success: true,
          message: 'Game directory does not exist, considering uninstalled',
          method: 'already_removed'
        };
      }

      // First, try to find an uninstaller
      const uninstallerPath = await this.findUninstaller(gameDirectory);
      
      if (uninstallerPath) {
        try {
          // Run the uninstaller
          await this.runUninstaller(uninstallerPath);
          
          // Wait a moment for the uninstaller to complete
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Check if directory still exists (some uninstallers might leave it)
          if (fs.existsSync(gameDirectory)) {
            await this.removeDirectory(gameDirectory);
          }
          
          return {
            success: true,
            message: `${gameName} has been uninstalled using the built-in uninstaller`,
            method: 'uninstaller'
          };
          
        } catch (uninstallerError) {
          console.warn(`⚠️ Uninstaller failed, falling back to directory removal:`, uninstallerError);
          // Fall through to manual removal
        }
      }

      // If no uninstaller found or uninstaller failed, remove the directory manually
      await this.removeDirectory(gameDirectory);
      
      // Remove from cache if exists
      if (this.gameExecutables.has(gameId)) {
        this.gameExecutables.delete(gameId);
      }

      return {
        success: true,
        message: `${gameName} has been uninstalled (folder deleted)`,
        method: 'folder_deletion'
      };

    } catch (error) {
      console.error(`Error uninstalling game:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async findUninstaller(gameDirectory) {
    try {
      const uninstallerPatterns = [
        'unins*.exe',
        'uninst*.exe', 
        'uninstall*.exe',
        'remove*.exe'
      ];

      const searchDirectory = (dir, depth = 0) => {
        if (depth > 2) return null; // Limit search depth
        
        const items = fs.readdirSync(dir);
        
        for (const item of items) {
          const itemPath = path.join(dir, item);
          const stat = fs.statSync(itemPath);
          
          if (stat.isFile()) {
            const fileName = item.toLowerCase();
            
            // Check if filename matches uninstaller patterns
            for (const pattern of uninstallerPatterns) {
              const regex = new RegExp(pattern.replace('*', '.*'));
              if (regex.test(fileName)) {
                return itemPath;
              }
            }
          } else if (stat.isDirectory() && depth < 2) {
            // Check subdirectories but limit depth
            const result = searchDirectory(itemPath, depth + 1);
            if (result) return result;
          }
        }
        
        return null;
      };

      return searchDirectory(gameDirectory);
      
    } catch (error) {
      console.error('Error finding uninstaller:', error);
      return null;
    }
  }

  async runUninstaller(uninstallerPath) {
    return new Promise((resolve, reject) => {
      // Run uninstaller with silent flags (most common ones)
      const uninstallerProcess = spawn(uninstallerPath, ['/S', '/SILENT', '/VERYSILENT'], {
        cwd: path.dirname(uninstallerPath),
        detached: false,
        stdio: ['ignore', 'ignore', 'ignore']
      });

      // Set a timeout for the uninstaller
      const timeout = setTimeout(() => {
        uninstallerProcess.kill();
        reject(new Error('Uninstaller timed out'));
      }, 30000); // 30 second timeout

      uninstallerProcess.on('exit', (code, signal) => {
        clearTimeout(timeout);
        resolve();
      });

      uninstallerProcess.on('error', (error) => {
        clearTimeout(timeout);
        console.error(`Uninstaller error:`, error);
        reject(error);
      });
    });
  }

  async removeDirectory(directoryPath) {
    return new Promise((resolve, reject) => {
      if (process.platform === 'win32') {
        // Use rmdir /s on Windows for better compatibility
        exec(`rmdir /s /q "${directoryPath}"`, (error, stdout, stderr) => {
          if (error) {
            console.error(`Error removing directory:`, error);
            reject(error);
          } else {
            resolve();
          }
        });
      } else {
        // Use rm -rf on Unix-like systems
        exec(`rm -rf "${directoryPath}"`, (error, stdout, stderr) => {
          if (error) {
            console.error(`Error removing directory:`, error);
            reject(error);
          } else {
            resolve();
          }
        });
      }
    });
  }

  monitorRunningGames() {
    // Check if any running games have actually stopped
    const gamesToCheck = Array.from(this.runningGames.entries());
    
    for (const [gameId, gameProcess] of gamesToCheck) {
      this.checkGameProcess(gameId, gameProcess);
    }
  }

  async checkGameProcess(gameId, gameProcess) {
    try {
      let processRunning = false;
      
      if (process.platform === 'win32') {
        // Use Promise-based approach for Windows
        try {
          const { exec } = require('child_process');
          const { promisify } = require('util');
          const execAsync = promisify(exec);
          
          const { stdout } = await execAsync(`tasklist /FI "PID eq ${gameProcess.pid}" /FO CSV 2>nul`);
          processRunning = stdout.includes(`"${gameProcess.pid}"`);
        } catch (error) {
          processRunning = false;
        }
      } else {
        // On Unix-like systems, check if process exists
        try {
          process.kill(gameProcess.pid, 0);
          processRunning = true;
        } catch (error) {
          processRunning = error.code !== 'ESRCH';
        }
      }
      
      if (!processRunning) {
        this.runningGames.delete(gameId);
        
        // Notify UI about game closure
        this.notifyGameClosed(gameId, gameProcess.gameName);
      }
    } catch (error) {
      console.warn(`Warning: Error monitoring game process ${gameId}:`, error.message);
    }
  }

  notifyGameClosed(gameId, gameName) {
    // Send notification to all renderer processes
    if (global.mainWindow) {
      global.mainWindow.webContents.send('launcher:game-closed', {
        gameId,
        gameName,
        timestamp: Date.now()
      });
    }
    
  }

  cleanup() {
    // Stop all running games
    for (const [gameId, gameProcess] of this.runningGames.entries()) {
      try {
        this.stopGame(gameId);
      } catch (error) {
        console.warn(`Warning: Failed to stop game ${gameId}:`, error.message);
      }
    }
    
    this.runningGames.clear();
    this.gameExecutables.clear();
  }

  // Run repack installer with user guidance
  async runRepackInstaller(installerInfo) {
    try {
      const { gameId, gameName, repackType, downloadLocation } = installerInfo;
      
      // Find the installer executable in the temp extraction folder
      const setupPath = await this.findRepackSetupExecutable(gameId, gameName);
      
      if (!setupPath) {
        return {
          success: false,
          error: 'Installer executable not found in extracted repack files. The extraction may have failed or the repack format is not supported.'
        };
      }
      
      if (!fs.existsSync(setupPath)) {
        return {
          success: false,
          error: 'Setup executable not found'
        };
      }
      
      // Use shell execution for better compatibility with Windows paths
      const { exec } = require('child_process');
      
      // Quote the path to handle spaces and special characters
      const quotedPath = `"${setupPath}"`;
      const workingDir = path.dirname(setupPath);
      
      // Launch the installer using exec with shell=true for better Windows compatibility
      const installerProcess = exec(quotedPath, {
        cwd: workingDir,
        windowsHide: false // Show the installer window
      });
      
      return {
        success: true,
        message: `${repackType} installer has been launched. Please follow the installation wizard and install to ${downloadLocation}.`,
        installerPid: installerProcess.pid,
        setupPath: setupPath
      };
      
    } catch (error) {
      console.error('Error running repack installer:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Find installer executable in the temp extraction folder for a repack
  async findRepackSetupExecutable(gameId, gameName) {
    try {
      // Get the download tracker to find the temp extraction path
      const Store = require('electron-store');
      const downloadStore = new Store({
        name: 'game-downloads',
        defaults: { downloads: {} }
      });
      
      const downloads = downloadStore.get('downloads', {});
      const download = Object.values(downloads).find(d => 
        (d.gameId === gameId || d.gameName === gameName) && d.isRepack && d.tempExtractionPath
      );
      
      if (!download || !download.tempExtractionPath) {
        console.error(`No temp extraction path found for repack: ${gameName}`);
        return null;
      }
      
      const tempPath = download.tempExtractionPath;
      
      if (!fs.existsSync(tempPath)) {
        console.error(`Temp extraction path does not exist: ${tempPath}`);
        return null;
      }
      
      // Search for setup executables
      const setupExecutables = await this.findSetupExecutables(tempPath);
      
      if (setupExecutables.length === 0) {
        console.error(`No setup executables found in: ${tempPath}`);
        return null;
      }
      
      // Return the first (and usually only) setup executable
      return setupExecutables[0];
      
    } catch (error) {
      console.error('Error finding repack setup executable:', error);
      return null;
    }
  }

  // Find setup executables in a directory
  async findSetupExecutables(directory) {
    try {
      const allExecutables = [];
      const preferredExecutables = [];
      
      const scanDirectory = (dir, depth = 0) => {
        if (depth > 3) return; // Limit search depth
        
        const items = fs.readdirSync(dir);
        
        for (const item of items) {
          const itemPath = path.join(dir, item);
          const stat = fs.statSync(itemPath);
          
          if (stat.isFile()) {
            const fileName = item.toLowerCase();
            
            // Look for all .exe files
            if (fileName.endsWith('.exe')) {
              // Filter out obvious non-installer files
              const excludePatterns = [
                'redist', 'vcredist', 'directx', 'dotnet', '_commonredist',
                'unins', 'uninst', 'uninstall', 'remove',
                'crack', 'patch', 'keygen', 'trainer',
                'updater', 'patcher', 'launcher'
              ];
              
              const isExcluded = excludePatterns.some(pattern => fileName.includes(pattern));
              
              if (!isExcluded) {
                allExecutables.push(itemPath);
                
                // Check if this looks like a preferred installer name
                if (fileName.includes('setup') || 
                    fileName.includes('install') || 
                    fileName === 'setup.exe' ||
                    fileName === 'installer.exe' ||
                    fileName === 'install.exe') {
                  preferredExecutables.push(itemPath);
                }
              }
            }
          } else if (stat.isDirectory() && depth < 3) {
            // Skip certain directories
            const dirName = item.toLowerCase();
            if (!dirName.includes('redist') && 
                !dirName.includes('_commonredist') && 
                !dirName.includes('directx') &&
                !dirName.includes('__macosx') &&
                !dirName.includes('temp') &&
                !dirName.includes('cache')) {
              scanDirectory(itemPath, depth + 1);
            }
          }
        }
      };
      
      scanDirectory(directory);
      
      // Decision logic:
      // 1. If we have preferred executables (with setup/install in name), use those
      // 2. If we only have one executable total, use that (common for repacks)
      // 3. Otherwise return all executables and let the caller decide
      
      if (preferredExecutables.length > 0) {
        console.log(`📦 Found ${preferredExecutables.length} preferred installer(s): ${preferredExecutables.map(p => path.basename(p)).join(', ')}`);
        return preferredExecutables;
      } else if (allExecutables.length === 1) {
        console.log(`📦 Found single executable (likely installer): ${path.basename(allExecutables[0])}`);
        return allExecutables;
      } else if (allExecutables.length > 1) {
        console.log(`📦 Found multiple executables: ${allExecutables.map(p => path.basename(p)).join(', ')}`);
        // Return all and let user/system decide, but prefer smaller files (installers are usually smaller)
        return allExecutables.sort((a, b) => {
          try {
            const statA = fs.statSync(a);
            const statB = fs.statSync(b);
            return statA.size - statB.size;
          } catch {
            return 0;
          }
        });
      }
      
      console.log(`📦 No suitable installer executables found in: ${directory}`);
      return [];
      
    } catch (error) {
      console.error('Error scanning for setup executables:', error);
      return [];
    }
  }

  // Check if a repack has been installed (look for installed game directory)
  async checkRepackInstallation(gameInfo) {
    try {
      const { gameId, gameName, possibleInstallPaths } = gameInfo;
      
      // Common installation directories to check
      const commonInstallPaths = possibleInstallPaths || [
        `C:\\Games\\${gameName}`,
        `C:\\Program Files\\${gameName}`,
        `C:\\Program Files (x86)\\${gameName}`,
        path.join(require('os').homedir(), 'Games', gameName),
        `D:\\Games\\${gameName}`,
        `E:\\Games\\${gameName}`
      ];
      
      for (const installPath of commonInstallPaths) {
        if (fs.existsSync(installPath)) {
          // Try to find executable in the installation directory
          const executables = await this.scanDirectoryForExecutables(installPath);
          const gameExecutables = executables.filter(exe => {
            const fileName = path.basename(exe).toLowerCase();
            return !fileName.includes('unins') && 
                   !fileName.includes('setup') && 
                   !fileName.includes('install');
          });
          
          if (gameExecutables.length > 0) {
            const bestExecutable = this.findBestExecutable(gameExecutables, gameName);
            
            // Clean up temp files since installation is complete
            await this.cleanupRepackTempFiles(gameId, gameName);
            
            return {
              success: true,
              installed: true,
              installPath: installPath,
              executablePath: bestExecutable,
              availableExecutables: gameExecutables
            };
          }
        }
      }
      
      return {
        success: true,
        installed: false,
        message: 'Game installation not detected yet'
      };
      
    } catch (error) {
      console.error('Error checking repack installation:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Add an installed game to the launcher's tracking
  async addInstalledGame(gameInfo) {
    try {
      const { gameId, gameName, installPath, executablePath } = gameInfo;
      
      // Cache the executable path
      if (executablePath) {
        this.gameExecutables.set(gameId, executablePath);
      }
      
      // Clean up temp files for repack installations
      await this.cleanupRepackTempFiles(gameId, gameName);
      
      // You might want to save this to a persistent store
      // For now, we'll just cache it in memory
      
      return {
        success: true,
        message: `${gameName} has been added to your library`,
        gameDirectory: installPath,
        executablePath: executablePath
      };
      
    } catch (error) {
      console.error('Error adding installed game:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Clean up repack temp files
  async cleanupRepackTempFiles(gameId, gameName) {
    try {
      console.log(`🧹 Cleaning up repack temp files for: ${gameName}`);
      
      // Access the global GameExtractionService instance
      const extractionService = global.gameExtractionService;
      if (extractionService) {
        const result = await extractionService.cleanupRepackTempFiles(gameId, gameName);
        if (result.success) {
          console.log(`✅ Successfully cleaned up temp files for ${gameName}`);
        } else {
          console.warn(`⚠️ Failed to clean up temp files for ${gameName}: ${result.error}`);
        }
        return result;
      } else {
        console.warn(`⚠️ GameExtractionService not available for cleanup`);
        return { success: false, error: 'Extraction service not available' };
      }
    } catch (error) {
      console.error(`❌ Error cleaning up repack temp files for ${gameName}:`, error);
      return { success: false, error: error.message };
    }
  }
}

// Initialize and export the service
function initGameLauncherService() {
  return new GameLauncherService();
}

module.exports = { initGameLauncherService }; 