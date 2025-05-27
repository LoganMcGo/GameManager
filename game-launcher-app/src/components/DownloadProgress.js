import React, { useState, useEffect } from 'react';

function DownloadProgress() {
  const [activeDownloads, setActiveDownloads] = useState([]);
  const [isVisible, setIsVisible] = useState(false);

  // Poll for active downloads
  useEffect(() => {
    const pollDownloads = async () => {
      try {
        if (window.api?.download?.getActiveDownloads) {
          const downloads = await window.api.download.getActiveDownloads();
          setActiveDownloads(downloads || []);
          setIsVisible(downloads && downloads.length > 0);
        }
      } catch (error) {
        console.error('Error fetching active downloads:', error);
      }
    };

    // Poll every 2 seconds
    const interval = setInterval(pollDownloads, 2000);
    
    // Initial poll
    pollDownloads();

    return () => clearInterval(interval);
  }, []);

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
    return `${formatFileSize(bytesPerSecond)}/s`;
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
    try {
      if (window.api?.download?.cancelDownload) {
        await window.api.download.cancelDownload(downloadId);
      }
    } catch (error) {
      console.error('Error canceling download:', error);
    }
  };

  if (!isVisible || activeDownloads.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 bg-gray-800 rounded-lg shadow-lg p-4 max-w-md w-full z-50 border border-gray-700">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-white font-semibold flex items-center">
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Downloads ({activeDownloads.length})
        </h3>
        <button
          onClick={() => setIsVisible(false)}
          className="text-gray-400 hover:text-white p-1"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="space-y-3 max-h-64 overflow-y-auto">
        {activeDownloads.map((download) => (
          <div key={download.id} className="bg-gray-700 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium truncate" title={download.filename}>
                  {download.filename}
                </p>
                <div className="flex items-center space-x-2 text-xs text-gray-400">
                  <span className={`px-2 py-1 rounded ${
                    download.status === 'downloading' ? 'bg-blue-600 text-white' :
                    download.status === 'completed' ? 'bg-green-600 text-white' :
                    download.status === 'failed' ? 'bg-red-600 text-white' :
                    'bg-gray-600 text-white'
                  }`}>
                    {download.status}
                  </span>
                  {download.status === 'downloading' && (
                    <>
                      <span>{formatFileSize(download.downloadedBytes)} / {formatFileSize(download.totalBytes)}</span>
                      <span>{formatSpeed(download.speed)}</span>
                      <span>ETA: {calculateETA(download.downloadedBytes, download.totalBytes, download.speed)}</span>
                    </>
                  )}
                </div>
              </div>
              
              {download.status === 'downloading' && (
                <button
                  onClick={() => handleCancelDownload(download.id)}
                  className="ml-2 text-red-400 hover:text-red-300 p-1"
                  title="Cancel download"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {/* Progress bar */}
            {download.status === 'downloading' && download.totalBytes > 0 && (
              <div className="w-full bg-gray-600 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(download.progress || 0, 100)}%` }}
                ></div>
              </div>
            )}

            {/* Completed status */}
            {download.status === 'completed' && (
              <div className="flex items-center text-green-400 text-sm">
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Download completed
              </div>
            )}

            {/* Error status */}
            {download.status === 'failed' && (
              <div className="text-red-400 text-sm">
                <div className="flex items-center">
                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Download failed
                </div>
                {download.error && (
                  <p className="text-xs text-gray-400 mt-1">{download.error}</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Show downloads folder button */}
      <div className="mt-3 pt-3 border-t border-gray-600">
        <button
          onClick={async () => {
            try {
              if (window.api?.download?.openDownloadLocation) {
                await window.api.download.openDownloadLocation();
              }
            } catch (error) {
              console.error('Error opening download location:', error);
            }
          }}
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