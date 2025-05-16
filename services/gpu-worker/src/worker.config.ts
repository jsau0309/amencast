import dotenv from 'dotenv';
import path from 'path';

// Load .env from project root
dotenv.config({ path: path.join(__dirname, '../../.env') });

function requireEnv(name: string, isSensitive: boolean = false, defaultValue?: string): string {
  const value = process.env[name];
  if (!value) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    if (isSensitive) {
      throw new Error(`Missing a required sensitive environment variable: ${name}`);
    }
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  isProduction: process.env.NODE_ENV === 'production',
  redis: {
    url: requireEnv('REDIS_URL', true),
    token: process.env.REDIS_TOKEN, // Optional, might be in URL
    queueName: requireEnv('REDIS_QUEUE_NAME', false, 'gpu_job_queue'),
  },
  supabase: {
    url: requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    anonKey: requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    databaseUrl: requireEnv('DATABASE_URL', true), 
  },
  livekit: {
    url: requireEnv('LIVEKIT_URL', true),
    apiKey: requireEnv('LIVEKIT_API_KEY', true),
    apiSecret: requireEnv('LIVEKIT_API_SECRET', true),
  },
  openai: {
    apiKey: requireEnv('OPENAI_API_KEY', true),
  },
  elevenlabs: {
    apiKey: requireEnv('ELEVENLABS_API_KEY', true),
    voiceId: requireEnv('ELEVENLABS_VOICE_ID', false, 'josh'),
    modelId: requireEnv('ELEVENLABS_MODEL_ID', false, 'eleven_multilingual_v2'),
    outputFormat: requireEnv('ELEVENLABS_OUTPUT_FORMAT', false, 'mp3_44100_128'),
  },
  worker: {
    whisperModelSize: requireEnv('WHISPER_MODEL_SIZE', false, 'large-v3'),
    pythonExecutable: requireEnv('PYTHON_EXECUTABLE', false, 'python3'),
    whisperDevice: requireEnv('WHISPER_DEVICE', false, 'cpu'),      // Default to CPU
    whisperComputeType: requireEnv('WHISPER_COMPUTE_TYPE', false, 'float32'), // Default for CPU
    concurrentJobs: parseInt(requireEnv('WORKER_CONCURRENT_JOBS', false, '1'), 10),
    pollingIntervalMs: parseInt(requireEnv('WORKER_POLLING_INTERVAL_MS', false, '5000'), 10),
  },
} as const;

// Basic validation for LiveKit URL format
if (config.livekit.url && !config.livekit.url.startsWith('ws')) {
    console.warn(`[worker.config.ts] LIVEKIT_URL "${config.livekit.url}" might be incorrect. Should start with ws:// or wss://`);
}

// Log configuration load
console.log(`[worker.config.ts] Loading .env from: ${path.join(__dirname, '../../.env')}`);

// TEST LOG to ensure .env is loaded and which one
console.log("[worker.config.ts] TESTING ENV LOAD - REDIS_URL from process.env:", process.env.REDIS_URL); 