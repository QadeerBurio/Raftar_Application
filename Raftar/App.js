import React, { useEffect } from 'react';
import { LogBox } from 'react-native';

// --- Error Logging Setup ---
// Expo/React Native sometimes shows errors on device but swallows terminal output.
// This ensures errors always print to the Metro bundler terminal.
if (__DEV__) {
  const originalConsoleError = console.error;
  console.error = (...args) => {
    console.log('\n❌ [EXPO ERROR]:', ...args, '\n');
    originalConsoleError(...args);
  };

  const originalConsoleWarn = console.warn;
  console.warn = (...args) => {
    console.log('\n⚠️ [EXPO WARN]:', ...args, '\n');
    originalConsoleWarn(...args);
  };

  if (global.ErrorUtils) {
    const originalErrorHandler = global.ErrorUtils.getGlobalHandler();
    global.ErrorUtils.setGlobalHandler((error, isFatal) => {
      console.log('\n💥 [FATAL UNHANDLED ERROR]:', error?.message || error);
      console.log('Stack Trace:\n', error?.stack, '\n');
      if (originalErrorHandler) {
        originalErrorHandler(error, isFatal);
      }
    });
  }
}
// ---------------------------
import { Provider } from 'react-redux';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { store } from './app/src/redux/store';
import AppNavigator from './app/src/navigation/AppNavigator';
import { SocketProvider } from './app/src/context/SocketContext';
import { ThemeProvider } from './app/src/context/ThemeContext';
import { NotificationProvider } from './app/src/context/NotificationContext';
import notificationService from './app/src/services/notificationService';

export default function App() {
  useEffect(() => {
    // Initialize notifications
    const initNotifications = async () => {
      await notificationService.registerForPushNotifications();
      notificationService.setupNotificationListeners();
    };
    
    initNotifications();

    // Cleanup on unmount
    return () => {
      notificationService.cleanup();
    };
  }, []);

  return (
    <Provider store={store}>
      <SafeAreaProvider>
        <ThemeProvider>
          <SocketProvider>
            <NotificationProvider>
              {/* AppNavigator contains NavigationContainer */}
              <AppNavigator />
            </NotificationProvider>
          </SocketProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </Provider>
  );
}