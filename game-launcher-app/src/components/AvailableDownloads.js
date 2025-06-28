import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLibrary } from '../context/LibraryContext';
import gameFinderService from '../services/gameFinderService';

function AvailableDownloads({ gameName, gameId, game, onNavigateToLibrary, onNavigateToDownloads }) {
  const { addToLibrary } = useLibrary();
  const [downloads, setDownloads] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchPerformed, setSearchPerformed] = useState(false);
  const [downloadingItems, setDownloadingItems] = useState(new Set());
  const [realDebridError, setRealDebridError] = useState(null);

  // Search for downloads when component mounts or game changes
  useEffect(() => {
    if (gameName && !searchPerformed) {
      searchForDownloads();
    }
  }, [gameName, searchPerformed]);

  // Search for game downloads using DHT crawler
  const searchForDownloads = async () => {
    if (!gameName) return;
    
    setLoading(true);
    setError(null);
    setSearchPerformed(true);

    try {
      console.log(`🔍 Searching for downloads: ${gameName}`);
      const response = await gameFinderService.searchTorrents(gameName);
      
      if (response.success) {
        setDownloads(response.data);
        console.log(`✅ Found ${response.data.length} torrents`);
      } else {
        throw new Error(response.error || 'Search failed');
      }
    } catch (err) {
      console.error('Error searching for downloads:', err);
      setError('Error searching for downloads: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Download torrent directly using magnet link
  const handleDownload = async (downloadItem) => {
    const itemId = downloadItem.url + downloadItem.source;
    setDownloadingItems(prev => new Set([...prev, itemId]));
    setRealDebridError(null);

    try {
      console.log(`📦 Starting full download workflow: ${downloadItem.title}`);
      
      // Use magnet link directly (stored in downloadItem.magnet or downloadItem.url)
      const magnetLink = downloadItem.magnet || downloadItem.url;
      
      if (!magnetLink || !magnetLink.startsWith('magnet:')) {
        throw new Error('No valid magnet link available');
      }

      // Start download tracking first
      const downloadId = await window.api.downloadTracker.startTracking({
        game: game || { id: gameId, name: gameName },
        magnetLink: magnetLink,
        torrentName: downloadItem.title
      });

      console.log(`📋 Started tracking download with ID: ${downloadId}`);

      // Add magnet to Real-Debrid using gameFinderService
      const addResponse = await gameFinderService.addToRealDebrid({ magnet: magnetLink, name: downloadItem.title });
      
      if (addResponse.success) {
        console.log('✅ Successfully added magnet to Real-Debrid');
        setError(null);
        setRealDebridError(null);
        
        // Update tracking with torrent ID if available
        if (addResponse.data?.id) {
          await window.api.downloadTracker.updateStatus(downloadId, 'starting_torrent', {
            torrentId: addResponse.data.id
          });
          console.log(`📋 Updated tracker with torrent ID: ${addResponse.data.id}`);
        }
        
        // Automatically add game to library if game object is provided
        if (game) {
          try {
            addToLibrary(game);
            console.log('✅ Game automatically added to library');
          } catch (libraryError) {
            console.warn('⚠️ Failed to add game to library:', libraryError);
          }
        }
        
        // Show success message with navigation option
        const successMessage = `Successfully started download: "${downloadItem.title}". Check Downloads page for progress.`;
        setError(successMessage);
        
        // Navigate to downloads page after a short delay instead of library
        setTimeout(() => {
          if (onNavigateToDownloads) {
            onNavigateToDownloads();
          } else if (onNavigateToLibrary) {
            // Fallback to library if downloads navigation is not available
            onNavigateToLibrary();
          }
        }, 2000);
        
        // Clear success message after 5 seconds
        setTimeout(() => {
          setError(null);
        }, 5000);
      } else {
        // If Real-Debrid failed, update tracker with error
        await window.api.downloadTracker.updateStatus(downloadId, 'error', {
          error: addResponse.error || 'Failed to add to Real-Debrid'
        });
        throw new Error('Failed to add magnet to Real-Debrid: ' + addResponse.error);
      }
    } catch (err) {
      console.error('❌ Error in download workflow:', err);
      const errorMessage = err.message;
      
      // Check if this is a Real-Debrid connection issue
      if (errorMessage.includes('Real-Debrid API not available') || 
          errorMessage.includes('Failed to add to Real-Debrid') ||
          errorMessage.includes('proxy') ||
          errorMessage.includes('connection')) {
        setRealDebridError(errorMessage);
      }
      
      setError('Error downloading: ' + errorMessage);
    } finally {
      setDownloadingItems(prev => {
        const newSet = new Set(prev);
        newSet.delete(itemId);
        return newSet;
      });
    }
  };

  // Refresh search
  const refreshSearch = () => {
    setSearchPerformed(false);
    setDownloads([]);
    setError(null);
    setRealDebridError(null);
  };

  if (!gameName) {
    return null;
  }

  return (
    <div className="mt-6 available-downloads-section">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h4 className="text-lg font-semibold">Available Downloads</h4>
          <p className="text-sm text-gray-400">
            Looking for downloads
          </p>
        </div>
        <button
          onClick={searchPerformed ? refreshSearch : searchForDownloads}
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm transition-colors duration-300 disabled:opacity-50 flex items-center"
        >
          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
          </svg>
          {loading ? 'Searching...' : searchPerformed ? 'Refresh' : 'Search'}
        </button>
      </div>

      {/* Error/Success Display */}
      {error && (
        <div className={`p-3 rounded-lg mb-4 ${error.includes('Successfully') ? 'bg-green-900 border border-green-700 text-green-300' : 'bg-red-900 border border-red-700 text-red-300'}`}>
          <div className="flex items-center">
            <svg className={`w-4 h-4 mr-2 ${error.includes('Successfully') ? 'text-green-400' : 'text-red-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {error.includes('Successfully') ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              )}
            </svg>
            <span className="text-sm">{error}</span>
          </div>
          <button
            onClick={() => setError(null)}
            className="mt-2 text-xs underline opacity-75 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-blue-500 mr-3"></div>
          <span className="text-gray-400 mb-2">Searching for downloads...</span>
          <div className="text-xs text-gray-500 text-center">
            <p>Open browser console (F12) for detailed logs</p>
          </div>
        </div>
      )}

      {/* No downloads found */}
      {!loading && searchPerformed && downloads.length === 0 && (
        <div className="text-center py-8">
          <svg className="w-12 h-12 mx-auto text-gray-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
          </svg>
          <p className="text-gray-400 mb-2">No torrents found</p>
          <p className="text-gray-500 text-sm">Try searching with a different name or check back later</p>
        </div>
      )}

      {/* Downloads List */}
      {!loading && downloads.length > 0 && (
        <div className="space-y-3">
          {downloads.map((download, index) => {
            const itemId = download.url + download.source;
            const isDownloading = downloadingItems.has(itemId);
            
            return (
              <div key={index} className="bg-gray-700 rounded-lg p-4 hover:bg-gray-650 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="mb-2">
                      <h5 className="font-medium text-white mb-1">{download.title}</h5>
                      <div className="flex items-center flex-wrap gap-2">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          download.source === 'RARBG' ? 'bg-red-600 text-red-100' :
                          download.source === 'SolidTorrents' ? 'bg-blue-600 text-blue-100' :
                          download.source === 'BT-Digg DHT' ? 'bg-green-600 text-green-100' :
                          'bg-purple-600 text-purple-100'
                        }`}>
                          {download.source}
                        </span>
                        {download.seeders && download.seeders > 0 && (
                          <span className="px-2 py-1 rounded text-xs font-medium bg-yellow-600 text-yellow-100">
                            {download.seeders} seeders
                          </span>
                        )}
                        {download.description && (
                          <span className="text-gray-400 text-xs">
                            {download.description}
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center text-xs text-gray-500 space-x-4">
                      {download.size && download.size !== 'Unknown' && (
                        <span className="flex items-center">
                          <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path>
                          </svg>
                          {download.size}
                        </span>
                      )}
                      <span className="flex items-center">
                        <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                        </svg>
                        Quality: {download.quality || 0}
                      </span>
                    </div>
                  </div>
                  
                  <div className="ml-4 flex space-x-2">
                    {/* Copy magnet link button */}
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(download.magnet || download.url);
                        setError('Magnet link copied to clipboard!');
                        setTimeout(() => setError(null), 3000);
                      }}
                      className="bg-gray-600 hover:bg-gray-500 text-white px-3 py-2 rounded text-sm transition-colors duration-300 flex items-center"
                      title="Copy magnet link"
                    >
                      <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
                      </svg>
                      Copy
                    </button>
                    
                    <button
                      onClick={() => handleDownload(download)}
                      disabled={isDownloading}
                      className={`px-3 py-2 rounded text-sm transition-colors duration-300 flex items-center ${
                        isDownloading
                          ? 'bg-yellow-600 text-white cursor-not-allowed'
                          : 'bg-green-600 hover:bg-green-700 text-white'
                      }`}
                    >
                      {isDownloading ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-1"></div>
                          Adding...
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                          </svg>
                          Download
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Real-Debrid connection issue warning - only show if there's an actual problem */}
      {realDebridError && (
        <div className="mt-4 p-3 bg-red-900 border border-red-700 rounded-lg">
          <div className="flex items-center">
            <svg className="w-5 h-5 text-red-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <div>
              <p className="text-red-300 text-sm font-medium">Real-Debrid Connection Issue</p>
              <p className="text-red-400 text-xs">Unable to connect to Real-Debrid through the proxy server. Please check your internet connection and try again.</p>
              {realDebridError && (
                <p className="text-red-500 text-xs mt-1">Error: {realDebridError}</p>
              )}
            </div>
          </div>
          <button
            onClick={() => setRealDebridError(null)}
            className="mt-2 text-xs underline opacity-75 hover:opacity-100 text-red-300"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}

export default AvailableDownloads;
