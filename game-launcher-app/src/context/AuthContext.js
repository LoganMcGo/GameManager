import React, { createContext, useState, useEffect, useContext } from 'react';

// Create the context
const AuthContext = createContext();

// Create a provider component
export function AuthProvider({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [firstLaunch, setFirstLaunch] = useState(true);
  const [userInfo, setUserInfo] = useState(null);

  // Check if the user is authenticated when the component mounts
  useEffect(() => {
    // Check if this is the first launch
    const isFirstLaunch = localStorage.getItem('firstLaunch') !== 'false';
    setFirstLaunch(isFirstLaunch);
    
    if (isFirstLaunch) {
      // If it's the first launch, mark it as visited for future
      localStorage.setItem('firstLaunch', 'false');
    }
    
    // Check Real Debrid authentication status
    checkAuthStatus();
  }, []);

  // Check Real Debrid authentication status
  const checkAuthStatus = async () => {
    try {
      const authStatus = await window.api.realDebrid.getAuthStatus();
      setIsAuthenticated(authStatus.authenticated);
      
      if (authStatus.authenticated) {
        // Get user info if authenticated
        const userResponse = await window.api.realDebrid.getUserInfo();
        if (userResponse.success) {
          setUserInfo(userResponse.data);
        }
      }
    } catch (error) {
      console.error('Error checking auth status:', error);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  };

  // Start Real Debrid authentication flow
  const startAuthFlow = async () => {
    try {
      const authData = await window.api.realDebrid.startAuthFlow();
      return authData;
    } catch (error) {
      console.error('Error starting auth flow:', error);
      throw error;
    }
  };

  // Check authentication status during flow
  const checkAuthFlowStatus = async () => {
    try {
      const statusResponse = await window.api.realDebrid.checkAuthStatus();
      
      if (statusResponse.status === 'authenticated') {
        setIsAuthenticated(true);
        
        // Get user info
        const userResponse = await window.api.realDebrid.getUserInfo();
        if (userResponse.success) {
          setUserInfo(userResponse.data);
        }
        
        return { status: 'authenticated' };
      }
      
      // Handle rate limiting by increasing the polling interval
      if (statusResponse.status === 'rate_limited') {
        return { status: 'rate_limited', message: statusResponse.message };
      }
      
      return statusResponse;
    } catch (error) {
      console.error('Error checking auth flow status:', error);
      return { status: 'error', message: error.message };
    }
  };

  // Disconnect from Real Debrid
  const disconnect = async () => {
    try {
      await window.api.realDebrid.disconnect();
      setIsAuthenticated(false);
      setUserInfo(null);
      return { success: true };
    } catch (error) {
      console.error('Error disconnecting:', error);
      throw error;
    }
  };

  // The context value that will be provided
  const contextValue = {
    isAuthenticated,
    isLoading,
    firstLaunch,
    userInfo,
    startAuthFlow,
    checkAuthFlowStatus,
    disconnect,
    setFirstLaunch,
    checkAuthStatus
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

// Custom hook to use the auth context
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
