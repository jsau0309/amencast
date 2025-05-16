
Okay, let's lay out a detailed, step-by-step implementation plan.

# Implementation Plan: Direct LiveKit, OpenAI & ElevenLabs

**Goal:** Create a robust GPU worker that receives text via LiveKit, translates it using OpenAI, converts it to speech using ElevenLabs, and streams the audio back via LiveKit.

---

## Phase 1: Project Setup & Core Dependencies

**Objective:** Prepare the development environment and install necessary libraries.

*   **Step 1.1: Directory Structure**
    *   Ensure you have a clear project structure. We'll primarily work within the `gpu-worker` directory.
    *   ```
        amencast/
        ├── gpu-worker/
        │   ├── index.js                # Main worker entry point
        │   ├── directWorker.js         # GPUWorker class
        │   ├── elevenlabsClient.js     # ElevenLabs API client
        │   └── package.json
        ├── frontend/                   # (Conceptual, for frontend integration ideas)
        └── .env                        # Environment variables
        ```

*   **Step 1.2: Initialize `npm` and Install Dependencies**
    *   Navigate to your `gpu-worker` directory:
        ```bash
        cd /Users/samuelalonso/amencast/gpu-worker
        ```
    *   If you don't have a `package.json`, create one:
        ```bash
        npm init -y
        ```
    *   Install dependencies:
        ```bash
        npm install livekit-server-sdk openai axios dotenv
        # livekit-server-sdk: For LiveKit room management and data publishing
        # openai: For OpenAI API (translation)
        # axios: For making HTTP requests to ElevenLabs
        # dotenv: For managing environment variables
        ```

*   **Step 1.3: Setup `.env` File**
    *   Create a `.env` file in your project root (`/Users/samuelalonso/amencast/.env`):
        ```env
        LIVEKIT_URL="wss://your-project.livekit.cloud" # Replace with your LiveKit URL
        LIVEKIT_API_KEY="YOUR_LIVEKIT_API_KEY"
        LIVEKIT_API_SECRET="YOUR_LIVEKIT_API_SECRET"
        OPENAI_API_KEY="YOUR_OPENAI_API_KEY"
        ELEVENLABS_API_KEY="YOUR_ELEVENLABS_API_KEY"
        ```
    *   **Action:** Replace placeholder values with your actual API keys and URL.

---

## Phase 2: ElevenLabs Client Implementation

**Objective:** Create a reusable client for interacting with the ElevenLabs API.

*   **Step 2.1: Create `elevenlabsClient.js`**
    *   In `gpu-worker/elevenlabsClient.js`, implement the client as previously detailed:
        ```javascript
        // gpu-worker/elevenlabsClient.js
        const axios = require('axios');

        class ElevenLabsClient {
          constructor(apiKey) {
            this.apiKey = apiKey;
            this.baseURL = 'https://api.elevenlabs.io/v1';
            this.client = axios.create({
              baseURL: this.baseURL,
              headers: {
                'xi-api-key': this.apiKey, // Corrected header key
                'Content-Type': 'application/json'
              }
            });
          }

          async streamTTS(text, options = {}) {
            try {
              const response = await this.client.post(
                `/text-to-speech/${options.voice_id}/stream`,
                {
                  text,
                  model_id: options.model_id || 'eleven_multilingual_v2', // Default model
                  voice_settings: {
                    stability: 0.5,
                    similarity_boost: 0.75,
                    // style: 0.0, // Uncomment and adjust if using a style-exaggerated model
                    // use_speaker_boost: true // Uncomment if needed
                  }
                },
                { responseType: 'stream' }
              );
              return response.data; // This is a readable stream
            } catch (error) {
              console.error('ElevenLabs API error:', 
                error.response ? error.response.data : error.message
              );
              throw error;
            }
          }
        }

        module.exports = ElevenLabsClient;
        ```
    *   **Note:** I've corrected the API key header to `xi-api-key` and added a default `model_id`.

---

## Phase 3: GPU Worker Core Logic (`directWorker.js`)

**Objective:** Implement the main `GPUWorker` class structure.

*   **Step 3.1: Basic Class Structure & Constructor**
    *   In `gpu-worker/directWorker.js`, start with:
        ```javascript
        // gpu-worker/directWorker.js
        const { RoomServiceClient, Room, RoomEvent, LocalParticipant, RemoteParticipant, DataPacket_Kind } = require('livekit-server-sdk');
        const { OpenAI } = require('openai');
        const ElevenLabsClient = require('./elevenlabsClient'); // Corrected import

        class GPUWorker {
          constructor() {
            this.liveKitConfig = {
              url: process.env.LIVEKIT_URL,
              apiKey: process.env.LIVEKIT_API_KEY,
              apiSecret: process.env.LIVEKIT_API_SECRET,
            };
            
            this.roomService = new RoomServiceClient(
              this.liveKitConfig.url,
              this.liveKitConfig.apiKey,
              this.liveKitConfig.apiSecret
            );

            this.openai = new OpenAI({
              apiKey: process.env.OPENAI_API_KEY,
            });

            this.elevenLabs = new ElevenLabsClient(process.env.ELEVENLABS_API_KEY);
            this.currentRoom = null;
            this.localParticipant = null; // To store the worker's local participant
          }
          // ... more methods will be added here
        }
        module.exports = GPUWorker;
        ```

*   **Step 3.2: Implement `connect()` Method**
    *   Add the `connect` method to `GPUWorker`:
        ```javascript
        // Inside GPUWorker class in directWorker.js
        async connect(roomName, workerIdentity = `gpu-worker-${Date.now()}`) {
          try {
            const token = await this.roomService.createToken({ // Corrected method name
              identity: workerIdentity,
              // ttl: '24h', // Optional: token time-to-live
              // metadata: JSON.stringify({ type: 'gpu-worker' }) // Optional
            }).setRoomName(roomName) // Specify room name for the token
              .setCanPublish(true)
              .setCanSubscribe(true)
              .setCanPublishData(true)
              .toJwt();

            this.currentRoom = new Room({
              adaptiveStream: true,
              dynacast: true,
            });

            this.setupRoomHandlers();

            await this.currentRoom.connect(this.liveKitConfig.url, token);
            this.localParticipant = this.currentRoom.localParticipant;
            console.log(`GPU Worker "${workerIdentity}" connected to room: ${this.currentRoom.name}`);
            console.log(`Worker SID: ${this.localParticipant.sid}`);

          } catch (error) {
            console.error(`Failed to connect worker to room "${roomName}":`, error);
            throw error;
          }
        }
        ```
        *   **Note:** Corrected token generation using `createToken` and chaining methods.

*   **Step 3.3: Implement `setupRoomHandlers()`**
    *   Add event handlers for incoming data and disconnections:
        ```javascript
        // Inside GPUWorker class in directWorker.js
        setupRoomHandlers() {
          this.currentRoom.on(RoomEvent.DataReceived, async (payload, participant) => {
            const JRPCTransport = undefined; // Not needed with direct DataPacket handling
            const dp = undefined; // Not needed with direct DataPacket handling
            const rpc = undefined; // Not needed with direct DataPacket handling
            const context = undefined; // Not needed with direct DataPacket handling
            let data;
            // payload is Uint8Array, convert to string
            const decoder = new TextDecoder();
            data = decoder.decode(payload);

            console.log(`Data received from ${participant ? participant.identity : 'server'}:`, data);
            try {
              const request = JSON.parse(data);
              if (request.type === 'translation_request' && participant) {
                await this.handleTranslationRequest(request, participant);
              }
            } catch (error) {
              console.error('Error parsing or handling data:', error);
              if (participant) {
                await this.sendError(participant, "Invalid request format.");
              }
            }
          });

          this.currentRoom.on(RoomEvent.Disconnected, (reason) => {
            console.log('GPU Worker disconnected from room. Reason:', reason);
            this.currentRoom = null;
            this.localParticipant = null;
          });

          this.currentRoom.on(RoomEvent.ParticipantConnected, (participant) => {
            console.log(`Participant connected: ${participant.identity}`);
          });

          this.currentRoom.on(RoomEvent.ParticipantDisconnected, (participant) => {
            console.log(`Participant disconnected: ${participant.identity}`);
          });
        }
        ```

*   **Step 3.4: Implement `sendStatus()` and `sendError()` Helpers**
    *   Add these utility methods for sending messages back to the requesting participant:
        ```javascript
        // Inside GPUWorker class in directWorker.js
        async sendData(data, destinationIdentity) {
          if (!this.localParticipant || !this.currentRoom) {
            console.error("Worker not connected, cannot send data.");
            return;
          }
          try {
            const encoder = new TextEncoder();
            const payload = encoder.encode(JSON.stringify(data));
            
            // Find the remote participant by identity to send data to
            let targetParticipant = null;
            this.currentRoom.remoteParticipants.forEach(p => {
                if (p.identity === destinationIdentity) {
                    targetParticipant = p;
                }
            });

            if (targetParticipant) {
                await this.localParticipant.publishData(payload, DataPacket_Kind.RELIABLE, [targetParticipant.sid]);
                // console.log(`Sent data to ${destinationIdentity}:`, data);
            } else {
                // Fallback or error if specific participant not found, or send to all
                // For now, let's log an error or decide on a broadcast strategy if needed
                console.warn(`Participant ${destinationIdentity} not found. Data not sent.`);
            }
          } catch (error) {
            console.error(`Error sending data to ${destinationIdentity}:`, error);
          }
        }

        async sendStatus(requestingParticipant, status, details) {
          await this.sendData({
            type: 'status_update',
            status,
            details,
            requestId: details.requestId || null, // Include requestId if available
            timestamp: Date.now(),
          }, requestingParticipant.identity);
        }

        async sendError(requestingParticipant, errorMessage, requestId = null) {
          await this.sendData({
            type: 'error',
            message: errorMessage,
            requestId: requestId,
            timestamp: Date.now(),
          }, requestingParticipant.identity);
        }
        ```
        *   **Note:** Updated `sendData` to target a specific participant by identity.

---

## Phase 4: Translation & TTS Pipeline in `directWorker.js`

**Objective:** Implement the core translation and text-to-speech logic.

*   **Step 4.1: Implement `handleTranslationRequest()`**
    *   This is the heart of the worker. Add it to `GPUWorker`:
        ```javascript
        // Inside GPUWorker class in directWorker.js
        async handleTranslationRequest(request, requestingParticipant) {
          const requestId = request.requestId || `req-${Date.now()}`; // Ensure a requestId
          try {
            console.log(`Handling translation request ID ${requestId} for ${requestingParticipant.identity}:`, request.text);
            await this.sendStatus(requestingParticipant, 'processing', { message: 'Starting translation...', requestId });

            // 1. Translate text using OpenAI
            const translationResponse = await this.openai.chat.completions.create({
              model: request.translationModel || "gpt-3.5-turbo", // Allow model override
              messages: [
                {
                  role: "system",
                  content: `You are an expert translator. Translate the following text accurately and naturally into ${request.targetLanguage}. Provide only the translated text itself, without any additional explanations, phrases like "Here is the translation:", or quotation marks around the translation.`,
                },
                { role: "user", content: request.text },
              ],
            });

            const translatedText = translationResponse.choices[0].message.content.trim();
            if (!translatedText) {
                throw new Error("OpenAI returned an empty translation.");
            }
            
            console.log(`Request ID ${requestId}: Translated text: ${translatedText}`);
            await this.sendStatus(requestingParticipant, 'translated', { originalText: request.text, translatedText, requestId });

            // 2. Convert translated text to speech using ElevenLabs
            await this.sendStatus(requestingParticipant, 'synthesizing_speech', { message: 'Converting translated text to speech...', requestId });
            const audioStream = await this.elevenLabs.streamTTS(translatedText, {
              voice_id: request.voiceId, // Ensure this is provided by client
              model_id: request.ttsModelId || 'eleven_multilingual_v2', // e.g., 'eleven_mono_english_v2'
            });
            console.log(`Request ID ${requestId}: ElevenLabs TTS stream initiated.`);

            // 3. Stream audio back through LiveKit
            await this.streamAudioToRoom(audioStream, requestingParticipant, requestId, translatedText);
            
            // Completion status sent within streamAudioToRoom after streaming

          } catch (error) {
            console.error(`Error in translation pipeline for request ID ${requestId}:`, error);
            await this.sendError(requestingParticipant, `Translation pipeline failed: ${error.message}`, requestId);
          }
        }
        ```

*   **Step 4.2: Implement `streamAudioToRoom()`**
    *   Handle the streaming of audio data back to the room:
        ```javascript
        // Inside GPUWorker class in directWorker.js
        async streamAudioToRoom(audioStream, requestingParticipant, requestId, translatedText) {
          if (!this.localParticipant) {
            console.error("Local participant not available to stream audio.");
            await this.sendError(requestingParticipant, "Worker error: Cannot stream audio.", requestId);
            return;
          }

          const trackName = `tts-audio-${requestId}`;
          let audioTrackPublication;
          try {
            // Publish a new audio track for this TTS stream
            // Note: LiveKit server SDK v1.x doesn't have createAudioTrack.
            // We need to manage this differently, perhaps by sending data packets with audio chunks
            // or having the worker join as a proper client participant to publish tracks.
            // For now, let's simulate sending audio data chunks via data channel.
            // This is a simplification. True audio track publishing is more complex from server-side.

            console.log(`Request ID ${requestId}: Starting to send audio data packets for "${translatedText}"`);
            await this.sendStatus(requestingParticipant, 'streaming_audio_started', { message: 'Streaming audio...', requestId });
            
            let totalBytesSent = 0;
            const audioChunks = []; // Store chunks to potentially reconstruct or save

            for await (const chunk of audioStream) {
              // For sending as data packets:
              // This might be too much data for reliable data channel if chunks are large or frequent.
              // Consider alternative strategy if this proves problematic (e.g., WebRTC from worker).
              // For now, we will send an event indicating chunk availability. The client can fetch.
              // OR, if the SDK allows publishing raw RTP, that's an option (more complex).
              // Let's send the raw chunk data directly if the client can handle it.
              
              // If sending raw bytes via data channel:
              // await this.localParticipant.publishData(chunk, DataPacket_Kind.LOSSY, [requestingParticipant.sid]);
              // totalBytesSent += chunk.length;
              // audioChunks.push(chunk);

              // A more practical approach for server-side generation without native track publishing
              // is to signal client to fetch or use a different method.
              // Given the constraints, let's send metadata and a signal for each chunk.
              // The frontend would need to handle assembling these.
              // This is NOT true audio streaming.
               await this.sendData({
                 type: 'audio_chunk',
                 requestId,
                 chunk: Buffer.from(chunk).toString('base64'), // Send as base64 string
                 sequence: audioChunks.length
               }, requestingParticipant.identity);
               audioChunks.push(chunk); // Store original chunk
               totalBytesSent += chunk.length;
            }

            console.log(`Request ID ${requestId}: Finished sending ${audioChunks.length} audio data packets, total bytes: ${totalBytesSent}.`);
            await this.sendStatus(requestingParticipant, 'streaming_audio_ended', { message: 'Audio streaming finished.', totalBytes: totalBytesSent, requestId });
            await this.sendStatus(requestingParticipant, 'completed', { originalText: null, translatedText, requestId });


          } catch (error) {
            console.error(`Error streaming audio for request ID ${requestId}:`, error);
            await this.sendError(requestingParticipant, `Audio streaming failed: ${error.message}`, requestId);
          } finally {
            // Clean up if any LiveKit track was published (not the case in current simplified data packet approach)
            // if (audioTrackPublication) {
            //   this.currentRoom.localParticipant.unpublishTrack(audioTrackPublication.trackSid);
            //   console.log(`Request ID ${requestId}: Unpublished audio track ${audioTrackPublication.trackSid}`);
            // }
          }
        }
        ```
        *   **Critical Note on Audio Streaming:** The `livekit-server-sdk` is primarily for server-side control and token generation. It does **not** directly support publishing media tracks in the same way a client SDK (`livekit-client`) does (e.g., by creating a `LocalAudioTrack` from a raw stream).
            *   The `streamAudioToRoom` method above has been adapted to send audio data as chunks over the data channel (base64 encoded). This is a workaround.
            *   **For true audio track streaming from the worker:** The worker would need to connect using the `livekit-client` SDK (e.g., in a Node.js environment that can emulate browser WebRTC APIs, or using a headless browser like Puppeteer). This is significantly more complex.
            *   Alternatively, the worker could write the audio to a file, make it accessible via a URL, and send that URL to the client.
            *   **We'll proceed with the data channel chunking for now, assuming the frontend can reassemble and play it.**

---

## Phase 5: Worker Entry Point (`index.js`)

**Objective:** Initialize and run the `GPUWorker`.

*   **Step 5.1: Create `gpu-worker/index.js`**
    ```javascript
    // gpu-worker/index.js
    require('dotenv').config({ path: '../.env' }); // Load .env from project root
    const GPUWorker = require('./directWorker');

    async function main() {
      try {
        const requiredEnvVars = [
          'LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET',
          'OPENAI_API_KEY', 'ELEVENLABS_API_KEY'
        ];
        for (const envVar of requiredEnvVars) {
          if (!process.env[envVar]) {
            console.error(`Critical Error: Missing required environment variable: ${envVar}`);
            process.exit(1);
          }
        }

        const worker = new GPUWorker();
        const roomName = process.env.LIVEKIT_DEFAULT_ROOM_NAME || 'amencast-translation-jobs'; // Default room for worker
        
        console.log(`Attempting to connect worker to room: ${roomName}`);
        await worker.connect(roomName);

        console.log(`GPU Worker is running and connected to room: ${roomName}. Waiting for translation requests...`);

        // Keep the process alive
        process.on('SIGINT', async () => {
          console.log('SIGINT received. Shutting down GPU worker...');
          if (worker.currentRoom && worker.currentRoom.state === 'connected') {
            await worker.currentRoom.disconnect();
            console.log('Worker disconnected from LiveKit room.');
          }
          process.exit(0);
        });
        process.on('SIGTERM', async () => {
          console.log('SIGTERM received. Shutting down GPU worker...');
          if (worker.currentRoom && worker.currentRoom.state === 'connected') {
            await worker.currentRoom.disconnect();
            console.log('Worker disconnected from LiveKit room.');
          }
          process.exit(0);
        });

      } catch (error) {
        console.error('Failed to start GPU Worker:', error);
        process.exit(1);
      }
    }

    main();
    ```
    *   **Note:** Assumes `.env` is one level up. Adjust `dotenv` path if needed.

---

## Phase 6: Frontend Integration (Conceptual)

**Objective:** Outline how the frontend would interact with this worker.

*   **Step 6.1: Frontend `TranslationService` (Conceptual)**
    *   The frontend would use `livekit-client`.
    *   Connect to the same room as the worker.
    *   Send `translation_request` data packets.
    *   Listen for `status_update`, `error`, and `audio_chunk` data packets.
    *   Reassemble base64 audio chunks (e.g., using `AudioContext` or a library) and play them.

    ```javascript
    // Conceptual frontend code
    // import { Room, RoomEvent, DataPacket_Kind, RemoteParticipant } from 'livekit-client';

    // async function requestTranslation(room, textToTranslate) {
    //   const request = {
    //     type: 'translation_request',
    //     requestId: `frontend-${Date.now()}`,
    //     text: textToTranslate,
    //     targetLanguage: 'Spanish',
    //     voiceId: 'YOUR_ELEVENLABS_VOICE_ID', // From your ElevenLabs account
    //     ttsModelId: 'eleven_multilingual_v2',
    //     translationModel: 'gpt-3.5-turbo'
    //   };
    //   const encoder = new TextEncoder();
    //   const payload = encoder.encode(JSON.stringify(request));
    //   await room.localParticipant.publishData(payload, DataPacket_Kind.RELIABLE);
    //   console.log('Translation request sent:', request);
    // }

    // room.on(RoomEvent.DataReceived, (payload, rp, kind, topic) => {
    //   const decoder = new TextDecoder();
    //   const message = JSON.parse(decoder.decode(payload));
    //   console.log('Frontend received data:', message);
    //   if (message.type === 'status_update') { /* ... */ }
    //   if (message.type === 'error') { /* ... */ }
    //   if (message.type === 'audio_chunk') { /* Collect and play audio */ }
    // });
    ```

---

## Phase 7: Testing and Refinement

*   **Step 7.1: Start the Worker**
    *   From your `amencast/gpu-worker` directory:
        ```bash
        node index.js
        ```
    *   Check for connection logs and any errors.

*   **Step 7.2: Simulate Frontend Request (Manual for now)**
    *   You'll need a way to send a data packet to the room the worker is in. The LiveKit CLI might not be sufficient for sending specific JSON payloads easily.
    *   The best way to test this initially would be to build a minimal HTML page with `livekit-client` to send the request.
    *   Alternatively, for very basic testing, you could temporarily modify the worker to trigger `handleTranslationRequest` itself on connection (not recommended for long).

*   **Step 7.3: Debugging**
    *   Pay close attention to logs from the worker (`console.log`, `console.error`).
    *   Check LiveKit server logs if available (e.g., if self-hosting or have access via cloud dashboard).
    *   Verify API key permissions for OpenAI and ElevenLabs.

*   **Step 7.4: Refine Audio Handling**
    *   The audio chunking via data channel is a workaround. If high-quality, low-latency audio is critical, investigate using `livekit-client` within the Node.js worker (requires environments like `node-webrtc` or headless browser) or an alternative media streaming solution.

---

This detailed plan should guide you through building the core of your GPU worker. Remember that the audio streaming part is the most complex due to server-side SDK limitations for direct media publishing. Good luck!
