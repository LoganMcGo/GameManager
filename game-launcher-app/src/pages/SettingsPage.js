import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import gameDownloadService from '../services/gameDownloadService';

function SettingsPage({ onGameSelect }) {
  const { isAuthenticated, userInfo, startAuthFlow, checkAuthFlowStatus, disconnect } = useAuth();
  const [isConnecting, setIsConnecting] = useState(false);
  const [authFlow, setAuthFlow] = useState(null);
  const [error, setError] = useState(null);
  const [currentPollInterval, setCurrentPollInterval] = useState(8); // Track current polling interval in seconds

  // IGDB cloud proxy status state
  const [igdbStatus, setIgdbStatus] = useState({ connected: false, message: 'Not tested' });
  const [igdbError, setIgdbError] = useState(null);
  const [isTestingIgdb, setIsTestingIgdb] = useState(false);

  // Real-Debrid cloud proxy status state
  const [realDebridProxyError, setRealDebridProxyError] = useState(null);
  const [isTestingRealDebridProxy, setIsTestingRealDebridProxy] = useState(false);

  // Jackett settings state
  const [jackettEnabled, setJackettEnabled] = useState(false);
  const [jackettUrl, setJackettUrl] = useState('http://localhost:9117');
  const [jackettApiKey, setJackettApiKey] = useState('');
  const [jackettStatus, setJackettStatus] = useState(null);
  const [isTestingJackett, setIsTestingJackett] = useState(false);
  const [isSavingJackett, setIsSavingJackett] = useState(false);
  const [jackettError, setJackettError] = useState(null);
  const [jackettSuccess, setJackettSuccess] = useState(null);

  // Provider settings state
  const [providerSettings, setProviderSettings] = useState({});
  const [providerError, setProviderError] = useState(null);
  const [providerSuccess, setProviderSuccess] = useState(null);
  const [isSavingProviders, setIsSavingProviders] = useState(false);

  // Download location settings state
  const [downloadLocation, setDownloadLocation] = useState('');
  const [downloadLocationError, setDownloadLocationError] = useState(null);
  const [downloadLocationSuccess, setDownloadLocationSuccess] = useState(null);
  const [isSavingDownloadLocation, setIsSavingDownloadLocation] = useState(false);

  // Load settings on component mount
  useEffect(() => {
    loadJackettSettings();
    loadProviderSettings();
    loadDownloadLocationSettings();
    testIgdbConnection(); // Test IGDB cloud proxy on mount
  }, []);

  // Load download location settings
  const loadDownloadLocationSettings = () => {
    try {
      const location = gameDownloadService.getDownloadLocation();
      setDownloadLocation(location || '');
    } catch (error) {
      console.error('Error loading download location settings:', error);
    }
  };

  // Browse for download folder
  const handleBrowseDownloadLocation = async () => {
    try {
      if (window.api?.selectFolder) {
        const result = await window.api.selectFolder();
        if (result && !result.canceled && result.filePaths.length > 0) {
          setDownloadLocation(result.filePaths[0]);
        }
      } else {
        // Fallback for web version - show file input
        const input = document.createElement('input');
        input.type = 'file';
        input.webkitdirectory = true;
        input.onchange = (e) => {
          if (e.target.files.length > 0) {
            const path = e.target.files[0].webkitRelativePath.split('/')[0];
            setDownloadLocation(path);
          }
        };
        input.click();
      }
    } catch (error) {
      console.error('Error browsing for download location:', error);
      setDownloadLocationError('Failed to browse for folder');
    }
  };

  // Save download location settings
  const handleSaveDownloadLocation = async () => {
    if (!downloadLocation.trim()) {
      setDownloadLocationError('Download location is required');
      return;
    }

    setIsSavingDownloadLocation(true);
    setDownloadLocationError(null);
    setDownloadLocationSuccess(null);

    try {
      await gameDownloadService.setDownloadLocation(downloadLocation);
      setIsSavingDownloadLocation(false);
      setDownloadLocationSuccess('Download location saved successfully!');
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        setDownloadLocationSuccess(null);
      }, 3000);
    } catch (error) {
      console.error('Error saving download location:', error);
      setDownloadLocationError('Failed to save download location');
      setIsSavingDownloadLocation(false);
    }
  };

  // Load provider settings from gameDownloadService
  const loadProviderSettings = () => {
    try {
      const settings = gameDownloadService.getProviderSettings();
      setProviderSettings(settings);
    } catch (error) {
      console.error('Error loading provider settings:', error);
    }
  };

  // Handle provider toggle
  const handleProviderToggle = (providerKey) => {
    setProviderSettings(prev => ({
      ...prev,
      [providerKey]: {
        ...prev[providerKey],
        enabled: !prev[providerKey]?.enabled
      }
    }));
  };

  // Save provider settings
  const handleSaveProviders = () => {
    setIsSavingProviders(true);
    setProviderError(null);
    setProviderSuccess(null);

    try {
      gameDownloadService.configureProviders(providerSettings);
      setIsSavingProviders(false);
      setProviderSuccess('Provider settings saved successfully!');
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        setProviderSuccess(null);
      }, 3000);
    } catch (error) {
      console.error('Error saving provider settings:', error);
      setProviderError('Failed to save provider settings');
      setIsSavingProviders(false);
    }
  };

  // Load Jackett settings from gameDownloadService
  const loadJackettSettings = async () => {
    try {
      const settings = gameDownloadService.loadJackettSettings();
      setJackettEnabled(settings.enabled || false);
      setJackettUrl(settings.url || 'http://localhost:9117');
      setJackettApiKey(settings.apiKey || '');
      
      // Check status if enabled
      if (settings.enabled && settings.apiKey) {
        const status = await gameDownloadService.getJackettStatus();
        setJackettStatus(status);
      }
    } catch (error) {
      console.error('Error loading Jackett settings:', error);
    }
  };

  // Test Jackett connection
  const handleTestJackett = async () => {
    if (!jackettUrl.trim() || !jackettApiKey.trim()) {
      setJackettError('Both URL and API Key are required');
      return;
    }

    setIsTestingJackett(true);
    setJackettError(null);
    setJackettSuccess(null);

    try {
      // Configure temporarily for testing
      const testConfig = {
        enabled: true,
        url: jackettUrl,
        apiKey: jackettApiKey
      };
      
      gameDownloadService.configureJackett(testConfig);
      const status = await gameDownloadService.getJackettStatus();
      
      setJackettStatus(status);
      setIsTestingJackett(false);

      if (status.connected) {
        setJackettSuccess('Jackett connection successful!');
      } else {
        setJackettError(status.message || 'Failed to connect to Jackett');
      }
    } catch (error) {
      console.error('Error testing Jackett:', error);
      setJackettError('Failed to test Jackett connection');
      setIsTestingJackett(false);
    }
  };

  // Save Jackett settings
  const handleSaveJackett = async () => {
    if (!jackettUrl.trim()) {
      setJackettError('Jackett URL is required');
      return;
    }

    if (jackettEnabled && !jackettApiKey.trim()) {
      setJackettError('API Key is required when Jackett is enabled');
      return;
    }

    setIsSavingJackett(true);
    setJackettError(null);
    setJackettSuccess(null);

    try {
      const settings = {
        enabled: jackettEnabled,
        url: jackettUrl,
        apiKey: jackettApiKey
      };
      
      gameDownloadService.configureJackett(settings);
      
      // Test connection if enabled
      if (jackettEnabled && jackettApiKey) {
        const status = await gameDownloadService.getJackettStatus();
        setJackettStatus(status);
      }
      
      setIsSavingJackett(false);
      setJackettSuccess('Jackett settings saved successfully!');
    } catch (error) {
      console.error('Error saving Jackett settings:', error);
      setJackettError('Failed to save Jackett settings');
      setIsSavingJackett(false);
    }
  };

  // Start Real Debrid authentication flow
  const handleStartAuthFlow = async () => {
    setIsConnecting(true);
    setError(null);
    setRealDebridProxyError(null); // Clear any previous proxy errors
    
    try {
      const authData = await startAuthFlow();
      setAuthFlow(authData);
      
      // Start polling for authentication status with a longer initial interval
      let pollInterval = 8000; // Start with 8 seconds
      let pollCount = 0;
      setCurrentPollInterval(8);
      
      const startPolling = () => {
        setCurrentPollInterval(Math.floor(pollInterval / 1000));
        const poll = setInterval(async () => {
          try {
            pollCount++;
            console.log(`Polling attempt ${pollCount}, interval: ${pollInterval}ms`);
            const status = await checkAuthFlowStatus();
            console.log('Polling result:', status);
            
            if (status.status === 'authenticated') {
              console.log('Authentication successful!');
              clearInterval(poll);
              setIsConnecting(false);
              setAuthFlow(null);
              setRealDebridProxyError(null); // Clear any proxy errors on success
            } else if (status.status === 'error') {
              console.error('Authentication error:', status.message);
              clearInterval(poll);
              setIsConnecting(false);
              setAuthFlow(null);
              
              // Check if it's a cloud proxy error
              if (status.message && (status.message.includes('proxy') || status.message.includes('cloud') || status.message.includes('fetch'))) {
                setRealDebridProxyError(status.message);
              } else {
                setError(status.message || 'Authentication failed');
              }
            } else if (status.status === 'expired') {
              console.error('Authentication expired');
              clearInterval(poll);
              setIsConnecting(false);
              setAuthFlow(null);
              setError('Authentication code expired. Please try again.');
            } else if (status.status === 'rate_limited') {
              console.warn('Rate limited, backing off...');
              // Increase polling interval when rate limited
              clearInterval(poll);
              setError('Rate limited. Waiting longer before next attempt...');
              setTimeout(() => {
                setError(null);
                pollInterval = Math.min(pollInterval * 1.5, 30000); // Increase interval, max 30 seconds
                setCurrentPollInterval(Math.floor(pollInterval / 1000));
                console.log(`Resuming polling with new interval: ${pollInterval}ms`);
                startPolling();
              }, 15000); // Wait 15 seconds before resuming
            } else if (status.status === 'pending') {
              console.log('Still pending authorization...');
            }
            
            // Gradually increase polling interval to be more respectful
            if (pollCount > 5) {
              console.log('Increasing polling interval after 5 attempts');
              clearInterval(poll);
              pollInterval = Math.min(pollInterval + 2000, 15000); // Increase by 2 seconds, max 15 seconds
              setCurrentPollInterval(Math.floor(pollInterval / 1000));
              pollCount = 0;
              startPolling();
            }
          } catch (err) {
            console.error('Error polling auth status:', err);
            clearInterval(poll);
            setIsConnecting(false);
            setAuthFlow(null);
            
            // Check if it's a cloud proxy error
            if (err.message && (err.message.includes('proxy') || err.message.includes('cloud') || err.message.includes('fetch'))) {
              setRealDebridProxyError(`Cloud proxy error during authentication: ${err.message}`);
            } else {
              setError('Authentication failed');
            }
          }
        }, pollInterval);

        // Clear polling after the device code expires (30 minutes)
        setTimeout(() => {
          clearInterval(poll);
          if (isConnecting) {
            setIsConnecting(false);
            setAuthFlow(null);
            setError('Authentication code expired. Please try again.');
          }
        }, 30 * 60 * 1000);
      };
      
      startPolling();

    } catch (err) {
      console.error('Error starting auth flow:', err);
      setIsConnecting(false);
      
      // Check if it's a cloud proxy error
      if (err.message && (err.message.includes('proxy') || err.message.includes('cloud') || err.message.includes('fetch'))) {
        setRealDebridProxyError(`Failed to start authentication via cloud proxy: ${err.message}`);
      } else {
        setError('Failed to start authentication. Please try again.');
      }
    }
  };

  // Open verification URL
  const openVerificationUrl = () => {
    if (authFlow?.verificationUrl) {
      window.open(authFlow.verificationUrl, '_blank');
    }
  };

  // Handle disconnect
  const handleDisconnect = async () => {
    try {
      await disconnect();
    } catch (err) {
      console.error('Error disconnecting:', err);
      setError('Failed to disconnect. Please try again.');
    }
  };

  // Test IGDB cloud proxy connection
  const testIgdbConnection = async () => {
    setIsTestingIgdb(true);
    setIgdbError(null);
    
    try {
      // Test by fetching a small number of popular games
      const result = await window.api.igdb.getPopularNewGames(1, 0);
      
      if (result.games && result.games.length > 0) {
        setIgdbStatus({ 
          connected: true, 
          message: 'Cloud proxy connection successful' 
        });
      } else if (result.error) {
        setIgdbStatus({ 
          connected: false, 
          message: 'Cloud proxy connection failed' 
        });
        setIgdbError(`IGDB API Error: ${result.error}`);
      } else {
        setIgdbStatus({ 
          connected: false, 
          message: 'No data received from cloud proxy' 
        });
        setIgdbError('Cloud proxy returned no data - this might indicate a configuration issue');
      }
    } catch (error) {
      console.error('Error testing IGDB cloud proxy:', error);
      setIgdbStatus({ 
        connected: false, 
        message: 'Cloud proxy test failed' 
      });
      setIgdbError(`Connection Error: ${error.message || 'Failed to connect to IGDB cloud proxy'}`);
    } finally {
      setIsTestingIgdb(false);
    }
  };

  // Test Real-Debrid cloud proxy connection (basic connectivity test)
  const testRealDebridProxy = async () => {
    setIsTestingRealDebridProxy(true);
    setRealDebridProxyError(null);
    
    try {
      // Test the proxy by attempting to get auth status (this should work even without tokens)
      const result = await window.api.realDebrid.getAuthStatus();
      
      if (result.success !== undefined) {
        // If we got any response from the proxy, it's working
        setRealDebridProxyError(null);
      } else if (result.error) {
        setRealDebridProxyError(`Real-Debrid API Error: ${result.error}`);
      }
    } catch (error) {
      console.error('Error testing Real-Debrid cloud proxy:', error);
      setRealDebridProxyError(`Cloud Proxy Error: ${error.message || 'Failed to connect to Real-Debrid cloud proxy'}`);
    } finally {
      setIsTestingRealDebridProxy(false);
    }
  };

  return (
    <div className="p-6 bg-gray-900 text-white h-screen overflow-y-auto">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Settings</h1>
        
        <div className="bg-gray-800 rounded-lg shadow-lg p-6 mb-8">
          <h2 className="text-xl font-bold mb-4">Real-Debrid Connection</h2>
          
          {error && (
            <div className="bg-red-900 text-white p-4 rounded-md mb-4">
              <div className="flex items-start">
                <svg className="w-5 h-5 text-red-400 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                <div>
                  <p className="font-medium">Authentication Error</p>
                  <p className="text-sm mt-1">{error}</p>
                </div>
              </div>
            </div>
          )}

          {realDebridProxyError && (
            <div className="bg-red-900 text-white p-4 rounded-md mb-4">
              <div className="flex items-start">
                <svg className="w-5 h-5 text-red-400 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                <div>
                  <p className="font-medium">Cloud Proxy Connection Error</p>
                  <p className="text-sm mt-1">{realDebridProxyError}</p>
                </div>
              </div>
            </div>
          )}
          
          {!isConnecting && !isAuthenticated && (
            <div>
              <p className="mb-4 text-gray-300">
                Connect your Real-Debrid account to enable downloading games using Real-Debrid's premium services.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleStartAuthFlow}
                  className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-md transition-colors duration-300"
                >
                  Connect to Real-Debrid
                </button>
                <button
                  onClick={testRealDebridProxy}
                  disabled={isTestingRealDebridProxy}
                  className="bg-gray-600 hover:bg-gray-700 text-white py-2 px-4 rounded-md transition-colors duration-300 disabled:opacity-50 flex items-center"
                >
                  {isTestingRealDebridProxy ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
                      Testing...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                      </svg>
                      Test Cloud Proxy
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
          
          {isConnecting && authFlow && (
            <div>
              <p className="mb-4 text-gray-300 text-center">
                Authenticating with Real-Debrid...
              </p>
              <div className="bg-gray-700 p-6 rounded-lg mb-4">
                <div className="text-center mb-4">
                  <p className="text-lg font-bold text-blue-400 mb-2">
                    Authentication Code
                  </p>
                  <div className="bg-gray-900 px-4 py-3 rounded-md border-2 border-blue-500 mb-4">
                    <span className="text-2xl font-mono font-bold text-white tracking-wider">
                      {authFlow.userCode}
                    </span>
                  </div>
                  <p className="text-sm text-gray-400 mb-6">
                    This code expires in {Math.floor(authFlow.expiresIn / 60)} minutes. 
                    Take your time - the system will wait for you to complete the process.
                  </p>
                </div>
                
                <div className="space-y-4">
                  <div className="flex items-start space-x-3">
                    <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0 mt-0.5">1</div>
                    <div>
                      <p className="text-white font-medium">Open the verification page</p>
                      <p className="text-sm text-gray-400">Click the button below to open Real-Debrid's verification page</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start space-x-3">
                    <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0 mt-0.5">2</div>
                    <div>
                      <p className="text-white font-medium">Enter the code above</p>
                      <p className="text-sm text-gray-400">Copy and paste the code shown above into the verification page</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start space-x-3">
                    <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0 mt-0.5">3</div>
                    <div>
                      <p className="text-white font-medium">Authorize the application</p>
                      <p className="text-sm text-gray-400">Follow the prompts on the Real-Debrid website to complete authorization</p>
                    </div>
                  </div>
                </div>
                
                <div className="flex justify-center mt-6">
                  <button
                    onClick={openVerificationUrl}
                    className="bg-green-600 hover:bg-green-700 text-white py-3 px-6 rounded-lg transition-colors duration-300 font-medium"
                  >
                    <svg className="w-5 h-5 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
                    </svg>
                    Open Verification Page
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-blue-500 mr-3"></div>
                <p className="text-sm text-gray-400">
                  Waiting for authentication... (Checking every {currentPollInterval} seconds)
                </p>
              </div>
            </div>
          )}
          
          {!isConnecting && isAuthenticated && userInfo && (
            <div>
              <div className="flex items-center mb-4">
                <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center mr-3">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                  </svg>
                </div>
                <div>
                  <p className="text-green-400">Connected to Real-Debrid</p>
                  <p className="text-sm text-gray-400">
                    User: {userInfo.username} | Type: {userInfo.type} | Expiration: {new Date(userInfo.expiration).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleDisconnect}
                  className="bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded-md transition-colors duration-300"
                >
                  Disconnect
                </button>
                <button
                  onClick={testRealDebridProxy}
                  disabled={isTestingRealDebridProxy}
                  className="bg-gray-600 hover:bg-gray-700 text-white py-2 px-4 rounded-md transition-colors duration-300 disabled:opacity-50 flex items-center"
                >
                  {isTestingRealDebridProxy ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
                      Testing...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                      </svg>
                      Test Cloud Proxy
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Download Location Settings */}
        <div className="bg-gray-800 rounded-lg shadow-lg p-6 mb-8">
          <h2 className="text-xl font-bold mb-4">Download Location</h2>
          
          {downloadLocationError && (
            <div className="bg-red-900 text-white p-4 rounded-md mb-4">
              <p>{downloadLocationError}</p>
            </div>
          )}

          {downloadLocationSuccess && (
            <div className="bg-green-900 text-white p-4 rounded-md mb-4">
              <p>{downloadLocationSuccess}</p>
            </div>
          )}

          <p className="text-gray-300 mb-4">
            Set the default location where Real-Debrid will download your games. This folder will be used for all game downloads.
          </p>

          <div className="mb-4">
            <label className="block text-gray-300 mb-2">Download Folder</label>
            <div className="flex gap-3">
              <input
                type="text"
                className="flex-1 bg-gray-700 text-white px-3 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Select a folder for downloads..."
                value={downloadLocation}
                onChange={(e) => setDownloadLocation(e.target.value)}
              />
              <button
                onClick={handleBrowseDownloadLocation}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md transition-colors duration-300 flex items-center"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path>
                </svg>
                Browse
              </button>
            </div>
          </div>

          <div className="flex justify-between items-center">
            <button
              onClick={handleSaveDownloadLocation}
              disabled={isSavingDownloadLocation}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md transition-colors duration-300 disabled:opacity-50"
            >
              {isSavingDownloadLocation ? 'Saving...' : 'Save Download Location'}
            </button>
            
            {downloadLocation && (
              <div className="text-sm text-gray-400">
                Current: {downloadLocation}
              </div>
            )}
          </div>

          <div className="mt-4 p-3 bg-gray-700 rounded">
            <h4 className="font-medium text-gray-200 mb-2">Important Notes:</h4>
            <ul className="text-gray-300 text-sm space-y-1">
              <li>• Make sure the selected folder has enough free space for game downloads</li>
              <li>• The folder should be easily accessible and have write permissions</li>
              <li>• Games can be quite large (10-100+ GB), so choose a location with adequate storage</li>
              <li>• You can change this location at any time</li>
            </ul>
          </div>
        </div>
        
        {/* IGDB Game Database Status */}
        <div className="bg-gray-800 rounded-lg shadow-lg p-6 mb-8">
          <h2 className="text-xl font-bold mb-4">IGDB Game Database</h2>
          
          {igdbError && (
            <div className="bg-red-900 text-white p-4 rounded-md mb-4">
              <div className="flex items-start">
                <svg className="w-5 h-5 text-red-400 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                <div>
                  <p className="font-medium">Cloud Proxy Connection Error</p>
                  <p className="text-sm mt-1">{igdbError}</p>
                </div>
              </div>
            </div>
          )}
          
          <div className="flex items-center mb-4">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center mr-3 ${igdbStatus.connected ? 'bg-green-500' : 'bg-red-500'}`}>
              {igdbStatus.connected ? (
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                </svg>
              ) : (
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              )}
            </div>
            <div>
              <p className={`font-medium ${igdbStatus.connected ? 'text-green-400' : 'text-red-400'}`}>
                {igdbStatus.connected ? 'Connected to IGDB' : 'IGDB Connection Failed'}
              </p>
              <p className="text-sm text-gray-400">{igdbStatus.message}</p>
            </div>
          </div>
          
          <div className="flex gap-3 mb-4">
            <button
              onClick={testIgdbConnection}
              disabled={isTestingIgdb}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md transition-colors duration-300 disabled:opacity-50 flex items-center"
            >
              {isTestingIgdb ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
                  Testing...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                  </svg>
                  Test Connection
                </>
              )}
            </button>
          </div>
          
          <div className="mt-4 p-4 bg-gray-700 rounded-md">
            <p className="text-gray-300 text-sm mb-2">
              The game database connection is managed automatically through our secure cloud service. 
              {igdbStatus.connected 
                ? ' The connection is working properly and you can browse games normally.'
                : ' If you\'re experiencing issues, try testing the connection or check your internet connection.'
              }
            </p>
            {!igdbStatus.connected && (
              <div className="mt-3 p-3 bg-red-900 border border-red-700 rounded">
                <p className="text-red-300 text-sm">
                  <strong>Troubleshooting:</strong> If the connection test fails, this might indicate issues with:
                </p>
                <ul className="text-red-300 text-sm mt-2 ml-4 list-disc">
                  <li>Internet connectivity</li>
                  <li>Firewall blocking the application</li>
                  <li>Temporary cloud service issues</li>
                </ul>
              </div>
            )}
          </div>
        </div>
        
        {/* Jackett Settings */}
        <div className="bg-gray-800 rounded-lg shadow-lg p-6 mb-8">
          <h2 className="text-xl font-bold mb-4">Jackett Integration (Optional)</h2>
          
          {jackettError && (
            <div className="bg-red-900 text-white p-4 rounded-md mb-4">
              <p>{jackettError}</p>
            </div>
          )}

          {jackettSuccess && (
            <div className="bg-green-900 text-white p-4 rounded-md mb-4">
              <p>{jackettSuccess}</p>
            </div>
          )}

          {/* Status indicator */}
          {jackettStatus && (
            <div className={`p-3 rounded-md mb-4 ${jackettStatus.connected ? 'bg-green-900 border border-green-700' : 'bg-yellow-900 border border-yellow-700'}`}>
              <div className="flex items-center">
                <div className={`w-3 h-3 rounded-full mr-2 ${jackettStatus.connected ? 'bg-green-400' : 'bg-yellow-400'}`}></div>
                <span className={`text-sm ${jackettStatus.connected ? 'text-green-300' : 'text-yellow-300'}`}>
                  {jackettStatus.message}
                </span>
              </div>
            </div>
          )}
          
          <div className="mb-4">
            <div className="flex items-center mb-4">
              <input
                type="checkbox"
                id="jackettEnabled"
                checked={jackettEnabled}
                onChange={(e) => setJackettEnabled(e.target.checked)}
                className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500 focus:ring-2"
              />
              <label htmlFor="jackettEnabled" className="ml-2 text-gray-300 font-medium">
                Enable Jackett Integration
              </label>
            </div>

            <label className="block text-gray-300 mb-2">Jackett URL</label>
            <input
              type="text"
              className="w-full bg-gray-700 text-white px-3 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
              placeholder="http://localhost:9117"
              value={jackettUrl}
              onChange={(e) => setJackettUrl(e.target.value)}
              disabled={!jackettEnabled}
            />
            
            <label className="block text-gray-300 mb-2">Jackett API Key</label>
            <input
              type="password"
              className="w-full bg-gray-700 text-white px-3 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
              placeholder="Enter your Jackett API Key"
              value={jackettApiKey}
              onChange={(e) => setJackettApiKey(e.target.value)}
              disabled={!jackettEnabled}
            />
            
            <div className="flex gap-3">
              <button 
                className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded-md transition-colors duration-300 disabled:opacity-50"
                onClick={handleTestJackett}
                disabled={isTestingJackett || isSavingJackett || !jackettEnabled}
              >
                {isTestingJackett ? 'Testing...' : 'Test Connection'}
              </button>
              
              <button 
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md transition-colors duration-300 disabled:opacity-50"
                onClick={handleSaveJackett}
                disabled={isTestingJackett || isSavingJackett}
              >
                {isSavingJackett ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </div>
          
          <div className="mt-4 p-4 bg-gray-700 rounded-md">
            <h3 className="text-lg font-semibold mb-2">About Jackett:</h3>
            <p className="text-gray-300 mb-3">
              Jackett is a proxy server that translates queries from apps into tracker-site-specific HTTP queries. 
              It provides access to many private and public torrent trackers for better search results.
            </p>
            <div className="space-y-2">
              <h4 className="font-medium text-gray-200">Setup Instructions:</h4>
              <ol className="list-decimal list-inside text-gray-300 space-y-1 text-sm">
                <li>Download and install <a href="https://github.com/Jackett/Jackett/releases" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">Jackett</a></li>
                <li>Run Jackett (usually accessible at http://localhost:9117)</li>
                <li>Configure your preferred torrent indexers in Jackett</li>
                <li>Copy the API Key from Jackett's dashboard</li>
                <li>Enter the URL and API Key above and test the connection</li>
              </ol>
              <div className="mt-3 p-3 bg-blue-900 border border-blue-700 rounded">
                <p className="text-blue-300 text-sm">
                  <strong>Note:</strong> Jackett is optional. The app will work with public torrent APIs even without Jackett. 
                  Jackett provides access to more sources and better quality results.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Torrent Provider Settings */}
        <div className="bg-gray-800 rounded-lg shadow-lg p-6 mb-8">
          <h2 className="text-xl font-bold mb-4">Torrent Search Providers</h2>
          
          {providerError && (
            <div className="bg-red-900 text-white p-4 rounded-md mb-4">
              <p>{providerError}</p>
            </div>
          )}

          {providerSuccess && (
            <div className="bg-green-900 text-white p-4 rounded-md mb-4">
              <p>{providerSuccess}</p>
            </div>
          )}

          <p className="text-gray-300 mb-4">
            Configure which torrent sources to search. Disable sources you don't want to use to speed up searches.
          </p>

          <div className="space-y-3 mb-6">
            {Object.entries(providerSettings).map(([key, provider]) => (
              <div key={key} className="flex items-center justify-between p-4 bg-gray-700 rounded-lg">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id={`provider-${key}`}
                    checked={provider.enabled}
                    onChange={() => handleProviderToggle(key)}
                    className="w-4 h-4 text-blue-600 bg-gray-600 border-gray-500 rounded focus:ring-blue-500 focus:ring-2"
                  />
                  <div className="ml-3">
                    <label htmlFor={`provider-${key}`} className="text-white font-medium cursor-pointer">
                      {provider.name}
                    </label>
                    <p className="text-gray-400 text-sm">{provider.description}</p>
                  </div>
                </div>
                <div className={`w-3 h-3 rounded-full ${provider.enabled ? 'bg-green-400' : 'bg-gray-500'}`}></div>
              </div>
            ))}
          </div>

          <div className="flex justify-between items-center">
            <button
              onClick={handleSaveProviders}
              disabled={isSavingProviders}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md transition-colors duration-300 disabled:opacity-50"
            >
              {isSavingProviders ? 'Saving...' : 'Save Provider Settings'}
            </button>
            
            <div className="text-sm text-gray-400">
              {Object.values(providerSettings).filter(p => p.enabled).length} of {Object.keys(providerSettings).length} providers enabled
            </div>
          </div>

          <div className="mt-4 p-3 bg-gray-700 rounded">
            <h4 className="font-medium text-gray-200 mb-2">Provider Information:</h4>
            <ul className="text-gray-300 text-sm space-y-1">
              <li><strong>TorrentAPI:</strong> High-quality game torrents (recommended)</li>
              <li><strong>ThePirateBay:</strong> Large database, good for finding older games</li>
              <li><strong>Nyaa.si:</strong> Excellent for Japanese games and visual novels</li>
              <li><strong>1337x:</strong> Popular torrent site with game repacks</li>
            </ul>
          </div>
        </div>

        {/* Torrent Search Status */}
        <div className="bg-gray-800 rounded-lg shadow-lg p-6 mb-8">
          <h2 className="text-xl font-bold mb-4">Search Status Overview</h2>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-gray-700 rounded">
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full bg-green-400 mr-3"></div>
                <span className="text-gray-300">Public APIs</span>
              </div>
              <span className="text-green-400 text-sm">
                {Object.values(providerSettings).filter(p => p.enabled).length} Enabled
              </span>
            </div>
            
            <div className="flex items-center justify-between p-3 bg-gray-700 rounded">
              <div className="flex items-center">
                <div className={`w-3 h-3 rounded-full mr-3 ${jackettStatus?.connected ? 'bg-green-400' : 'bg-gray-500'}`}></div>
                <span className="text-gray-300">Jackett Integration</span>
              </div>
              <span className={`text-sm ${jackettStatus?.connected ? 'text-green-400' : 'text-gray-500'}`}>
                {jackettStatus?.connected ? 'Connected' : 'Not Available'}
              </span>
            </div>
          </div>
          
          <div className="mt-4 p-3 bg-gray-700 rounded">
            <p className="text-gray-300 text-sm">
              The app uses a hybrid approach: it searches enabled public torrent APIs and uses Jackett when available for enhanced results.
              {jackettStatus?.connected ? ' Jackett is currently providing additional search sources.' : ' Configure Jackett above for access to more torrent sources.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SettingsPage;

