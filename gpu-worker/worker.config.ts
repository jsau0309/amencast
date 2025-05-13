import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../.env') }); // Adjust path if needed, assumes .env is in gpu-worker/

// Helper function to get required env var or throw error
function getEnvVar(key: string): string {
  const value = process.env[key];
  if (value === undefined || value === null || value === '') {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

// Define and export configuration object
export const config = {
  redis: {
    url: getEnvVar('REDIS_URL'),
    token: process.env.REDIS_TOKEN, // Token might be optional if included in URL
    queueName: process.env.REDIS_QUEUE_NAME || 'gpu_job_queue',
  },
  supabase: {
    dbUrl: getEnvVar('SUPABASE_DB_URL'),
    serviceRoleKey: getEnvVar('SUPABASE_SERVICE_ROLE_KEY'),
  },
  openai: {
    apiKey: getEnvVar('OPENAI_API_KEY'),
  },
  elevenlabs: {
    apiKey: getEnvVar('ELEVENLABS_API_KEY'),
    voiceId: getEnvVar('ELEVENLABS_VOICE_ID'),
  },
  livekit: {
    apiKey: getEnvVar('LIVEKIT_API_KEY'),
    apiSecret: getEnvVar('LIVEKIT_API_SECRET'),
    url: getEnvVar('LIVEKIT_URL'),
  },
  worker: {
    whisperModelSize: process.env.WHISPER_MODEL_SIZE || 'large-v3',
    pythonExecutablePath: process.env.PYTHON_EXECUTABLE_PATH || 'python3',
  },
  // Add other configuration settings as needed
  isProduction: process.env.NODE_ENV === 'production',
};

// Log loaded configuration (optional, remove sensitive keys in production)
// console.log('Worker configuration loaded:', config);
