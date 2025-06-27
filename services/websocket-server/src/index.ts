import express from 'express';
import http from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { Redis, RedisOptions } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { config } from './config';
import axios from 'axios';

const app = express();
const server = http.createServer(app);

// Basic CORS setup - adjust as needed for your frontend URL in production
const io = new SocketIOServer(server, {
  cors: {
    origin: "*", // Allows all origins for local dev. Be more specific in production!
    methods: ["GET", "POST"]
  }
});

// Construct Redis options
const redisOptions: RedisOptions = {
  host: config.redis.host,
  port: config.redis.port,
  username: 'default',
  lazyConnect: true,
};

if (config.redis.password) {
  redisOptions.password = config.redis.password;
}

if (config.redis.tlsEnabled) {
  redisOptions.tls = {}; 
}

// Initialize Redis clients with the options object
const publisherRedis = new Redis(redisOptions);
const subscriberRedis = new Redis(redisOptions); // Dedicated client for blocking BRPOP
const audioSubscriberRedis = new Redis(redisOptions); // New client for Pub/Sub

console.log('[WebSocketServer] Initializing Redis clients...');

publisherRedis.on('connect', () => console.log('[WebSocketServer] Publisher Redis connected.'));
publisherRedis.on('error', (err) => console.error('[WebSocketServer] Publisher Redis error:', err));

subscriberRedis.on('connect', () => console.log('[WebSocketServer] Subscriber Redis connected (for results).'));
subscriberRedis.on('error', (err) => console.error('[WebSocketServer] Subscriber Redis error (for results):', err));

audioSubscriberRedis.on('connect', () => console.log('[WebSocketServer] Audio Subscriber Redis connected.'));
audioSubscriberRedis.on('error', (err) => console.error('[WebSocketServer] Audio Subscriber Redis error:', err));

// In-memory stores for simplicity in local development.
// For production, consider a shared store like Redis if scaling to multiple server instances.
const clientRequestToSocketIdMap = new Map<string, string>();
const streamIdToClientRequestMap = new Map<string, string>();

console.log('[WebSocketServer] Starting server setup...');

// At the top of your file or a config section
const SAMPLE_RATE = 16000;
const BYTES_PER_SAMPLE = 2; // 16-bit
const CHANNELS = 1;
const CHUNK_DURATION_SECONDS = 1.5;
const OVERLAP_DURATION_SECONDS = 0.5;

const BYTES_PER_SECOND = SAMPLE_RATE * BYTES_PER_SAMPLE * CHANNELS;
const CHUNK_SIZE_BYTES = Math.floor(BYTES_PER_SECOND * CHUNK_DURATION_SECONDS); // 48000
const OVERLAP_BYTES = Math.floor(BYTES_PER_SECOND * OVERLAP_DURATION_SECONDS);   // 16000
const STRIDE_BYTES = CHUNK_SIZE_BYTES - OVERLAP_BYTES;                         // 32000 (1 second of new audio)

/**
 * Extracts the YouTube video ID from a given YouTube URL.
 *
 * Supports standard YouTube URLs (youtube.com) and shortened URLs (youtu.be). Returns null if the URL is invalid or does not contain a video ID.
 *
 * @param url - The YouTube URL to parse.
 * @returns The extracted video ID, or null if extraction fails.
 */
function extractYouTubeVideoId(url: string): string | null {
  let videoId: string | null = null;
  try {
    const urlObj = new URL(url);
    if (urlObj.hostname === 'www.youtube.com' || urlObj.hostname === 'youtube.com') {
      if (urlObj.pathname.startsWith('/shorts/')) {
        videoId = urlObj.pathname.substring('/shorts/'.length);
      } else {
        videoId = urlObj.searchParams.get('v');
      }
    } else if (urlObj.hostname === 'youtu.be') {
      videoId = urlObj.pathname.slice(1);
    }
  } catch (error) {
    console.error('[WebSocketServer] Error parsing YouTube URL:', url, error);
    return null;
  }
  if (videoId && videoId.includes('?')) {
    videoId = videoId.substring(0, videoId.indexOf('?'));
  }
  return videoId;
}

/**
 * Continuously polls the Redis results queue for completed translation jobs and relays results to the appropriate connected client sockets.
 *
 * @remark
 * If the Redis connection is lost, the function attempts to reconnect and resumes polling. Malformed or invalid job results are skipped without interrupting the listener.
 */
async function listenForResults() {
  console.log(`[WebSocketServer] Results listener starting. Polling Redis queue: ${config.redis.resultsQueueName}`);
  try {
    // Ensure subscriberRedis is connected before starting the loop if it was lazy
    if (subscriberRedis.status !== 'ready') {
        await subscriberRedis.connect();
    }
    while (true) { // Keep polling indefinitely
      try {
        const result = await subscriberRedis.brpop(config.redis.resultsQueueName, 0); // 0 = block indefinitely
        if (result) {
          const jobResultString = result[1];
          console.log(`[WebSocketServer] Received result from queue ${result[0]}: ${jobResultString.substring(0, 300)}...`);
          
          let jobResult: any;
          try {
            jobResult = JSON.parse(jobResultString);
          } catch (parseError) {
            console.error('[WebSocketServer] Failed to parse result JSON from queue:', jobResultString, parseError);
            continue; // Skip this malformed result
          }

          if (!jobResult || !jobResult.streamId) {
            console.error('[WebSocketServer] Invalid job result format (missing streamId):', jobResult);
            continue; // Skip invalid result
          }

          const streamId = jobResult.streamId;
          const clientRequestId = streamIdToClientRequestMap.get(streamId);

          if (clientRequestId) {
            const socketId = clientRequestToSocketIdMap.get(clientRequestId);
            if (socketId) {
              const targetSocket = io.sockets.sockets.get(socketId);
              if (targetSocket) {
                if (jobResult.status === 'success') {
                  targetSocket.emit('translation_result', jobResult);
                  console.log(`[WebSocketServer] Relayed 'translation_result' to socket ${socketId} for streamId ${streamId}`);
                } else {
                  targetSocket.emit('translation_error', jobResult); // Send a more specific error event
                  console.log(`[WebSocketServer] Relayed 'translation_error' to socket ${socketId} for streamId ${streamId}`);
                }
              } else {
                console.warn(`[WebSocketServer] Socket ${socketId} for streamId ${streamId} (clientRequestId ${clientRequestId}) no longer connected. Result not sent.`);
              }
            } else {
              console.warn(`[WebSocketServer] No socketId found for clientRequestId ${clientRequestId} (streamId ${streamId}). Result not sent.`);
            }
            // Clean up maps for this completed/attempted job
            streamIdToClientRequestMap.delete(streamId);
            clientRequestToSocketIdMap.delete(clientRequestId); // Client request is now fully processed or errored
          } else {
            console.warn(`[WebSocketServer] No clientRequestId found for streamId ${streamId}. Result not sent or already processed/cleaned up.`);
          }
        }
      } catch (error: any) {
        if (error.message.includes('Connection is closed')) {
            console.log('[WebSocketServer] Results Redis connection closed. Attempting to reconnect and restart polling...');
            try {
                if (subscriberRedis.status !== 'ready') await subscriberRedis.connect();
                console.log('[WebSocketServer] Results Redis reconnected. Resuming polling.');
            } catch (reconnectError) {
                console.error('[WebSocketServer] Failed to reconnect Results Redis. Waiting before retry...', reconnectError);
                await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5s before retrying loop
            }
        } else {
            console.error('[WebSocketServer] Error during BRPOP on results queue:', error);
            await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5s before retrying loop
        }
      }
    }
  } catch (initialConnectError) {
    console.error('[WebSocketServer] CRITICAL: Failed to connect subscriberRedis for results listener. Results will not be processed.', initialConnectError);
    // Potentially try to restart this listener after a delay
  }
}

/**
 * Listens for real-time translated audio chunks on Redis Pub/Sub and relays them to the correct client.
 */
async function listenForTranslatedAudio() {
    console.log(`[WebSocketServer] Translated audio listener starting. Subscribing to 'translated_audio:*'...`);
    try {
        if (audioSubscriberRedis.status !== 'ready') {
            await audioSubscriberRedis.connect();
        }
        await audioSubscriberRedis.psubscribe('translated_audio:*');

        audioSubscriberRedis.on('pmessageBuffer', (pattern, channelBuffer, messageBuffer) => {
            const channel = channelBuffer.toString();
            const streamId = channel.split(':')[1];
            
            if (!streamId) return;

            const clientRequestId = streamIdToClientRequestMap.get(streamId);
            if (!clientRequestId) {
                // This can happen if the client disconnected. It's not necessarily an error.
                // console.warn(`[WebSocketServer] No clientRequestId found for streamId ${streamId} in audio relay.`);
                return;
            }

            const socketId = clientRequestToSocketIdMap.get(clientRequestId);
            if (socketId) {
                const targetSocket = io.sockets.sockets.get(socketId);
                if (targetSocket) {
                    targetSocket.emit('translated_audio_chunk', messageBuffer);
                    // This log can be very noisy, disable it unless debugging.
                    // console.log(`[WebSocketServer] Relayed audio chunk (${messageBuffer.length} bytes) to socket ${socketId} for streamId ${streamId}`);
                }
            }
        });
    } catch (error) {
        console.error('[WebSocketServer] CRITICAL: Failed to subscribe for translated audio. Real-time audio will not be relayed.', error);
    }
}

// Renamed route and prepared for new logic
app.post('/internal/audio-stream/:streamId', (req: express.Request, res: express.Response) => {
  const streamId = req.params.streamId;
  console.log(`[WebSocketServer] /internal/audio-stream/${streamId}: Connection received for real-time processing.`);

  let masterBuffer = Buffer.alloc(0); // Buffer to accumulate all incoming audio data
  let totalBytesProcessedForChunks = 0;

  req.on('data', (chunk: Buffer) => {
    masterBuffer = Buffer.concat([masterBuffer, chunk]);
    console.log(`[WebSocketServer] /internal/audio-stream/${streamId}: Received chunk: ${chunk.length} bytes. Master buffer size: ${masterBuffer.length}`);

    // Process as many full strides as possible from the masterBuffer
    while (masterBuffer.length >= totalBytesProcessedForChunks + CHUNK_SIZE_BYTES) {
      // We need enough data in masterBuffer that starts from where we last processed (totalBytesProcessedForChunks)
      // and extends for a full CHUNK_SIZE_BYTES.
      // The starting point for our next chunk is totalBytesProcessedForChunks.
      const chunkToPublish = masterBuffer.subarray(
        totalBytesProcessedForChunks,
        totalBytesProcessedForChunks + CHUNK_SIZE_BYTES
      );

      if (chunkToPublish.length === CHUNK_SIZE_BYTES) {
        // TODO: Publish chunkToPublish to Redis Pub/Sub: audio_chunks:<streamId>
        publisherRedis.publish(`audio_chunks:${streamId}`, chunkToPublish)
          .then(() => {
            console.log(`[WebSocketServer] /internal/audio-stream/${streamId}: Published ${chunkToPublish.length}B chunk. Offset: ${totalBytesProcessedForChunks / BYTES_PER_SECOND}s`);
          })
          .catch(err => {
            console.error(`[WebSocketServer] /internal/audio-stream/${streamId}: Error publishing chunk to Redis:`, err);
          });
        
        totalBytesProcessedForChunks += STRIDE_BYTES; // Advance by one stride
      } else {
        // This should ideally not happen if logic is correct and CHUNK_SIZE_BYTES is a multiple of sample frame size
        console.warn(`[WebSocketServer] /internal/audio-stream/${streamId}: Tried to publish a partial chunk of size ${chunkToPublish.length}B. This indicates an issue.`);
        break; // Avoid infinite loop on partial chunk
      }
    }
  });

  req.on('end', () => {
    console.log(`[WebSocketServer] /internal/audio-stream/${streamId}: Incoming stream ended. Master buffer size: ${masterBuffer.length}`);
    // Process any remaining data in masterBuffer that might form a final partial or full chunk
    // This part needs careful handling for the very last chunk if it's smaller than CHUNK_SIZE_BYTES
    // For now, our loop handles full chunks. A final partial chunk might be padded or handled differently.
    // Current logic will only process full chunks. If masterBuffer.length < totalBytesProcessedForChunks + CHUNK_SIZE_BYTES
    // but masterBuffer.length > totalBytesProcessedForChunks, this remaining part is not processed into a chunk.

    // Consider if the last segment needs padding to CHUNK_SIZE_BYTES or special handling.
    // For simplicity in this step, we only publish full 1.5s chunks.
    // A more advanced version might pad the last chunk or send it as-is with its actual length.

    // Clean up any remaining part of the buffer that wasn't processed into full strides
    if (totalBytesProcessedForChunks > 0 && masterBuffer.length > totalBytesProcessedForChunks) {
        masterBuffer = masterBuffer.subarray(totalBytesProcessedForChunks);
    } else if (totalBytesProcessedForChunks === 0) {
        // masterBuffer might still contain data if no full chunk was ever formed
    } else {
        masterBuffer = Buffer.alloc(0); // All processed
    }
    console.log(`[WebSocketServer] /internal/audio-stream/${streamId}: Remaining in masterBuffer after stream end: ${masterBuffer.length} bytes.`);


    res.status(200).send('Audio stream processing finished.');
  });

  req.on('error', (err) => {
    console.error(`[WebSocketServer] /internal/audio-stream/${streamId}: Error on request stream:`, err);
    if (!res.headersSent) {
      res.status(500).send('Error receiving stream.');
    }
  });

  req.on('close', () => {
    console.log(`[WebSocketServer] /internal/audio-stream/${streamId}: Connection closed by client.`);
    // Perform any necessary cleanup for this streamId if the connection drops prematurely
  });
});

io.on('connection', (socket: Socket) => {
  console.log(`[WebSocketServer] Client connected: ${socket.id}`);

  socket.on('initiate_youtube_translation', async (data: { 
    youtubeUrl: string; 
    targetLanguage: string; 
    clientRequestId: string; 
    streamId: string;
    format?: string;
  }) => {
    console.log(`[WebSocketServer] Received 'initiate_youtube_translation' from ${socket.id}:`, data);

    if (!data || !data.youtubeUrl || !data.targetLanguage || !data.clientRequestId || !data.streamId) {
      console.error('[WebSocketServer] Invalid data received for initiate_youtube_translation:', data);
      socket.emit('request_error', { 
        clientRequestId: data?.clientRequestId, 
        streamId: data?.streamId,
        message: 'Invalid request data. Ensure youtubeUrl, targetLanguage, clientRequestId, and streamId are provided.' 
      });
      return;
    }

    const streamIdFromClient = data.streamId;

    clientRequestToSocketIdMap.set(data.clientRequestId, socket.id);
    streamIdToClientRequestMap.set(streamIdFromClient, data.clientRequestId);

    const youtubeVideoId = extractYouTubeVideoId(data.youtubeUrl);
    if (!youtubeVideoId) {
      console.error('[WebSocketServer] Could not extract YouTube Video ID from URL:', data.youtubeUrl);
      socket.emit('request_error', { 
        clientRequestId: data.clientRequestId, 
        streamId: streamIdFromClient,
        message: 'Invalid YouTube URL or could not extract Video ID.' 
      });
      clientRequestToSocketIdMap.delete(data.clientRequestId);
      streamIdToClientRequestMap.delete(streamIdFromClient);
      return;
    }

    try {
      // --- START: New logic for Phase 3 ---
      // Publish a "start" command to the control channel for the gpu-worker
      const controlCommand = {
        action: 'start',
        streamId: streamIdFromClient,
        targetLanguage: data.targetLanguage,
      };
      await publisherRedis.publish('stream_control', JSON.stringify(controlCommand));
      console.log(`[WebSocketServer] Published START command for stream ${streamIdFromClient} to stream_control channel.`);
      // --- END: New logic for Phase 3 ---

      const ingestionWorkerHost = process.env.INGESTION_WORKER_INTERNAL_HOST || 'localhost'; // Use env vars for config
      const ingestionWorkerPort = process.env.INGESTION_WORKER_INTERNAL_PORT || 3002;
      const ingestionEndpoint = `http://${ingestionWorkerHost}:${ingestionWorkerPort}/initiate-stream-processing`;

      console.log(`[WebSocketServer] Calling ingestion-worker endpoint for streamId ${streamIdFromClient}: ${ingestionEndpoint}`);

      // Using axios for the POST request:
      const response = await axios.post(ingestionEndpoint, {
        youtubeUrl: data.youtubeUrl, // Send the full URL
        streamId: streamIdFromClient
      });

      if (response.status === 202) {
        console.log(`[WebSocketServer] Successfully initiated stream processing with ingestion-worker for streamId ${streamIdFromClient}. Response:`, response.data);
        socket.emit('request_processing', { // Or a new event like 'realtime_stream_initiated'
          clientRequestId: data.clientRequestId,
          streamId: streamIdFromClient,
          message: 'Real-time stream processing initiated.'
        });
      } else {
        // This case might not be hit if axios throws for non-2xx, but good for robustness
        console.error(`[WebSocketServer] ingestion-worker responded with status ${response.status} for streamId ${streamIdFromClient}. Data:`, response.data);
        socket.emit('request_error', {
          clientRequestId: data.clientRequestId,
          streamId: streamIdFromClient,
          message: `Failed to initiate stream processing with ingestion-worker (status ${response.status}).`
        });
      }
    } catch (error: any) {
      console.error(`[WebSocketServer] Error calling ingestion-worker for streamId ${streamIdFromClient}:`, error.message);
      let detailMessage = 'Server error: Could not contact ingestion service.';
      if (axios.isAxiosError(error) && error.response) {
          console.error('[WebSocketServer] Ingestion-worker error response data:', error.response.data);
          detailMessage = `Ingestion service error (status ${error.response.status}): ${error.response.data?.error || error.message}`;
      } else if (axios.isAxiosError(error) && error.request) {
          console.error('[WebSocketServer] Ingestion-worker no response:', error.request);
          detailMessage = 'No response from ingestion service.';
      }
      socket.emit('request_error', {
        clientRequestId: data.clientRequestId,
        streamId: streamIdFromClient,
        message: detailMessage
      });
      // Consider if you need to clean up maps if the initiation fails here
      clientRequestToSocketIdMap.delete(data.clientRequestId);
      streamIdToClientRequestMap.delete(streamIdFromClient);
    }
  });

  socket.on('disconnect', () => {
    console.log(`[WebSocketServer] Client disconnected: ${socket.id}`);
    let associatedClientRequestId: string | null = null;
    for (const [clientRequestId, socketIdStored] of clientRequestToSocketIdMap.entries()) {
      if (socketIdStored === socket.id) {
        associatedClientRequestId = clientRequestId;
        clientRequestToSocketIdMap.delete(clientRequestId);
        console.log(`[WebSocketServer] Cleaned up clientRequestToSocketIdMap for disconnected socket: ${socket.id} (clientRequestId: ${clientRequestId})`);
        break; 
      }
    }
    if (associatedClientRequestId) {
        for (const [streamId, clientRequestIdMapped] of streamIdToClientRequestMap.entries()) {
            if (clientRequestIdMapped === associatedClientRequestId) {
                console.log(`[WebSocketServer] Note: Client ${associatedClientRequestId} for stream ${streamId} disconnected. Results for this stream might not be delivered if they haven't been already.`);
            }
        }
    }
  });
});

// Connect Redis clients explicitly if lazyConnect is true
Promise.all([
  publisherRedis.connect().catch(err => {
    console.error('[WebSocketServer] Failed to connect publisher Redis:', err);
    return Promise.reject(err); // Ensure outer Promise.all fails
  }),
  // Do not connect subscriberRedis here if it's explicitly connected in listenForResults
  // It's better to connect it just before its blocking loop starts.
  audioSubscriberRedis.connect().catch(err => {
    console.error('[WebSocketServer] Failed to connect audioSubscriberRedis:', err);
    // This might not be critical to stop the server, but real-time audio won't work.
  })
]).then(() => {
  server.listen(config.port, () => {
    console.log(`[WebSocketServer] Express server with Socket.IO listening on http://localhost:${config.port}`);
    listenForResults(); // Start the results listener after server starts and publisher is connected
    listenForTranslatedAudio(); // Start the real-time audio listener
  });
}).catch(err => {
  console.error('[WebSocketServer] Critical error during publisher Redis connection or server start. Server not started.', err);
}); 