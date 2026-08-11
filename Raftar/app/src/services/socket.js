import io from 'socket.io-client';
import { SOCKET_URL } from '../config/constants';

class SocketService {
  constructor() {
    this.socket = null;
    this.listeners = {};
  }

  connect(token, userId) {
    if (this.socket) {
      this.disconnect();
    }

    this.socket = io(SOCKET_URL || 'http://10.11.73.253:5000', {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    // Re-attach all existing listeners that components registered
    Object.keys(this.listeners).forEach(event => {
      this.listeners[event].forEach(callback => {
        this.socket.on(event, callback);
      });
    });

    this.setupListeners(userId);
  }

  setupListeners(userId) {
    this.socket.on('connect', () => {
      console.log('Socket connected');
      if (userId) {
        console.log(`[SocketService] Emitting join-user for ${userId}`);
        this.socket.emit('join-user', userId);
      }
    });

    this.socket.on('disconnect', () => {
      console.log('Socket disconnected');
    });

    this.socket.on('error', (error) => {
      console.error('Socket error:', error);
    });
  }

  emit(event, data) {
    if (this.socket) {
      this.socket.emit(event, data);
    }
  }

  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    // Only add if not already present
    if (!this.listeners[event].includes(callback)) {
      this.listeners[event].push(callback);
    }
    
    if (this.socket) {
      // Remove first to avoid duplicates if re-attaching
      this.socket.off(event, callback);
      this.socket.on(event, callback);
    }
  }

  off(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }
    if (this.socket) {
      this.socket.off(event, callback);
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      // Do not wipe this.listeners; components manage their own lifecycles via off()
    }
  }
}

export default new SocketService();