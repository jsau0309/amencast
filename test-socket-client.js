const { io } = require("socket.io-client");

// Connect to your websocket-server
const socket = io("http://localhost:3001", { // Ensure port matches your websocket-server
  transports: ["websocket"] // Optional, but can be good for consistency
});

socket.on("connect", () => {
  console.log("TestClient: Connected to WebSocket server with ID:", socket.id);

  const testData = {
    youtubeUrl: "https://www.youtube.com/watch?v=YG7juc3GXJo", // Use a known SHORT and PUBLIC video
    targetLanguage: "es",
    clientRequestId: `clientReq-${Date.now()}`, // Unique ID
    streamId: `stream-${Date.now()}`,         // Unique ID
    format: "video+audio"
  };

  console.log("TestClient: Emitting 'initiate_youtube_translation' with data:", testData);
  socket.emit("initiate_youtube_translation", testData);
});

socket.on("request_processing", (data) => {
  console.log("TestClient: Received 'request_processing':", data);
  // socket.disconnect(); // Optionally disconnect after confirmation
});

socket.on("translation_result", (data) => { // For future use
  console.log("TestClient: Received 'translation_result':", data);
  socket.disconnect();
});

socket.on("request_error", (data) => {
  console.error("TestClient: Received 'request_error':", data);
  socket.disconnect();
});

socket.on("connect_error", (err) => {
  console.error("TestClient: Connection Error!", err.message);
});

socket.on("disconnect", (reason) => {
  console.log("TestClient: Disconnected from WebSocket server. Reason:", reason);
});

// Timeout to exit if nothing happens after a while
setTimeout(() => {
    if (socket.connected) {
        console.log("TestClient: Test timeout, disconnecting.");
        socket.disconnect();
    }
}, 30000); // 30 seconds timeout
