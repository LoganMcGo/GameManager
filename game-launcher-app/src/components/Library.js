import React, { useState, useEffect } from 'react';
import { useLibrary } from '../context/LibraryContext';
import { useAuth } from '../context/AuthContext';
import SearchBar from './SearchBar';
import AvailableDownloads from './AvailableDownloads';

function Library({ onGameSelect }) {
  const { library, favorites, isLoading, addToLibrary, removeFromLibrary, toggleFavorite, isFavorited } = useLibrary();
  const { isAuthenticated } = useAuth();
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'list'
  const [sortBy, setSortBy] = useState('name'); // 'name', 'dateAdded', 'lastPlayed'
  const [filterBy, setFilterBy] = useState('all'); // 'all', 'favorites', 'installed', 'notInstalled'
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGame, setSelectedGame] = useState(null);
  const [selectedGameDetails, setSelectedGameDetails] = useState(null);
  const [installedGames, setInstalledGames] = useState(new Set());
  const [downloadedGames, setDownloadedGames] = useState(new Set());
  const [activeDownloads, setActiveDownloads] = useState(new Map());
  const [runningGames, setRunningGames] = useState(new Set());
  const [gameStatuses, setGameStatuses] = useState(new Map());

  // Check for installed games and Real-Debrid downloads
  useEffect(() => {
    checkInstalledGames();
    checkRunningGames();
    if (isAuthenticated) {
      checkRealDebridDownloads();
    }
  }, [isAuthenticated]);

  // Poll for download status updates and running games
  useEffect(() => {
    if (isAuthenticated) {
      const interval = setInterval(() => {
        checkRealDebridDownloads();
        checkActiveDownloads();
        checkRunningGames();
      }, 5000); // Check every 5 seconds

      return () => clearInterval(interval);
    }
  }, [isAuthenticated]);

  // Check for installed games
  const checkInstalledGames = async () => {
    try {
      const downloadLocation = await window.api.download.getDownloadLocation();
      if (downloadLocation) {
        const updatedStatuses = new Map();
        
        for (const game of library) {
          const gameInfo = {
            gameId: game.appId,
            gameName: game.name,
            gameDirectory: `${downloadLocation}/${game.name}`
          };
          
          try {
            const readyStatus = await window.api.launcher.isGameReady(gameInfo);
            if (readyStatus.ready) {
              setInstalledGames(prev => new Set(prev).add(game.appId));
              updatedStatuses.set(game.appId, {
                ...readyStatus,
                gameDirectory: gameInfo.gameDirectory
              });
            } else {
              setInstalledGames(prev => {
                const newSet = new Set(prev);
                newSet.delete(game.appId);
                return newSet;
              });
            }
          } catch (error) {
            console.warn(`Failed to check game readiness for ${game.name}:`, error);
          }
        }
        
        setGameStatuses(updatedStatuses);
      }
    } catch (error) {
      console.warn('Failed to check installed games:', error);
    }
  };

  // Check for running games
  const checkRunningGames = async () => {
    try {
      const runningGameIds = await window.api.launcher.getRunningGames();
      setRunningGames(new Set(runningGameIds));
    } catch (error) {
      console.warn('Failed to check running games:', error);
    }
  };

  // Check Real-Debrid downloads for games
  const checkRealDebridDownloads = async () => {
    try {
      if (window.api?.realDebrid?.getDownloads) {
        const response = await window.api.realDebrid.getDownloads();
        if (response.success) {
          const downloads = response.data;
          const gameDownloads = new Set();
          
          // Match downloads to library games by name similarity
          downloads.forEach(download => {
            library.forEach(game => {
              if (download.filename && 
                  (download.filename.toLowerCase().includes(game.name.toLowerCase()) ||
                   game.name.toLowerCase().includes(download.filename.toLowerCase().split('.')[0]))) {
                gameDownloads.add(game.appId);
              }
            });
          });
          
          setDownloadedGames(gameDownloads);
        }
      }
    } catch (error) {
      console.warn('Failed to check Real-Debrid downloads:', error);
    }
  };

  // Check active downloads
  const checkActiveDownloads = async () => {
    try {
      if (window.api?.download?.getActiveDownloads) {
        const downloads = await window.api.download.getActiveDownloads();
        const activeMap = new Map();
        
        downloads.forEach(download => {
          // Try to match download to a library game
          library.forEach(game => {
            if (download.filename && 
                (download.filename.toLowerCase().includes(game.name.toLowerCase()) ||
                 game.name.toLowerCase().includes(download.filename.toLowerCase().split('.')[0]))) {
              activeMap.set(game.appId, download);
            }
          });
        });
        
        setActiveDownloads(activeMap);
      }
    } catch (error) {
      console.warn('Failed to check active downloads:', error);
    }
  };

  // Filter and sort games
  const filteredGames = library
    .filter(game => {
      // Search filter
      if (searchQuery && !game.name.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      
      // Category filter
      switch (filterBy) {
        case 'favorites':
          return isFavorited(game.appId);
        case 'installed':
          return installedGames.has(game.appId);
        case 'notInstalled':
          return !installedGames.has(game.appId);
        case 'downloaded':
          return downloadedGames.has(game.appId);
        case 'downloading':
          return activeDownloads.has(game.appId);
        case 'running':
          return runningGames.has(game.appId);
        default:
          return true;
      }
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'dateAdded':
          return new Date(b.addedAt) - new Date(a.addedAt);
        case 'lastPlayed':
          // For now, sort by date added as a fallback
          return new Date(b.addedAt) - new Date(a.addedAt);
        case 'name':
        default:
          return a.name.localeCompare(b.name);
      }
    });

  const handleGameClick = async (game) => {
    setSelectedGame(game);
    setSelectedGameDetails(null);
    
    // Fetch detailed game info (similar to how it's done in App.js)
    try {
      if (window.api && window.api.igdb) {
        const response = await window.api.igdb.getGameDetails(game.appId);
        if (response.success) {
          setSelectedGameDetails(response.gameDetails);
        } else {
          setSelectedGameDetails(game);
        }
      } else {
        setSelectedGameDetails(game);
      }
    } catch (error) {
      console.error('Error fetching game details:', error);
      setSelectedGameDetails(game);
    }
  };

  const handleGameAction = async (game) => {
    const isInstalled = installedGames.has(game.appId);
    const isRunning = runningGames.has(game.appId);
    const isDownloaded = downloadedGames.has(game.appId);
    const activeDownload = activeDownloads.get(game.appId);
    
    if (isRunning) {
      // Stop the game
      try {
        console.log('Stopping game:', game.name);
        const result = await window.api.launcher.stopGame(game.appId);
        if (result.success) {
          console.log('Game stopped successfully');
          // Update running games state
          setRunningGames(prev => {
            const newSet = new Set(prev);
            newSet.delete(game.appId);
            return newSet;
          });
        } else {
          console.error('Failed to stop game:', result.error);
        }
      } catch (error) {
        console.error('Error stopping game:', error);
      }
    } else if (isInstalled) {
      // Launch game
      try {
        console.log('Launching game:', game.name);
        const gameStatus = gameStatuses.get(game.appId);
        const gameInfo = {
          gameId: game.appId,
          gameName: game.name,
          gameDirectory: gameStatus?.gameDirectory || `${await window.api.download.getDownloadLocation()}/${game.name}`
        };
        
        const result = await window.api.launcher.launchGame(gameInfo);
        if (result.success) {
          console.log('Game launched successfully');
          // Update running games state
          setRunningGames(prev => new Set(prev).add(game.appId));
        } else if (result.needsManualSetup) {
          // Show executable selection dialog
          await handleExecutableSelection(game, gameInfo);
        } else {
          console.error('Failed to launch game:', result.error);
        }
      } catch (error) {
        console.error('Error launching game:', error);
      }
    } else if (isDownloaded) {
      // Game is downloaded but not installed - open download location
      console.log('Opening download location for:', game.name);
      try {
        if (window.api?.download?.openDownloadLocation) {
          await window.api.download.openDownloadLocation();
        }
      } catch (error) {
        console.error('Failed to open download location:', error);
      }
    } else if (activeDownload) {
      // Show download progress or cancel download
      console.log('Download in progress for:', game.name);
    } else {
      // Show available downloads
      handleGameClick(game);
    }
  };

  const handleExecutableSelection = async (game, gameInfo) => {
    try {
      // First try to scan for executables automatically
      const scanResult = await window.api.launcher.findExecutable(gameInfo);
      
      if (scanResult.needsUserSelection && scanResult.availableExecutables) {
        // Show a selection dialog with available executables
        // For now, we'll use the first executable or let user select manually
        console.log('Multiple executables found:', scanResult.availableExecutables);
        
        // You could implement a custom modal here to let user choose
        // For now, let's try the first one
        if (scanResult.availableExecutables.length > 0) {
          const selectedExecutable = scanResult.availableExecutables[0];
          const setResult = await window.api.launcher.setExecutablePath(game.appId, selectedExecutable);
          
          if (setResult.success) {
            // Try launching again
            const launchResult = await window.api.launcher.launchGame(gameInfo);
            if (launchResult.success) {
              setRunningGames(prev => new Set(prev).add(game.appId));
            }
          }
        }
      } else {
        // No executables found or other error
        console.error('No executables found:', scanResult.error);
        
        // Let user manually select executable
        const fileResult = await window.api.selectExecutable();
        if (!fileResult.canceled && fileResult.filePaths.length > 0) {
          const executablePath = fileResult.filePaths[0];
          const setResult = await window.api.launcher.setExecutablePath(game.appId, executablePath);
          
          if (setResult.success) {
            // Try launching again
            const launchResult = await window.api.launcher.launchGame(gameInfo);
            if (launchResult.success) {
              setRunningGames(prev => new Set(prev).add(game.appId));
            }
          }
        }
      }
    } catch (error) {
      console.error('Error handling executable selection:', error);
    }
  };

  const closeDetailView = () => {
    setSelectedGame(null);
    setSelectedGameDetails(null);
  };

  const getGameStatus = (game) => {
    const isInstalled = installedGames.has(game.appId);
    const isRunning = runningGames.has(game.appId);
    const isDownloaded = downloadedGames.has(game.appId);
    const activeDownload = activeDownloads.get(game.appId);
    
    if (isRunning) {
      return { status: 'running', text: '🎮 Running', color: 'text-green-400', action: 'Stop Game' };
    } else if (isInstalled) {
      return { status: 'installed', text: '● Installed', color: 'text-green-400', action: 'Play Game' };
    } else if (activeDownload) {
      const progress = activeDownload.progress || 0;
      let statusText = `⬇ Downloading ${progress.toFixed(1)}%`;
      
      if (activeDownload.status === 'extracting') {
        statusText = `🔧 Extracting...`;
      } else if (activeDownload.status === 'extracted') {
        statusText = `✅ Extracted`;
      } else if (activeDownload.status === 'extraction_failed') {
        statusText = `❌ Extraction Failed`;
      }
      
      return { 
        status: 'downloading', 
        text: statusText, 
        color: 'text-blue-400', 
        action: 'View Progress',
        progress: progress
      };
    } else if (isDownloaded) {
      return { status: 'downloaded', text: '✓ Downloaded', color: 'text-yellow-400', action: 'Open Folder' };
    } else {
      return { status: 'not_downloaded', text: '○ Not Downloaded', color: 'text-gray-400', action: 'Find Downloads' };
    }
  };

  if (selectedGame) {
    const gameData = selectedGameDetails || selectedGame;
    const gameStatus = getGameStatus(gameData);
    
    return (
      <div className="flex flex-col h-full bg-gray-900 text-white">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between p-6 bg-gray-800 border-b border-gray-700">
          <div className="flex items-center space-x-4">
            <button
              onClick={closeDetailView}
              className="flex items-center text-gray-400 hover:text-white transition-colors"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path>
              </svg>
              Back to Library
            </button>
            <div className="w-px h-6 bg-gray-600"></div>
            <h1 className="text-2xl font-bold">{gameData.name}</h1>
          </div>
          <div className="flex items-center space-x-4">
            <div className={`text-sm font-medium ${gameStatus.color}`}>
              {gameStatus.text}
            </div>
            <button
              onClick={() => handleGameAction(gameData)}
              className={`px-6 py-2 rounded-lg font-semibold transition-colors flex items-center ${
                gameStatus.status === 'installed' 
                  ? 'bg-green-600 hover:bg-green-700 text-white'
                  : gameStatus.status === 'downloading'
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : gameStatus.status === 'downloaded'
                  ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
                  : 'bg-gray-600 hover:bg-gray-700 text-white'
              }`}
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {gameStatus.status === 'installed' ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h10a2 2 0 012 2v14a2 2 0 01-2 2z" />
                ) : gameStatus.status === 'downloading' ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4 4m0 0l-4-4m4 4V4" />
                ) : gameStatus.status === 'downloaded' ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                )}
              </svg>
              {gameStatus.action}
            </button>
          </div>
        </div>

        {/* Game Detail Content */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {/* Hero Section */}
          <div className="relative h-96 bg-gradient-to-r from-gray-800 to-gray-700">
            {gameData.imageUrl && (
              <img 
                src={gameData.imageUrl} 
                alt={gameData.name} 
                className="w-full h-full object-cover opacity-30"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent">
              <div className="absolute bottom-6 left-6 right-6">
                <div className="flex items-end justify-between">
                  <div>
                    <h2 className="text-4xl font-bold mb-2">{gameData.name}</h2>
                    <div className="flex items-center space-x-4 text-sm text-gray-300">
                      {gameData.releaseDate && <span>{gameData.releaseDate}</span>}
                      {gameData.developer && (
                        <>
                          <span>•</span>
                          <span>{gameData.developer}</span>
                        </>
                      )}
                      {gameData.platforms && (
                        <>
                          <span>•</span>
                          <span>{gameData.platforms}</span>
                        </>
                      )}
                    </div>
                    {gameData.rating && (
                      <div className="flex items-center mt-2">
                        <div className="bg-blue-600 text-white px-2 py-1 rounded text-sm font-bold mr-2">
                          {gameData.rating}%
                        </div>
                        <span className="text-gray-400 text-sm">User Score</span>
                      </div>
                    )}
                  </div>
                  
                  {/* Download Progress Bar for Active Downloads */}
                  {gameStatus.status === 'downloading' && gameStatus.progress !== undefined && (
                    <div className="bg-gray-800 rounded-lg p-4 min-w-[200px]">
                      <div className="text-sm text-gray-300 mb-2">Download Progress</div>
                      <div className="w-full bg-gray-700 rounded-full h-2">
                        <div 
                          className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                          style={{ width: `${gameStatus.progress}%` }}
                        ></div>
                      </div>
                      <div className="text-xs text-gray-400 mt-1">{gameStatus.progress.toFixed(1)}% complete</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Game Info */}
          <div className="p-6">
            <div className="grid grid-cols-3 gap-8">
              <div className="col-span-2 space-y-6">
                {/* Description */}
                <div>
                  <h3 className="text-xl font-semibold mb-3">About This Game</h3>
                  <p className="text-gray-300 leading-relaxed">
                    {gameData.description || gameData.summary || "No description available for this game."}
                  </p>
                </div>

                {/* Available Downloads - Only show if not installed and not downloading */}
                {gameStatus.status !== 'installed' && gameStatus.status !== 'downloading' && (
                  <AvailableDownloads 
                    gameName={gameData.name} 
                    gameId={gameData.appId} 
                    game={gameData}
                    onNavigateToLibrary={closeDetailView}
                  />
                )}

                {/* Genres */}
                {gameData.genres && gameData.genres.length > 0 && (
                  <div>
                    <h3 className="text-xl font-semibold mb-3">Genres</h3>
                    <div className="flex flex-wrap gap-2">
                      {gameData.genres.map((genre, index) => (
                        <span 
                          key={index} 
                          className="bg-gray-700 text-gray-300 px-3 py-1 rounded-full text-sm hover:bg-gray-600 transition-colors"
                        >
                          {genre}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Sidebar */}
              <div className="space-y-6">
                <div className="bg-gray-800 rounded-lg p-4">
                  <h4 className="font-semibold mb-3">Game Information</h4>
                  <div className="space-y-3 text-sm">
                    <div>
                      <span className="text-gray-400">Status:</span>
                      <p className={`font-medium ${gameStatus.color}`}>{gameStatus.text}</p>
                    </div>
                    <div>
                      <span className="text-gray-400">Developer:</span>
                      <p className="text-gray-300">{gameData.developer || "Unknown"}</p>
                    </div>
                    <div>
                      <span className="text-gray-400">Publisher:</span>
                      <p className="text-gray-300">{gameData.publisher || "Unknown"}</p>
                    </div>
                    <div>
                      <span className="text-gray-400">Release Date:</span>
                      <p className="text-gray-300">{gameData.releaseDate || "Unknown"}</p>
                    </div>
                    <div>
                      <span className="text-gray-400">Added to Library:</span>
                      <p className="text-gray-300">
                        {gameData.addedAt ? new Date(gameData.addedAt).toLocaleDateString() : "Unknown"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="bg-gray-800 rounded-lg p-4">
                  <h4 className="font-semibold mb-3">Quick Actions</h4>
                  <div className="space-y-2">
                    <button
                      onClick={() => toggleFavorite(gameData)}
                      className={`w-full px-3 py-2 rounded text-sm transition-colors ${
                        isFavorited(gameData.appId)
                          ? 'bg-red-600 hover:bg-red-700 text-white'
                          : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                      }`}
                    >
                      {isFavorited(gameData.appId) ? '❤ Remove from Favorites' : '♡ Add to Favorites'}
                    </button>
                    <button
                      onClick={() => removeFromLibrary(gameData.appId)}
                      className="w-full px-3 py-2 rounded text-sm bg-gray-700 hover:bg-red-600 text-gray-300 hover:text-white transition-colors"
                    >
                      Remove from Library
                    </button>
                    {gameStatus.status === 'downloaded' && (
                      <button
                        onClick={() => window.api?.download?.openDownloadLocation()}
                        className="w-full px-3 py-2 rounded text-sm bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                      >
                        Open Download Folder
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-900 text-white main-container">
      {/* Fixed Header Section */}
      <div className="flex-shrink-0 p-4 sm:p-6 pb-0">
        {/* Search Bar */}
        <SearchBar onGameSelect={onGameSelect} />
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 mt-6">
          <div>
            <h1 className="text-3xl font-bold">Your Library</h1>
            <p className="text-gray-400 mt-1">
              {library.length} {library.length === 1 ? 'game' : 'games'} in your collection
            </p>
          </div>
          <div className="flex items-center space-x-4">
            {/* View Mode Toggle */}
            <div className="flex bg-gray-800 rounded-lg p-1">
              <button
                onClick={() => setViewMode('grid')}
                className={`px-3 py-2 rounded transition-colors ${
                  viewMode === 'grid' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"></path>
                </svg>
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`px-3 py-2 rounded transition-colors ${
                  viewMode === 'list' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"></path>
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Filters and Search */}
        <div className="flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-4 mb-6">
          <div className="flex items-center space-x-2">
            <label className="text-sm text-gray-400">Filter:</label>
            <select
              value={filterBy}
              onChange={(e) => setFilterBy(e.target.value)}
              className="bg-gray-800 text-white px-3 py-2 rounded border border-gray-700 focus:border-blue-500 focus:outline-none"
            >
              <option value="all">All Games</option>
              <option value="favorites">Favorites</option>
              <option value="installed">Installed</option>
              <option value="downloaded">Downloaded</option>
              <option value="downloading">Downloading</option>
              <option value="running">Running</option>
              <option value="notInstalled">Not Downloaded</option>
            </select>
          </div>
          <div className="flex items-center space-x-2">
            <label className="text-sm text-gray-400">Sort by:</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-gray-800 text-white px-3 py-2 rounded border border-gray-700 focus:border-blue-500 focus:outline-none"
            >
              <option value="name">Name</option>
              <option value="dateAdded">Date Added</option>
              <option value="lastPlayed">Last Played</option>
            </select>
          </div>
          <div className="w-full sm:flex-1 sm:max-w-md">
            <input
              type="text"
              placeholder="Search your library..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-gray-800 text-white px-4 py-2 rounded border border-gray-700 focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 pb-4 sm:pb-6">
        {/* Library Content */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
          </div>
        ) : library.length === 0 ? (
          <div className="text-center py-12">
            <svg className="w-16 h-16 mx-auto text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path>
            </svg>
            <h2 className="text-xl font-semibold mb-2">Your library is empty</h2>
            <p className="text-gray-400 mb-4">Add games to your library to get started</p>
          </div>
        ) : filteredGames.length === 0 ? (
          <div className="text-center py-12">
            <h2 className="text-xl font-semibold mb-2">No games found</h2>
            <p className="text-gray-400">Try adjusting your search or filter settings</p>
          </div>
        ) : (
          <div className={viewMode === 'grid' 
            ? "grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-3 sm:gap-4 auto-rows-max"
            : "space-y-2"
          }>
          {filteredGames.map((game) => {
            const gameStatus = getGameStatus(game);
            const gameIsFavorited = isFavorited(game.appId);
            
            if (viewMode === 'grid') {
              return (
                <div
                  key={game.appId}
                  onClick={() => handleGameClick(game)}
                  className="relative bg-gray-800 rounded-lg overflow-hidden hover:shadow-lg hover:scale-105 transition-all duration-300 cursor-pointer group aspect-[3/4]"
                >
                  {/* Game Image */}
                  <div className="w-full h-full">
                    {game.imageUrl ? (
                      <img 
                        src={game.imageUrl} 
                        alt={game.name} 
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gray-700 flex items-center justify-center">
                        <span className="text-gray-500 text-sm">Game Image</span>
                      </div>
                    )}
                    
                    {/* Status Indicators */}
                    <div className="absolute top-2 left-2 flex flex-col space-y-1">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        gameStatus.status === 'installed' ? 'bg-green-600 text-white' :
                        gameStatus.status === 'downloading' ? 'bg-blue-600 text-white' :
                        gameStatus.status === 'downloaded' ? 'bg-yellow-600 text-white' :
                        'bg-gray-600 text-gray-300'
                      }`}>
                        {gameStatus.status === 'installed' ? 'Installed' :
                         gameStatus.status === 'downloading' ? 'Downloading' :
                         gameStatus.status === 'downloaded' ? 'Downloaded' :
                         'Not Downloaded'}
                      </span>
                      {gameIsFavorited && (
                        <span className="bg-red-600 text-white px-2 py-1 rounded text-xs font-medium">
                          ❤ Favorite
                        </span>
                      )}
                    </div>
                    
                    {/* Download Progress Bar */}
                    {gameStatus.status === 'downloading' && gameStatus.progress !== undefined && (
                      <div className="absolute bottom-12 left-2 right-2">
                        <div className="bg-black bg-opacity-75 rounded p-2">
                          <div className="w-full bg-gray-700 rounded-full h-1">
                            <div 
                              className="bg-blue-600 h-1 rounded-full transition-all duration-300" 
                              style={{ width: `${gameStatus.progress}%` }}
                            ></div>
                          </div>
                          <div className="text-xs text-white mt-1">{gameStatus.progress.toFixed(1)}%</div>
                        </div>
                      </div>
                    )}
                    
                    {/* Title Overlay */}
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent p-3">
                      <h3 className="text-white font-medium text-sm line-clamp-2">{game.name}</h3>
                    </div>
                  </div>
                </div>
              );
            } else {
              return (
                <div
                  key={game.appId}
                  onClick={() => handleGameClick(game)}
                  className="bg-gray-800 rounded-lg p-4 hover:bg-gray-750 transition-colors cursor-pointer flex items-center space-x-4"
                >
                  <div className="w-12 h-16 bg-gray-700 rounded overflow-hidden flex-shrink-0">
                    {game.imageUrl ? (
                      <img 
                        src={game.imageUrl} 
                        alt={game.name} 
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="text-gray-500 text-xs">📁</span>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-white mb-1 truncate">{game.name}</h3>
                    <div className="flex items-center space-x-2 text-sm text-gray-400">
                      <span>{game.developer || 'Unknown Developer'}</span>
                      {gameIsFavorited && (
                        <>
                          <span>•</span>
                          <span className="text-red-400">❤ Favorite</span>
                        </>
                      )}
                    </div>
                    {gameStatus.status === 'downloading' && gameStatus.progress !== undefined && (
                      <div className="mt-2">
                        <div className="w-full bg-gray-700 rounded-full h-1">
                          <div 
                            className="bg-blue-600 h-1 rounded-full transition-all duration-300" 
                            style={{ width: `${gameStatus.progress}%` }}
                          ></div>
                        </div>
                        <div className="text-xs text-gray-400 mt-1">{gameStatus.progress.toFixed(1)}% downloaded</div>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center space-x-3">
                    <div className={`text-sm font-medium ${gameStatus.color}`}>
                      {gameStatus.text}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleGameAction(game);
                      }}
                      className={`px-4 py-2 rounded transition-colors text-sm font-medium ${
                        gameStatus.status === 'installed' 
                          ? 'bg-green-600 hover:bg-green-700 text-white'
                          : gameStatus.status === 'downloading'
                          ? 'bg-blue-600 hover:bg-blue-700 text-white'
                          : gameStatus.status === 'downloaded'
                          ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
                          : 'bg-gray-600 hover:bg-gray-700 text-white'
                      }`}
                    >
                      {gameStatus.action}
                    </button>
                  </div>
                </div>
              );
            }
          })}
          </div>
        )}
      </div>
    </div>
  );
}

export default Library; 