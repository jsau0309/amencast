import Redis from 'ioredis';
import { config } from './config';

// Test client to simulate translation output and verify TTS worker

const redis = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  tls: config.redis.tlsEnabled ? {} : undefined,
});

const testStreamId = `test-stream-${Date.now()}`;
const targetLanguage = process.argv[2] || 'es'; // Default to Spanish

async function simulateTTS() {
  console.log(`Starting TTS test for stream ${testStreamId} with target language: ${targetLanguage}`);
  
  // Subscribe to audio output
  const subRedis = redis.duplicate();
  await subRedis.subscribe(`audio:synthesized:${testStreamId}`);
  
  subRedis.on('message', (channel, message) => {
    const result = JSON.parse(message);
    console.log('\n=== Audio Result ===');
    console.log(`Chunk ID: ${result.chunkId}`);
    console.log(`Audio data length: ${result.audioData.length} chars (base64)`);
    console.log(`Timestamp: ${new Date(result.timestamp).toISOString()}`);
    console.log('===================\n');
  });
  
  // Wait a bit for subscription
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Test translations
  const translations = [
    { text: "Hola, y bienvenidos a nuestro servicio de hoy.", original: "Hello, and welcome to our service today." },
    { text: "Vamos a leer del libro de Juan, capítulo 3.", original: "We're going to be reading from the book of John, chapter 3." },
    { text: "Porque de tal manera amó Dios al mundo que dio a su Hijo único.", original: "For God so loved the world that he gave his only Son." },
    { text: "Oremos juntos.", original: "Let us pray together." },
    { text: "Padre nuestro que estás en los cielos, santificado sea tu nombre.", original: "Our Father who art in heaven, hallowed be thy name." },
    { text: "Que la gracia de nuestro Señor Jesucristo sea con todos ustedes.", original: "May the grace of our Lord Jesus Christ be with you all." }
  ];
  
  // Send test translations
  for (let i = 0; i < translations.length; i++) {
    const translationMessage = {
      streamId: testStreamId,
      chunkId: `chunk-${i}`,
      sourceText: translations[i].original,
      translatedText: translations[i].text,
      timestamp: Date.now(),
      languageTarget: targetLanguage
    };
    
    await redis.publish(`text:translated:${testStreamId}`, JSON.stringify(translationMessage));
    console.log(`Sent translation ${i + 1}: "${translations[i].text.substring(0, 50)}..."`);
    
    // Wait between translations
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  
  // Send stop message
  await redis.publish('stream_control', JSON.stringify({
    action: 'stop',
    streamId: testStreamId
  }));
  
  console.log('\nTest complete. Waiting for final audio chunks...');
  
  // Wait for final audio
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Cleanup
  await subRedis.disconnect();
  await redis.disconnect();
  process.exit(0);
}

// Run the test
simulateTTS().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});