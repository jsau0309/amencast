import Redis from 'ioredis';
import fs from 'fs';
import path from 'path';

// Test script for STT Worker

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD,
  tls: process.env.REDIS_TLS_ENABLED === 'true' ? {} : undefined,
});

const subscriber = redis.duplicate();
const testStreamId = `test-stt-${Date.now()}`;

async function generateTestAudio(): Buffer {
  // Generate a simple sine wave audio buffer (PCM 16kHz, 16-bit, mono)
  const sampleRate = 16000;
  const duration = 1; // 1 second
  const frequency = 440; // A4 note
  const samples = sampleRate * duration;
  const buffer = Buffer.alloc(samples * 2); // 16-bit = 2 bytes per sample

  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    const value = Math.sin(2 * Math.PI * frequency * t);
    const sample = Math.floor(value * 32767); // Convert to 16-bit signed integer
    buffer.writeInt16LE(sample, i * 2);
  }

  return buffer;
}

async function testSTTWorker() {
  console.log('🧪 Starting STT Worker test...\n');

  // Subscribe to transcripts
  await subscriber.subscribe(`text:transcribed:${testStreamId}`);
  
  let transcriptReceived = false;
  
  subscriber.on('message', (channel, message) => {
    const data = JSON.parse(message);
    console.log('✅ Received transcript:', data);
    transcriptReceived = true;
  });

  // Wait for subscription
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Send control message to start
  console.log('📤 Sending start control message...');
  await redis.publish('stream:control', JSON.stringify({
    action: 'start',
    streamId: testStreamId,
    targetLanguage: 'es'
  }));

  await new Promise(resolve => setTimeout(resolve, 500));

  // Send test audio chunks
  console.log('🎵 Sending test audio chunks...');
  const audioBuffer = generateTestAudio();
  
  // Split into smaller chunks
  const chunkSize = 3200; // 100ms at 16kHz
  for (let i = 0; i < audioBuffer.length; i += chunkSize) {
    const chunk = audioBuffer.slice(i, Math.min(i + chunkSize, audioBuffer.length));
    
    await redis.publish(`audio:raw:${testStreamId}`, JSON.stringify({
      streamId: testStreamId,
      data: chunk.toString('base64'),
      timestamp: Date.now(),
      offsetMs: (i / 32) // Convert bytes to ms
    }));
    
    console.log(`  Sent chunk ${Math.floor(i / chunkSize) + 1}/${Math.ceil(audioBuffer.length / chunkSize)}`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Signal end of audio
  console.log('\n📤 Sending ingestion complete signal...');
  await redis.publish('stream:control', JSON.stringify({
    action: 'ingestion_complete',
    streamId: testStreamId
  }));

  // Wait for transcripts
  console.log('\n⏳ Waiting for transcripts...');
  await new Promise(resolve => setTimeout(resolve, 5000));

  if (transcriptReceived) {
    console.log('\n✨ STT Worker test completed successfully!');
  } else {
    console.log('\n❌ No transcripts received. Check STT worker logs.');
  }

  // Cleanup
  await subscriber.disconnect();
  await redis.disconnect();
  process.exit(transcriptReceived ? 0 : 1);
}

testSTTWorker().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});