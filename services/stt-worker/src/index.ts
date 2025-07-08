import { Redis, RedisOptions } from 'ioredis';
import { config } from './config';
import { AssemblyAIStreamManager } from './AssemblyAIStreamManager';

console.log('[STT-Worker] Starting up...');

// Interfaces
interface AudioChunk {
  streamId: string;
  data: string; // base64 encoded audio
  timestamp: number;
  offsetMs?: number;
}

interface TranscriptResult {
  streamId: string;
  chunkId: string;
  text: string;
  timestamp: number;
  confidence?: number;
}

// Redis clients
const redisOptions: RedisOptions = {
  host: config.redis.host,
  port: config.redis.port,
  lazyConnect: true,
};
if (config.redis.password) redisOptions.password = config.redis.password;
if (config.redis.tlsEnabled) {
  redisOptions.tls = {};
}

const subRedisClient = new Redis(redisOptions);
const pubRedisClient = new Redis(redisOptions);

// AssemblyAI manager
let assemblyAIManager: AssemblyAIStreamManager | null = null;

// Active streams tracking
const activeStreams = new Map<string, { startTime: number; chunkCount: number }>();

let isShuttingDown = false;

/**
 * Initializes Redis clients and AssemblyAI manager
 */
async function initializeClients() {
  console.log('[STT-Worker] Initializing Redis clients...');
  
  subRedisClient.on('connect', () => console.log('[STT-Worker] Subscriber Redis connected.'));
  subRedisClient.on('error', (err) => console.error('[STT-Worker] Subscriber Redis error:', err));
  pubRedisClient.on('connect', () => console.log('[STT-Worker] Publisher Redis connected.'));
  pubRedisClient.on('error', (err) => console.error('[STT-Worker] Publisher Redis error:', err));

  // Initialize AssemblyAI
  try {
    assemblyAIManager = new AssemblyAIStreamManager();
    console.log('[STT-Worker] AssemblyAI manager initialized.');
  } catch (error) {
    console.error('[STT-Worker] Failed to initialize AssemblyAI:', error);
    throw error;
  }

  // Connect Redis clients
  await Promise.all([
    subRedisClient.connect().catch(err => { 
      console.error('[STT-Worker] Failed to connect Subscriber Redis:', err); 
      throw err; 
    }),
    pubRedisClient.connect().catch(err => { 
      console.error('[STT-Worker] Failed to connect Publisher Redis:', err); 
      throw err; 
    })
  ]);
  
  console.log('[STT-Worker] All clients initialized successfully.');
}

/**
 * Handles incoming audio chunks for a stream
 */
async function handleAudioChunk(message: string, channel: string) {
  try {
    const chunk: AudioChunk = JSON.parse(message);
    const streamId = chunk.streamId;
    
    if (!activeStreams.has(streamId)) {
      console.log(`[STT-Worker] New stream detected: ${streamId}`);
      activeStreams.set(streamId, { startTime: Date.now(), chunkCount: 0 });
      
      // Start AssemblyAI stream
      if (assemblyAIManager) {
        await assemblyAIManager.startStream(
          streamId,
          // Transcript callback
          (streamId: string, transcript: string) => {
            handleTranscript(streamId, transcript);
          },
          // Completion callback
          (streamId: string, error?: Error) => {
            handleStreamCompletion(streamId, error);
          }
        );
      }
    }

    // Update chunk count
    const streamInfo = activeStreams.get(streamId)!;
    streamInfo.chunkCount++;

    // Send audio to AssemblyAI
    if (assemblyAIManager && chunk.data) {
      const audioBuffer = Buffer.from(chunk.data, 'base64');
      assemblyAIManager.sendAudio(streamId, audioBuffer);
      
      if (streamInfo.chunkCount % 10 === 0) {
        console.log(`[STT-Worker] Stream ${streamId}: Processed ${streamInfo.chunkCount} chunks`);
      }
    }

  } catch (error) {
    console.error('[STT-Worker] Error handling audio chunk:', error);
  }
}

/**
 * Handles final transcripts from AssemblyAI
 */
async function handleTranscript(streamId: string, transcript: string) {
  if (!transcript || transcript.trim() === '') {
    return; // Skip empty transcripts
  }

  console.log(`[STT-Worker] Transcript for ${streamId}: "${transcript}"`);
  
  const result: TranscriptResult = {
    streamId,
    chunkId: `${streamId}-${Date.now()}`,
    text: transcript,
    timestamp: Date.now()
  };

  // Publish to transcribed text channel
  await pubRedisClient.publish(
    `text:transcribed:${streamId}`,
    JSON.stringify(result)
  );
}

/**
 * Handles stream completion
 */
async function handleStreamCompletion(streamId: string, error?: Error) {
  console.log(`[STT-Worker] Stream ${streamId} completed${error ? ' with error' : ''}`);
  
  if (error) {
    console.error(`[STT-Worker] Stream ${streamId} error:`, error);
  }

  // Clean up
  activeStreams.delete(streamId);
  
  // Notify completion
  await pubRedisClient.publish(
    `stream:status:${streamId}`,
    JSON.stringify({
      status: error ? 'stt_error' : 'stt_complete',
      streamId,
      error: error?.message,
      timestamp: Date.now()
    })
  );
}

/**
 * Handles control messages (start, stop, etc.)
 */
async function handleControlMessage(message: string, channel: string) {
  try {
    const control = JSON.parse(message);
    const { action, streamId } = control;

    console.log(`[STT-Worker] Control message: ${action} for stream ${streamId}`);

    switch (action) {
      case 'stop':
      case 'ingestion_complete':
        // Signal end of audio to AssemblyAI
        if (assemblyAIManager && activeStreams.has(streamId)) {
          console.log(`[STT-Worker] Ending audio stream for ${streamId}`);
          await assemblyAIManager.signalAudioStreamEnd(streamId);
        }
        break;
        
      case 'force_stop':
        // Force stop the stream
        if (assemblyAIManager) {
          console.log(`[STT-Worker] Force stopping stream ${streamId}`);
          await assemblyAIManager.stopStream(streamId);
        }
        activeStreams.delete(streamId);
        break;
    }
  } catch (error) {
    console.error('[STT-Worker] Error handling control message:', error);
  }
}

/**
 * Starts listening to Redis channels
 */
async function startListening() {
  console.log('[STT-Worker] Starting to listen for audio chunks...');

  // Subscribe to audio chunks pattern (for all streams)
  await subRedisClient.psubscribe('audio:raw:*');
  
  // Subscribe to control channel
  await subRedisClient.subscribe('stream:control');

  // Handle messages
  subRedisClient.on('pmessage', async (pattern, channel, message) => {
    if (channel.startsWith('audio:raw:')) {
      await handleAudioChunk(message, channel);
    }
  });

  subRedisClient.on('message', async (channel, message) => {
    if (channel === 'stream:control') {
      await handleControlMessage(message, channel);
    }
  });

  console.log('[STT-Worker] Listening for audio streams...');
}

/**
 * Graceful shutdown handler
 */
async function shutdown() {
  if (isShuttingDown) return;
  console.log('[STT-Worker] Shutting down...');
  isShuttingDown = true;

  // Stop all active streams
  if (assemblyAIManager) {
    for (const streamId of activeStreams.keys()) {
      try {
        await assemblyAIManager.stopStream(streamId);
      } catch (error) {
        console.error(`[STT-Worker] Error stopping stream ${streamId}:`, error);
      }
    }
  }

  // Disconnect Redis
  const disconnectPromises = [];
  if (subRedisClient.status === 'ready') {
    disconnectPromises.push(subRedisClient.disconnect());
  }
  if (pubRedisClient.status === 'ready') {
    disconnectPromises.push(pubRedisClient.disconnect());
  }

  try {
    await Promise.all(disconnectPromises);
    console.log('[STT-Worker] Redis clients disconnected.');
  } catch (error) {
    console.error('[STT-Worker] Error during disconnect:', error);
  }

  console.log('[STT-Worker] Shutdown complete.');
  process.exit(0);
}

/**
 * Main entry point
 */
async function main() {
  try {
    await initializeClients();
    await startListening();
    
    // Keep the process running
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    
  } catch (error) {
    console.error('[STT-Worker] Critical error:', error);
    process.exit(1);
  }
}

// Start the worker
main();