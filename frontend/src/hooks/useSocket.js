import { useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = process.env.REACT_APP_BACKEND_URL;

let socketInstance = null;

export function getSocket() {
  if (!socketInstance) {
    socketInstance = io(SOCKET_URL, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      autoConnect: false,
    });
  }
  return socketInstance;
}

export function useSocket(eventName, callback) {
  const savedCallback = useRef(callback);
  savedCallback.current = callback;

  useEffect(() => {
    const socket = getSocket();
    const handler = (...args) => savedCallback.current(...args);
    socket.on(eventName, handler);
    return () => socket.off(eventName, handler);
  }, [eventName]);
}

export function useSocketConnect(token) {
  useEffect(() => {
    if (!token) return;
    const socket = getSocket();
    if (!socket.connected) {
      socket.connect();
    }
    socket.emit('authenticate', { token });
    return () => {};
  }, [token]);
}
