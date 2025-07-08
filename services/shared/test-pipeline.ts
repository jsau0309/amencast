import Redis from 'ioredis';

// Test script to verify Redis channel communication

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD,
  tls: process.env.REDIS_TLS_ENABLED === 'true' ? {} : undefined,
});

const testStreamId = `test-pipeline-${Date.now()}`;

async function testPipeline() {
  console.log('🧪 Starting pipeline test...\n');
  
  // Create subscribers for all channels
  const subscribers = {
    raw: redis.duplicate(),
    transcribed: redis.duplicate(), 
    translated: redis.duplicate(),
    synthesized: redis.duplicate(),
    status: redis.duplicate()
  };

  // Subscribe to all channels
  await subscribers.raw.subscribe(`audio:raw:${testStreamId}`);
  await subscribers.transcribed.subscribe(`text:transcribed:${testStreamId}`);
  await subscribers.translated.subscribe(`text:translated:${testStreamId}`);
  await subscribers.synthesized.subscribe(`audio:synthesized:${testStreamId}`);
  await subscribers.status.subscribe(`stream:status:${testStreamId}`);

  // Set up listeners
  subscribers.raw.on('message', (channel, message) => {
    console.log('✅ Received on audio:raw:', message.length, 'bytes');
  });

  subscribers.transcribed.on('message', (channel, message) => {
    const data = JSON.parse(message);
    console.log('✅ Received on text:transcribed:', data.text);
  });

  subscribers.translated.on('message', (channel, message) => {
    const data = JSON.parse(message);
    console.log('✅ Received on text:translated:', data.translatedText);
  });

  subscribers.synthesized.on('message', (channel, message) => {
    const data = JSON.parse(message);
    console.log('✅ Received on audio:synthesized:', data.audioData.length, 'chars (base64)');
  });

  subscribers.status.on('message', (channel, message) => {
    const data = JSON.parse(message);
    console.log('📊 Status update:', data.status, 'from', data.service || 'unknown');
  });

  // Wait for subscriptions
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('\n📤 Testing channel communication...\n');

  // Test 1: Audio Raw
  console.log('1️⃣ Publishing to audio:raw...');
  await redis.publish(`audio:raw:${testStreamId}`, Buffer.from('test audio data'));
  await new Promise(resolve => setTimeout(resolve, 500));

  // Test 2: Text Transcribed
  console.log('\n2️⃣ Publishing to text:transcribed...');
  await redis.publish(`text:transcribed:${testStreamId}`, JSON.stringify({
    streamId: testStreamId,
    chunkId: 'chunk-1',
    text: 'Hello world, this is a test.',
    timestamp: Date.now()
  }));
  await new Promise(resolve => setTimeout(resolve, 500));

  // Test 3: Text Translated
  console.log('\n3️⃣ Publishing to text:translated...');
  await redis.publish(`text:translated:${testStreamId}`, JSON.stringify({
    streamId: testStreamId,
    chunkId: 'chunk-1',
    sourceText: 'Hello world, this is a test.',
    translatedText: 'Hola mundo, esto es una prueba.',
    languageTarget: 'es',
    timestamp: Date.now()
  }));
  await new Promise(resolve => setTimeout(resolve, 500));

  // Test 4: Audio Synthesized
  console.log('\n4️⃣ Publishing to audio:synthesized...');
  await redis.publish(`audio:synthesized:${testStreamId}`, JSON.stringify({
    streamId: testStreamId,
    chunkId: 'chunk-1',
    audioData: 'BASE64_ENCODED_AUDIO_DATA_HERE',
    timestamp: Date.now()
  }));
  await new Promise(resolve => setTimeout(resolve, 500));

  // Test 5: Control Channel
  console.log('\n5️⃣ Testing control channel...');
  const controlSub = redis.duplicate();
  await controlSub.subscribe('stream:control');
  
  controlSub.on('message', (channel, message) => {
    const data = JSON.parse(message);
    console.log('✅ Received on stream:control:', data.action, 'for stream', data.streamId);
  });

  await new Promise(resolve => setTimeout(resolve, 500));
  
  await redis.publish('stream:control', JSON.stringify({
    action: 'start',
    streamId: testStreamId,
    targetLanguage: 'es'
  }));

  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('\n✨ Pipeline test complete!\n');

  // Cleanup
  await Promise.all([
    subscribers.raw.disconnect(),
    subscribers.transcribed.disconnect(),
    subscribers.translated.disconnect(),
    subscribers.synthesized.disconnect(),
    subscribers.status.disconnect(),
    controlSub.disconnect(),
    redis.disconnect()
  ]);

  process.exit(0);
}

testPipeline().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});