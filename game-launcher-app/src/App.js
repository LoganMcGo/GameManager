import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import MainContent from './components/MainContent';
import SearchBar from './components/SearchBar';
import WelcomeScreen from './pages/WelcomeScreen';
import SettingsPage from './pages/SettingsPage';
import CategoryPage from './pages/CategoryPage';
import GameDetailView from './components/GameDetailView';
import GameDownloadsManager from './components/RealDebridManager';
import Library from './components/Library';
import NotificationContainer from './components/NotificationContainer';
import { AuthProvider, useAuth } from './context/AuthContext';
import { IgdbProvider, useIgdb } from './context/IgdbContext';
import { LibraryProvider, useLibrary } from './context/LibraryContext';
import { NotificationProvider } from './context/NotificationContext';
import { useNotifications } from './context/NotificationContext';
import { useAutoUpdater } from './hooks/useAutoUpdater';

// Main App content
function AppContent() {
  const { isLoading, firstLaunch, setFirstLaunch } = useAuth();
  const { fetchGameDetails } = useIgdb();
  const { addToRecentlyViewed } = useLibrary();
  const { notifyError, notifyWarning } = useNotifications();
  
  // Initialize auto-updater here where it has access to notifications
  useAutoUpdater();
  
  const [currentPage, setCurrentPage] = useState('home'); // 'home', 'library', 'settings', 'downloads', 'category/action', etc.
  const [selectedGame, setSelectedGame] = useState(null);
  const [gameDetails, setGameDetails] = useState(null);
  const [isLoadingGameDetails, setIsLoadingGameDetails] = useState(false);

  // Set up event listeners for custom navigation events
  useEffect(() => {
    const handleNavigateToLibrary = () => {
      setCurrentPage('library');
    };

    const handleNavigateToDownloads = () => {
      setCurrentPage('downloads');
    };

    window.addEventListener('navigateToLibrary', handleNavigateToLibrary);
    window.addEventListener('navigateToDownloads', handleNavigateToDownloads);

    return () => {
      window.removeEventListener('navigateToLibrary', handleNavigateToLibrary);
      window.removeEventListener('navigateToDownloads', handleNavigateToDownloads);
    };
  }, []);
  
  // Navigation handler
  const handleNavigate = (page) => {
    setCurrentPage(page);
    
    // Trigger refresh for specific pages
    if (page === 'library') {
      // Trigger library refresh event
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('libraryRefresh'));
      }, 100);
    }
  };

  // Handle game selection from search with proper detail fetching
  const handleGameSelect = async (game) => {
    setSelectedGame(game);
    setGameDetails(null);
    setIsLoadingGameDetails(true);
    setCurrentPage('game-detail');
    
    // Add to recently viewed
    addToRecentlyViewed(game);
    
    try {
      const { success, gameDetails: details } = await fetchGameDetails(game.appId);
      if (success) {
        setGameDetails(details);
      } else {
        // Fallback to basic game info if detailed fetch fails
        setGameDetails(game);
        notifyWarning('Could not load detailed game information', {
          subtitle: 'Showing basic game details instead'
        });
      }
    } catch (error) {
      console.error('Error fetching game details:', error);
      // Fallback to basic game info
      setGameDetails(game);
      notifyError('Failed to load game details', {
        subtitle: error.message || 'Please try again later'
      });
    } finally {
      setIsLoadingGameDetails(false);
    }
  };

  // Close game detail view
  const handleCloseGameDetail = () => {
    setSelectedGame(null);
    setGameDetails(null);
    setIsLoadingGameDetails(false);
    setCurrentPage('home');
  };

  // Window control handlers with error handling
  const handleMinimize = () => {
    try {
      if (window.api && window.api.window) {
        window.api.window.minimize();
      }
    } catch (error) {
      console.error('Error minimizing window:', error);
      notifyError('Failed to minimize window', {
        subtitle: 'Window controls may not be available'
      });
    }
  };

  const handleMaximize = () => {
    try {
      if (window.api && window.api.window) {
        window.api.window.maximize();
      }
    } catch (error) {
      console.error('Error maximizing window:', error);
      notifyError('Failed to maximize window', {
        subtitle: 'Window controls may not be available'
      });
    }
  };

  const handleClose = () => {
    try {
      if (window.api && window.api.window) {
        window.api.window.close();
      }
    } catch (error) {
      console.error('Error closing window:', error);
      notifyError('Failed to close window', {
        subtitle: 'Please try using Alt+F4 or the system close button'
      });
    }
  };

  // If still loading auth status, show a loading spinner
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  // If it's the first launch, show the welcome screen
  if (firstLaunch) {
    return <WelcomeScreen onComplete={() => setFirstLaunch(false)} />;
  }

  // Show the main app UI
  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Custom Title Bar */}
      <div className="flex bg-gray-900 h-8 min-h-[2rem]" style={{ WebkitAppRegion: 'drag' }}>
        {/* Draggable area */}
        <div className="flex-1"></div>
        
        {/* Window Controls */}
        <div className="flex" style={{ WebkitAppRegion: 'no-drag' }}>
          <button 
            onClick={handleMinimize}
            className="px-2 sm:px-3 py-1 text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
            title="Minimize"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 12H4"></path>
            </svg>
          </button>
          <button 
            onClick={handleMaximize}
            className="px-2 sm:px-3 py-1 text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
            title="Maximize/Restore"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5"></path>
            </svg>
          </button>
          <button 
            onClick={handleClose}
            className="px-2 sm:px-3 py-1 text-gray-400 hover:text-white hover:bg-red-600 transition-colors"
            title="Close"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>
      </div>

      {/* Main App Content */}
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Left Sidebar */}
        <Sidebar currentPage={currentPage} setCurrentPage={setCurrentPage} onNavigate={handleNavigate} />
        
        {/* Main Content Area */}
        {currentPage === 'home' && <MainContent onNavigate={handleNavigate} onGameSelect={handleGameSelect} />}
        {currentPage === 'library' && <Library onGameSelect={handleGameSelect} />}
        {currentPage === 'settings' && <SettingsPage onGameSelect={handleGameSelect} />}
        {currentPage === 'downloads' && <GameDownloadsManager onGameSelect={handleGameSelect} />}
        {currentPage === 'game-detail' && selectedGame && (
          <GameDetailView 
            game={gameDetails || selectedGame}
            isLoading={isLoadingGameDetails}
            onClose={handleCloseGameDetail}
            onGameSelect={handleGameSelect}
          />
        )}
        {currentPage.startsWith('category/') && (
          <CategoryPage 
            category={currentPage.split('/')[1]} 
            onNavigate={handleNavigate}
            onGameSelect={handleGameSelect}
          />
        )}
      </div>

      {/* Global Notification Container */}
      <NotificationContainer />
    </div>
  );
}

// Wrap the app content with the providers
function App() {
  return (
    <AuthProvider>
      <IgdbProvider>
        <LibraryProvider>
          <NotificationProvider>
            <AppContent />
          </NotificationProvider>
        </LibraryProvider>
      </IgdbProvider>
    </AuthProvider>
  );
}

export default App; 