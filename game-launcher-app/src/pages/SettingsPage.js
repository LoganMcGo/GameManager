import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { createNotificationHandlers } from '../services/notificationService';
import gameFinderService from '../services/gameFinderService';
import { useAutoUpdater } from '../hooks/useAutoUpdater';

function SettingsPage({ onGameSelect }) {
  const { firstLaunch } = useAuth();
  const notifications = createNotificationHandlers(useNotifications);

  // IGDB cloud proxy status state
  const [igdbStatus, setIgdbStatus] = useState({ connected: false, message: 'Not tested' });
  const [isTestingIgdb, setIsTestingIgdb] = useState(false);

  // Real-Debrid cloud proxy status state
  const [realDebridStatus, setRealDebridStatus] = useState({ connected: false, message: 'Not tested' });
  const [isTestingRealDebridProxy, setIsTestingRealDebridProxy] = useState(false);

  // Jackett settings state
  const [jackettEnabled, setJackettEnabled] = useState(false);
  const [jackettUrl, setJackettUrl] = useState('http://localhost:9117');
  const [jackettApiKey, setJackettApiKey] = useState('');
  const [jackettStatus, setJackettStatus] = useState(null);
  const [isTestingJackett, setIsTestingJackett] = useState(false);
  const [isSavingJackett, setIsSavingJackett] = useState(false);

  // Provider settings state
  const [providerSettings, setProviderSettings] = useState({});
  const [isSavingProviders, setIsSavingProviders] = useState(false);

  // Download location settings state
  const [downloadLocation, setDownloadLocation] = useState('');
  const [isSavingDownloadLocation, setIsSavingDownloadLocation] = useState(false);

  // Auto-updater
  const { checkForUpdates, currentVersion } = useAutoUpdater();

  // Load settings on component mount
  useEffect(() => {
    loadJackettSettings();
    loadProviderSettings();
    loadDownloadLocationSettings();
    testIgdbConnection(); // Test IGDB cloud proxy on mount
    testRealDebridProxy(); // Test Real-Debrid cloud proxy on mount
  }, []);

  // Load download location settings
  const loadDownloadLocationSettings = () => {
    try {
      const location = gameFinderService.getDownloadLocation();
      setDownloadLocation(location || '');
    } catch (error) {
      notifications.handleError(error, 'loading download location settings');
    }
  };

  // Browse for download folder
  const handleBrowseDownloadLocation = async () => {
    await notifications.withNotifications(
      async () => {
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
              const file = e.target.files[0];
              const relativePath = file.webkitRelativePath;
              
              const pathParts = relativePath.split('/');
              if (pathParts.length > 1) {
                const folderName = pathParts[0];
                setDownloadLocation(folderName);
                notifications.notifyWarning('Web version limitation', {
                  subtitle: 'Only folder name saved. Full path may not work correctly.'
                });
              } else {
                throw new Error('Unable to determine folder path from selected files');
              }
            }
          };
          input.click();
        }
      },
      {
        errorMessage: {
          title: 'Failed to browse folder',
          subtitle: 'Could not access folder selection dialog'
        }
      }
    );
  };

  // Save download location settings
  const handleSaveDownloadLocation = async () => {
    if (!downloadLocation.trim()) {
      notifications.notifyError('Download location required', {
        subtitle: 'Please select a valid download folder'
      });
      return;
    }

    setIsSavingDownloadLocation(true);

    await notifications.withNotifications(
      async () => {
        await gameFinderService.setDownloadLocation(downloadLocation);
      },
      {
        showSuccess: true,
        successMessage: {
          title: 'Download location saved',
          subtitle: 'Downloads will be saved to the selected folder'
        },
        errorMessage: {
          title: 'Failed to save download location',
          subtitle: 'Please check folder permissions and try again'
        },
        onSuccess: () => setIsSavingDownloadLocation(false),
        onError: () => setIsSavingDownloadLocation(false)
      }
    );
  };

  // Load provider settings from gameFinderService
  const loadProviderSettings = () => {
    try {
      const settings = gameFinderService.getProviderSettings();
      setProviderSettings(settings);
    } catch (error) {
      notifications.handleError(error, 'loading provider settings');
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
  const handleSaveProviders = async () => {
    setIsSavingProviders(true);

    await notifications.withNotifications(
      async () => {
        gameFinderService.configureProviders(providerSettings);
      },
      {
        showSuccess: true,
        successMessage: {
          title: 'Provider settings saved',
          subtitle: 'Download provider configuration updated'
        },
        errorMessage: {
          title: 'Failed to save provider settings',
          subtitle: 'Please check your configuration and try again'
        },
        onSuccess: () => setIsSavingProviders(false),
        onError: () => setIsSavingProviders(false)
      }
    );
  };

  // Load Jackett settings from gameFinderService
  const loadJackettSettings = async () => {
    try {
      const settings = gameFinderService.loadJackettSettings();
      setJackettEnabled(settings.enabled || false);
      setJackettUrl(settings.url || 'http://localhost:9117');
      setJackettApiKey(settings.apiKey || '');
      
      // Check status if enabled
      if (settings.enabled && settings.apiKey) {
        const status = await gameFinderService.getJackettStatus();
        setJackettStatus(status);
      }
    } catch (error) {
      notifications.handleError(error, 'loading Jackett settings');
    }
  };

  // Test Jackett connection
  const handleTestJackett = async () => {
    if (!jackettUrl.trim() || !jackettApiKey.trim()) {
      notifications.notifyError('Jackett configuration incomplete', {
        subtitle: 'Both URL and API Key are required'
      });
      return;
    }

    setIsTestingJackett(true);

    await notifications.withNotifications(
      async () => {
        const status = await gameFinderService.testJackettConnection(jackettUrl, jackettApiKey);
        setJackettStatus(status);
        return status;
      },
      {
        showSuccess: true,
        successMessage: {
          title: 'Jackett connection successful',
          subtitle: 'Connection to Jackett server verified'
        },
        errorMessage: {
          title: 'Jackett connection failed',
          subtitle: 'Please check your URL and API key'
        },
        onSuccess: () => setIsTestingJackett(false),
        onError: () => setIsTestingJackett(false)
      }
    );
  };

  // Test IGDB cloud proxy connection
  const testIgdbConnection = async () => {
    setIsTestingIgdb(true);
    
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
        notifications.notifyError('IGDB API Error', {
          subtitle: result.error
        });
      } else {
        setIgdbStatus({ 
          connected: false, 
          message: 'No data received from cloud proxy' 
        });
        notifications.notifyWarning('Cloud proxy returned no data', {
          subtitle: 'This might indicate a configuration issue'
        });
      }
    } catch (error) {
      console.error('Error testing IGDB cloud proxy:', error);
      setIgdbStatus({ 
        connected: false, 
        message: 'Cloud proxy test failed' 
      });
      notifications.notifyError('Connection Error', {
        subtitle: error.message || 'Failed to connect to IGDB cloud proxy'
      });
    } finally {
      setIsTestingIgdb(false);
    }
  };

  // Test Real-Debrid cloud proxy connection
  const testRealDebridProxy = async () => {
    setIsTestingRealDebridProxy(true);
    
    try {
      // Test the proxy by getting user info (this will test the full authentication chain)
      const result = await window.api.realDebrid.getUserInfo();
      
      if (result.success) {
        setRealDebridStatus({ 
          connected: true, 
          message: 'Cloud proxy and authentication working' 
        });
        notifications.notifySuccess('Real-Debrid connection successful', {
          subtitle: 'Real-Debrid cloud proxy is working'
        });
      } else {
        setRealDebridStatus({ 
          connected: false, 
          message: result.error || 'Connection failed' 
        });
        if (result.error && result.error.includes('Service configuration error')) {
          notifications.notifyError('Real-Debrid Configuration Error', {
            subtitle: 'Real-Debrid API token not configured in cloud proxy'
          });
        } else {
          notifications.notifyError('Real-Debrid API Error', {
            subtitle: result.error
          });
        }
      }
    } catch (error) {
      console.error('Error testing Real-Debrid cloud proxy:', error);
      setRealDebridStatus({ 
        connected: false, 
        message: 'Cloud proxy test failed' 
      });
      notifications.notifyError('Cloud Proxy Error', {
        subtitle: error.message || 'Failed to connect to Real-Debrid cloud proxy'
      });
    } finally {
      setIsTestingRealDebridProxy(false);
    }
  };

  return (
    <div className="p-6 bg-gray-900 text-white h-screen overflow-y-auto">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Settings</h1>
        
        <div className="bg-gray-800 rounded-lg shadow-lg p-6 mb-8">
          <h2 className="text-xl font-bold mb-4">Real-Debrid Service</h2>
          
          <div className="flex items-center mb-4">
            <div className={`w-3 h-3 rounded-full mr-3 ${realDebridStatus.connected ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <div>
              <p className={`font-medium ${realDebridStatus.connected ? 'text-green-400' : 'text-red-400'}`}>
                {realDebridStatus.connected ? 'Connected' : 'Disconnected'}
              </p>
              <p className="text-sm text-gray-400">{realDebridStatus.message}</p>
            </div>
          </div>
          
          <p className="mb-4 text-gray-300">
            Real-Debrid is automatically configured through the cloud proxy. No manual authentication required.
          </p>
          
          <button
            onClick={testRealDebridProxy}
            disabled={isTestingRealDebridProxy}
            className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-md transition-colors duration-300 disabled:opacity-50 flex items-center"
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
                Test Connection
              </>
            )}
          </button>
        </div>

        <div className="bg-gray-800 rounded-lg shadow-lg p-6 mb-8">
          <h2 className="text-xl font-bold mb-4">IGDB Game Database</h2>
          
          <div className="flex items-center mb-4">
            <div className={`w-3 h-3 rounded-full mr-3 ${igdbStatus.connected ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <div>
              <p className={`font-medium ${igdbStatus.connected ? 'text-green-400' : 'text-red-400'}`}>
                {igdbStatus.connected ? 'Connected' : 'Disconnected'}
              </p>
              <p className="text-sm text-gray-400">{igdbStatus.message}</p>
            </div>
          </div>
          
          <p className="mb-4 text-gray-300">
            IGDB provides game information and metadata through our cloud proxy service.
          </p>
          
          <button
            onClick={testIgdbConnection}
            disabled={isTestingIgdb}
            className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-md transition-colors duration-300 disabled:opacity-50 flex items-center"
          >
            {isTestingIgdb ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
                Testing...
              </>
            ) : (
              <>
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                Test Connection
              </>
            )}
          </button>
        </div>

        {/* Download Location Settings */}
        <div className="bg-gray-800 rounded-lg shadow-lg p-6 mb-8">
          <h2 className="text-xl font-bold mb-4">Download Location</h2>
          
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Downloads will be saved to:
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={downloadLocation}
                onChange={(e) => setDownloadLocation(e.target.value)}
                placeholder="Select download folder..."
                className="flex-1 bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleBrowseDownloadLocation}
                className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-md transition-colors duration-300"
              >
                Browse
              </button>
            </div>
          </div>
          
          <button
            onClick={handleSaveDownloadLocation}
            disabled={isSavingDownloadLocation}
            className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-md transition-colors duration-300 disabled:opacity-50"
          >
            {isSavingDownloadLocation ? 'Saving...' : 'Save Location'}
          </button>
        </div>

        {/* Jackett Settings */}
        <div className="bg-gray-800 rounded-lg shadow-lg p-6 mb-8">
          <h2 className="text-xl font-bold mb-4">Jackett Integration (Optional)</h2>
          
          {notifications.error && (
            <div className="bg-red-900 text-white p-4 rounded-md mb-4">
              <p>{notifications.error.title}</p>
            </div>
          )}

          {notifications.success && (
            <div className="bg-green-900 text-white p-4 rounded-md mb-4">
              <p>{notifications.success.title}</p>
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
                onClick={handleTestJackett}
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

        {/* App Information */}
        <div className="bg-gray-800 rounded-lg shadow-lg p-6">
          <h3 className="text-xl font-bold mb-4 text-white">App Information</h3>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-300">Current Version</p>
              <p className="text-sm text-gray-400">{currentVersion}</p>
            </div>
            <button
              onClick={checkForUpdates}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md transition-colors duration-300"
            >
              Check for Updates
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SettingsPage;

