import React from 'react';
import { useNotifications, NOTIFICATION_TYPES } from '../context/NotificationContext';

const NotificationDemo = () => {
  const { 
    notifyError, 
    notifySuccess, 
    notifyWarning, 
    notifyInfo, 
    notifyDownload,
    updateNotification,
    clearNotifications 
  } = useNotifications();

  const testNotifications = () => {
    // Error notification
    notifyError('Failed to connect to server', {
      subtitle: 'Please check your internet connection'
    });

    // Success notification
    setTimeout(() => {
      notifySuccess('Game downloaded successfully!', {
        subtitle: 'Ready to play'
      });
    }, 1000);

    // Warning notification
    setTimeout(() => {
      notifyWarning('Low disk space detected', {
        subtitle: 'Consider freeing up some space'
      });
    }, 2000);

    // Info notification
    setTimeout(() => {
      notifyInfo('System update available', {
        subtitle: 'Version 2.1.0 is now available'
      });
    }, 3000);

    // Download notification with progress
    setTimeout(() => {
      const downloadId = notifyDownload('Downloading Cyberpunk 2077...', {
        progress: 0,
        subtitle: '0 MB / 70.2 GB'
      });

      // Simulate download progress
      let progress = 0;
      const progressInterval = setInterval(() => {
        progress += Math.random() * 10;
        if (progress >= 100) {
          progress = 100;
          clearInterval(progressInterval);
          updateNotification(downloadId, {
            message: 'Cyberpunk 2077 download complete!',
            progress: 100,
            subtitle: '70.2 GB / 70.2 GB',
            autoRemove: true,
            duration: 3000
          });
        } else {
          const downloadedGB = (progress / 100 * 70.2).toFixed(1);
          updateNotification(downloadId, {
            progress,
            subtitle: `${downloadedGB} GB / 70.2 GB`
          });
        }
      }, 500);
    }, 4000);
  };

  return (
    <div className="p-4 bg-gray-800 rounded-lg m-4">
      <h3 className="text-white text-lg font-semibold mb-4">Notification System Demo</h3>
      <div className="space-x-2 space-y-2">
        <button
          onClick={testNotifications}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded transition-colors"
        >
          Test All Notifications
        </button>
        
        <button
          onClick={() => notifyError('This is an error message')}
          className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded transition-colors"
        >
          Test Error
        </button>
        
        <button
          onClick={() => notifySuccess('Operation completed successfully!')}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded transition-colors"
        >
          Test Success
        </button>
        
        <button
          onClick={() => notifyWarning('This is a warning')}
          className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded transition-colors"
        >
          Test Warning
        </button>
        
        <button
          onClick={() => notifyInfo('Here is some information')}
          className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded transition-colors"
        >
          Test Info
        </button>
        
        <button
          onClick={clearNotifications}
          className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded transition-colors"
        >
          Clear All
        </button>
      </div>
      
      <div className="mt-4 text-sm text-gray-400">
        <p>• Click buttons to test different notification types</p>
        <p>• Notifications auto-dismiss after 5 seconds (except downloads)</p>
        <p>• Click the X button or swipe right to dismiss manually</p>
        <p>• Download notifications show progress bars</p>
      </div>
    </div>
  );
};

export default NotificationDemo; 