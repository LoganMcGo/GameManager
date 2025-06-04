import React from 'react';
import { useNotifications } from '../context/NotificationContext';
import Notification from './Notification';

const NotificationContainer = () => {
  const { notifications } = useNotifications();

  // Don't render anything if there are no notifications
  if (notifications.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 pointer-events-none">
      <div className="flex flex-col-reverse space-y-reverse space-y-3 pointer-events-auto">
        {notifications.map((notification) => (
          <Notification 
            key={notification.id} 
            notification={notification} 
          />
        ))}
      </div>
    </div>
  );
};

export default NotificationContainer; 