import { Redis, RedisOptions } from 'ioredis';
import { config } from './config';
import { ElevenLabsClient } from 'elevenlabs';

console.log('[TTS-Worker] Starting up...');

// Interfaces
interface TranslationMessage {
  streamId: string;
  chunkId: string;
  sourceText: string;
  translatedText: string;
  timestamp: number;
  languageTarget: string;
}

interface AudioResult {
  streamId: string;
  chunkId: string;
  audioData: string; // base64 encoded audio
  timestamp: number;
  duration?: number;
}

interface StreamState {
  streamId: string;
  languageTarget: string;
  voiceId: string;
  chunkCount: number;
  startTime: number;
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

// ElevenLabs client
let elevenlabs: ElevenLabsClient | null = null;

// Active streams tracking
const activeStreams = new Map<string, StreamState>();

// Default voice ID
const DEFAULT_VOICE_ID = 'JBFqnCBsd6RMkjVDRZzb';

// Voice mapping for different languages
const VOICE_MAP: Record<string, string> = {
  'es': config.elevenlabs.voiceIdSpanish || config.elevenlabs.voiceId || DEFAULT_VOICE_ID,
  'it': config.elevenlabs.voiceIdItalian || config.elevenlabs.voiceId || DEFAULT_VOICE_ID,
  'de': config.elevenlabs.voiceIdGerman || config.elevenlabs.voiceId || DEFAULT_VOICE_ID,
  'default': config.elevenlabs.voiceId || DEFAULT_VOICE_ID
};

// Helper function to get voice ID safely
function getVoiceId(language: string): string {
  const voiceId = VOICE_MAP[language];
  return voiceId || VOICE_MAP['default'] || DEFAULT_VOICE_ID;
}

let isShuttingDown = false;

/**
 * Initializes Redis clients and ElevenLabs
 */
async function initializeClients() {
  console.log('[TTS-Worker] Initializing clients...');
  
  subRedisClient.on('connect', () => console.log('[TTS-Worker] Subscriber Redis connected.'));
  subRedisClient.on('error', (err) => console.error('[TTS-Worker] Subscriber Redis error:', err));
  pubRedisClient.on('connect', () => console.log('[TTS-Worker] Publisher Redis connected.'));
  pubRedisClient.on('error', (err) => console.error('[TTS-Worker] Publisher Redis error:', err));

  // Initialize ElevenLabs
  if (config.elevenlabs.apiKey) {
    elevenlabs = new ElevenLabsClient({
      apiKey: config.elevenlabs.apiKey,
    });
    console.log('[TTS-Worker] ElevenLabs client initialized.');
  } else {
    throw new Error('ElevenLabs API key is required');
  }

  // Connect Redis clients
  await Promise.all([
    subRedisClient.connect().catch(err => { 
      console.error('[TTS-Worker] Failed to connect Subscriber Redis:', err); 
      throw err; 
    }),
    pubRedisClient.connect().catch(err => { 
      console.error('[TTS-Worker] Failed to connect Publisher Redis:', err); 
      throw err; 
    })
  ]);
  
  console.log('[TTS-Worker] All clients initialized successfully.');
}

/**
 * Handles incoming translations for TTS synthesis
 */
async function handleTranslation(message: string, _channel: string) {
  try {
    const translation: TranslationMessage = JSON.parse(message);
    const { streamId, translatedText, languageTarget } = translation;
    
    // Skip empty translations
    if (!translatedText || translatedText.trim() === '') {
      return;
    }
    
    // Get or create stream state
    let streamState = activeStreams.get(streamId);
    if (!streamState) {
      streamState = {
        streamId,
        languageTarget,
        voiceId: getVoiceId(languageTarget),
        chunkCount: 0,
        startTime: Date.now()
      };
      activeStreams.set(streamId, streamState);
      console.log(`[TTS-Worker] New stream ${streamId} with voice ${streamState.voiceId} for ${languageTarget}`);
    }
    
    // Synthesize speech
    const audioData = await synthesizeSpeech(translatedText, streamState);
    
    if (audioData) {
      streamState.chunkCount++;
      
      // Publish audio result
      const result: AudioResult = {
        streamId,
        chunkId: translation.chunkId,
        audioData,
        timestamp: Date.now()
      };
      
      await pubRedisClient.publish(
        `audio:synthesized:${streamId}`,
        JSON.stringify(result)
      );
      
      if (streamState.chunkCount % 10 === 0) {
        console.log(`[TTS-Worker] Stream ${streamId}: Synthesized ${streamState.chunkCount} chunks`);
      }
    }
    
  } catch (error) {
    console.error('[TTS-Worker] Error handling translation:', error);
  }
}

/**
 * Synthesizes speech using ElevenLabs
 */
async function synthesizeSpeech(text: string, streamState: StreamState): Promise<string | null> {
  if (!elevenlabs) return null;
  
  try {
    // Use streaming API for lower latency
    const audioStream = await elevenlabs.textToSpeech.convertAsStream(streamState.voiceId, {
      text: text,
      model_id: config.elevenlabs.modelId,
      voice_settings: {
        stability: config.elevenlabs.stability,
        similarity_boost: config.elevenlabs.similarityBoost,
        style: config.elevenlabs.style,
        use_speaker_boost: true
      }
    });

    // Collect audio chunks
    const chunks: Buffer[] = [];
    for await (const chunk of audioStream) {
      if (chunk instanceof Buffer || chunk instanceof Uint8Array) {
        chunks.push(Buffer.from(chunk));
      }
    }

    // Combine chunks and encode as base64
    const audioBuffer = Buffer.concat(chunks);
    const audioBase64 = audioBuffer.toString('base64');
    
    return audioBase64;
    
  } catch (error) {
    console.error('[TTS-Worker] ElevenLabs synthesis error:', error);
    return null;
  }
}

/**
 * Handles control messages
 */
async function handleControlMessage(message: string, _channel: string) {
  try {
    const control = JSON.parse(message);
    const { action, streamId } = control;
    
    console.log(`[TTS-Worker] Control message: ${action} for stream ${streamId}`);
    
    switch (action) {
      case 'stop':
      case 'force_stop':
      case 'tts_complete':
        // Clean up stream state
        if (activeStreams.has(streamId)) {
          const streamState = activeStreams.get(streamId)!;
          const duration = Date.now() - streamState.startTime;
          console.log(`[TTS-Worker] Stopping TTS for ${streamId}. Synthesized ${streamState.chunkCount} chunks in ${duration}ms`);
          
          activeStreams.delete(streamId);
          
          // Notify completion
          await pubRedisClient.publish(
            `stream:status:${streamId}`,
            JSON.stringify({
              status: 'tts_complete',
              streamId,
              chunkCount: streamState.chunkCount,
              duration,
              timestamp: Date.now()
            })
          );
        }
        break;
    }
  } catch (error) {
    console.error('[TTS-Worker] Error handling control message:', error);
  }
}

/**
 * Starts listening to Redis channels
 */
async function startListening() {
  console.log('[TTS-Worker] Starting to listen for translations...');

  // Subscribe to translated text pattern (for all streams)
  await subRedisClient.psubscribe('text:translated:*');
  
  // Subscribe to control channel
  await subRedisClient.subscribe('stream:control');

  // Handle messages
  subRedisClient.on('pmessage', async (_pattern, channel, message) => {
    if (channel.startsWith('text:translated:')) {
      await handleTranslation(message, channel);
    }
  });

  subRedisClient.on('message', async (channel, message) => {
    if (channel === 'stream:control') {
      await handleControlMessage(message, channel);
    }
  });

  console.log('[TTS-Worker] Listening for translations...');
}

/**
 * Graceful shutdown handler
 */
async function shutdown() {
  if (isShuttingDown) return;
  console.log('[TTS-Worker] Shutting down...');
  isShuttingDown = true;

  // Log final statistics
  for (const [streamId, state] of activeStreams.entries()) {
    console.log(`[TTS-Worker] Stream ${streamId}: Synthesized ${state.chunkCount} chunks`);
  }

  // Clear streams
  activeStreams.clear();

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
    console.log('[TTS-Worker] Redis clients disconnected.');
  } catch (error) {
    console.error('[TTS-Worker] Error during disconnect:', error);
  }

  console.log('[TTS-Worker] Shutdown complete.');
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
    console.error('[TTS-Worker] Critical error:', error);
    process.exit(1);
  }
}

// Start the worker
main();