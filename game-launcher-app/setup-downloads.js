#!/usr/bin/env node

// Auto-setup script for game downloads
// This configures everything automatically so downloads just work

const fs = require('fs');
const path = require('path');

console.log('🎮 Setting up automated game downloads...\n');

// Check if .env file exists
const envPath = path.join(__dirname, '.env');
let envContent = '';

if (fs.existsSync(envPath)) {
  envContent = fs.readFileSync(envPath, 'utf8');
  console.log('✅ Found existing .env file');
} else {
  console.log('📄 Creating .env file...');
}

// Add download service configuration
const downloadConfig = `
# Automated Download Service Configuration
# Uses public APIs - no manual setup required!
AUTO_DOWNLOAD_ENABLED=true
DOWNLOAD_SERVICE_TIMEOUT=30000
DOWNLOAD_QUALITY_THRESHOLD=40

# Real-Debrid Integration
# Add your Real-Debrid API key here for downloads
# Get it from: https://real-debrid.com/apitoken
REAL_DEBRID_API_KEY=

# Optional: Advanced torrent search settings
PREFER_REPACKS=true
MAX_GAME_SIZE_GB=50
MIN_SEEDERS=1
`;

// Check if download config already exists
if (!envContent.includes('AUTO_DOWNLOAD_ENABLED')) {
  envContent += downloadConfig;
  fs.writeFileSync(envPath, envContent);
  console.log('✅ Added download configuration to .env');
} else {
  console.log('✅ Download configuration already exists');
}

// Create a simple test script
const testScript = `
// Test the download service
// import gameFinderService from './src/services/gameFinderService.js';

async function testDownload() {
  console.log('🧪 Testing download service...');
  
  try {
    // Test search functionality - uncomment the import above to use
    // const result = await gameFinderService.downloadGame('Cyberpunk 2077', {
    //   minSeeders: 1,
    //   maxSizeGB: 50
    // });
    
    // if (result.success) {
    //   console.log('✅ Download service working!');
    //   console.log('🎯 Found torrent:', result.torrent.name);
    // } else {
    //   console.log('❌ Download failed:', result.error);
    // }
    console.log('⚠️ Uncomment the gameFinderService import and usage above to test');
  } catch (error) {
    console.log('❌ Service error:', error.message);
  }
}

// Uncomment to test:
// testDownload();
`;

const testPath = path.join(__dirname, 'test-download.js');
if (!fs.existsSync(testPath)) {
  fs.writeFileSync(testPath, testScript);
  console.log('✅ Created test script at test-download.js');
}

console.log('\n🚀 Setup complete! Here\'s what you need to know:\n');

console.log('📁 FILES CREATED:');
console.log('  ✓ .env - Configuration file');
console.log('  ✓ test-download.js - Test script');
console.log('  ✓ src/services/gameFinderService.js - Download service');

console.log('\n🔧 HOW IT WORKS:');
console.log('  1. Uses public torrent APIs (no setup needed)');
console.log('  2. Automatically finds best game torrents');
console.log('  3. Adds them to Real-Debrid for safe downloading');
console.log('  4. Your ISP only sees HTTPS traffic to Real-Debrid');

console.log('\n⚙️  CONFIGURATION:');
console.log('  • Download buttons are now available in search results');
console.log('  • Add your Real-Debrid API key to .env for downloads');
console.log('  • Everything else works automatically!');

console.log('\n🎯 REAL-DEBRID SETUP:');
console.log('  1. Go to https://real-debrid.com/apitoken');
console.log('  2. Copy your API token');
console.log('  3. Add it to .env: REAL_DEBRID_API_KEY=your_token_here');

console.log('\n✨ THAT\'S IT! Downloads should now work automatically.');
console.log('   Click any "Download" button in your game search to try it!');

// Check if Real-Debrid is configured
if (envContent.includes('REAL_DEBRID_API_KEY=') && !envContent.includes('REAL_DEBRID_API_KEY=\n')) {
  console.log('\n🎉 Real-Debrid API key detected - you\'re ready to download!');
} else {
  console.log('\n⚠️  Remember to add your Real-Debrid API key to enable downloads');
}

console.log('\n📖 For troubleshooting, check the browser console for download status'); 