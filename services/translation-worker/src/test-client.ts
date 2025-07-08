import Redis from 'ioredis';
import { config } from './config';

// Test client to simulate STT output and verify translation worker

const redis = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  tls: config.redis.tlsEnabled ? {} : undefined,
});

const testStreamId = `test-stream-${Date.now()}`;
const targetLanguage = process.argv[2] || 'es'; // Default to Spanish

async function simulateTranslation() {
  console.log(`Starting test for stream ${testStreamId} with target language: ${targetLanguage}`);
  
  // Subscribe to translation output
  const subRedis = redis.duplicate();
  await subRedis.subscribe(`text:translated:${testStreamId}`);
  
  subRedis.on('message', (channel, message) => {
    const result = JSON.parse(message);
    console.log('\n=== Translation Result ===');
    console.log(`Source: "${result.sourceText}"`);
    console.log(`Translation (${result.languageTarget}): "${result.translatedText}"`);
    console.log('========================\n');
  });
  
  // Send start control message
  await redis.publish('stream_control', JSON.stringify({
    action: 'start_translation',
    streamId: testStreamId,
    targetLanguage: targetLanguage
  }));
  
  // Wait a bit for the worker to initialize
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Test sentences
  const testSentences = [
    "Hello, and welcome to our service today.",
    "We're going to be reading from the book of John, chapter 3.",
    "For God so loved the world that he gave his only Son.",
    "Let us pray together.",
    "Our Father who art in heaven, hallowed be thy name.",
    "May the grace of our Lord Jesus Christ be with you all."
  ];
  
  // Send test transcripts
  for (let i = 0; i < testSentences.length; i++) {
    const transcript = {
      streamId: testStreamId,
      chunkId: `chunk-${i}`,
      text: testSentences[i],
      timestamp: Date.now(),
      confidence: 0.95
    };
    
    await redis.publish(`text:transcribed:${testStreamId}`, JSON.stringify(transcript));
    console.log(`Sent: "${testSentences[i]}"`);
    
    // Wait between sentences
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  // Send stop message
  await redis.publish('stream_control', JSON.stringify({
    action: 'stop',
    streamId: testStreamId
  }));
  
  console.log('\nTest complete. Waiting for final translations...');
  
  // Wait for final translations
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Cleanup
  await subRedis.disconnect();
  await redis.disconnect();
  process.exit(0);
}

// Run the test
simulateTranslation().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});