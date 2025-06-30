// Fix for ESM loading issues with newer Electron versions
// Removed outdated --no-experimental-modules flag that causes warnings in newer Electron versions

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const url = require('url');
const { initRealDebridService } = require('./src/services/realDebridService');
const { initIgdbService } = require('./src/services/igdbService');
const { initGameDownloadService } = require('./src/services/gameDownloadService');
const { initJwtService } = require('./src/services/jwtService');
const { initGameExtractionService } = require('./src/services/gameExtractionService');
const { initGameLauncherService } = require('./src/services/gameLauncherService');
const { initGameDownloadTracker } = require('./src/services/gameDownloadTracker');
const { autoUpdater } = require('electron-updater');

// Keep a global reference of the window object to prevent it from being garbage collected
let mainWindow;

function createWindow() {
  // Create the browser window with initial dimensions
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,   // Set minimum width for usability
    minHeight: 600,  // Set minimum height for usability
    backgroundColor: '#1a1a1a', // Dark background color
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: true,  // Enable web security
      zoomFactor: 1.0,    // Ensure initial zoom is 1x
      sandbox: false,     // Disable sandbox for module loading
      enableRemoteModule: false
    },
    autoHideMenuBar: true, // Hide the menu bar
    frame: false, // Remove the window frame (including file and edit buttons)
    resizable: true,     // Ensure window is resizable
    show: false          // Don't show window until services are ready
  });

  // Prevent zoom with Ctrl+Scroll and keyboard shortcuts
  mainWindow.webContents.on('zoom-changed', (event, zoomDirection) => {
    event.preventDefault();
    mainWindow.webContents.setZoomFactor(1.0);
  });

  // Block zoom keyboard shortcuts
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.control && (input.key === '=' || input.key === '-' || input.key === '0')) {
      event.preventDefault();
    }
  });

  // Set Content Security Policy
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: https:; " +
          "media-src 'self' blob: data: https: https://*.youtube.com https://*.googlevideo.com; " +
          "frame-src 'self' https: https://*.youtube.com https://youtube.com; " +
          "img-src 'self' data: https: blob: https://*.ytimg.com https://*.youtube.com; " +
          "connect-src 'self' https: wss: blob:; " +
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' https: https://*.youtube.com; " +
          "style-src 'self' 'unsafe-inline' https:; " +
          "object-src 'none';"
        ]
      }
    });
  });

  // Load the index.html of the app
  const startUrl = process.env.ELECTRON_START_URL || url.format({
    pathname: path.join(__dirname, './dist/index.html'),
    protocol: 'file:',
    slashes: true
  });
  
  mainWindow.loadURL(startUrl);

  // Open the DevTools in development mode
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  // Remove the window reference when the window is closed
  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

// IPC handlers for window controls
function setupWindowControls() {
  // Minimize window
  ipcMain.handle('window:minimize', () => {
    if (mainWindow) {
      mainWindow.minimize();
    }
  });

  // Maximize/restore window
  ipcMain.handle('window:maximize', () => {
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  });

  // Close window
  ipcMain.handle('window:close', () => {
    if (mainWindow) {
      mainWindow.close();
    }
  });

  // Check if window is maximized
  ipcMain.handle('window:is-maximized', () => {
    return mainWindow ? mainWindow.isMaximized() : false;
  });
}

// IPC handlers for dialog operations
function setupDialogHandlers() {
  // Folder selection dialog
  ipcMain.handle('dialog:select-folder', async () => {
    if (!mainWindow) {
      return { canceled: true, filePaths: [] };
    }
    
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
        title: 'Select Download Folder'
      });
      
      return result;
    } catch (error) {
      console.error('Error opening folder dialog:', error);
      return { canceled: true, filePaths: [] };
    }
  });

  // File selection dialog for executable
  ipcMain.handle('dialog:select-executable', async () => {
    if (!mainWindow) {
      return { canceled: true, filePaths: [] };
    }
    
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        title: 'Select Game Executable',
        filters: [
          { name: 'Executable Files', extensions: ['exe'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });
      
      return result;
    } catch (error) {
      console.error('Error opening executable dialog:', error);
      return { canceled: true, filePaths: [] };
    }
  });
}

// Initialize services and handle cleanup
async function initializeServices() {
  console.log('🚀 Initializing Game Manager Services...');
  
  try {
    // Initialize core services - these should be fast
    console.log('🔑 Initializing JWT service...');
    initJwtService();
    
    console.log('🔄 Initializing Real-Debrid service...');
    initRealDebridService();
    
    console.log('🎮 Initializing IGDB service...');
    initIgdbService();
    
    console.log('📊 Initializing download tracker...');
    initGameDownloadTracker();
    
    console.log('⬇️ Initializing download service...');
    global.gameDownloadService = initGameDownloadService();
    
    console.log('🗜️ Initializing extraction service...');
    global.gameExtractionService = initGameExtractionService();
    
    console.log('🚀 Initializing launcher service...');
    global.launcherService = initGameLauncherService();

    // Give core services a moment to complete any sync initialization
    await new Promise(resolve => setTimeout(resolve, 500));

    console.log('✅ Core services initialized successfully');
    
    // Show the window after core services are ready
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      console.log('🖼️ Window shown - app ready!');
    }
    
    // Continue with any async initialization in the background
    // This won't block the window from showing
    console.log('🔄 Starting background service initialization...');
    
  } catch (error) {
    console.error('❌ Failed to initialize core services:', error);
    
    // Show window with error state rather than hanging
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      console.log('🖼️ Window shown with service errors');
    }
  }
}

// Handle app cleanup
function handleAppCleanup() {
  console.log('🧹 Cleaning up services...');
  
  if (global.gameExtractionService) {
    global.gameExtractionService.cleanup();
  }
  
  if (global.launcherService) {
    global.launcherService.cleanup();
  }
  
  if (global.gameDownloadService) {
    global.gameDownloadService.cleanup();
  }
}

// Auto-updater setup
if (!process.env.NODE_ENV === 'development') {
  autoUpdater.checkForUpdatesAndNotify();
  
  autoUpdater.on('update-available', (info) => {
    mainWindow.webContents.send('update-available', {
      version: info.version,
      releaseNotes: info.releaseNotes,
      releaseName: info.releaseName,
      releaseDate: info.releaseDate
    });
  });
  
  autoUpdater.on('update-downloaded', (info) => {
    mainWindow.webContents.send('update-downloaded', {
      version: info.version,
      releaseNotes: info.releaseNotes
    });
  });
  
  autoUpdater.on('download-progress', (progressObj) => {
    mainWindow.webContents.send('update-progress', progressObj);
  });
  
  autoUpdater.on('error', (error) => {
    mainWindow.webContents.send('update-error', error.message);
  });
}

// Handle update install
ipcMain.handle('restart-and-update', () => {
  autoUpdater.quitAndInstall();
});

ipcMain.handle('check-for-updates', () => {
  if (!process.env.NODE_ENV === 'development') {
    autoUpdater.checkForUpdatesAndNotify();
  }
});

// Handle app version request
ipcMain.handle('app:get-version', () => {
  return app.getVersion();
});

// Fix for ESM loading issues with newer Electron versions
app.commandLine.appendSwitch('--disable-features', 'OutOfBlinkCors');
app.commandLine.appendSwitch('--disable-web-security');

// Create window and initialize services when Electron has finished initialization
app.whenReady().then(async () => {
  // Register custom protocol handler for file:// URLs
  const { protocol } = require('electron');
  
  protocol.registerFileProtocol('file', (request, callback) => {
    const pathname = decodeURI(request.url.replace('file:///', ''));
    callback(pathname);
  });
  
  createWindow();
  setupWindowControls();
  setupDialogHandlers();
  
  // Initialize services asynchronously and show window when ready
  // Add shorter timeout fallback to ensure window shows if services hang
  const serviceInitPromise = initializeServices();
  const timeoutPromise = new Promise(resolve => {
    setTimeout(() => {
      console.warn('⚠️ Service initialization timeout - showing window anyway');
      if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
        mainWindow.show();
        console.log('🖼️ Window shown via timeout fallback');
      }
      resolve();
    }, 3000); // 3 second timeout (reduced from 10 seconds)
  });
  
  // Race between service initialization and timeout
  await Promise.race([serviceInitPromise, timeoutPromise]);
});

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', function () {
  handleAppCleanup();
  if (process.platform !== 'darwin') app.quit();
});

// On macOS, recreate the window when the dock icon is clicked and no other windows are open
app.on('activate', function () {
  if (mainWindow === null) createWindow();
});

// Handle app before quit
app.on('before-quit', () => {
  handleAppCleanup();
});

