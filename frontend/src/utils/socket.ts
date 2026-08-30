import { io, Socket } from 'socket.io-client';

// VITE_SOCKET_URL should be your backend root URL without /api/v1
// e.g.  http://localhost:3000  or  https://api.yourapp.com
const SOCKET_BASE_URL =
  import.meta.env.VITE_SOCKET_URL ||
  (import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1').replace('/api/v1', '');

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
