import io from 'socket.io-client'; // Use default import for io
import type { Socket as ClientSocket } from 'socket.io-client'; // Explicit type import for Socket
import { v4 as uuidv4 } from 'uuid'; // For generating clientRequestId

// Define the server URL from your websocket-server config or .env for consistency
// For this client, we can hardcode it for simplicity or use a similar config approach if it grows
const SERVER_URL = process.env.WEBSOCKET_SERVER_URL || 'http://localhost:3000'; // Assuming port 3000 from websocket-server config

console.log(`[TestClient] Connecting to WebSocket server at ${SERVER_URL}...`);

// Let TypeScript infer the type, or use the aliased type ClientSocket
const socket = io(SERVER_URL, { // Removed explicit :Socket annotation for inference
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  transports: ['websocket'], // Force WebSocket transport
});

// If you need to use the Socket type explicitly elsewhere, you can use ClientSocket
// function example(mySock: ClientSocket) { /* ... */ }

socket.on('connect', () => {
  console.log(`[TestClient] Connected to server with socket ID: ${socket.id}`);

  // Prepare a test request
  const clientRequestId = uuidv4();
  const testRequest = {
    youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', // A classic test video
    targetLanguage: 'es', // Spanish
    clientRequestId: clientRequestId,
  };

  console.log(`[TestClient] Sending 'initiate_youtube_translation' event with clientRequestId: ${clientRequestId}`, testRequest);
  socket.emit('initiate_youtube_translation', testRequest);
});

socket.on('request_processing', (data: any) => {
  console.log('[TestClient] Received \'request_processing\' event:', data);
  if (data && data.streamId) {
    console.log(`[TestClient] Our request is being processed with streamId: ${data.streamId}`);
  }
});

socket.on('request_error', (data: any) => {
  console.error('[TestClient] Received \'request_error\' event:', data);
  // data might be: { clientRequestId: string, message: string }
  // Consider closing the socket or handling the error appropriately
  // socket.disconnect();
});

socket.on('translation_result', (data: any) => {
  console.log('[TestClient] Received \'translation_result\' event:', data);
  // This is for the full end-to-end test later
  // For now, just log it. It will contain the translated text/audio info.
  // socket.disconnect(); // Optionally disconnect after receiving the final result
});

socket.on('disconnect', (reason: any) => {
  console.log(`[TestClient] Disconnected from server: ${reason}`);
});

socket.on('connect_error', (error: any) => {
  console.error(`[TestClient] Connection Error: ${error.message}`, error);
});

// Handle script termination to close the socket
process.on('SIGINT', () => {
  console.log('[TestClient] SIGINT received, disconnecting socket...');
  socket.disconnect();
  process.exit(0);
});

// Keep the client running for a bit to receive events, or until manually stopped.
// For a simple test, this will connect, send, and then can be manually stopped (Ctrl+C).
// If you want it to auto-exit after some time or after a specific event, add that logic.
console.log('[TestClient] Client started. Waiting for events... (Press Ctrl+C to exit)'); 