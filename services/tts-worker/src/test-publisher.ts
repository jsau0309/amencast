import { Redis } from 'ioredis';
import { config as dotEnvConfig } from 'dotenv';
import { join } from 'path';

// Load environment variables from the correct path
dotEnvConfig({ path: join(process.cwd(), 'services/tts-worker/.env') });

const streamId = process.argv[2] || 'test-stream';
const text = process.argv[3] || 'Hello, this is a test of the text to speech worker.';

const redisOptions = {
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD,
  tls: process.env.REDIS_TLS_ENABLED === 'true' ? {} : undefined,
  lazyConnect: true,
};

const publisher = new Redis(redisOptions);

const controlPublisher = new Redis(redisOptions);

async function main() {
  await publisher.connect();
  await controlPublisher.connect();
  console.log('Connected to Redis.');

  const startCommand = JSON.stringify({
    action: 'start',
    streamId: streamId,
    targetLanguage: 'en',
  });

  await controlPublisher.publish('stream_control', startCommand);
  console.log(`Sent START command for stream ${streamId}`);

  // Give the worker a moment to start up and connect to the room
  await new Promise(resolve => setTimeout(resolve, 2000));

  await publisher.publish(`translated_text:${streamId}`, text);
  console.log(`Published text to stream ${streamId}: "${text}"`);
  
  // Give it time to process
  await new Promise(resolve => setTimeout(resolve, 5000));

  const sttCompleteCommand = JSON.stringify({
    action: 'stt_complete',
    streamId: streamId,
  });
  await controlPublisher.publish('stream_control', sttCompleteCommand);
  console.log(`Sent STT_COMPLETE command for stream ${streamId}`);

  await publisher.quit();
  await controlPublisher.quit();
  console.log('Disconnected from Redis.');
}

main().catch(console.error); 