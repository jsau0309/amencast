import dotenv from 'dotenv';
import path from 'path';

// Load .env file from the root of tts-worker
dotenv.config({ path: path.resolve(__dirname, '../.env') });

export const config = {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    tlsEnabled: process.env.REDIS_TLS_ENABLED === 'true',
  },
  elevenlabs: {
    apiKey: process.env.ELEVENLABS_API_KEY,
    voiceId: process.env.ELEVENLABS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb',
    // Language-specific voice IDs
    voiceIdSpanish: process.env.ELEVENLABS_VOICE_ID_ES || process.env.ELEVENLABS_VOICE_ID || undefined,
    voiceIdItalian: process.env.ELEVENLABS_VOICE_ID_IT || process.env.ELEVENLABS_VOICE_ID || undefined,
    voiceIdGerman: process.env.ELEVENLABS_VOICE_ID_DE || process.env.ELEVENLABS_VOICE_ID || undefined,
    // Model configuration
    modelId: process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2',
    // Voice settings
    stability: parseFloat(process.env.ELEVENLABS_STABILITY || '0.5'),
    similarityBoost: parseFloat(process.env.ELEVENLABS_SIMILARITY_BOOST || '0.75'),
    style: parseFloat(process.env.ELEVENLABS_STYLE || '0.5'),
  }
};

// Basic validation
if (!config.elevenlabs.apiKey) {
  console.warn('[TTS-Worker] WARNING: ELEVENLABS_API_KEY is not set in .env. TTS will fail.');
}