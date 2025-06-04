/**
 * Notification Service - Wraps common operations with automatic error handling and notifications
 * This service can be used throughout the app to add consistent error handling and user feedback
 */

// Import the notification types (we'll use a different approach to avoid circular dependencies)
export const NOTIFICATION_TYPES = {
  ERROR: 'error',
  SUCCESS: 'success',
  WARNING: 'warning',
  INFO: 'info',
  DOWNLOAD: 'download'
};

/**
 * Wraps an async operation with error handling and notifications
 * @param {Function} operation - The async operation to execute
 * @param {Object} options - Configuration options
 * @param {Function} options.notifyError - Error notification function
 * @param {Function} options.notifySuccess - Success notification function
 * @param {Function} options.notifyWarning - Warning notification function
 * @param {string} options.successMessage - Message to show on success
 * @param {string} options.errorMessage - Message to show on error
 * @param {boolean} options.showSuccess - Whether to show success notification
 * @param {boolean} options.showError - Whether to show error notification
 * @param {Function} options.onError - Custom error handler
 * @param {Function} options.onSuccess - Custom success handler
 */
export async function withNotifications(operation, options = {}) {
  const {
    notifyError,
    notifySuccess,
    notifyWarning,
    successMessage,
    errorMessage,
    showSuccess = false,
    showError = true,
    onError,
    onSuccess,
    warningCondition,
    warningMessage
  } = options;

  try {
    const result = await operation();
    
    // Check for warning conditions
    if (warningCondition && warningCondition(result)) {
      if (notifyWarning && warningMessage) {
        notifyWarning(warningMessage.title || 'Warning', {
          subtitle: warningMessage.subtitle
        });
      }
    }
    
    // Show success notification if requested
    if (showSuccess && successMessage && notifySuccess) {
      notifySuccess(successMessage.title || 'Success', {
        subtitle: successMessage.subtitle
      });
    }
    
    // Call custom success handler
    if (onSuccess) {
      onSuccess(result);
    }
    
    return result;
  } catch (error) {
    console.error('Operation failed:', error);
    
    // Show error notification
    if (showError && errorMessage && notifyError) {
      notifyError(errorMessage.title || 'Operation Failed', {
        subtitle: errorMessage.subtitle || error.message
      });
    }
    
    // Call custom error handler
    if (onError) {
      onError(error);
    } else {
      // Re-throw error if no custom handler
      throw error;
    }
  }
}

/**
 * Wraps a download operation with progress notifications
 * @param {Function} operation - The download operation
 * @param {Object} options - Configuration options
 */
export async function withDownloadNotifications(operation, options = {}) {
  const {
    notifyDownload,
    updateNotification,
    notifyError,
    notifySuccess,
    downloadName,
    onProgress,
    onError,
    onSuccess
  } = options;

  let downloadId = null;

  try {
    // Create initial download notification
    if (notifyDownload && downloadName) {
      downloadId = notifyDownload(`Starting download: ${downloadName}`, {
        progress: 0,
        subtitle: 'Preparing download...'
      });
    }

    const result = await operation({
      onProgress: (progress, subtitle) => {
        if (downloadId && updateNotification) {
          updateNotification(downloadId, {
            progress: progress,
            subtitle: subtitle || `${Math.round(progress)}% complete`
          });
        }
        if (onProgress) {
          onProgress(progress, subtitle);
        }
      }
    });

    // Update to completion
    if (downloadId && updateNotification) {
      updateNotification(downloadId, {
        message: `${downloadName} download complete!`,
        progress: 100,
        subtitle: 'Download finished successfully',
        autoRemove: true,
        duration: 3000
      });
    }

    if (onSuccess) {
      onSuccess(result);
    }

    return result;
  } catch (error) {
    console.error('Download failed:', error);
    
    // Update download notification to show error
    if (downloadId && updateNotification) {
      updateNotification(downloadId, {
        message: `Download failed: ${downloadName}`,
        type: NOTIFICATION_TYPES.ERROR,
        subtitle: error.message || 'Download could not be completed',
        autoRemove: true,
        duration: 5000
      });
    } else if (notifyError) {
      notifyError(`Download failed: ${downloadName}`, {
        subtitle: error.message || 'Download could not be completed'
      });
    }

    if (onError) {
      onError(error);
    } else {
      throw error;
    }
  }
}

/**
 * Enhanced error handler that provides user-friendly messages based on error types
 * @param {Error} error - The error object
 * @param {Function} notifyError - Error notification function
 * @param {string} context - Context of where the error occurred
 */
export function handleError(error, notifyError, context = 'operation') {
  let title = `${context.charAt(0).toUpperCase() + context.slice(1)} failed`;
  let subtitle = 'Please try again later';

  // Handle specific error types
  if (error.message) {
    if (error.message.includes('network') || error.message.includes('fetch')) {
      title = 'Network Error';
      subtitle = 'Please check your internet connection';
    } else if (error.message.includes('unauthorized') || error.message.includes('401')) {
      title = 'Authentication Error';
      subtitle = 'Please check your credentials';
    } else if (error.message.includes('timeout')) {
      title = 'Request Timeout';
      subtitle = 'The request took too long to complete';
    } else if (error.message.includes('not found') || error.message.includes('404')) {
      title = 'Resource Not Found';
      subtitle = 'The requested resource was not found';
    } else {
      subtitle = error.message;
    }
  }

  if (notifyError) {
    notifyError(title, { subtitle });
  }

  console.error(`${context} error:`, error);
}

/**
 * Creates notification functions for a specific context
 * This is a helper to make it easier to use notifications in components
 */
export function createNotificationHandlers(useNotifications) {
  const notifications = useNotifications();
  
  return {
    ...notifications,
    handleError: (error, context) => handleError(error, notifications.notifyError, context),
    withNotifications: (operation, options) => withNotifications(operation, {
      ...options,
      notifyError: notifications.notifyError,
      notifySuccess: notifications.notifySuccess,
      notifyWarning: notifications.notifyWarning
    }),
    withDownloadNotifications: (operation, options) => withDownloadNotifications(operation, {
      ...options,
      notifyDownload: notifications.notifyDownload,
      updateNotification: notifications.updateNotification,
      notifyError: notifications.notifyError,
      notifySuccess: notifications.notifySuccess
    })
  };
}

export default {
  withNotifications,
  withDownloadNotifications,
  handleError,
  createNotificationHandlers,
  NOTIFICATION_TYPES
}; 