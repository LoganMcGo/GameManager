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
  }

  setupProcessMonitoring() {
    // Monitor running processes every 5 seconds
    setInterval(() => {
      this.monitorRunningGames();
    }, 5000);
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
      });

      gameProcess.on('error', (error) => {
        console.error(`❌ Game process error: ${gameName}`, error);
        this.runningGames.delete(gameId);
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

      console.log(`🔍 Searching for executable in: ${gameDirectory}`);

      // Get all executable files in the directory
      const executables = await this.scanDirectoryForExecutables(gameDirectory);

      if (executables.length === 0) {
        return {
          success: false,
          error: 'No executable files found in game directory',
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
}

// Initialize and export the service
function initGameLauncherService() {
  console.log('🎮 Initializing Game Launcher Service...');
  return new GameLauncherService();
}

module.exports = { initGameLauncherService }; 