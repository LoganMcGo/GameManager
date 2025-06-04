import React, { useState, useEffect } from 'react';
import { useNotifications } from '../context/NotificationContext';
import { createNotificationHandlers } from '../services/notificationService';

function DownloadProgress() {
  const [activeDownloads, setActiveDownloads] = useState([]);
  const [previousDownloads, setPreviousDownloads] = useState(new Map());
  const notifications = createNotificationHandlers(useNotifications);

  // Poll for active downloads
  useEffect(() => {
    const pollDownloads = async () => {
      try {
        if (window.api?.download?.getActiveDownloads) {
          const downloads = await window.api.download.getActiveDownloads();
          const currentDownloads = downloads || [];
          
          // Check for status changes to trigger notifications
          currentDownloads.forEach(download => {
            const previous = previousDownloads.get(download.id);
            
            // New download started
            if (!previous && download.status === 'downloading') {
              const downloadId = notifications.notifyDownload(`Starting download`, {
                progress: download.progress || 0,
                subtitle: download.filename,
                autoRemove: false
              });
              
              // Store notification ID with download
              download.notificationId = downloadId;
            }
            
            // Download completed
            if (previous && previous.status === 'downloading' && download.status === 'completed') {
              if (download.notificationId) {
                notifications.updateNotification(download.notificationId, {
                  message: `Download complete!`,
                  progress: 100,
                  subtitle: download.filename,
                  autoRemove: true,
                  duration: 5000
                });
              } else {
                notifications.notifySuccess('Download completed!', {
                  subtitle: download.filename
                });
              }
            }
            
            // Download failed
            if (previous && previous.status === 'downloading' && download.status === 'failed') {
              if (download.notificationId) {
                notifications.updateNotification(download.notificationId, {
                  message: `Download failed`,
                  type: 'error',
                  subtitle: download.error || 'Download could not be completed',
                  autoRemove: true,
                  duration: 8000
                });
              } else {
                notifications.notifyError('Download failed', {
                  subtitle: download.error || download.filename
                });
              }
            }
            
            // Update progress for ongoing downloads
            if (previous && download.status === 'downloading' && download.notificationId) {
              const progress = download.progress || 0;
              const downloadedMB = (download.downloadedBytes / (1024 * 1024)).toFixed(1);
              const totalMB = (download.totalBytes / (1024 * 1024)).toFixed(1);
              const speed = formatSpeed(download.speed);
              
              notifications.updateNotification(download.notificationId, {
                progress: progress,
                subtitle: `${downloadedMB}MB / ${totalMB}MB (${speed})`
              });
            }
          });
          
          setActiveDownloads(currentDownloads);
          
          // Update previous downloads map
          const newPreviousDownloads = new Map();
          currentDownloads.forEach(download => {
            newPreviousDownloads.set(download.id, { ...download });
          });
          setPreviousDownloads(newPreviousDownloads);
        }
      } catch (error) {
        console.error('Error fetching active downloads:', error);
        notifications.handleError(error, 'fetching download status');
      }
    };

    // Poll every 2 seconds
    const interval = setInterval(pollDownloads, 2000);
    
    // Initial poll
    pollDownloads();

    return () => clearInterval(interval);
  }, [notifications, previousDownloads]);

  // Format file size
  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
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
    if (!bytesPerSecond) return '0 B/s';
    const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    let speed = bytesPerSecond;
    let unitIndex = 0;
    
    while (speed >= 1024 && unitIndex < units.length - 1) {
      speed /= 1024;
      unitIndex++;
    }
    
    return `${speed.toFixed(1)} ${units[unitIndex]}`;
  };

  // Calculate ETA
  const calculateETA = (downloadedBytes, totalBytes, speed) => {
    if (!speed || !totalBytes || downloadedBytes >= totalBytes) return 'Unknown';
    
    const remainingBytes = totalBytes - downloadedBytes;
    const remainingSeconds = remainingBytes / speed;
    
    if (remainingSeconds < 60) {
      return `${Math.round(remainingSeconds)}s`;
    } else if (remainingSeconds < 3600) {
      return `${Math.round(remainingSeconds / 60)}m`;
    } else {
      return `${Math.round(remainingSeconds / 3600)}h`;
    }
  };

  // Handle download cancellation
  const handleCancelDownload = async (downloadId) => {
    await notifications.withNotifications(
      async () => {
        if (window.api?.download?.cancelDownload) {
          await window.api.download.cancelDownload(downloadId);
        }
      },
      {
        showSuccess: true,
        successMessage: {
          title: 'Download cancelled',
          subtitle: 'The download has been stopped'
        },
        errorMessage: {
          title: 'Failed to cancel download',
          subtitle: 'Please try again'
        }
      }
    );
  };

  // Handle opening downloads folder
  const handleOpenDownloadLocation = async () => {
    await notifications.withNotifications(
      async () => {
        if (window.api?.download?.openDownloadLocation) {
          await window.api.download.openDownloadLocation();
        }
      },
      {
        errorMessage: {
          title: 'Could not open download folder',
          subtitle: 'Please check if the folder exists'
        }
      }
    );
  };

  // Only show the overlay if there are actively downloading items
  const activelyDownloading = activeDownloads.filter(d => d.status === 'downloading');
  
  if (activelyDownloading.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-20 right-4 bg-gray-800 rounded-lg shadow-lg p-4 max-w-md w-full z-40 border border-gray-700">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-white font-semibold flex items-center">
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Active Downloads ({activelyDownloading.length})
        </h3>
      </div>

      <div className="space-y-3 max-h-48 overflow-y-auto">
        {activelyDownloading.map((download) => (
          <div key={download.id} className="bg-gray-700 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium truncate" title={download.filename}>
                  {download.filename}
                </p>
                <div className="flex items-center space-x-2 text-xs text-gray-400">
                  <span className="bg-blue-600 text-white px-2 py-1 rounded">
                    {Math.round(download.progress || 0)}%
                  </span>
                  <span>{formatSpeed(download.speed)}</span>
                </div>
              </div>
              
              <button
                onClick={() => handleCancelDownload(download.id)}
                className="ml-2 text-red-400 hover:text-red-300 p-1"
                title="Cancel download"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Progress bar */}
            {download.totalBytes > 0 && (
              <div className="w-full bg-gray-600 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(download.progress || 0, 100)}%` }}
                ></div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Show downloads folder button */}
      <div className="mt-3 pt-3 border-t border-gray-600">
        <button
          onClick={handleOpenDownloadLocation}
          className="w-full bg-gray-600 hover:bg-gray-500 text-white text-sm py-2 px-3 rounded transition-colors duration-200 flex items-center justify-center"
        >
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
          Open Downloads Folder
        </button>
      </div>
    </div>
  );
}

export default DownloadProgress; 