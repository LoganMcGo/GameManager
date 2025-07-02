import React, { useState, useEffect } from 'react';

import { useNotifications } from '../context/NotificationContext';

function GameDownloadsManager({ onGameSelect }) {
  const [downloads, setDownloads] = useState([]);
  const [history, setHistory] = useState([]);
  const [activeTab, setActiveTab] = useState('active');
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const { notifyDownload, notifySuccess, notifyError, updateNotification } = useNotifications();
  const notificationMap = new Map(); // Track notification IDs for each download

  // Load data when component mounts
  useEffect(() => {
    loadDownloads();
    loadHistory();
    
    // Set up stuck download warning listener
    const unsubscribeStuckWarning = window.api.downloadTracker.onStuckWarning((warning) => {
      notifyError(`Download may be stuck: ${warning.gameName}`, {
        subtitle: warning.message,
        duration: 15000, // Show longer for stuck warnings
        actions: [{
          label: 'Cancel Download',
          action: () => handleCancelDownload(warning.downloadId, 'user_canceled_stuck')
        }]
      });
    });
    
    // Set up auto-cancel notification listener
    const unsubscribeAutoCanceled = window.api.downloadTracker.onAutoCanceled((notification) => {
      notifyError(`Download auto-canceled: ${notification.gameName}`, {
        subtitle: notification.reason,
        duration: 10000
      });
    });
    
    // Set up real-time updates using optimized monitoring
    const unsubscribeDownloads = window.api.downloadTracker.onDownloadUpdate((download) => {
      setDownloads(prevDownloads => {
        const updated = prevDownloads.map(d => 
          d.id === download.id ? download : d
        );
        
        // If this is a new download, add it
        if (!updated.find(d => d.id === download.id)) {
          updated.push(download);
          
          // Create notification for new download
          if (!notificationMap.has(download.id)) {
            const notificationId = notifyDownload(`Starting download: ${download.gameName}`, {
              progress: 0,
              subtitle: download.statusMessage,
              autoRemove: false,
              gameDownloadStatus: download.status
            });
            notificationMap.set(download.id, notificationId);
          }
        }
        
        // Update notification based on status
        const notificationId = notificationMap.get(download.id);
        if (notificationId) {
          switch (download.status) {
            case 'downloading':
              updateNotification(notificationId, {
                progress: download.progress,
                subtitle: `${formatFileSize(download.downloadedBytes)} / ${formatFileSize(download.totalBytes)} • ${formatSpeed(download.downloadSpeed)}`,
                downloadInfo: {
                  speed: formatSpeed(download.downloadSpeed),
                  eta: calculateETA(download.downloadedBytes, download.totalBytes, download.downloadSpeed)
                }
              });
              break;
              
            case 'complete':
              updateNotification(notificationId, {
                message: `Download complete: ${download.gameName}`,
                type: 'success',
                progress: 100,
                subtitle: 'Download finished successfully',
                autoRemove: true,
                duration: 5000
              });
              notificationMap.delete(download.id);
              break;
              
            case 'error':
              updateNotification(notificationId, {
                message: `Download failed: ${download.gameName}`,
                type: 'error',
                subtitle: download.error || 'An error occurred',
                autoRemove: true,
                duration: 8000
              });
              notificationMap.delete(download.id);
              break;
              
            default:
              updateNotification(notificationId, {
                subtitle: download.statusMessage,
                gameDownloadStatus: download.status
              });
          }
        }
        
        return updated;
      });
    });
    
    // Set up history event listeners
    const unsubscribeHistory = window.api.downloadTracker.onHistoryUpdate((historyItems) => {
      setHistory(historyItems);
    });
    
    const unsubscribeMovedToHistory = window.api.downloadTracker.onMovedToHistory((download) => {
      // Remove from active downloads when moved to history
      setDownloads(prevDownloads => prevDownloads.filter(d => d.id !== download.id));
      // Refresh history to show the new item
      loadHistory();
    });
    
    return () => {
      if (unsubscribeDownloads) unsubscribeDownloads();
      if (unsubscribeHistory) unsubscribeHistory();
      if (unsubscribeMovedToHistory) unsubscribeMovedToHistory();
      if (unsubscribeStuckWarning) unsubscribeStuckWarning();
      if (unsubscribeAutoCanceled) unsubscribeAutoCanceled();
    };
  }, []);

  // Load downloads
  const loadDownloads = async () => {
    setLoading(true);
    try {
      const trackedDownloads = await window.api.downloadTracker.getDownloads();
      setDownloads(trackedDownloads || []);
    } catch (err) {
      console.error('Error loading tracked downloads:', err.message);
      setDownloads([]);
    } finally {
      setLoading(false);
    }
  };

  // Load history
  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const historyItems = await window.api.downloadTracker.getHistory();
      setHistory(historyItems || []);
    } catch (err) {
      console.error('Error loading download history:', err.message);
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  // Remove download
  const handleRemoveDownload = async (downloadId) => {
    try {
      await window.api.downloadTracker.removeDownload(downloadId);
      loadDownloads(); // Refresh the list
    } catch (err) {
      console.error('Error removing download:', err.message);
    }
  };

  // Clear completed downloads
  const handleClearCompleted = async () => {
    try {
      await window.api.downloadTracker.clearCompleted();
      loadDownloads(); // Refresh the list
    } catch (err) {
      console.error('Error clearing completed downloads:', err.message);
    }
  };

  // Clear download history
  const handleClearHistory = async () => {
    try {
      await window.api.downloadTracker.clearHistory();
      setHistory([]);
    } catch (err) {
      console.error('Error clearing download history:', err.message);
    }
  };

  // Remove history item
  const handleRemoveHistoryItem = async (downloadId) => {
    try {
      await window.api.downloadTracker.removeHistoryItem(downloadId);
      setHistory(prev => prev.filter(item => item.id !== downloadId));
    } catch (err) {
      console.error('Error removing history item:', err.message);
    }
  };

  // Move download to history manually
  const handleMoveToHistory = async (downloadId) => {
    try {
      await window.api.downloadTracker.moveToHistory(downloadId);
      setDownloads(prev => prev.filter(d => d.id !== downloadId));
      loadHistory(); // Refresh history
    } catch (err) {
      console.error('Error moving download to history:', err.message);
    }
  };

  // Cancel download
  const handleCancelDownload = async (downloadId, reason = 'user_canceled') => {
    try {
      const result = await window.api.downloadTracker.cancelDownload(downloadId, reason);
      if (result.success) {
        notifySuccess('Download canceled', {
          subtitle: result.message,
          duration: 5000
        });
        // Remove from active downloads
        setDownloads(prev => prev.filter(d => d.id !== downloadId));
        // Refresh history to show the canceled download
        setTimeout(() => loadHistory(), 1000);
      } else {
        notifyError('Failed to cancel download', {
          subtitle: result.error,
          duration: 8000
        });
      }
    } catch (err) {
      console.error('Error canceling download:', err.message);
      notifyError('Failed to cancel download', {
        subtitle: 'An unexpected error occurred',
        duration: 8000
      });
    }
  };

  // Format file size
  const formatFileSize = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };

  // Format download speed
  const formatSpeed = (bytesPerSecond) => {
    if (!bytesPerSecond || bytesPerSecond === 0) return '0 B/s';
    return `${formatFileSize(bytesPerSecond)}/s`;
  };

  // Calculate ETA
  const calculateETA = (downloadedBytes, totalBytes, speed) => {
    if (!speed || !totalBytes || downloadedBytes >= totalBytes) return '';
    
    const remainingBytes = totalBytes - downloadedBytes;
    const remainingSeconds = remainingBytes / speed;
    
    if (remainingSeconds < 60) {
      return `${Math.round(remainingSeconds)}s remaining`;
    } else if (remainingSeconds < 3600) {
      return `${Math.round(remainingSeconds / 60)}m remaining`;
    } else {
      return `${Math.round(remainingSeconds / 3600)}h remaining`;
    }
  };

  // Get status loading dots for transitional states
  const getLoadingDots = (status) => {
    const transitionalStatuses = [
      'adding_to_debrid', 
      'starting_torrent', 
      'torrent_downloading', 
      'starting_download', 
      'file_ready',
      'extracting',
      'finding_executable'
    ];
    if (transitionalStatuses.includes(status)) {
      return (
        <div className="inline-flex space-x-1 ml-1">
          <div className="w-1 h-1 bg-blue-400 rounded-full animate-pulse" style={{ animationDelay: '0s' }}></div>
          <div className="w-1 h-1 bg-blue-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
          <div className="w-1 h-1 bg-blue-400 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
        </div>
      );
    }
    return null;
  };

  // Get status color
  const getStatusColor = (status) => {
    switch (status) {
      case 'complete': return 'text-green-400';
      case 'error': return 'text-red-400';
      case 'downloading': return 'text-blue-400';
      case 'download_complete': return 'text-blue-300';
      case 'extracting': return 'text-purple-400';
      case 'extraction_complete': return 'text-purple-300';
      case 'finding_executable': return 'text-yellow-400';
      case 'torrent_downloading': return 'text-cyan-400';
      case 'file_ready': return 'text-purple-400';
      default: return 'text-yellow-400';
    }
  };

  // Get progress bar color
  const getProgressColor = (status) => {
    switch (status) {
      case 'complete': return 'bg-green-500';
      case 'error': return 'bg-red-500';
      case 'downloading': return 'bg-blue-500';
      case 'download_complete': return 'bg-blue-400';
      case 'extracting': return 'bg-purple-500';
      case 'extraction_complete': return 'bg-purple-400';
      case 'finding_executable': return 'bg-yellow-500';
      case 'torrent_downloading': return 'bg-cyan-500';
      default: return 'bg-yellow-500';
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-gray-900 text-white main-container">
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold">Game Downloads</h2>
            <p className="text-gray-400 text-sm">Track your game downloads from start to finish</p>
          </div>
          <div className="flex gap-3">
            {activeTab === 'active' ? (
              <button
                onClick={handleClearCompleted}
                className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-md transition-colors duration-300 flex items-center"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                </svg>
                Clear Completed
              </button>
            ) : (
              <button
                onClick={handleClearHistory}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md transition-colors duration-300 flex items-center"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                </svg>
                Clear History
              </button>
            )}
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-gray-700 mb-6">
          <button
            onClick={() => setActiveTab('active')}
            className={`px-4 py-2 font-medium text-sm transition-colors duration-200 border-b-2 ${
              activeTab === 'active'
                ? 'text-blue-400 border-blue-400'
                : 'text-gray-400 border-transparent hover:text-white hover:border-gray-500'
            }`}
          >
            Active Downloads ({downloads.length})
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 font-medium text-sm transition-colors duration-200 border-b-2 ${
              activeTab === 'history'
                ? 'text-blue-400 border-blue-400'
                : 'text-gray-400 border-transparent hover:text-white hover:border-gray-500'
            }`}
          >
            History ({history.length})
          </button>
        </div>

        {/* Active Downloads Tab */}
        {activeTab === 'active' && (
          <>
            {loading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
                <p className="text-gray-400">Loading downloads...</p>
              </div>
            ) : downloads.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 mx-auto mb-4 bg-gray-700 rounded-full flex items-center justify-center">
                  <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                  </svg>
                </div>
                <h3 className="text-lg font-semibold mb-2 text-gray-300">No Active Downloads</h3>
                <p className="text-gray-400">Start downloading a game to see progress here</p>
              </div>
            ) : (
              <div className="space-y-4">
                {downloads.map((download) => (
                  <div key={download.id} className="bg-gray-800 rounded-lg p-4 shadow-lg">
                <div className="flex items-start space-x-4">
                  {/* Game Image */}
                  <div className="flex-shrink-0">
                    {download.gameImage ? (
                      <img
                        src={download.gameImage.replace(/t_thumb|t_cover_small/g, 't_cover_big')}
                        alt={download.gameName}
                        className="w-24 h-32 object-cover rounded-md bg-gray-700"
                        onError={(e) => {
                          e.target.style.display = 'none';
                          e.target.nextSibling.style.display = 'flex';
                        }}
                      />
                    ) : null}
                    <div className={`w-24 h-32 bg-gray-700 rounded-md flex items-center justify-center ${download.gameImage ? 'hidden' : 'flex'}`}>
                      <svg className="w-10 h-10 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                      </svg>
                    </div>
                  </div>

                  {/* Game Info and Status */}
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-semibold text-lg text-white truncate pr-4">{download.gameName}</h3>
                      <div className="flex-shrink-0 flex items-center space-x-2">
                        {/* Cancel button - only show for active downloads */}
                        {download.status !== 'complete' && download.status !== 'error' && (
                          <button
                            onClick={() => handleCancelDownload(download.id, 'user_canceled')}
                            className="text-yellow-400 hover:text-yellow-300 transition-colors duration-300 p-1 rounded"
                            title="Cancel download and remove from Real-Debrid"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                            </svg>
                          </button>
                        )}
                        {/* Remove button */}
                        <button
                          onClick={() => handleRemoveDownload(download.id)}
                          className="text-gray-400 hover:text-red-400 transition-colors duration-300 p-1 rounded"
                          title="Remove from list"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* Status */}
                    <div className="flex items-center mb-3">
                      <span className={`text-sm font-medium ${getStatusColor(download.status)}`}>
                        {download.statusMessage}
                      </span>
                      {getLoadingDots(download.status)}
                      
                      {/* Stuck download warning indicator */}
                      {download.status === 'torrent_downloading' && download.progress === 0 && (
                        <div className="ml-2 flex items-center text-yellow-400">
                          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
                          </svg>
                          <span className="text-xs">Monitoring for stuck download</span>
                        </div>
                      )}
                    </div>

                    {/* Progress Bar Area - Always takes same space */}
                    <div className="mb-3 h-12">
                      {(download.status === 'downloading' || 
                        download.status === 'torrent_downloading' ||
                        download.status === 'extracting' ||
                        download.status === 'download_complete' ||
                        download.status === 'extraction_complete') ? (
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-xs text-gray-400">
                              {download.status === 'extracting' 
                                ? 'Extracting...'
                                : download.status === 'download_complete'
                                ? 'Download Complete - Starting Extraction...'
                                : download.status === 'extraction_complete'
                                ? 'Extraction Complete - Setting up game...'
                                : `${download.progress.toFixed(1)}%`
                              }
                            </span>
                            <div className="text-xs text-gray-400 space-x-2">
                              {download.downloadedBytes > 0 && download.status === 'downloading' && (
                                <span>{formatFileSize(download.downloadedBytes)}</span>
                              )}
                              {download.totalBytes > 0 && download.status === 'downloading' && (
                                <span>/ {formatFileSize(download.totalBytes)}</span>
                              )}
                              {download.downloadSpeed > 0 && download.status === 'downloading' && (
                                <span>• {formatSpeed(download.downloadSpeed)}</span>
                              )}
                            </div>
                          </div>
                          <div className="w-full bg-gray-700 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full transition-all duration-300 ${getProgressColor(download.status)}`}
                              style={{ 
                                width: `${Math.min(100, Math.max(0, 
                                  download.status === 'extracting' 
                                    ? 100
                                    : download.status === 'download_complete' || download.status === 'extraction_complete'
                                    ? 100
                                    : download.progress
                                ))}%` 
                              }}
                            ></div>
                          </div>
                          {download.status === 'extracting' && (
                            <div className="text-xs text-gray-500 mt-1">
                              Extracting game files to final location...
                            </div>
                          )}
                        </div>
                      ) : (
                        <div></div>
                      )}
                    </div>

                    {/* Error Message */}
                    {download.status === 'error' && download.error && (
                      <div className="mt-2 p-2 bg-red-900 border border-red-700 rounded text-red-300 text-sm">
                        {download.error}
                      </div>
                    )}

                    {/* Download Info */}
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>Started {new Date(download.startTime).toLocaleString()}</span>
                      {download.status === 'complete' && (
                        <span className="text-green-400 font-medium">✓ Complete</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
          <>
            {historyLoading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
                <p className="text-gray-400">Loading history...</p>
              </div>
            ) : history.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 mx-auto mb-4 bg-gray-700 rounded-full flex items-center justify-center">
                  <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                  </svg>
                </div>
                <h3 className="text-lg font-semibold mb-2 text-gray-300">No Download History</h3>
                <p className="text-gray-400">Completed downloads will appear here automatically</p>
              </div>
            ) : (
              <div className="space-y-4">
                {history.map((download) => (
                  <div key={download.id} className="bg-gray-800 rounded-lg p-4 shadow-lg border-l-4 border-gray-600">
                    <div className="flex items-start space-x-4">
                      {/* Game Image */}
                      <div className="flex-shrink-0">
                        {download.gameImage ? (
                          <img
                            src={download.gameImage.replace(/t_thumb|t_cover_small/g, 't_cover_big')}
                            alt={download.gameName}
                            className="w-24 h-32 object-cover rounded-md bg-gray-700 opacity-80"
                            onError={(e) => {
                              e.target.style.display = 'none';
                              e.target.nextSibling.style.display = 'flex';
                            }}
                          />
                        ) : null}
                        <div className={`w-24 h-32 bg-gray-700 rounded-md flex items-center justify-center opacity-80 ${download.gameImage ? 'hidden' : 'flex'}`}>
                          <svg className="w-10 h-10 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                          </svg>
                        </div>
                      </div>

                      {/* Game Info and Status */}
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start mb-2">
                          <h3 className="font-semibold text-lg text-white truncate pr-4">{download.gameName}</h3>
                          <div className="flex items-center space-x-2">
                            {/* Status Badge */}
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              download.status === 'complete' 
                                ? 'bg-green-900 text-green-300 border border-green-700' 
                                : 'bg-red-900 text-red-300 border border-red-700'
                            }`}>
                              {download.status === 'complete' ? '✓ Completed' : '✗ Failed'}
                            </span>
                            <button
                              onClick={() => handleRemoveHistoryItem(download.id)}
                              className="flex-shrink-0 text-gray-400 hover:text-red-400 transition-colors duration-300"
                              title="Remove from history"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                              </svg>
                            </button>
                          </div>
                        </div>

                        {/* Completion Time */}
                        <div className="text-sm text-gray-400 mb-2">
                          {download.completedAt ? (
                            <>Completed on {new Date(download.completedAt).toLocaleString()}</>
                          ) : (
                            <>Finished {new Date(download.lastUpdated).toLocaleString()}</>
                          )}
                        </div>

                        {/* Download Summary */}
                        <div className="flex items-center justify-between text-xs text-gray-500">
                          <div className="flex items-center space-x-4">
                            <span>Started {new Date(download.startTime).toLocaleString()}</span>
                            {download.isRepack && (
                              <span className="bg-purple-900 text-purple-300 px-2 py-1 rounded">
                                {download.repackType || 'Repack'}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center space-x-2">
                            {download.totalBytes > 0 && (
                              <span>{formatFileSize(download.totalBytes)}</span>
                            )}
                          </div>
                        </div>

                        {/* Error Message for failed downloads */}
                        {download.status === 'error' && download.error && (
                          <div className="mt-2 p-2 bg-red-900 border border-red-700 rounded text-red-300 text-sm">
                            Error: {download.error}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default GameDownloadsManager; 