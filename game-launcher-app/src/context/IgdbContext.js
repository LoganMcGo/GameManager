import React, { createContext, useState, useEffect, useContext, useCallback, useMemo } from 'react';

// Create the context
const IgdbContext = createContext();

// Create a provider component
export function IgdbProvider({ children }) {
  const [clientId, setClientId] = useState(null);
  const [clientSecret, setClientSecret] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Check if the IGDB credentials are configured when the component mounts
  useEffect(() => {
    const checkCredentials = async () => {
      try {
        const { clientId, clientSecret, accessToken } = await window.api.igdb.getCredentials();
        setClientId(clientId);
        setClientSecret(clientSecret);
        setAccessToken(accessToken);
        setIsLoading(false);
      } catch (error) {
        console.error('Error checking IGDB credentials:', error);
        setError('Failed to check IGDB credentials');
        setIsLoading(false);
      }
    };

    checkCredentials();
  }, []);

  // Function to test credentials
  const testCredentials = useCallback(async (newClientId, newClientSecret) => {
    try {
      const result = await window.api.igdb.testCredentials(newClientId, newClientSecret);
      return result;
    } catch (error) {
      console.error('Error testing IGDB credentials:', error);
      return { success: false, error: 'Failed to test credentials' };
    }
  }, []);

  // Function to save the IGDB credentials
  const saveCredentials = useCallback(async (newClientId, newClientSecret) => {
    try {
      const result = await window.api.igdb.setCredentials(newClientId, newClientSecret);
      if (result.success) {
        setClientId(newClientId);
        setClientSecret(newClientSecret);
        setAccessToken(result.accessToken);
        setError(null);
      }
      return result;
    } catch (error) {
      console.error('Error saving IGDB credentials:', error);
      setError('Failed to save IGDB credentials');
      return { success: false, error };
    }
  }, []);

  // Function to fetch game details
  const fetchGameDetails = useCallback(async (gameId) => {
    setError(null);
    
    try {
      const result = await window.api.igdb.getGameDetails(gameId);
      
      if (result.error) {
        console.error('Error fetching game details:', result.error);
        return { success: false, error: result.error };
      }
      
      return { success: true, gameDetails: result.gameDetails };
    } catch (error) {
      console.error(`Error fetching details for game ${gameId}:`, error);
      return { success: false, error: 'Failed to fetch game details' };
    }
  }, []);

  // Function to search games
  const searchGames = useCallback(async (query, limit = 10) => {
    if (!query || query.trim().length < 2) {
      return { success: true, games: [] };
    }

    setError(null);
    
    try {
      const result = await window.api.igdb.searchGames(query, limit);
      
      if (result.error) {
        console.error('Error searching games:', result.error);
        return { success: false, error: result.error };
      }
      
      return { success: true, games: result.games };
    } catch (error) {
      console.error(`Error searching games:`, error);
      return { success: false, error: 'Failed to search games' };
    }
  }, []);

  // Function to fetch games by genre
  const fetchGamesByGenre = useCallback(async (genre, limit = 20, offset = 0) => {
    setError(null);
    
    try {
      const { games, error: apiError } = await window.api.igdb.getGamesByGenre(genre, limit, offset);
      
      if (apiError) {
        console.error('Error fetching games by genre:', apiError);
        return { success: false, error: apiError };
      }
      
      return { success: true, games };
    } catch (error) {
      console.error(`Error fetching ${genre} games:`, error);
      return { success: false, error: `Failed to fetch ${genre} games` };
    }
  }, []);

  // Function to fetch featured games
  const fetchFeaturedGames = useCallback(async (limit = 5) => {
    setError(null);
    
    try {
      const { games, error: apiError } = await window.api.igdb.getFeaturedGames(limit);
      
      if (apiError) {
        console.error('Error fetching featured games:', apiError);
        return { success: false, error: apiError };
      }
      
      return { success: true, games };
    } catch (error) {
      console.error('Error fetching featured games:', error);
      return { success: false, error: 'Failed to fetch featured games' };
    }
  }, []);

  // The context value that will be provided
  const contextValue = useMemo(() => ({
    clientId,
    clientSecret,
    accessToken,
    isLoading,
    error,
    testCredentials,
    saveCredentials,
    fetchGamesByGenre,
    fetchFeaturedGames,
    fetchGameDetails,
    searchGames
  }), [
    clientId,
    clientSecret,
    accessToken,
    isLoading,
    error,
    testCredentials,
    saveCredentials,
    fetchGamesByGenre,
    fetchFeaturedGames,
    fetchGameDetails,
    searchGames
  ]);

  return (
    <IgdbContext.Provider value={contextValue}>
      {children}
    </IgdbContext.Provider>
  );
}

// Custom hook to use the IGDB context
export function useIgdb() {
  const context = useContext(IgdbContext);
  if (context === undefined) {
    throw new Error('useIgdb must be used within an IgdbProvider');
  }
  return context;
}
