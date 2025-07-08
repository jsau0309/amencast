import dotenv from 'dotenv';
import path from 'path';

// Load .env file from the root of stt-worker
dotenv.config({ path: path.resolve(__dirname, '../.env') });

export const config = {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    tlsEnabled: process.env.REDIS_TLS_ENABLED === 'true',
  },
  assemblyai: {
    apiKey: process.env.ASSEMBLYAI_API_KEY,
  },
  // Keeping OpenAI config for potential punctuation enhancement
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
  },
  supabase: {
    url: process.env.SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  }
};

// Basic validation
if (!config.assemblyai.apiKey) {
  console.warn('[STT-Worker] WARNING: ASSEMBLYAI_API_KEY is not set in .env. STT will fail.');
} 