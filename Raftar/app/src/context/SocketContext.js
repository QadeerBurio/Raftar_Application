import React, { createContext, useContext, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { Alert } from 'react-native';
import socketService from '../services/socket';

const SocketContext = createContext();

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};

export const SocketProvider = ({ children }) => {
  const { token, isAuthenticated, user } = useSelector(state => state.auth);

  useEffect(() => {
    if (isAuthenticated && token && user) {
      socketService.connect(token, user.id);

      const handleRideReminder = (data) => {
        Alert.alert('Ride Reminder', data.message);
      };
      socketService.on('ride-reminder', handleRideReminder);

      return () => {
        socketService.off('ride-reminder', handleRideReminder);
        socketService.disconnect();
      };
    } else {
      socketService.disconnect();
    }

    return () => {
      socketService.disconnect();
    };
  }, [isAuthenticated, token, user]);

  return (
    <SocketContext.Provider value={socketService}>
      {children}
    </SocketContext.Provider>
  );
};