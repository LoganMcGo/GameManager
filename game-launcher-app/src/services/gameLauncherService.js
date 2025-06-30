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
      
      console.log(`🎮 Launching game: ${gameName}`);
      console.log(`📁 Game directory: ${gameDirectory}`);

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

      console.log(`🚀 Launching executable: ${executablePath}`);
      console.log(`📁 Working directory: ${workingDirectory}`);

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
        console.log(`🛑 Game exited: ${gameName} (PID: ${gameProcess.pid})`);
        this.runningGames.delete(gameId);
        // Notify UI immediately when process exits
        this.notifyGameClosed(gameId, gameName);
      });

      gameProcess.on('error', (error) => {
        console.error(`❌ Game process error: ${gameName}`, error);
        this.runningGames.delete(gameId);
        // Notify UI about process error
        this.notifyGameClosed(gameId, gameName);
      });

      // Unref to allow the main process to exit
      gameProcess.unref();

      console.log(`✅ Game launched successfully: ${gameName} (PID: ${gameProcess.pid})`);
      
      return {
        success: true,
        pid: gameProcess.pid,
        executablePath,
        message: `${gameName} has been launched successfully`
      };

    } catch (error) {
      console.error(`❌ Error launching game:`, error);
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

      console.log(`🛑 Stopping game: ${gameProcess.gameName} (PID: ${gameProcess.pid})`);

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
      console.error(`❌ Error stopping game:`, error);
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
      const { gameId, gameName, gameDirectory, isRepack, tempDirectory } = gameInfo;

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

      // For repacks, check temp directory first
      const searchDirectory = isRepack && tempDirectory ? tempDirectory : gameDirectory;

      if (!fs.existsSync(searchDirectory)) {
        return {
          success: false,
          error: `Game directory does not exist: ${searchDirectory}`
        };
      }

      console.log(`🔍 Searching for executable in: ${searchDirectory}${isRepack ? ' (temp - repack)' : ''}`);

      // Get all executable files in the directory
      const executables = await this.scanDirectoryForExecutables(searchDirectory);

      if (executables.length === 0) {
        return {
          success: false,
          error: 'No executable files found in game directory',
          scannedDirectory: searchDirectory
        };
      }

      // Check if this appears to be a repack that needs installation
      const repackInfo = this.detectRepack(executables, searchDirectory);
      if (repackInfo.isRepack) {
        return {
          success: false,
          error: 'This appears to be a repack that needs installation',
          isRepack: true,
          repackInfo: repackInfo,
          needsInstallation: true,
          scannedDirectory: searchDirectory
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
      
      // Check for setup/installer executables
      if (fileName.includes('setup') || 
          fileName.includes('install') || 
          fileName === 'setup.exe' ||
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
      if (fileName.includes(cleanGameName)) {
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
      
      console.log(`🗑️ Starting uninstall for: ${gameName}`);
      console.log(`📁 Game directory: ${gameDirectory}`);

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
        console.log(`🔧 Found uninstaller: ${uninstallerPath}`);
        
        try {
          // Run the uninstaller
          await this.runUninstaller(uninstallerPath);
          
          // Wait a moment for the uninstaller to complete
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Check if directory still exists (some uninstallers might leave it)
          if (fs.existsSync(gameDirectory)) {
            console.log(`📁 Directory still exists after uninstaller, removing manually...`);
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
      console.log(`🗑️ Removing game directory manually: ${gameDirectory}`);
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
      console.error(`❌ Error uninstalling game:`, error);
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
      console.log(`🔧 Running uninstaller: ${uninstallerPath}`);
      
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
        console.log(`🔧 Uninstaller exited with code: ${code}`);
        resolve();
      });

      uninstallerProcess.on('error', (error) => {
        clearTimeout(timeout);
        console.error(`❌ Uninstaller error:`, error);
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
            console.error(`❌ Error removing directory:`, error);
            reject(error);
          } else {
            console.log(`✅ Directory removed: ${directoryPath}`);
            resolve();
          }
        });
      } else {
        // Use rm -rf on Unix-like systems
        exec(`rm -rf "${directoryPath}"`, (error, stdout, stderr) => {
          if (error) {
            console.error(`❌ Error removing directory:`, error);
            reject(error);
          } else {
            console.log(`✅ Directory removed: ${directoryPath}`);
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
        console.log(`🛑 Detected external game exit: ${gameProcess.gameName} (PID: ${gameProcess.pid})`);
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
    
    console.log(`📢 Notified UI about game closure: ${gameName}`);
  }

  cleanup() {
    // Stop all running games
    console.log('🧹 Cleaning up game launcher service...');
    
    for (const [gameId, gameProcess] of this.runningGames.entries()) {
      try {
        console.log(`🛑 Stopping game: ${gameProcess.gameName}`);
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
      const { installerPath, gameId, gameName, repackType } = installerInfo;
      
      console.log(`🔨 Running ${repackType} installer for: ${gameName}`);
      console.log(`📁 Installer path: ${installerPath}`);
      
      if (!fs.existsSync(installerPath)) {
        return {
          success: false,
          error: 'Installer executable not found'
        };
      }
      
      // Use shell execution for better compatibility with Windows paths
      const { exec } = require('child_process');
      
      // Quote the path to handle spaces and special characters
      const quotedPath = `"${installerPath}"`;
      const workingDir = path.dirname(installerPath);
      
      console.log(`🚀 Executing: ${quotedPath} in directory: ${workingDir}`);
      
      // Launch the installer using exec with shell=true for better Windows compatibility
      const installerProcess = exec(quotedPath, {
        cwd: workingDir,
        windowsHide: false // Show the installer window
      });
      
      console.log(`✅ Installer launched for ${gameName} (PID: ${installerProcess.pid})`);
      
      return {
        success: true,
        message: `${repackType} installer has been launched. Please follow the installation wizard.`,
        installerPid: installerProcess.pid
      };
      
    } catch (error) {
      console.error('Error running repack installer:', error);
      return {
        success: false,
        error: error.message
      };
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
      
      console.log(`🔍 Checking for installed game: ${gameName}`);
      
      for (const installPath of commonInstallPaths) {
        if (fs.existsSync(installPath)) {
          console.log(`📁 Found potential installation at: ${installPath}`);
          
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
      
      console.log(`➕ Adding installed game to library: ${gameName}`);
      
      // Cache the executable path
      if (executablePath) {
        this.gameExecutables.set(gameId, executablePath);
      }
      
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
}

// Initialize and export the service
function initGameLauncherService() {
  console.log('🎮 Initializing Game Launcher Service...');
  return new GameLauncherService();
}

module.exports = { initGameLauncherService }; 