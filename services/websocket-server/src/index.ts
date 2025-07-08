import express from 'express';
import http from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { Redis, RedisOptions } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { config } from './config';
import axios from 'axios';

const app = express();
const server = http.createServer(app);

// Add a health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', uptime: process.uptime() });
});

const allowedOrigins = [
  "http://localhost:3000",
  "https://amencast.tech",
  /https:\/\/.+\.proxy\.runpod\.net/,
];

const io = new SocketIOServer(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.some(o => typeof o === 'string' ? o === origin : o.test(origin))) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
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
const audioSubscriberRedis = new Redis(redisOptions); // Dedicated client for blocking BRPOP

console.log('[WebSocketServer] Initializing Redis clients...');

publisherRedis.on('connect', () => console.log('[WebSocketServer] Publisher Redis connected.'));
publisherRedis.on('error', (err) => console.error('[WebSocketServer] Publisher Redis error:', err));

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
  const resultSubscriber = new Redis(redisOptions);
  try {
    await resultSubscriber.connect();
    console.log('[WebSocketServer] Results Redis connected. Resuming polling.');
    
    while (true) { 
      try {
        const result = await resultSubscriber.brpop(config.redis.resultsQueueName, 0); 
        if (result) {
          const jobResultString = result[1];
          console.log(`[WebSocketServer] Received result from queue ${result[0]}: ${jobResultString.substring(0, 300)}...`);
          
          let jobResult: any;
          try {
            jobResult = JSON.parse(jobResultString);
          } catch (parseError) {
            console.error('[WebSocketServer] Failed to parse result JSON from queue:', jobResultString, parseError);
            continue; 
          }

          if (!jobResult || !jobResult.streamId) {
            console.error('[WebSocketServer] Invalid job result format (missing streamId):', jobResult);
            continue;
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
                  targetSocket.emit('translation_error', jobResult); 
                  console.log(`[WebSocketServer] Relayed 'translation_error' to socket ${socketId} for streamId ${streamId}`);
                }
              } else {
                console.warn(`[WebSocketServer] Socket ${socketId} for streamId ${streamId} (clientRequestId ${clientRequestId}) no longer connected.`);
              }
            } else {
              console.warn(`[WebSocketServer] No socketId found for clientRequestId ${clientRequestId} (streamId ${streamId}).`);
            }
            streamIdToClientRequestMap.delete(streamId);
            clientRequestToSocketIdMap.delete(clientRequestId); 
          } else {
            console.warn(`[WebSocketServer] No clientRequestId found for streamId ${streamId}.`);
          }
        }
      } catch (error: any) {
        if (error.message.includes('Connection is closed')) {
            console.log('[WebSocketServer] Results Redis connection closed. Attempting to reconnect...');
            try {
                await resultSubscriber.connect();
                console.log('[WebSocketServer] Results Redis reconnected.');
            } catch (reconnectError) {
                console.error('[WebSocketServer] Failed to reconnect Results Redis. Waiting before retry...', reconnectError);
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        } else {
            console.error('[WebSocketServer] Error during BRPOP on results queue:', error);
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }
    }
  } catch (initialConnectError) {
    console.error('[WebSocketServer] CRITICAL: Failed to connect results listener.', initialConnectError);
  }
}

// Renamed route and prepared for new logic
app.post('/internal/audio-stream/:streamId', (req: express.Request, res: express.Response) => {
  const streamId = req.params.streamId;
  console.log(`[WebSocketServer] /internal/audio-stream/${streamId}: Connection received for real-time processing.`);

  let masterBuffer = Buffer.alloc(0);
  let totalBytesProcessedForChunks = 0;
  let currentOffsetMs = 0; // Start at 0 milliseconds

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
        publisherRedis.publish(`audio:raw:${streamId}`, chunkToPublish)
          .then(() => {
            const offsetSeconds = (currentOffsetMs / 1000).toFixed(1);
            console.log(`[WebSocketServer] /internal/audio-stream/${streamId}: Published ${chunkToPublish.length}B chunk. Offset: ${offsetSeconds}s`);
            currentOffsetMs += (STRIDE_BYTES / BYTES_PER_SECOND) * 1000;
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
    
    // Current logic will only process full chunks. If masterBuffer.length < totalBytesProcessedForChunks + CHUNK_SIZE_BYTES
    // but masterBuffer.length > totalBytesProcessedForChunks, this remaining part is not processed into a chunk.
    const remainingBuffer = masterBuffer.subarray(totalBytesProcessedForChunks);
    if (remainingBuffer.length > 0) {
      console.log(`[WebSocketServer] /internal/audio-stream/${streamId}: Processing final remaining buffer of ${remainingBuffer.length} bytes.`);
      
      const finalChunk = Buffer.alloc(CHUNK_SIZE_BYTES, 0); // Create a buffer of the required size, filled with silence
      remainingBuffer.copy(finalChunk); // Copy the remaining audio data into the start of it

      publisherRedis.publish(`audio:raw:${streamId}`, finalChunk)
        .then(() => {
          const offsetSeconds = (currentOffsetMs / 1000).toFixed(1);
          console.log(`[WebSocketServer] /internal/audio-stream/${streamId}: Published FINAL padded chunk of ${finalChunk.length}B. Offset: ${offsetSeconds}s`);
        })
        .catch(err => {
          console.error(`[WebSocketServer] /internal/audio-stream/${streamId}: Error publishing FINAL chunk to Redis:`, err);
        });
    }

    // The logic to send the STOP command was here, but has been moved to the client 'disconnect' event handler.
    // This ensures the stream is only stopped when the user navigates away or closes the page.

    res.status(200).send('Audio stream processing finished.');
  });

  req.on('error', (err) => {
    console.error(`[WebSocketServer] /internal/audio-stream/${streamId}: Error on request stream:`, err);
    if (!res.headersSent) {
      res.status(500).send('Error receiving stream.');
    }
  });

  req.on('close', () => {
    console.log(`[WebSocketServer] /internal/audio-stream/${streamId}: Connection closed by client (ingestion-worker).`);
    // This is a critical event. The ingestion has stopped, so we must stop the downstream services.
    const ingestionCompleteCommand = {
        action: 'ingestion_complete',
        streamId: streamId,
    };
    publisherRedis.publish('stream:control', JSON.stringify(ingestionCompleteCommand))
        .then(() => console.log(`[WebSocketServer] Published INGESTION_COMPLETE command for stream ${streamId} due to ingestion client disconnect.`))
        .catch(err => console.error(`[WebSocketServer] Error publishing INGESTION_COMPLETE command for stream ${streamId} after client disconnect:`, err));
  });
});

io.on('connection', (socket: Socket) => {
  console.log(`[WebSocketServer] Client connected: ${socket.id}`);

  // New handler for clients to join a specific audio stream
  socket.on('join-audio-stream', async (streamId: string) => {
    console.log(`[WebSocketServer] Client ${socket.id} joining audio stream room: audio-${streamId}`);
    socket.join(`audio-${streamId}`);

    // Each client gets its own subscriber to avoid conflicts
    const audioSubscriber = new Redis(redisOptions);
    await audioSubscriber.connect();
    
    const audioChannel = `audio:synthesized:${streamId}`;
    const statusChannel = `stream:status:${streamId}`;

    audioSubscriber.subscribe(audioChannel, statusChannel, (err, count) => {
        if (err) {
            console.error(`[WebSocketServer] Failed to subscribe to Redis channels for stream ${streamId}`, err);
            socket.emit('request_error', { streamId, message: 'Failed to subscribe to audio stream.'});
            return;
        }
        console.log(`[WebSocketServer] Socket ${socket.id} successfully subscribed to channels for stream ${streamId}`);
    });

    audioSubscriber.on('messageBuffer', (channelBuffer, messageBuffer) => {
        const channel = channelBuffer.toString();
        if (channel === audioChannel) {
            io.to(`audio-${streamId}`).emit('audio_chunk', { streamId, audioData: messageBuffer });
        }
    });
    
    audioSubscriber.on('message', (channel, message) => {
        const channelStr = channel.toString();
        if(channelStr === statusChannel) {
            try {
                const { status } = JSON.parse(message);
                if (status === 'completed') {
                    io.to(`audio-${streamId}`).emit('translation_completed', { streamId });
                    console.log(`[WebSocketServer] Relayed 'translation_completed' to room audio-${streamId}`);
                }
            } catch (e) {
                console.error(`[WebSocketServer] Error parsing status message for stream ${streamId}:`, message);
            }
        }
    });

    socket.on('leave-audio-stream', () => {
        console.log(`[WebSocketServer] Client ${socket.id} leaving audio stream room: audio-${streamId}`);
        socket.leave(`audio-${streamId}`);
        audioSubscriber.unsubscribe();
        audioSubscriber.quit();
    });

    socket.on('disconnect', () => {
        console.log(`[WebSocketServer] Client ${socket.id} disconnected, cleaning up audio stream subscriptions for stream ${streamId}`);
        audioSubscriber.unsubscribe();
        audioSubscriber.quit();
    });
  });

  socket.on('initiate_youtube_translation', async (data: { 
    youtubeUrl: string; 
    targetLanguage: string; 
    clientRequestId: string; 
    streamId: string;
    format?: string;
  }) => {
    console.log(`[WebSocketServer] Received 'initiate_youtube_translation' from ${socket.id}:`, data);

    if (!data || !data.youtubeUrl || !data.targetLanguage || !data.clientRequestId || !data.streamId) {
      socket.emit('request_error', { message: 'Invalid request data.' });
      return;
    }

    const streamIdFromClient = data.streamId;
    clientRequestToSocketIdMap.set(data.clientRequestId, socket.id);
    streamIdToClientRequestMap.set(streamIdFromClient, data.clientRequestId);

    const youtubeVideoId = extractYouTubeVideoId(data.youtubeUrl);
    if (!youtubeVideoId) {
      socket.emit('request_error', { message: 'Invalid YouTube URL.' });
      return;
    }

    try {
      const controlCommand = {
        action: 'start',
        streamId: streamIdFromClient,
        targetLanguage: data.targetLanguage,
      };
      await publisherRedis.publish('stream:control', JSON.stringify(controlCommand));
      console.log(`[WebSocketServer] Published START command for stream ${streamIdFromClient}`);
      
      const ingestionWorkerUrl = process.env.INGESTION_WORKER_URL;
      if (!ingestionWorkerUrl) {
        throw new Error("INGESTION_WORKER_URL is not set.");
      }

      console.log(`[WebSocketServer] Calling ingestion-worker: ${ingestionWorkerUrl}`);
      const response = await axios.post(`${ingestionWorkerUrl}/initiate-stream-processing`, {
        youtubeUrl: data.youtubeUrl,
        streamId: streamIdFromClient
      });

      if (response.status === 202) {
        console.log(`[WebSocketServer] Successfully initiated stream with ingestion-worker for streamId ${streamIdFromClient}.`);
        socket.emit('request_processing', { streamId: streamIdFromClient });
      } else {
        throw new Error(`Ingestion service returned status ${response.status}`);
      }
    } catch (error: any) {
      console.error(`[WebSocketServer] Error initiating translation for streamId ${streamIdFromClient}:`, error.message);
      socket.emit('request_error', { message: 'Failed to start translation pipeline.' });
    }
  });

  socket.on('disconnect', () => {
    console.log(`[WebSocketServer] Client disconnected: ${socket.id}`);
    
    let clientRequestIdToDelete: string | null = null;
    let streamIdToStop: string | null = null;

    // Find the client request ID for the disconnected socket
    for (const [key, value] of clientRequestToSocketIdMap.entries()) {
        if (value === socket.id) {
            clientRequestIdToDelete = key;
            break;
        }
    }

    if (clientRequestIdToDelete) {
        // Find the stream ID associated with that client request ID
        for (const [key, value] of streamIdToClientRequestMap.entries()) {
            if (value === clientRequestIdToDelete) {
                streamIdToStop = key;
                break;
            }
        }
        
        // Clean up the maps
        clientRequestToSocketIdMap.delete(clientRequestIdToDelete);
        if (streamIdToStop) {
            streamIdToClientRequestMap.delete(streamIdToStop);
        }
        console.log(`[WebSocketServer] Cleaned up maps for disconnected client: ${clientRequestIdToDelete}`);
    }

    // If we found a stream to stop, publish the command
    if (streamIdToStop) {
        const stopCommand = {
            action: 'stop',
            streamId: streamIdToStop,
        };
        publisherRedis.publish('stream:control', JSON.stringify(stopCommand))
            .then(() => console.log(`[WebSocketServer] Published STOP command for stream ${streamIdToStop} due to client disconnect.`))
            .catch(err => console.error(`[WebSocketServer] Error publishing STOP command for stream ${streamIdToStop}:`, err));
    }
  });
});

async function startServer() {
  try {
    await Promise.all([
      publisherRedis.connect(),
      audioSubscriberRedis.connect(),
    ]);
    console.log('[WebSocketServer] All necessary Redis clients connected.');

    server.listen(config.port, () => {
      console.log(`[WebSocketServer] Express server with Socket.IO listening on http://localhost:${config.port}`);
    });

  } catch (err) {
    console.error('[WebSocketServer] Critical error during Redis connection or server start. Server not started.', err);
    process.exit(1);
  }
}

startServer(); 