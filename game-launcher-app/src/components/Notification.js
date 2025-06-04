import React, { useState, useEffect, useRef } from 'react';
import { useNotifications, NOTIFICATION_TYPES } from '../context/NotificationContext';

const Notification = ({ notification }) => {
  const { removeNotification } = useNotifications();
  const [isVisible, setIsVisible] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const notificationRef = useRef(null);
  const dragStartX = useRef(0);
  const dragStartTime = useRef(0);

  // Show animation on mount
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 50);
    return () => clearTimeout(timer);
  }, []);

  // Get notification styles based on type
  const getNotificationStyles = (type) => {
    const baseStyles = "border-l-4 shadow-lg backdrop-blur-sm";
    
    switch (type) {
      case NOTIFICATION_TYPES.ERROR:
        return `${baseStyles} bg-red-900/90 border-red-500 text-red-100`;
      case NOTIFICATION_TYPES.SUCCESS:
        return `${baseStyles} bg-green-900/90 border-green-500 text-green-100`;
      case NOTIFICATION_TYPES.WARNING:
        return `${baseStyles} bg-yellow-900/90 border-yellow-500 text-yellow-100`;
      case NOTIFICATION_TYPES.DOWNLOAD:
        return `${baseStyles} bg-blue-900/90 border-blue-500 text-blue-100`;
      case NOTIFICATION_TYPES.INFO:
      default:
        return `${baseStyles} bg-gray-900/90 border-gray-500 text-gray-100`;
    }
  };

  // Get icon based on notification type
  const getIcon = (type) => {
    const iconClass = "w-5 h-5 mr-3 flex-shrink-0";
    
    switch (type) {
      case NOTIFICATION_TYPES.ERROR:
        return (
          <svg className={`${iconClass} text-red-400`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case NOTIFICATION_TYPES.SUCCESS:
        return (
          <svg className={`${iconClass} text-green-400`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case NOTIFICATION_TYPES.WARNING:
        return (
          <svg className={`${iconClass} text-yellow-400`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        );
      case NOTIFICATION_TYPES.DOWNLOAD:
        return (
          <svg className={`${iconClass} text-blue-400`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
          </svg>
        );
      case NOTIFICATION_TYPES.INFO:
      default:
        return (
          <svg className={`${iconClass} text-gray-400`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
    }
  };

  // Handle dismiss
  const handleDismiss = () => {
    setIsRemoving(true);
    setTimeout(() => {
      removeNotification(notification.id);
    }, 300);
  };

  // Touch/Mouse events for swipe to dismiss
  const handleStart = (clientX) => {
    setIsDragging(true);
    dragStartX.current = clientX;
    dragStartTime.current = Date.now();
  };

  const handleMove = (clientX) => {
    if (!isDragging) return;
    
    const deltaX = clientX - dragStartX.current;
    if (deltaX > 0) { // Only allow right swipe
      setDragX(deltaX);
    }
  };

  const handleEnd = () => {
    if (!isDragging) return;
    
    setIsDragging(false);
    const deltaTime = Date.now() - dragStartTime.current;
    const velocity = dragX / deltaTime;
    
    // Dismiss if swiped far enough or fast enough
    if (dragX > 100 || velocity > 0.5) {
      handleDismiss();
    } else {
      // Snap back
      setDragX(0);
    }
  };

  // Mouse events
  const handleMouseDown = (e) => {
    e.preventDefault();
    handleStart(e.clientX);
  };

  const handleMouseMove = (e) => {
    if (isDragging) {
      e.preventDefault();
      handleMove(e.clientX);
    }
  };

  const handleMouseUp = () => {
    handleEnd();
  };

  // Touch events
  const handleTouchStart = (e) => {
    handleStart(e.touches[0].clientX);
  };

  const handleTouchMove = (e) => {
    if (isDragging) {
      e.preventDefault();
      handleMove(e.touches[0].clientX);
    }
  };

  const handleTouchEnd = () => {
    handleEnd();
  };

  // Add global mouse events when dragging
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, dragX]);

  // In the notification content, add support for action buttons and release notes
  const renderNotificationContent = (notification) => {
    return (
      <div>
        {/* Existing notification content */}
        
        {/* Action button for updates */}
        {notification.actionButton && (
          <button
            onClick={notification.actionButton.action}
            className="mt-2 bg-white text-blue-500 px-3 py-1 rounded text-sm hover:bg-gray-100 transition-colors"
          >
            {notification.actionButton.text}
          </button>
        )}
        
        {/* Release notes toggle */}
        {notification.showReleaseNotes && notification.releaseNotes && (
          <details className="mt-2">
            <summary className="cursor-pointer text-sm opacity-75 hover:opacity-100">
              View Release Notes
            </summary>
            <div className="mt-2 text-xs opacity-75 max-h-32 overflow-y-auto">
              {notification.releaseNotes}
            </div>
          </details>
        )}
        
        {/* Progress bar for downloads */}
        {notification.progress !== undefined && (
          <div className="mt-2 w-full bg-white bg-opacity-25 rounded-full h-2">
            <div 
              className="bg-white h-2 rounded-full transition-all duration-300"
              style={{ width: `${notification.progress}%` }}
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      ref={notificationRef}
      className={`
        max-w-sm w-full rounded-lg p-4 mb-3 cursor-pointer select-none
        transform transition-all duration-300 ease-in-out
        ${getNotificationStyles(notification.type)}
        ${isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}
        ${isRemoving ? 'translate-x-full opacity-0' : ''}
        ${isDragging ? 'transition-none' : ''}
      `}
      style={{
        transform: `translateX(${dragX}px) ${isVisible && !isRemoving ? 'translateX(0)' : isRemoving ? 'translateX(100%)' : 'translateX(100%)'}`,
        opacity: isVisible && !isRemoving ? 1 : 0
      }}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div className="flex items-start">
        {getIcon(notification.type)}
        
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium leading-tight">
            {notification.message}
          </p>
          
          {/* Show additional info if provided */}
          {notification.subtitle && (
            <p className="text-xs opacity-75 mt-1">
              {notification.subtitle}
            </p>
          )}
          
          {renderNotificationContent(notification)}
        </div>
        
        {/* Close button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleDismiss();
          }}
          className="ml-3 flex-shrink-0 rounded-full p-1 hover:bg-white/20 transition-colors"
          aria-label="Dismiss notification"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default Notification; 