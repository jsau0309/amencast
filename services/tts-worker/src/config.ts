import dotenv from 'dotenv';
import path from 'path';

// Load .env file from the root of gpu-worker
dotenv.config({ path: path.resolve(__dirname, '../.env') });

export const config = {
  redis: {
    // These will be similar to how websocket-server connects if using Upstash
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    tlsEnabled: process.env.REDIS_TLS_ENABLED === 'true',

    // IMPORTANT: This queue name MUST match the output queue name from ingestion-worker
    inputQueueName: process.env.GPU_WORKER_INPUT_QUEUE_NAME || 'gpu_jobs_queue',
    
    // IMPORTANT: This queue name MUST match the results input queue name in websocket-server
    outputQueueName: process.env.GPU_WORKER_OUTPUT_QUEUE_NAME || 'translation_results_queue',
  },
  // Add other GPU worker specific configurations here if needed
  // e.g., OpenAI API Key, ElevenLabs API Key, Voice ID (if not already managed elsewhere)
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
  },
  elevenlabs: {
    apiKey: process.env.ELEVENLABS_API_KEY,
    voiceId: process.env.ELEVENLABS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb', // Default from previous worker.config
  },
  assemblyai: {
    apiKey: process.env.ASSEMBLYAI_API_KEY,
  },
  supabase: {
    url: process.env.SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    // Bucket for storing the final translated audio from ElevenLabs
    translatedAudioBucket: process.env.SUPABASE_TRANSLATED_AUDIO_BUCKET || 'translated-stream-audio',
  },
  livekit: {
    url: process.env.LIVEKIT_URL || 'http://localhost:7880',
    apiKey: process.env.LIVEKIT_API_KEY,
    apiSecret: process.env.LIVEKIT_API_SECRET,
  }
};

// Basic validation (optional, but good practice)
if (!config.openai.apiKey) {
  console.warn('[GPWorker] WARNING: OPENAI_API_KEY is not set in .env. OpenAI calls will fail.');
}
if (!config.elevenlabs.apiKey) {
  console.warn('[GPWorker] WARNING: ELEVENLABS_API_KEY is not set in .env. ElevenLabs calls will fail.');
}
if (!config.supabase.url || !config.supabase.serviceRoleKey) {
  console.warn('[GPWorker] WARNING: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set. Supabase operations will fail.');
} 