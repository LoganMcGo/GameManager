import React, { useState, useEffect, useRef } from 'react';
import { useLibrary } from '../context/LibraryContext';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import AvailableDownloads from './AvailableDownloads';

function Library({ onGameSelect }) {
  const { library, favorites, isLoading, addToLibrary, removeFromLibrary, toggleFavorite, isFavorited } = useLibrary();
  const { isAuthenticated } = useAuth();
  const notifications = useNotifications();
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
  const [statusUpdateDebounce, setStatusUpdateDebounce] = useState(new Map());
  
  // Library's own persistent state for games that need setup
  const [libraryGameStates, setLibraryGameStates] = useState(new Map());
  
  // Use a ref to access current library states in event handlers to avoid stale closures
  const libraryGameStatesRef = useRef(libraryGameStates);
  
  // Keep ref in sync with state
  useEffect(() => {
    libraryGameStatesRef.current = libraryGameStates;
  }, [libraryGameStates]);

  // Load library game states from localStorage on mount
  useEffect(() => {
    const loadLibraryStates = () => {
      try {
        const savedStates = localStorage.getItem('libraryGameStates');
        if (savedStates) {
          const statesObject = JSON.parse(savedStates);
          const statesMap = new Map(Object.entries(statesObject));
          setLibraryGameStates(statesMap);
          console.log('📚 Loaded library game states:', statesMap);
        }
      } catch (error) {
        console.warn('Failed to load library game states:', error);
      }
    };

    loadLibraryStates();
  }, []);

  // Save library game states to localStorage whenever they change
  useEffect(() => {
    if (libraryGameStates.size > 0) {
      try {
        const statesObject = Object.fromEntries(libraryGameStates);
        localStorage.setItem('libraryGameStates', JSON.stringify(statesObject));
        console.log('💾 Saved library game states to localStorage');
      } catch (error) {
        console.warn('Failed to save library game states:', error);
      }
    }
  }, [libraryGameStates]);
  const [isCheckingInstalled, setIsCheckingInstalled] = useState(false);
  const [showUninstallConfirm, setShowUninstallConfirm] = useState(false);
  const [gameToUninstall, setGameToUninstall] = useState(null);
  const [isUninstalling, setIsUninstalling] = useState(false);

  // Repack installation modal state
  const [showRepackModal, setShowRepackModal] = useState(false);
  const [repackGameInfo, setRepackGameInfo] = useState(null);
  const [repackInfo, setRepackInfo] = useState(null);
  const [isInstallingRepack, setIsInstallingRepack] = useState(false);

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
      // Only do initial check, no polling
      checkRealDebridDownloads();
      checkActiveDownloads();
      checkRunningGames();
    }
  }, [isAuthenticated]);

  // Setup real-time listeners
  useEffect(() => {
    // Listen for download updates
    const unsubscribeDownloads = window.api.downloadTracker.onDownloadUpdate((download) => {
      setActiveDownloads(prevDownloads => {
        const updated = new Map(prevDownloads);
        
        // Only update active downloads if library doesn't own this game's state
        const libraryOwnsState = libraryGameStatesRef.current.has(download.gameId);
        
        if (!libraryOwnsState) {
          updated.set(download.gameId, download);
        } else {
          console.log(`📚 Library owns ${download.gameName}, not updating active downloads`);
        }
        
        return updated;
      });
      
      // Check if download is complete and needs setup - transfer ownership to library
      if (download.status === 'complete' && (download.needsManualSetup || download.isRepack)) {
        transferGameToLibraryOwnership(download);
        return; // Library owns this game now, don't update gameStatuses
      }
      
      // Only update gameStatuses if library doesn't own this game's state
      const libraryOwnsState = libraryGameStatesRef.current.has(download.gameId);
      if (!libraryOwnsState) {
        const existingStatus = gameStatuses.get(download.gameId);
        
        // Preserve installed/ready status if game is complete and has executable
        const shouldPreserveInstalled = existingStatus && 
          existingStatus.status === 'complete' && 
          existingStatus.executablePath && 
          download.status === 'complete';
        
        if (!shouldPreserveInstalled) {
          const newStatus = {
            status: download.status,
            progress: download.progress || 0,
            gameDirectory: download.gameDirectory,
            executablePath: download.executablePath,
            needsManualSetup: download.needsManualSetup,
            availableExecutables: download.availableExecutables
          };
          
          updateGameStatusDebounced(download.gameId, newStatus, 'realTimeListener');
        }
      } else {
        console.log(`📚 Library owns ${download.gameName}, not updating game status`);
      }
      
      // Immediate installation check when download completes
      if (download.status === 'complete' || download.status === 'extraction_complete') {
        setTimeout(() => checkInstalledGames(), 500); // Small delay to ensure files are ready
      }
    });

    // Listen for game closure events
    const unsubscribeGameClosed = window.api.launcher.onGameClosed((gameData) => {
      setRunningGames(prev => {
        const newSet = new Set(prev);
        newSet.delete(gameData.gameId);
        return newSet;
      });
      // Force immediate check of all running games to ensure consistency
      setTimeout(() => checkRunningGames(), 100);
    });

    // Listen for downloads moved to history
    const unsubscribeHistoryUpdates = window.api.downloadTracker.onHistoryUpdate && window.api.downloadTracker.onHistoryUpdate(() => {
      console.log('📚 Download history updated - library maintaining setup states');
      // Don't need to do anything special here since library owns the setup states
      // Just log that we're aware of the history change
    });

    // Listen for downloads moved to history (specific download)
    const unsubscribeMovedToHistory = window.api.downloadTracker.onMovedToHistory && window.api.downloadTracker.onMovedToHistory((download) => {
      console.log(`📚 Download moved to history: ${download.gameName}`);
      
      // If library owns this game's setup state, maintain it
      const libraryOwnsState = libraryGameStatesRef.current.has(download.gameId);
      if (libraryOwnsState) {
        console.log(`📚 Library maintaining setup state for ${download.gameName} despite move to history`);
        // Remove from active downloads but keep library state
        setActiveDownloads(prev => {
          const updated = new Map(prev);
          updated.delete(download.gameId);
          return updated;
        });
      }
    });

    // Listen for inter-component communication events
    const handleGameNeedsSetup = (event) => {
      const { gameId, gameName, setupData } = event.detail;
      console.log(`📨 Received setup request for: ${gameName}`, setupData);
      
      // Take ownership of this game's setup state
      setLibraryGameStates(prev => {
        const updated = new Map(prev);
        updated.set(gameId, {
          status: 'needs_setup',
          timestamp: Date.now(),
          setupData: setupData,
          source: 'external_notification'
        });
        return updated;
      });
    };

    const handleGameInstalled = (event) => {
      const { gameId, installData } = event.detail;
      console.log(`📨 Game installed notification for: ${gameId}`, installData);
      
      // Only release from library ownership if the install data indicates a successful installation
      // with an executable path
      if (installData && installData.executablePath) {
        console.log(`✅ Releasing ownership - game has executable: ${installData.executablePath}`);
        releaseGameFromLibraryOwnership(gameId, 'external_install_notification', false);
        
        // Trigger installation check
        setTimeout(() => checkInstalledGames(), 500);
      } else {
        console.log(`⚠️ Not releasing ownership - no executable path in install data`);
        // Keep the setup state since the game might not be properly installed
      }
    };

    // Add event listeners for inter-component communication
    window.addEventListener('game-needs-setup', handleGameNeedsSetup);
    window.addEventListener('game-installed', handleGameInstalled);

    return () => {
      unsubscribeDownloads();
      unsubscribeGameClosed();
      unsubscribeHistoryUpdates && unsubscribeHistoryUpdates();
      unsubscribeMovedToHistory && unsubscribeMovedToHistory();
      window.removeEventListener('game-needs-setup', handleGameNeedsSetup);
      window.removeEventListener('game-installed', handleGameInstalled);
    };
  }, []); // Removed libraryGameStates dependency to prevent stale closures

  // Setup periodic checks with improved intervals + force refresh capability
  useEffect(() => {
    if (library.length === 0) return;

    // Force refresh function accessible globally
    window.libraryForceRefresh = () => {
      console.log('🔄 Force refreshing library...');
      checkInstalledGames();
      checkActiveDownloads(); 
      checkRunningGames();
    };

    // Initial checks when library loads
    checkInstalledGames();
    checkActiveDownloads();
    checkRunningGames();

    // More frequent monitoring for running games to catch external closures
    const runningGamesInterval = setInterval(() => {
      if (runningGames.size > 0) {
        checkRunningGames();
      }
    }, 3000); // Check every 3 seconds when games are running

    return () => {
      // Clean up global function
      if (window.libraryForceRefresh) {
        delete window.libraryForceRefresh;
      }
      clearInterval(runningGamesInterval);
    };
  }, [library, runningGames.size]);

  // Force refresh when component becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && library.length > 0) {
        // Immediate checks for better responsiveness
        setTimeout(() => {
          checkInstalledGames();
          checkActiveDownloads();
          checkRunningGames();
        }, 100);
      }
    };

    const handleNavigationRefresh = () => {
      // Immediate checks for better responsiveness
      setTimeout(() => {
        checkInstalledGames();
        checkActiveDownloads();
        checkRunningGames();
      }, 100);
    };

    const handleKeyPress = (e) => {
      // F5 or Ctrl+R to force refresh library status
      if (e.key === 'F5' || (e.ctrlKey && e.key === 'r')) {
        e.preventDefault();
        checkInstalledGames();
        checkActiveDownloads();
        checkRunningGames();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('navigateToLibrary', handleNavigationRefresh);
    window.addEventListener('libraryRefresh', handleNavigationRefresh);
    document.addEventListener('keydown', handleKeyPress);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('navigateToLibrary', handleNavigationRefresh);
      window.removeEventListener('libraryRefresh', handleNavigationRefresh);
      document.removeEventListener('keydown', handleKeyPress);
    };
  }, [library]);

  // Check for installed games
  const checkInstalledGames = async () => {
    // Prevent multiple concurrent checks
    if (isCheckingInstalled) {
      return;
    }
    
    setIsCheckingInstalled(true);
    try {
      const downloadLocation = await window.api.download.getDownloadLocation();
      if (downloadLocation) {
        const newInstalledGames = new Set();
        
        for (const game of library) {
          // Check if library owns this game's state (e.g., needs setup)
          const libraryOwnsState = libraryGameStatesRef.current.has(game.appId);
          const libraryState = libraryGameStatesRef.current.get(game.appId);
          
          // Skip games that library owns for setup - don't override their state
          if (libraryOwnsState && libraryState?.status === 'needs_setup') {
            console.log(`⏭️ Skipping installation check for ${game.name} - library owns setup state`);
            continue;
          }
          
          // First try to use tracked game directory if available
          const trackedStatus = gameStatuses.get(game.appId);
          
          // Skip games that are actively downloading/extracting to avoid conflicts
          if (trackedStatus && ['downloading', 'extracting', 'download_complete', 'extraction_complete', 'finding_executable'].includes(trackedStatus.status)) {
            continue;
          }
          
          const gameDirectory = trackedStatus?.gameDirectory || `${downloadLocation}/${game.name.replace(/[<>:"/\\|?*]/g, '_')}`;
          
          const gameInfo = {
            gameId: game.appId,
            gameName: game.name,
            gameDirectory: gameDirectory
          };
          
          try {
            const readyStatus = await window.api.launcher.isGameReady(gameInfo);
            if (readyStatus.ready) {
              newInstalledGames.add(game.appId);
              
              // Only update gameStatuses if we don't have a tracked status OR the tracked status is complete but missing executable info
              const needsStatusUpdate = !trackedStatus || 
                (trackedStatus.status === 'complete' && !trackedStatus.executablePath && readyStatus.executablePath);
              
              if (needsStatusUpdate) {
                const newStatus = {
                  ...trackedStatus, // Preserve existing tracked data
                  ...readyStatus,
                  gameDirectory: gameDirectory,
                  status: 'complete' // Mark as complete for installed games
                };
                updateGameStatusDebounced(game.appId, newStatus, 'installedChecker');
              }
            }
          } catch (error) {
            console.warn(`Failed to check game readiness for ${game.name}:`, error);
          }
        }
        
        setInstalledGames(newInstalledGames);
      }
    } catch (error) {
      console.warn('Failed to check installed games:', error);
    } finally {
      setIsCheckingInstalled(false);
    }
  };

  // Check for running games
  const checkRunningGames = async () => {
    try {
      const runningGameIds = await window.api.launcher.getRunningGames();
      const newRunningGames = new Set(runningGameIds);
      
      setRunningGames(newRunningGames);
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
              if (download.filename) {
                // Use precise matching for filenames too
                const filenameWithoutExt = download.filename.toLowerCase().split('.')[0];
                if (isGameNameMatch(filenameWithoutExt, game.name)) {
                  gameDownloads.add(game.appId);
                }
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

  // Check active downloads from the new download tracker (simplified since library manages its own state)
  const checkActiveDownloads = async () => {
    try {
      if (window.api?.downloadTracker?.getDownloads) {
        const trackedDownloads = await window.api.downloadTracker.getDownloads();
        const activeMap = new Map();
        
        trackedDownloads.forEach(download => {
          // Match download to library game by game ID or name (with precise matching)
          library.forEach(game => {
            if ((download.gameId && download.gameId === game.appId) ||
                (download.gameName && isGameNameMatch(download.gameName, game.name))) {
              
              // Check if library owns this game's state
              const libraryOwnsState = libraryGameStatesRef.current.has(game.appId);
              
              if (!libraryOwnsState) {
                activeMap.set(game.appId, download);
                
                const existingStatus = gameStatuses.get(game.appId);
                
                // Only update if this represents a change or new information
                const shouldUpdateStatus = !existingStatus || 
                  existingStatus.status !== download.status ||
                  (!existingStatus.executablePath && download.executablePath);
                
                if (shouldUpdateStatus) {
                  const newStatus = {
                    status: download.status,
                    progress: download.progress || 0,
                    gameDirectory: download.gameDirectory,
                    executablePath: download.executablePath,
                    needsManualSetup: download.needsManualSetup,
                    availableExecutables: download.availableExecutables
                  };
                  updateGameStatusDebounced(game.appId, newStatus, 'downloadTracker');
                }
              } else {
                console.log(`📚 Library owns ${game.name}, skipping active download update`);
              }
            }
          });
        });
        
        setActiveDownloads(activeMap);
      }
    } catch (error) {
      console.warn('Failed to check tracked downloads:', error);
    }
  };

  // Debounced status update function
  const updateGameStatusDebounced = (gameId, newStatus, source) => {
    const currentTime = Date.now();
    const lastUpdate = statusUpdateDebounce.get(gameId) || 0;
    
    // Prevent updates within 2 seconds unless it's a significant change
    if (currentTime - lastUpdate < 2000) {
      const existingStatus = gameStatuses.get(gameId);
      if (existingStatus && existingStatus.status === newStatus.status) {
        return;
      }
    }
    
    setStatusUpdateDebounce(prev => new Map(prev).set(gameId, currentTime));
    
    setGameStatuses(prev => {
      const updated = new Map(prev);
      updated.set(gameId, newStatus);
      return updated;
    });
  };

  // Transfer game ownership to library when download completes and needs setup
  const transferGameToLibraryOwnership = (download) => {
    const gameId = download.gameId;
    const gameName = download.gameName;
    
    console.log(`📚 Library taking ownership of setup for: ${gameName}`, {
      gameId,
      tempExtractionPath: download.tempExtractionPath,
      isRepack: download.isRepack,
      repackType: download.repackType,
      needsManualSetup: download.needsManualSetup
    });
    
    // Ensure we have valid setup data
    const setupData = {
      gameDirectory: download.gameDirectory,
      tempExtractionPath: download.tempExtractionPath,
      isRepack: download.isRepack || false,
      repackType: download.repackType || 'Game Repack',
      needsManualSetup: download.needsManualSetup || false,
      availableExecutables: download.availableExecutables || [],
      executablePath: download.executablePath
    };
    
    // Log the setup data to ensure tempExtractionPath is included
    console.log(`📚 Setup data for ${gameName}:`, setupData);
    
    setLibraryGameStates(prev => {
      const updated = new Map(prev);
      updated.set(gameId, {
        status: 'needs_setup',
        timestamp: Date.now(),
        setupData: setupData,
        source: 'download_completion'
      });
      
      console.log(`📚 Library state updated for ${gameName}:`, updated.get(gameId));
      return updated;
    });
    
    // Remove from regular gameStatuses since library owns it now
    setGameStatuses(prev => {
      const updated = new Map(prev);
      updated.delete(gameId);
      return updated;
    });
  };

  // Remove game from library ownership (when installed or no longer needs setup)
  const releaseGameFromLibraryOwnership = (gameId, reason = 'unknown', requiresExecutable = true) => {
    console.log(`📤 Library considering releasing ownership of game: ${gameId} (reason: ${reason})`);
    
    // If we require an executable and this is an install notification, verify the game actually has one
    if (requiresExecutable && reason.includes('install')) {
      const trackedStatus = gameStatuses.get(gameId);
      const installedGameExists = installedGames.has(gameId);
      
      // Only release if the game is actually detected as installed with an executable
      if (!installedGameExists || !trackedStatus?.executablePath) {
        console.log(`⚠️ Not releasing ownership - game not properly installed yet`);
        return;
      }
    }
    
    console.log(`📤 Library releasing ownership of game: ${gameId} (reason: ${reason})`);
    
    setLibraryGameStates(prev => {
      const updated = new Map(prev);
      updated.delete(gameId);
      return updated;
    });
  };

  // Notify other components about game state changes
  const notifyGameStateChange = (gameId, gameName, newState, data = {}) => {
    const event = new CustomEvent(`game-state-change`, {
      detail: { gameId, gameName, newState, data, timestamp: Date.now() }
    });
    window.dispatchEvent(event);
    console.log(`📨 Notified game state change: ${gameName} -> ${newState}`);
  };

  // Precise game name matching to avoid "Portal" matching "Portal 2"
  const isGameNameMatch = (downloadName, gameName) => {
    if (!downloadName || !gameName) return false;
    
    const cleanDownloadName = downloadName.toLowerCase().trim();
    const cleanGameName = gameName.toLowerCase().trim();
    
    // Exact match first
    if (cleanDownloadName === cleanGameName) {
      return true;
    }
    
    // Clean both names by removing common variations
    const cleanForComparison = (name) => {
      return name
        .replace(/[:\-–—]/g, ' ')  // Replace colons and dashes with spaces
        .replace(/\s+/g, ' ')       // Normalize spaces
        .trim();
    };
    
    const normalizedDownload = cleanForComparison(cleanDownloadName);
    const normalizedGame = cleanForComparison(cleanGameName);
    
    // Check if either name exactly matches the other after normalization
    if (normalizedDownload === normalizedGame) {
      return true;
    }
    
    // For substring matching, be very strict to avoid false positives
    // Only match if one name is a subset of the other AND the difference is small
    const minLength = Math.min(normalizedDownload.length, normalizedGame.length);
    const maxLength = Math.max(normalizedDownload.length, normalizedGame.length);
    
    // If the length difference is too large, it's likely a different game
    if (maxLength - minLength > 10) {
      return false;
    }
    
    // Check for exact word boundaries to avoid "Portal" matching "Portal 2"
    const downloadWords = normalizedDownload.split(' ').filter(w => w.length > 0);
    const gameWords = normalizedGame.split(' ').filter(w => w.length > 0);
    
    // Must have significant word overlap
    const commonWords = downloadWords.filter(word => 
      gameWords.some(gameWord => gameWord === word)
    );
    
    // Require at least 80% of the shorter name's words to match
    const minWords = Math.min(downloadWords.length, gameWords.length);
    const matchRatio = commonWords.length / minWords;
    
    if (matchRatio >= 0.8) {
      // Additional check: make sure we're not matching sequels
      const hasSequelIndicators = (words) => {
        return words.some(word => 
          /^(2|3|4|5|ii|iii|iv|v|two|three|four|five)$/i.test(word) ||
          /^(sequel|part|chapter|episode)$/i.test(word)
        );
      };
      
      const downloadHasSequel = hasSequelIndicators(downloadWords);
      const gameHasSequel = hasSequelIndicators(gameWords);
      
      // If one has sequel indicators and the other doesn't, don't match
      if (downloadHasSequel !== gameHasSequel) {
        return false;
      }
      
      return true;
    }
    
    return false;
  };

  // Expose library state management functions globally for inter-component communication
  useEffect(() => {
    // Make functions available to other components
    window.libraryStateManager = {
      takeOwnership: (gameId, gameName, setupData) => {
        console.log(`📚 External request to take ownership of: ${gameName}`);
        setLibraryGameStates(prev => {
          const updated = new Map(prev);
          updated.set(gameId, {
            status: 'needs_setup',
            timestamp: Date.now(),
            setupData: setupData,
            source: 'external_api'
          });
          return updated;
        });
      },
      releaseOwnership: (gameId, reason = 'external_release') => {
        releaseGameFromLibraryOwnership(gameId, reason);
      },
      getLibraryState: (gameId) => {
        return libraryGameStates.get(gameId);
      },
      getAllLibraryStates: () => {
        return Array.from(libraryGameStates.entries());
      }
    };

    return () => {
      if (window.libraryStateManager) {
        delete window.libraryStateManager;
      }
    };
  }, [libraryGameStates]);

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
    const gameStatus = getGameStatus(game);
    const trackedStatus = gameStatuses.get(game.appId);
    
    switch (gameStatus.status) {
      case 'running':
        // Stop the game
        try {
          const result = await window.api.launcher.stopGame(game.appId);
          if (result.success) {
            setRunningGames(prev => {
              const newSet = new Set(prev);
              newSet.delete(game.appId);
              return newSet;
            });
            // Force immediate status update
            checkRunningGames();
          }
        } catch (error) {
          console.error('Error stopping game:', error);
        }
        break;
        
      case 'installed':
      case 'ready_to_play':
        // Launch game - try tracked executable first, then fallback to old method
        try {
          let gameInfo = {
            gameId: game.appId,
            gameName: game.name
          };
          
          // Use tracked game directory and executable if available
          if (trackedStatus?.gameDirectory) {
            gameInfo.gameDirectory = trackedStatus.gameDirectory;
            if (trackedStatus.executablePath) {
              gameInfo.executablePath = trackedStatus.executablePath;
            }
          } else {
            // Fallback to old method
            const downloadLocation = await window.api.download.getDownloadLocation();
            gameInfo.gameDirectory = `${downloadLocation}/${game.name}`;
          }
          
          const result = await window.api.launcher.launchGame(gameInfo);
          if (result.success) {
            setRunningGames(prev => new Set(prev).add(game.appId));
            // Force immediate status update without delay
            checkRunningGames();
          } else if (result.needsManualSetup) {
            await handleExecutableSelection(game, gameInfo);
          }
        } catch (error) {
          console.error('Error launching game:', error);
        }
        break;
        
      case 'needs_setup':
        // Handle repack installation or manual executable selection using library state
        try {
          // Get the library's own state for this game
          const libraryState = libraryGameStates.get(game.appId);
          let setupData = libraryState?.setupData || {};
          
          console.log('🔧 Setting up game using library state:', game.name, setupData);
          
          // If we don't have temp extraction path, try to get it from download tracker history
          if (setupData.isRepack && !setupData.tempExtractionPath) {
            console.log('⚠️ Missing temp extraction path, checking download tracker history...');
            
            try {
              const [activeDownloads, downloadHistory] = await Promise.all([
                window.api.downloadTracker.getDownloads(),
                window.api.downloadTracker.getHistory()
              ]);
              
              // Check both active and history for this game
              const allDownloads = [...activeDownloads, ...downloadHistory];
              const gameDownload = allDownloads.find(d => {
                // Use precise matching to avoid Portal matching Portal 2
                const downloadNameMatch = d.gameName && isGameNameMatch(d.gameName, game.name);
                const idMatch = d.gameId === game.appId;
                return (idMatch || downloadNameMatch) && d.isRepack && d.tempExtractionPath;
              });
              
              if (gameDownload?.tempExtractionPath) {
                console.log('✅ Found temp extraction path in download tracker:', gameDownload.tempExtractionPath);
                setupData = {
                  ...setupData,
                  tempExtractionPath: gameDownload.tempExtractionPath,
                  repackType: gameDownload.repackType || setupData.repackType
                };
                
                // Update library state with the found path
                setLibraryGameStates(prev => {
                  const updated = new Map(prev);
                  const currentState = updated.get(game.appId);
                  if (currentState) {
                    updated.set(game.appId, {
                      ...currentState,
                      setupData: setupData
                    });
                  }
                  return updated;
                });
              } else {
                console.warn(`❌ Could not find temp extraction path for ${game.name} in download history`);
                
                // As a fallback, try to locate any extracted repack files in the download directory
                const downloadLocation = await window.api.download.getDownloadLocation();
                const possibleTempPath = `${downloadLocation}\\${game.name.replace(/[<>:"/\\|?*]/g, '_')}`;
                
                console.log(`🔍 Checking for extracted files at: ${possibleTempPath}`);
                
                // Check if this directory exists and contains setup files
                try {
                  const directoryExists = await window.api.launcher.checkDirectoryExists(possibleTempPath);
                  if (directoryExists) {
                    // Try to find setup executables in this directory
                    const executables = await window.api.launcher.scanDirectory(possibleTempPath);
                    const hasSetupFiles = executables.some(exe => {
                      const fileName = exe.toLowerCase();
                      return fileName.includes('setup') || fileName.includes('install');
                    });
                    
                    if (hasSetupFiles) {
                      console.log('✅ Found possible repack files at fallback location');
                      setupData = {
                        ...setupData,
                        tempExtractionPath: possibleTempPath
                      };
                      
                      // Update library state with the found path
                      setLibraryGameStates(prev => {
                        const updated = new Map(prev);
                        const currentState = updated.get(game.appId);
                        if (currentState) {
                          updated.set(game.appId, {
                            ...currentState,
                            setupData: setupData
                          });
                        }
                        return updated;
                      });
                    }
                  }
                } catch (error) {
                  console.warn('Failed to check fallback directory:', error);
                }
              }
            } catch (error) {
              console.warn('Failed to check download tracker for temp extraction path:', error);
            }
          }
          
          if (setupData.isRepack && setupData.tempExtractionPath) {
            console.log('🔄 Handling repack installation for:', game.name);
            
            // This is a repack - handle installation flow
            const repackInfo = {
              repackType: setupData.repackType || 'Game Repack',
              installer: setupData.tempExtractionPath,
              installInstructions: [
                'This is a repack that needs to be installed before playing.',
                'Follow the installation wizard to complete setup.',
                'Install to the download directory for automatic detection.'
              ]
            };
            
            await handleRepackInstallation(game, {
              gameId: game.appId,
              gameName: game.name,
              gameDirectory: setupData.tempExtractionPath
            }, repackInfo);
          } else {
            console.log('🔧 Handling as regular game setup');
            
            // Regular game setup - look for executable in download directory  
            const gameInfo = {
              gameId: game.appId,
              gameName: game.name,
              gameDirectory: setupData.gameDirectory || `${await window.api.download.getDownloadLocation()}/${game.name.replace(/[<>:"/\\|?*]/g, '_')}`
            };
            await handleExecutableSelection(game, gameInfo);
          }
        } catch (error) {
          console.error('Error setting up game:', error);
        }
        break;
        
      case 'downloading':
      case 'download_complete':
      case 'extracting':
      case 'extraction_complete':
      case 'finding_executable':
        // Navigate to downloads page to view progress
        handleNavigateToDownloads();
        break;
        
      case 'downloaded':
        // Open download folder
        try {
          if (window.api?.download?.openDownloadLocation) {
            await window.api.download.openDownloadLocation();
          }
        } catch (error) {
          console.error('Failed to open download location:', error);
        }
        break;
        
      case 'error':
        // Show available downloads to retry
        handleGameClick(game);
        break;
        
      case 'not_downloaded':
      default:
        // Show available downloads - first try to scroll to downloads section if already viewing this game
        if (selectedGame && selectedGame.appId === game.appId) {
          scrollToDownloads();
        } else {
          handleGameClick(game);
        }
        break;
    }
  };

  const handleExecutableSelection = async (game, gameInfo) => {
    try {
      // First try to scan for executables automatically
      const scanResult = await window.api.launcher.findExecutable(gameInfo);
      
      // Check if this is a repack that needs installation
      if (scanResult.isRepack && scanResult.needsInstallation) {
        await handleRepackInstallation(game, gameInfo, scanResult.repackInfo);
        return;
      }
      
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
    const isRunning = runningGames.has(game.appId);
    const isInstalled = installedGames.has(game.appId);
    const isDownloaded = downloadedGames.has(game.appId);
    const activeDownload = activeDownloads.get(game.appId);
    const gameStatus = gameStatuses.get(game.appId);
    const libraryState = libraryGameStatesRef.current.get(game.appId); // Use ref for latest state
    
    // Debug logging for Portal specifically
    if (game.name === 'Portal') {
      console.log(`🎮 Portal status check:`, {
        isRunning,
        isInstalled,
        isDownloaded,
        hasActiveDownload: !!activeDownload,
        hasGameStatus: !!gameStatus,
        hasLibraryState: !!libraryState,
        libraryStatus: libraryState?.status,
        setupData: libraryState?.setupData,
        libraryMapSize: libraryGameStatesRef.current.size
      });
    }
    
    // Priority 1: Currently running games
    if (isRunning) {
      return { status: 'running', text: '🎮 Running', color: 'text-green-400', action: 'Stop Game' };
    }
    
    // Priority 2: Library-owned states (highest priority for setup states)
    if (libraryState) {
      console.log(`📚 Using library state for ${game.name}:`, libraryState);
      switch (libraryState.status) {
        case 'needs_setup':
          const setupData = libraryState.setupData || {};
          if (setupData.isRepack) {
            return { 
              status: 'needs_setup', 
              text: '⚙️ Needs Setup (Repack)', 
              color: 'text-purple-400', 
              action: 'Setup Repack'
            };
          } else {
            return { 
              status: 'needs_setup', 
              text: '⚙️ Needs Setup', 
              color: 'text-purple-400', 
              action: 'Setup Game'
            };
          }
        default:
          // Unknown library state, continue to other checks
          console.log(`⚠️ Unknown library state for ${game.name}:`, libraryState.status);
          break;
      }
    }
    
    // Priority 3: Games with tracked status (from download tracker)
    if (gameStatus) {
      switch (gameStatus.status) {
        case 'downloading':
          return { 
            status: 'downloading', 
            text: `⬇ Downloading ${gameStatus.progress.toFixed(1)}%`, 
            color: 'text-blue-400', 
            action: 'View Progress',
            progress: gameStatus.progress
          };
        case 'download_complete':
          return { 
            status: 'download_complete', 
            text: '📦 Download Complete', 
            color: 'text-blue-300', 
            action: 'View Progress',
            progress: 100
          };
        case 'extracting':
          return { 
            status: 'extracting', 
            text: '🔧 Extracting...', 
            color: 'text-purple-400', 
            action: 'View Progress'
          };
        case 'extraction_complete':
          return { 
            status: 'extraction_complete', 
            text: '✅ Extraction Complete', 
            color: 'text-purple-300', 
            action: 'View Progress',
            progress: 100
          };
        case 'finding_executable':
          return { 
            status: 'finding_executable', 
            text: '🔍 Setting up game...', 
            color: 'text-yellow-400', 
            action: 'View Progress',
            progress: 90
          };
        case 'complete':
          // Game is complete, check if it has executable path
          if (gameStatus.executablePath) {
            return { 
              status: 'ready_to_play', 
              text: '🎮 Installed', 
              color: 'text-green-400', 
              action: 'Play'
            };
          } else if (gameStatus.needsManualSetup && gameStatus.isRepack) {
            return { 
              status: 'needs_setup', 
              text: '⚙️ Needs Setup', 
              color: 'text-purple-400', 
              action: 'Setup'
            };
          } else if (gameStatus.needsManualSetup) {
            return { 
              status: 'needs_setup', 
              text: '⚙️ Needs Setup', 
              color: 'text-purple-400', 
              action: 'Setup'
            };
          } else {
            // Fallback to installed check
            return { 
              status: 'installed', 
              text: '● Installed', 
              color: 'text-green-400', 
              action: 'Play'
            };
          }
        case 'error':
          return { 
            status: 'error', 
            text: '❌ Download Failed', 
            color: 'text-red-400', 
            action: 'Retry Download'
          };
        default:
          // Unknown tracked status, continue to other checks
          break;
      }
    }
    
    // Priority 4: Check if game is installed (detected by launcher)
    if (isInstalled) {
      return { status: 'installed', text: '● Installed', color: 'text-green-400', action: 'Play' };
    }
    
    // Priority 5: Active download in progress (legacy or without tracked status)
    if (activeDownload) {
      return { 
        status: 'downloading', 
        text: '⬇ Processing...', 
        color: 'text-blue-400', 
        action: 'View Progress'
      };
    }
    
    // Priority 6: Downloaded to Real-Debrid but not locally installed
    if (isDownloaded) {
      return { status: 'downloaded', text: '✓ Downloaded', color: 'text-yellow-400', action: 'Open Folder' };
    }
    
    // Priority 7: Not downloaded at all
    return { status: 'not_downloaded', text: '○ Not Downloaded', color: 'text-gray-400', action: 'Find Downloads' };
  };

  // Navigate to downloads page
  const handleNavigateToDownloads = () => {
    closeDetailView(); // Close the detail view first
    // Use a small delay to ensure the detail view closes before navigation
    setTimeout(() => {
      // Navigate to downloads page by triggering custom event
      window.dispatchEvent(new CustomEvent('navigateToDownloads'));
    }, 100);
  };

  // Scroll to downloads section within the current game detail view
  const scrollToDownloads = () => {
    const downloadsSection = document.querySelector('.available-downloads-section');
    if (downloadsSection) {
      downloadsSection.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'start' 
      });
    }
  };

  // Handle uninstall button click
  const handleUninstallClick = (game) => {
    setGameToUninstall(game);
    setShowUninstallConfirm(true);
  };

  // Handle uninstall confirmation
  const handleUninstallConfirm = async () => {
    if (!gameToUninstall) return;
    
    setIsUninstalling(true);
    try {
      const downloadLocation = await window.api.download.getDownloadLocation();
      const trackedStatus = gameStatuses.get(gameToUninstall.appId);
      
      // Determine game directory
      const gameDirectory = trackedStatus?.gameDirectory || 
        `${downloadLocation}/${gameToUninstall.name.replace(/[<>:"/\\|?*]/g, '_')}`;
      
      // Check if the directory exists
      const directoryExists = await window.api.launcher.checkDirectoryExists(gameDirectory);
      
      if (!directoryExists) {
        console.log('Game directory does not exist, considering uninstalled');
        // Update status and remove from installed games
        setInstalledGames(prev => {
          const newSet = new Set(prev);
          newSet.delete(gameToUninstall.appId);
          return newSet;
        });
        setGameStatuses(prev => {
          const newMap = new Map(prev);
          newMap.delete(gameToUninstall.appId);
          return newMap;
        });
        setShowUninstallConfirm(false);
        setGameToUninstall(null);
        return;
      }
      
      // Try to find and run uninstaller first
      const uninstallResult = await window.api.launcher.uninstallGame({
        gameId: gameToUninstall.appId,
        gameName: gameToUninstall.name,
        gameDirectory: gameDirectory
      });
      
      if (uninstallResult.success) {
        console.log('Game uninstalled successfully');
        
        // Update state to reflect uninstallation
        setInstalledGames(prev => {
          const newSet = new Set(prev);
          newSet.delete(gameToUninstall.appId);
          return newSet;
        });
        
        // Clear game status
        setGameStatuses(prev => {
          const newMap = new Map(prev);
          newMap.delete(gameToUninstall.appId);
          return newMap;
        });
        
        // Trigger a refresh to update the UI
        setTimeout(() => checkInstalledGames(), 1000);
      } else {
        console.error('Failed to uninstall game:', uninstallResult.error);
      }
    } catch (error) {
      console.error('Error during uninstallation:', error);
    } finally {
      setIsUninstalling(false);
      setShowUninstallConfirm(false);
      setGameToUninstall(null);
    }
  };

  // Handle repack installation
  const handleRepackInstallation = async (game, gameInfo, repackInfo) => {
    // Get download location for display in modal
    const downloadLocation = await window.api.download.getDownloadLocation();
    
    setRepackGameInfo({ game, gameInfo });
    setRepackInfo({ ...repackInfo, downloadLocation });
    setShowRepackModal(true);
  };

  // Handle running the repack installer
  const handleRunInstaller = async () => {
    if (!repackGameInfo || !repackInfo) return;
    
    setIsInstallingRepack(true);
    try {
      // Get download location for instructions
      const downloadLocation = await window.api.download.getDownloadLocation();
      
      const result = await window.api.launcher.runRepackInstaller({
        gameId: repackGameInfo.game.appId,
        gameName: repackGameInfo.game.name,
        repackType: repackInfo.repackType,
        downloadLocation: downloadLocation
      });
      
      if (result.success) {
        setShowRepackModal(false);
        
        // Start polling for installation completion - check download location specifically
        startInstallationPolling(repackGameInfo.game, downloadLocation);
      } else {
        // Show error to user
        if (notifications?.showNotification) {
          notifications.showNotification({
            id: 'repack-install-error',
            title: 'Installation Error',
            message: result.error || 'Failed to launch the repack installer.',
            type: 'error',
            duration: 8000
          });
        }
      }
    } catch (error) {
      console.error('Error running installer:', error);
      
      // Show error to user
      if (notifications?.showNotification) {
        notifications.showNotification({
          id: 'repack-install-error',
          title: 'Installation Error', 
          message: 'An unexpected error occurred while launching the installer.',
          type: 'error',
          duration: 8000
        });
      }
    } finally {
      setIsInstallingRepack(false);
    }
  };

  // Poll for installation completion - check download directory
  const startInstallationPolling = (game, downloadLocation) => {
    let pollAttempts = 0;
    const maxPollAttempts = 120; // 10 minutes (5 second intervals)
    
    const pollInterval = setInterval(async () => {
      pollAttempts++;
      
      try {
        // Check if a folder with the game name exists in the download directory
        const gameFolderPath = `${downloadLocation}\\${game.name.replace(/[<>:"/\\|?*]/g, '_')}`;
        const folderExists = await window.api.download.checkPathExists(gameFolderPath);
        
        if (folderExists) {
          clearInterval(pollInterval);
          
          // Try to find executable in the installation directory
          const executableResult = await window.api.launcher.findGameExecutable({
            gameId: game.appId,
            gameName: game.name,
            gameDirectory: gameFolderPath
          });
          
          if (executableResult.success) {
            // Add the installed game to the launcher
            await window.api.launcher.addInstalledGame({
              gameId: game.appId,
              gameName: game.name,
              installPath: gameFolderPath,
              executablePath: executableResult.executablePath
            });
            
            // Update local state immediately to ensure we recognize the game as installed
            setInstalledGames(prev => new Set(prev).add(game.appId));
            
            // Update game status to reflect successful installation
            setGameStatuses(prev => {
              const updated = new Map(prev);
              updated.set(game.appId, {
                status: 'complete',
                gameDirectory: gameFolderPath,
                executablePath: executableResult.executablePath,
                needsManualSetup: false
              });
              return updated;
            });
            
            // Clean up temp files for this repack
            await cleanupRepackTempFiles(game.appId, game.name);
            
            // Release from library ownership now that the game is properly installed
            releaseGameFromLibraryOwnership(game.appId, 'successful_installation', false);
            
            // Notify other components about successful installation
            notifyGameStateChange(game.appId, game.name, 'installed', {
              gameDirectory: gameFolderPath,
              executablePath: executableResult.executablePath
            });
            
            // Show success notification
            notifications.showNotification({
              id: 'repack-install-success',
              title: 'Installation Complete!',
              message: `${game.name} has been successfully installed and added to your library.`,
              type: 'success',
              duration: 5000
            });
          } else {
            console.warn('Installation folder found but no executable detected');
            // DON'T release ownership if we can't find an executable
            // Keep the setup state so user can try again or manually select executable
            
            notifications.showNotification({
              id: 'repack-install-partial',
              title: 'Installation Incomplete',
              message: `${game.name} installation folder found but no executable detected. The game still needs setup.`,
              type: 'warning',
              duration: 8000
            });
          }
          
          return;
        }
        
        if (pollAttempts >= maxPollAttempts) {
          clearInterval(pollInterval);
          
          notifications.showNotification({
            id: 'repack-install-timeout',
            title: 'Installation Check Timeout',
            message: `Couldn't automatically detect the installation of ${game.name}. You may need to add it manually if the installation completed.`,
            type: 'warning',
            duration: 8000
          });
        }
        
      } catch (error) {
        console.error('Polling error:', error);
        if (pollAttempts >= maxPollAttempts) {
          clearInterval(pollInterval);
        }
      }
    }, 5000); // Check every 5 seconds
  };

  // Clean up temporary repack files after successful installation
  const cleanupRepackTempFiles = async (gameId, gameName) => {
    try {
      // Remove the temp extraction folder
      const result = await window.api.extraction.cleanupRepackTempFiles(gameId, gameName);
      
      if (result.success) {
        // Temp files cleaned up successfully
      }
    } catch (error) {
      // Error during temp file cleanup
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
                                        gameStatus.status === 'running'
                        ? 'bg-red-600 hover:bg-red-700 text-white'
                        : gameStatus.status === 'installed' || gameStatus.status === 'ready_to_play'
                        ? 'bg-green-600 hover:bg-green-700 text-white'
                        : gameStatus.status === 'downloading' || gameStatus.status === 'extracting'
                        ? 'bg-blue-600 hover:bg-blue-700 text-white'
                        : gameStatus.status === 'downloaded'
                        ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
                        : gameStatus.status === 'needs_setup'
                        ? 'bg-purple-600 hover:bg-purple-700 text-white'
                        : 'bg-gray-600 hover:bg-gray-700 text-white'
              }`}
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {gameStatus.status === 'running' ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 6h12v12H6z" />
                ) : gameStatus.status === 'installed' || gameStatus.status === 'ready_to_play' ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h10a2 2 0 012 2v14a2 2 0 01-2 2z" />
                ) : gameStatus.status === 'downloading' || gameStatus.status === 'extracting' ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4 4m0 0l-4-4m4 4V4" />
                ) : gameStatus.status === 'downloaded' ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                )}
              </svg>
              {gameStatus.status === 'running' ? 'Stop' : 
               gameStatus.status === 'installed' || gameStatus.status === 'ready_to_play' ? 'Play' :
               gameStatus.action}
            </button>
          </div>
        </div>

        {/* Game Detail Content */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {/* Hero Section */}
          <div className="relative h-96 bg-gradient-to-r from-gray-800 to-gray-700 overflow-hidden">
            {(gameData.heroImageUrl || gameData.imageUrl) && (
              <>
                {/* Blurred background layer */}
                <img
                  src={gameData.heroImageUrl || gameData.imageUrl}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover scale-110 blur-md transition-transform duration-700"
                  style={{ filter: 'blur(8px) brightness(0.4)' }}
                />
                {/* Sharp foreground image using object-contain to show whole image */}
                <img
                  src={gameData.heroImageUrl || gameData.imageUrl}
                  alt={gameData.name}
                  className="relative z-10 w-full h-full object-contain transition-transform duration-700"
                />
              </>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent z-20">
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

                {/* Available Downloads - Only show if not installed, not downloading, and doesn't need setup */}
                {gameStatus.status !== 'installed' && 
                 gameStatus.status !== 'ready_to_play' && 
                 gameStatus.status !== 'downloading' && 
                 gameStatus.status !== 'running' && 
                 gameStatus.status !== 'needs_setup' && (
                  <AvailableDownloads 
                    gameName={gameData.name} 
                    gameId={gameData.appId} 
                    game={gameData}
                    onNavigateToLibrary={closeDetailView}
                    onNavigateToDownloads={handleNavigateToDownloads}
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
                    {(gameStatus.status === 'installed' || gameStatus.status === 'ready_to_play' || gameStatus.status === 'downloaded') && (
                      <button
                        onClick={() => handleUninstallClick(gameData)}
                        className="w-full px-3 py-2 rounded text-sm bg-orange-600 hover:bg-orange-700 text-white transition-colors flex items-center justify-center"
                      >
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                        </svg>
                        Uninstall Game
                      </button>
                    )}
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

        {/* Uninstall Confirmation Dialog */}
        {showUninstallConfirm && gameToUninstall && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
              <div className="flex items-center mb-4">
                <div className="flex-shrink-0 w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center mr-3">
                  <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-white">Uninstall Game</h3>
              </div>
              
              <div className="mb-4">
                <p className="text-gray-300 mb-2">
                  Are you sure you want to uninstall <strong>{gameToUninstall.name}</strong>?
                </p>
                <p className="text-red-400 text-sm">
                  ⚠️ You may lose any game save data that isn't stored in the cloud. This action cannot be undone.
                </p>
              </div>
              
              <div className="flex space-x-3">
                <button
                  onClick={() => {
                    setShowUninstallConfirm(false);
                    setGameToUninstall(null);
                  }}
                  disabled={isUninstalling}
                  className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUninstallConfirm}
                  disabled={isUninstalling}
                  className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center"
                >
                  {isUninstalling ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
                      Uninstalling...
                    </>
                  ) : (
                    'Yes, Uninstall'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Repack Installation Modal */}
        {showRepackModal && repackInfo && repackGameInfo && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center mb-4">
                <div className="flex-shrink-0 w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center mr-3">
                  <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path>
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-white">Install {repackInfo.repackType}</h3>
              </div>
              
              <div className="mb-6">
                <p className="text-gray-300 mb-4">
                  <strong>{repackGameInfo.game.name}</strong> is a {repackInfo.repackType} that needs to be installed before you can play it.
                </p>
                
                <div className="bg-gray-900 rounded-lg p-4 mb-4">
                  <h4 className="text-white font-medium mb-2">📋 Installation Instructions:</h4>
                  <ul className="text-gray-300 text-sm space-y-2">
                    <li className="flex items-start">
                      <span className="text-blue-400 mr-2 mt-0.5">▸</span>
                      <span>When prompted for installation location, choose this directory:</span>
                    </li>
                    <li className="ml-6 bg-gray-800 rounded p-2 font-mono text-xs text-green-400 flex items-center justify-between">
                      <span>{repackInfo.downloadLocation}</span>
                      <button
                        onClick={() => navigator.clipboard.writeText(repackInfo.downloadLocation)}
                        className="ml-2 px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-white text-xs"
                        title="Copy to clipboard"
                      >
                        Copy
                      </button>
                    </li>
                    <li className="flex items-start">
                      <span className="text-blue-400 mr-2 mt-0.5">▸</span>
                      <span>Installing to this location is required for the launcher to detect the game automatically</span>
                    </li>
                    {repackInfo.installInstructions.map((instruction, index) => (
                      <li key={index} className="flex items-start">
                        <span className="text-blue-400 mr-2 mt-0.5">▸</span>
                        <span>{instruction}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="bg-yellow-900 border border-yellow-600 rounded-lg p-4 mb-4">
                  <div className="flex items-start">
                    <svg className="w-5 h-5 text-yellow-400 mr-2 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
                    </svg>
                    <div>
                      <p className="text-yellow-300 font-medium text-sm">Important Notes:</p>
                      <ul className="text-yellow-200 text-sm mt-1 space-y-1">
                        <li>• Installation may take 15 minutes to 2+ hours</li>
                        <li>• Keep the launcher open during installation</li>
                        <li>• The game will be automatically added to your library once installed</li>
                        <li>• Make sure you have sufficient disk space</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <p className="text-gray-400 text-sm">
                  After clicking "Run Installer", the setup program will open. Follow the installation wizard to complete the process.
                </p>
              </div>
              
              <div className="flex space-x-3">
                <button
                  onClick={() => {
                    setShowRepackModal(false);
                    setRepackGameInfo(null);
                    setRepackInfo(null);
                  }}
                  disabled={isInstallingRepack}
                  className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRunInstaller}
                  disabled={isInstallingRepack}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center"
                >
                  {isInstallingRepack ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
                      Starting...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h10a2 2 0 012 2v14a2 2 0 01-2 2z"></path>
                      </svg>
                      Run Installer
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-900 text-white main-container">
      {/* Fixed Header Section */}
      <div className="flex-shrink-0 p-4 sm:p-6 pb-0">
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
            ? "grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-3 sm:gap-4 auto-rows-max pt-2"
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
                        gameStatus.status === 'installed' || gameStatus.status === 'ready_to_play' ? 'bg-green-600 text-white' :
                        gameStatus.status === 'downloading' ? 'bg-blue-600 text-white' :
                        gameStatus.status === 'downloaded' ? 'bg-yellow-600 text-white' :
                        gameStatus.status === 'needs_setup' ? 'bg-purple-600 text-white' :
                        'bg-gray-600 text-gray-300'
                      }`}>
                        {gameStatus.status === 'installed' || gameStatus.status === 'ready_to_play' ? 'Installed' :
                         gameStatus.status === 'downloading' ? 'Downloading' :
                         gameStatus.status === 'downloaded' ? 'Downloaded' :
                         gameStatus.status === 'needs_setup' ? 'Needs Setup' :
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
                                              gameStatus.status === 'running'
                        ? 'bg-red-600 hover:bg-red-700 text-white'
                        : gameStatus.status === 'installed' || gameStatus.status === 'ready_to_play'
                        ? 'bg-green-600 hover:bg-green-700 text-white'
                        : gameStatus.status === 'downloading' || gameStatus.status === 'extracting'
                        ? 'bg-blue-600 hover:bg-blue-700 text-white'
                        : gameStatus.status === 'downloaded'
                        ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
                        : gameStatus.status === 'needs_setup'
                        ? 'bg-purple-600 hover:bg-purple-700 text-white'
                        : 'bg-gray-600 hover:bg-gray-700 text-white'
                      }`}
                    >
                      {gameStatus.status === 'running' ? 'Stop' : 
                       gameStatus.status === 'installed' || gameStatus.status === 'ready_to_play' ? 'Play' :
                       gameStatus.action}
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