import dotenv from 'dotenv';
import path from 'path';

// Load .env file from the root of translation-worker
dotenv.config({ path: path.resolve(__dirname, '../.env') });

export const config = {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    tlsEnabled: process.env.REDIS_TLS_ENABLED === 'true',
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
  },
  prisma: {
    databaseUrl: process.env.DATABASE_URL,
  },
  translation: {
    // Rolling context window size (number of previous sentences to include)
    contextWindowSize: parseInt(process.env.TRANSLATION_CONTEXT_SIZE || '3', 10),
    // Temperature for translation
    temperature: parseFloat(process.env.TRANSLATION_TEMPERATURE || '0.3'),
  }
};

// Basic validation
if (!config.openai.apiKey) {
  console.warn('[Translation-Worker] WARNING: OPENAI_API_KEY is not set in .env. Translation will fail.');
}

if (!config.prisma.databaseUrl) {
  console.warn('[Translation-Worker] WARNING: DATABASE_URL is not set. Bible verse lookups may fail.');
}