import { useEffect, useRef, useState } from 'react';
import { useNotifications } from '../context/NotificationContext';

export const useAutoUpdater = () => {
  const notifications = useNotifications();
  const updateNotificationId = useRef(null);
  const [currentVersion, setCurrentVersion] = useState('0.1.0');
  
  useEffect(() => {
    // Get current version on mount
    const getVersion = async () => {
      try {
        if (window.electronAPI?.getVersion) {
          const version = await window.electronAPI.getVersion();
          setCurrentVersion(version || '0.1.0');
        }
      } catch (error) {
        console.error('Failed to get app version:', error);
        setCurrentVersion('0.1.0');
      }
    };
    
    getVersion();
  }, []);
  
  useEffect(() => {
    if (!window.electronAPI) return;

    // Handle update available
    const handleUpdateAvailable = (event, updateInfo) => {
      notifications.notifyInfo('Update Available', {
        title: `Version ${updateInfo.version} is available`,
        subtitle: 'Downloading update...',
        autoRemove: false,
        showReleaseNotes: true,
        releaseNotes: updateInfo.releaseNotes
      });
    };

    // Handle download progress
    const handleUpdateProgress = (event, progressObj) => {
      if (updateNotificationId.current) {
        notifications.updateNotification(updateNotificationId.current, {
          title: 'Downloading Update...',
          subtitle: `${Math.round(progressObj.percent)}% complete`,
          progress: progressObj.percent
        });
      } else {
        updateNotificationId.current = notifications.notifyDownload('Downloading Update...', {
          title: 'Downloading Update...',
          subtitle: `${Math.round(progressObj.percent)}% complete`,
          progress: progressObj.percent
        });
      }
    };

    // Handle update downloaded
    const handleUpdateDownloaded = (event, updateInfo) => {
      // Remove download progress notification
      if (updateNotificationId.current) {
        notifications.removeNotification(updateNotificationId.current);
        updateNotificationId.current = null;
      }

      // Show install notification
      notifications.notifySuccess('Update Ready!', {
        title: `Version ${updateInfo.version} downloaded`,
        subtitle: 'Click to restart and install',
        autoRemove: false,
        actionButton: {
          text: 'Restart & Install',
          action: () => window.electronAPI?.restartAndUpdate()
        },
        showReleaseNotes: true,
        releaseNotes: updateInfo.releaseNotes
      });
    };

    // Handle update error
    const handleUpdateError = (event, error) => {
      notifications.notifyError('Update Error', {
        subtitle: error,
        autoRemove: true
      });
    };

    // Set up listeners
    window.electronAPI.onUpdateAvailable(handleUpdateAvailable);
    window.electronAPI.onUpdateProgress(handleUpdateProgress);
    window.electronAPI.onUpdateDownloaded(handleUpdateDownloaded);
    window.electronAPI.onUpdateError(handleUpdateError);

    return () => {
      // Cleanup listeners
      window.electronAPI?.removeAllListeners('update-available');
      window.electronAPI?.removeAllListeners('update-progress');
      window.electronAPI?.removeAllListeners('update-downloaded');
      window.electronAPI?.removeAllListeners('update-error');
    };
  }, [notifications]);

  const checkForUpdates = () => {
    window.electronAPI?.checkForUpdates();
  };

  return {
    checkForUpdates,
    currentVersion
  };
}; 