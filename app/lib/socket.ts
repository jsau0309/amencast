import { Socket } from "socket.io-client";
import io from "socket.io-client";

const SOCKET_SERVER_URL =
  process.env.NEXT_PUBLIC_WEBSOCKET_URL || "http://localhost:3001";

class SocketManager {
  private static instance: SocketManager;
  private socket: typeof Socket;

  private constructor() {
    console.log(
      `[SocketManager] Initializing new socket connection to ${SOCKET_SERVER_URL}`
    );
    this.socket = io(SOCKET_SERVER_URL, {
      autoConnect: false,
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
      transports: ["websocket"],
    });

    this.socket.on("connect", () => {
      console.log(
        `[SocketManager] Connected to WebSocket server. Socket ID: ${this.socket.id}`
      );
    });

    this.socket.on("disconnect", (reason: string) => {
      console.log(
        `[SocketManager] Disconnected from WebSocket server. Reason: ${reason}`
      );
    });

    this.socket.on("connect_error", (error: Error) => {
      console.error("[SocketManager] WebSocket Connection Error:", error);
    });
  }

  public static getInstance(): SocketManager {
    if (!SocketManager.instance) {
      SocketManager.instance = new SocketManager();
    }
    return SocketManager.instance;
  }

  public connect(): void {
    if (!this.socket.connected) {
      console.log("[SocketManager] Attempting to connect...");
      this.socket.connect();
    }
  }

  public getSocket(): typeof Socket {
    return this.socket;
  }
}

export const socketManager = SocketManager.getInstance();
// Optional: Function to explicitly disconnect the socket if needed from elsewhere in the app
export const disconnectSocket = () => {
  const socket = socketManager.getSocket();
  if (socket && socket.connected) {
    console.log('[Frontend] Explicitly disconnecting socket.');
    socket.disconnect();
  }
  // Allow re-initialization on next getSocket call
};
