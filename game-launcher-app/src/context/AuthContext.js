import React, { createContext, useState, useEffect, useContext } from 'react';

// Create the context
const AuthContext = createContext();

// Create a provider component
export function AuthProvider({ children }) {
  const [isLoading, setIsLoading] = useState(false);
  const [firstLaunch, setFirstLaunch] = useState(true);

  // Check if this is the first launch when the component mounts
  useEffect(() => {
    const isFirstLaunch = localStorage.getItem('firstLaunch') !== 'false';
    setFirstLaunch(isFirstLaunch);
    
    if (isFirstLaunch) {
      localStorage.setItem('firstLaunch', 'false');
    }
    
    setIsLoading(false);
  }, []);

  // The context value that will be provided
  const contextValue = {
    isLoading,
    firstLaunch,
    setFirstLaunch
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
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
