// Import services
const { initRealDebridService } = require('./src/services/realDebridService');
const { initIgdbService } = require('./src/services/igdbService');
const { initGameDownloadTracker } = require('./src/services/gameDownloadTracker');

// ... existing code in createWindow function ...

// Initialize services
console.log('🔧 Initializing Game Manager Services...');

console.log('🌐 Initializing JWT service...');
const jwtService = require('./src/services/jwtService');
console.log('JWT service initialized');

console.log('🔗 Initializing Real-Debrid service...');
initRealDebridService();

console.log('🎮 Initializing IGDB service...');
initIgdbService();

console.log('⬇️ Initializing download tracker...');
initGameDownloadTracker();

console.log('📥 Initializing download service...');
// ... rest of existing initialization ... 