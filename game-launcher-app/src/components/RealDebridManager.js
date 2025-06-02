import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import SearchBar from './SearchBar';

function RealDebridManager({ onGameSelect }) {
  const { isAuthenticated, userInfo } = useAuth();
  const [downloads, setDownloads] = useState([]);
  const [loading, setLoading] = useState(false);

  // Load data when component mounts
  useEffect(() => {
    if (isAuthenticated) {
      loadDownloads();
    }
  }, [isAuthenticated]);

  // Load downloads
  const loadDownloads = async () => {
    setLoading(true);
    try {
      const response = await window.api.realDebrid.getDownloads();
      if (response.success) {
        setDownloads(response.data || []);
      } else {
        console.error('Failed to load downloads:', response.error);
        // Don't show error to user, just log it
        setDownloads([]);
      }
    } catch (err) {
      console.error('Error loading downloads:', err.message);
      // Don't show error to user, just log it and show empty state
      setDownloads([]);
    } finally {
      setLoading(false);
    }
  };

  // Delete download
  const handleDeleteDownload = async (id) => {
    if (!confirm('Are you sure you want to delete this download?')) return;

    try {
      const response = await window.api.realDebrid.deleteDownload(id);
      if (response.success) {
        loadDownloads();
      } else {
        console.error('Failed to delete download:', response.error);
        // Don't show error to user, just log it and refresh list
        loadDownloads();
      }
    } catch (err) {
      console.error('Error deleting download:', err.message);
      // Don't show error to user, just log it and refresh list
      loadDownloads();
    }
  };

  // Format file size
  const formatFileSize = (bytes) => {
    if (!bytes) return 'Unknown';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };

  // Format date
  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown';
    return new Date(dateString).toLocaleString();
  };

  if (!isAuthenticated) {
    return (
      <div className="flex-1 overflow-y-auto bg-gray-900 text-white main-container">
        <SearchBar onGameSelect={onGameSelect} />
        
        <div className="max-w-4xl mx-auto text-center py-12">
          <div className="bg-gray-800 rounded-lg shadow-lg p-8">
            <div className="w-16 h-16 mx-auto mb-4 bg-blue-600 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
              </svg>
            </div>
            <h2 className="text-2xl font-bold mb-4">Real-Debrid Downloads</h2>
            <p className="text-gray-400 mb-6">Connect to Real-Debrid to manage your downloads</p>
            <button
              onClick={() => window.location.href = '#settings'}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-md transition-colors duration-300"
            >
              Connect Real-Debrid
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-900 text-white main-container">
      {/* Search Bar */}
      <SearchBar onGameSelect={onGameSelect} />
      
      {/* Header with User Info */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Downloads</h1>
          <p className="text-gray-400 mt-1">Manage your Real-Debrid downloads</p>
        </div>
        {userInfo && (
          <div className="text-right">
            <div className="flex items-center text-sm text-gray-400">
              <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
              Connected as {userInfo.username}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {userInfo.type} • Expires: {new Date(userInfo.expiration).toLocaleDateString()}
            </div>
          </div>
        )}
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-1 gap-4 mb-6">
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center mr-3">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
              </svg>
            </div>
            <div>
              <div className="text-2xl font-bold">{downloads.length}</div>
              <div className="text-sm text-gray-400">Available Downloads</div>
            </div>
          </div>
        </div>
      </div>

      {/* Downloads */}
      <div className="bg-gray-800 rounded-lg shadow-lg">
        <div className="flex justify-between items-center p-6 border-b border-gray-700">
          <h2 className="text-xl font-bold">Your Downloads</h2>
          <button
            onClick={loadDownloads}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md transition-colors duration-300 disabled:opacity-50 flex items-center"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
            </svg>
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
            </div>
          ) : downloads.length === 0 ? (
            <div className="text-center py-12">
              <svg className="w-16 h-16 mx-auto text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
              </svg>
              <p className="text-gray-400 text-lg mb-2">No downloads found</p>
              <p className="text-gray-500 text-sm">Your Real-Debrid downloads will appear here when available</p>
            </div>
          ) : (
            <div className="space-y-4">
              {downloads.map((download) => (
                <div key={download.id} className="bg-gray-700 rounded-lg p-4 hover:bg-gray-650 transition-colors">
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-white mb-2 truncate">{download.filename}</h3>
                      <div className="flex flex-wrap gap-4 text-sm text-gray-400 mb-3">
                        <span className="flex items-center">
                          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path>
                          </svg>
                          {formatFileSize(download.filesize)}
                        </span>
                        <span className="flex items-center">
                          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                          </svg>
                          {formatDate(download.generated)}
                        </span>
                        <span className="flex items-center">
                          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                          </svg>
                          {download.host}
                        </span>
                      </div>
                      {download.link && (
                        <a
                          href={download.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm transition-colors duration-300"
                        >
                          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                          </svg>
                          Download File
                        </a>
                      )}
                    </div>
                    <button
                      onClick={() => handleDeleteDownload(download.id)}
                      className="ml-4 bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-md text-sm transition-colors duration-300 flex items-center"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default RealDebridManager; 