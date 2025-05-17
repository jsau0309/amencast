import { io, Socket } from 'socket.io-client';

const SOCKET_SERVER_URL = process.env.NEXT_PUBLIC_WEBSOCKET_URL || 'http://localhost:3001';
let socketInstance: Socket | null = null;

export const getSocket = (): Socket => {
  if (!socketInstance) {
    console.log(`[Frontend] Initializing new socket connection to ${SOCKET_SERVER_URL}`);
    socketInstance = io(SOCKET_SERVER_URL, {
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      transports: ['websocket'], // Prefer WebSocket transport
      // You might want to add withCredentials: true if you handle auth with cookies across domains later
    });

    socketInstance.on('connect', () => {
      console.log('[Frontend] Connected to WebSocket server. Socket ID:', socketInstance?.id);
    });

    socketInstance.on('disconnect', (reason: string) => {
      console.log('[Frontend] Disconnected from WebSocket server. Reason:', reason);
      // Optionally nullify the instance if you want a fresh connection next time getSocket is called after a disconnect
      // if (reason === 'io server disconnect') {
      //   socketInstance = null;
      // }
    });

    socketInstance.on('connect_error', (error: Error) => {
      console.error('[Frontend] WebSocket Connection Error:', error);
      // Potentially nullify the instance here too, so next getSocket tries a fresh connection
      // socketInstance = null;
    });

  } else {
    // If instance exists but is not connected, you might want to force a connection attempt
    if (!socketInstance.connected) {
        console.log('[Frontend] Socket instance exists but not connected, attempting to connect...');
        socketInstance.connect();
    }
  }
  return socketInstance;
};

// Optional: Function to explicitly disconnect the socket if needed from elsewhere in the app
export const disconnectSocket = () => {
  if (socketInstance && socketInstance.connected) {
    console.log('[Frontend] Explicitly disconnecting socket.');
    socketInstance.disconnect();
  }
  socketInstance = null; // Allow re-initialization on next getSocket call
}; 