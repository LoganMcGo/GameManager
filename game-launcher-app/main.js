const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const url = require('url');
const { initRealDebridService } = require('./src/services/realDebridService');
const { initIgdbService } = require('./src/services/igdbService');
const { initDownloadService } = require('./src/services/downloadService');

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
      zoomFactor: 1.0     // Ensure initial zoom is 1x
    },
    autoHideMenuBar: true, // Hide the menu bar
    frame: false, // Remove the window frame (including file and edit buttons)
    resizable: true,     // Ensure window is resizable
    show: false          // Don't show window until ready
  });

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
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
        'Content-Security-Policy': ['default-src \'self\' \'unsafe-inline\' \'unsafe-eval\' data: https:']
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

// Create window and initialize services when Electron has finished initialization
app.whenReady().then(() => {
  createWindow();
  setupWindowControls();
  initRealDebridService();
  initIgdbService();
  
  // Initialize download service and store globally for access by other services
  global.downloadService = initDownloadService();
});

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// On macOS, recreate the window when the dock icon is clicked and no other windows are open
app.on('activate', function () {
  if (mainWindow === null) createWindow();
});
