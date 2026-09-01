import { io, Socket } from 'socket.io-client';

const getSocketBaseUrl = () => {
  let url = (import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_API_URL || 'http://localhost:3000').trim().replace(/\/$/, '');
  // Strip trailing /api/v1 or /api so it targets backend root domain for Socket.IO namespace
  url = url.replace(/\/api\/v1$/, '').replace(/\/api$/, '');
  return url;
};

const SOCKET_BASE_URL = getSocketBaseUrl();

const sockets: { [key: string]: Socket } = {};

export function getSocket(namespace: string = 'realtime'): Socket {
  if (!sockets[namespace]) {
    const socket = io(`${SOCKET_BASE_URL}/${namespace}`, {
      withCredentials: true,
      transports: ['websocket'],
    });

    // Override disconnect to prevent shared connections from dying on React unmounts
    const originalDisconnect = socket.disconnect.bind(socket);
    socket.disconnect = () => {
      return socket;
    };
    
    // Store original if needed
    (socket as any).realDisconnect = originalDisconnect;

    sockets[namespace] = socket;
  }
  
  return sockets[namespace];
}
