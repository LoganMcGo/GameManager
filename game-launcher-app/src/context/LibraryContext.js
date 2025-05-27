import React, { createContext, useState, useEffect, useContext, useCallback, useMemo } from 'react';

// Create the context
const LibraryContext = createContext();

// Create a provider component
export function LibraryProvider({ children }) {
  const [library, setLibrary] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [recentlyViewed, setRecentlyViewed] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load data from localStorage on mount
  useEffect(() => {
    const loadData = () => {
      try {
        const savedLibrary = localStorage.getItem('gameLibrary');
        const savedFavorites = localStorage.getItem('gameFavorites');
        const savedRecentlyViewed = localStorage.getItem('recentlyViewed');

        if (savedLibrary) {
          setLibrary(JSON.parse(savedLibrary));
        }
        if (savedFavorites) {
          setFavorites(JSON.parse(savedFavorites));
        }
        if (savedRecentlyViewed) {
          setRecentlyViewed(JSON.parse(savedRecentlyViewed));
        }
      } catch (error) {
        console.error('Error loading library data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  // Save library to localStorage whenever it changes
  useEffect(() => {
    if (!isLoading) {
      localStorage.setItem('gameLibrary', JSON.stringify(library));
    }
  }, [library, isLoading]);

  // Save favorites to localStorage whenever it changes
  useEffect(() => {
    if (!isLoading) {
      localStorage.setItem('gameFavorites', JSON.stringify(favorites));
    }
  }, [favorites, isLoading]);

  // Save recently viewed to localStorage whenever it changes
  useEffect(() => {
    if (!isLoading) {
      localStorage.setItem('recentlyViewed', JSON.stringify(recentlyViewed));
    }
  }, [recentlyViewed, isLoading]);

  // Add game to library
  const addToLibrary = useCallback((game) => {
    setLibrary(prev => {
      const exists = prev.find(g => g.appId === game.appId);
      if (exists) {
        return prev; // Game already in library
      }
      return [...prev, { ...game, addedAt: new Date().toISOString() }];
    });
  }, []);

  // Remove game from library
  const removeFromLibrary = useCallback((gameId) => {
    setLibrary(prev => prev.filter(game => game.appId !== gameId));
  }, []);

  // Check if game is in library
  const isInLibrary = useCallback((gameId) => {
    return library.some(game => game.appId === gameId);
  }, [library]);

  // Add game to favorites
  const addToFavorites = useCallback((game) => {
    setFavorites(prev => {
      const exists = prev.find(g => g.appId === game.appId);
      if (exists) {
        return prev; // Game already in favorites
      }
      return [...prev, { ...game, favoritedAt: new Date().toISOString() }];
    });
  }, []);

  // Remove game from favorites
  const removeFromFavorites = useCallback((gameId) => {
    setFavorites(prev => prev.filter(game => game.appId !== gameId));
  }, []);

  // Toggle favorite status
  const toggleFavorite = useCallback((game) => {
    const isFavorited = favorites.some(fav => fav.appId === game.appId);
    if (isFavorited) {
      removeFromFavorites(game.appId);
    } else {
      addToFavorites(game);
    }
  }, [favorites, addToFavorites, removeFromFavorites]);

  // Check if game is favorited
  const isFavorited = useCallback((gameId) => {
    return favorites.some(game => game.appId === gameId);
  }, [favorites]);

  // Add game to recently viewed (limit to 20 games)
  const addToRecentlyViewed = useCallback((game) => {
    setRecentlyViewed(prev => {
      // Remove if already exists
      const filtered = prev.filter(g => g.appId !== game.appId);
      // Add to beginning and limit to 20
      return [{ ...game, viewedAt: new Date().toISOString() }, ...filtered].slice(0, 20);
    });
  }, []);

  // Get library stats
  const libraryStats = useMemo(() => ({
    totalGames: library.length,
    totalFavorites: favorites.length,
    recentlyViewedCount: recentlyViewed.length
  }), [library.length, favorites.length, recentlyViewed.length]);

  // The context value that will be provided
  const contextValue = useMemo(() => ({
    library,
    favorites,
    recentlyViewed,
    isLoading,
    libraryStats,
    addToLibrary,
    removeFromLibrary,
    isInLibrary,
    addToFavorites,
    removeFromFavorites,
    toggleFavorite,
    isFavorited,
    addToRecentlyViewed
  }), [
    library,
    favorites,
    recentlyViewed,
    isLoading,
    libraryStats,
    addToLibrary,
    removeFromLibrary,
    isInLibrary,
    addToFavorites,
    removeFromFavorites,
    toggleFavorite,
    isFavorited,
    addToRecentlyViewed
  ]);

  return (
    <LibraryContext.Provider value={contextValue}>
      {children}
    </LibraryContext.Provider>
  );
}

// Custom hook to use the library context
export function useLibrary() {
  const context = useContext(LibraryContext);
  if (context === undefined) {
    throw new Error('useLibrary must be used within a LibraryProvider');
  }
  return context;
}
