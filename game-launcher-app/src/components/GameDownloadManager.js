import React, { useState, useEffect } from 'react';
import { useNotifications } from '../context/NotificationContext';
import { createNotificationHandlers } from '../services/notificationService';
import torrentService from '../services/torrentService';

const GameDownloadManager = ({ selectedGame, onClose }) => {
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [serviceHealth, setServiceHealth] = useState({});
  const notifications = createNotificationHandlers(useNotifications);

  useEffect(() => {
    checkServiceHealth();
    if (selectedGame) {
      searchGame(selectedGame.name);
    }
  }, [selectedGame]);

  const checkServiceHealth = async () => {
    await notifications.withNotifications(
      async () => {
        const health = await torrentService.checkServiceHealth();
        setServiceHealth(health);
        return health;
      },
      {
        errorMessage: {
          title: 'Service health check failed',
          subtitle: 'Some download services may not be available'
        }
      }
    );
  };

  const searchGame = async (gameName) => {
    setIsSearching(true);
    setSearchResults([]);

    await notifications.withNotifications(
      async () => {
        console.log(`🔍 Searching DHT for: ${gameName}`);
        const results = await torrentService.searchGameTorrents(gameName, {
          autoAddToRealDebrid: false,
          limit: 15
        });

        setSearchResults(results);
        
        if (results.length === 0) {
          notifications.notifyWarning('No torrents found', {
            subtitle: `No game torrents found for "${gameName}". Try a different search term.`
          });
        } else {
          notifications.notifySuccess('Search completed', {
            subtitle: `Found ${results.length} torrents for "${gameName}"`
          });
        }
        
        return results;
      },
      {
        errorMessage: {
          title: 'Search failed',
          subtitle: 'Could not search for game torrents'
        },
        onSuccess: () => setIsSearching(false),
        onError: () => setIsSearching(false)
      }
    );
  };

  const downloadGame = async (torrent) => {
    setIsDownloading(true);

    await notifications.withDownloadNotifications(
      async ({ onProgress }) => {
        // Simulate progress for Real-Debrid addition
        onProgress(10, 'Adding torrent to Real-Debrid...');
        
        const result = await torrentService.addToRealDebrid(torrent);
        
        onProgress(100, 'Successfully added to Real-Debrid!');
        
        // Auto-close after success
        setTimeout(() => {
          onClose?.();
        }, 2000);
        
        return result;
      },
      {
        downloadName: torrent.name,
        onSuccess: () => setIsDownloading(false),
        onError: () => setIsDownloading(false)
      }
    );
  };

  const quickDownload = async () => {
    if (!selectedGame) return;
    
    setIsDownloading(true);

    await notifications.withDownloadNotifications(
      async ({ onProgress }) => {
        onProgress(0, 'Searching for best torrent...');
        
        const result = await torrentService.quickGameDownload(selectedGame.name);
        
        onProgress(50, 'Found torrent, adding to Real-Debrid...');
        
        // Give it a moment to process
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        onProgress(100, 'Successfully added to Real-Debrid!');
        
        setTimeout(() => {
          onClose?.();
        }, 2000);
        
        return result;
      },
      {
        downloadName: selectedGame.name,
        onSuccess: () => setIsDownloading(false),
        onError: () => setIsDownloading(false)
      }
    );
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return 'Unknown';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };

  const getQualityBadge = (quality) => {
    if (quality > 70) return 'bg-green-600 text-white';
    if (quality > 40) return 'bg-yellow-600 text-white';
    return 'bg-red-600 text-white';
  };

  const getQualityText = (quality) => {
    if (quality > 70) return 'Excellent';
    if (quality > 40) return 'Good';
    return 'Poor';
  };

  if (!selectedGame) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-start p-6 border-b border-gray-700">
          <div>
            <h2 className="text-2xl font-bold text-white mb-2">Download Game</h2>
            <h3 className="text-lg text-gray-300">{selectedGame.name}</h3>
            
            {/* Service Status */}
            <div className="flex items-center space-x-4 mt-3 text-sm">
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${serviceHealth.bitmagnet ? 'bg-green-500' : 'bg-red-500'}`}></div>
                <span className="text-gray-400">Bitmagnet DHT</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${serviceHealth.jackett ? 'bg-green-500' : 'bg-red-500'}`}></div>
                <span className="text-gray-400">Jackett</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${serviceHealth.realDebrid ? 'bg-green-500' : 'bg-red-500'}`}></div>
                <span className="text-gray-400">Real-Debrid</span>
              </div>
            </div>
          </div>
          
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-2"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Quick Download Section */}
        <div className="p-6 border-b border-gray-700">
          <button
            onClick={quickDownload}
            disabled={isDownloading || !serviceHealth.realDebrid}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-6 py-3 rounded-lg font-semibold flex items-center justify-center space-x-2 transition-colors"
          >
            {isDownloading ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div>
                <span>Processing...</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <span>🚀 Quick Download Best Result</span>
              </>
            )}
          </button>
          
          <p className="text-gray-400 text-sm mt-2 text-center">
            Automatically finds and downloads the best torrent to Real-Debrid
          </p>
        </div>

        {/* Search Results */}
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h4 className="text-lg font-semibold text-white">Available Torrents</h4>
            <button
              onClick={() => searchGame(selectedGame.name)}
              disabled={isSearching}
              className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-md text-sm transition-colors"
            >
              {isSearching ? 'Searching...' : 'Refresh'}
            </button>
          </div>

          {/* Results List */}
          {!isSearching && searchResults.length > 0 && (
            <div className="space-y-3">
              {searchResults.map((torrent, index) => (
                <div key={torrent.hash || index} className="bg-gray-700 rounded-lg p-4">
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0 mr-4">
                      <h5 className="font-semibold text-white mb-2 truncate">{torrent.name}</h5>
                      
                      <div className="flex flex-wrap gap-3 text-sm text-gray-300 mb-3">
                        <span className="flex items-center">
                          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                          </svg>
                          {formatFileSize(torrent.size)}
                        </span>
                        
                        <span className="flex items-center text-green-400">
                          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11l5-5m0 0l5 5m-5-5v12" />
                          </svg>
                          {torrent.seeders} seeders
                        </span>
                        
                        <span className="flex items-center text-blue-400">
                          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 13l5 5m0 0l5-5m-5 5V6" />
                          </svg>
                          {torrent.leechers} leechers
                        </span>
                        
                        <span className="text-gray-400">{torrent.source}</span>
                      </div>

                      {/* Quality Badge */}
                      <div className="flex items-center space-x-2">
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${getQualityBadge(torrent.quality)}`}>
                          {getQualityText(torrent.quality)} ({torrent.quality})
                        </span>
                        
                        {torrent.name.toLowerCase().includes('fitgirl') && (
                          <span className="px-2 py-1 bg-purple-600 text-white rounded text-xs font-semibold">
                            FitGirl Repack
                          </span>
                        )}
                        
                        {torrent.name.toLowerCase().includes('dodi') && (
                          <span className="px-2 py-1 bg-orange-600 text-white rounded text-xs font-semibold">
                            DODI Repack
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <button
                      onClick={() => downloadGame(torrent)}
                      disabled={isDownloading || !serviceHealth.realDebrid}
                      className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white px-4 py-2 rounded-md text-sm transition-colors flex items-center space-x-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      <span>Download</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* No Results */}
          {!isSearching && searchResults.length === 0 && (
            <div className="text-center py-12">
              <svg className="w-16 h-16 mx-auto text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-gray-400 text-lg mb-2">No torrents found</p>
              <p className="text-gray-500 text-sm">Try searching with different keywords or check your indexer configuration</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GameDownloadManager; 