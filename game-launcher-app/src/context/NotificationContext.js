import React, { createContext, useState, useContext, useCallback } from 'react';

// Create the notification context
const NotificationContext = createContext();

// Notification types and their corresponding styles
export const NOTIFICATION_TYPES = {
  ERROR: 'error',
  SUCCESS: 'success',
  WARNING: 'warning',
  INFO: 'info',
  DOWNLOAD: 'download'
};

// Create a provider component
export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([]);

  // Add a new notification
  const addNotification = useCallback((message, type = NOTIFICATION_TYPES.INFO, options = {}) => {
    const id = Date.now() + Math.random(); // Simple unique ID
    const notification = {
      id,
      message,
      type,
      timestamp: Date.now(),
      autoRemove: options.autoRemove !== false, // Default to true
      duration: options.duration || 5000, // Default 5 seconds
      ...options
    };

    setNotifications(prev => [...prev, notification]);

    // Auto-remove if enabled
    if (notification.autoRemove) {
      setTimeout(() => {
        removeNotification(id);
      }, notification.duration);
    }

    return id;
  }, []);

  // Remove a specific notification
  const removeNotification = useCallback((id) => {
    setNotifications(prev => prev.filter(notification => notification.id !== id));
  }, []);

  // Clear all notifications
  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  // Update a notification (useful for download progress)
  const updateNotification = useCallback((id, updates) => {
    setNotifications(prev => 
      prev.map(notification => 
        notification.id === id 
          ? { ...notification, ...updates }
          : notification
      )
    );
  }, []);

  // Convenience methods for different notification types
  const notifyError = useCallback((message, options) => 
    addNotification(message, NOTIFICATION_TYPES.ERROR, options), [addNotification]);

  const notifySuccess = useCallback((message, options) => 
    addNotification(message, NOTIFICATION_TYPES.SUCCESS, options), [addNotification]);

  const notifyWarning = useCallback((message, options) => 
    addNotification(message, NOTIFICATION_TYPES.WARNING, options), [addNotification]);

  const notifyInfo = useCallback((message, options) => 
    addNotification(message, NOTIFICATION_TYPES.INFO, options), [addNotification]);

  const notifyDownload = useCallback((message, options) => 
    addNotification(message, NOTIFICATION_TYPES.DOWNLOAD, { autoRemove: false, ...options }), [addNotification]);

  // The context value that will be provided
  const contextValue = {
    notifications,
    addNotification,
    removeNotification,
    clearNotifications,
    updateNotification,
    notifyError,
    notifySuccess,
    notifyWarning,
    notifyInfo,
    notifyDownload
  };

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}
    </NotificationContext.Provider>
  );
}

// Custom hook to use the notification context
export function useNotifications() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
} 