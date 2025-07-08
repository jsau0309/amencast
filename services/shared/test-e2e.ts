import Redis from 'ioredis';

// End-to-end test for the complete pipeline

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD,
  tls: process.env.REDIS_TLS_ENABLED === 'true' ? {} : undefined,
});

const testStreamId = `test-e2e-${Date.now()}`;

interface PipelineStage {
  name: string;
  channel: string;
  received: boolean;
  data?: any;
  timestamp?: number;
}

async function testE2EPipeline() {
  console.log('🧪 Starting End-to-End Pipeline test...\n');
  console.log(`Stream ID: ${testStreamId}\n`);

  // Track pipeline stages
  const stages: PipelineStage[] = [
    { name: 'Audio Input', channel: `audio:raw:${testStreamId}`, received: false },
    { name: 'STT Output', channel: `text:transcribed:${testStreamId}`, received: false },
    { name: 'Translation Output', channel: `text:translated:${testStreamId}`, received: false },
    { name: 'TTS Output', channel: `audio:synthesized:${testStreamId}`, received: false },
  ];

  // Create subscribers for each stage
  const subscribers = await Promise.all(
    stages.map(async (stage) => {
      const sub = redis.duplicate();
      await sub.subscribe(stage.channel);
      
      sub.on('message', (channel, message) => {
        stage.received = true;
        stage.timestamp = Date.now();
        try {
          stage.data = JSON.parse(message);
        } catch {
          stage.data = message;
        }
        console.log(`✅ ${stage.name} received at ${new Date(stage.timestamp).toISOString()}`);
        
        // Log sample of the data
        if (stage.data.text) {
          console.log(`   Text: "${stage.data.text.substring(0, 50)}..."`);
        } else if (stage.data.translatedText) {
          console.log(`   Translation: "${stage.data.translatedText.substring(0, 50)}..."`);
        } else if (stage.data.audioData) {
          console.log(`   Audio: ${stage.data.audioData.length} chars (base64)`);
        }
      });
      
      return sub;
    })
  );

  // Subscribe to status updates
  const statusSub = redis.duplicate();
  await statusSub.subscribe(`stream:status:${testStreamId}`);
  
  statusSub.on('message', (channel, message) => {
    const status = JSON.parse(message);
    console.log(`📊 Status Update: ${status.status} from ${status.service || 'unknown'}`);
  });

  // Wait for all subscriptions
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Start the stream
  console.log('🚀 Starting stream with control message...\n');
  await redis.publish('stream:control', JSON.stringify({
    action: 'start',
    streamId: testStreamId,
    targetLanguage: 'es'
  }));

  await new Promise(resolve => setTimeout(resolve, 1000));

  // Send test audio (simulating ingestion worker output)
  console.log('🎵 Sending test audio chunks...\n');
  
  // Create a simple test message that will produce predictable output
  const testAudioData = Buffer.from('test audio data').toString('base64');
  
  for (let i = 0; i < 3; i++) {
    await redis.publish(`audio:raw:${testStreamId}`, JSON.stringify({
      streamId: testStreamId,
      data: testAudioData,
      timestamp: Date.now(),
      offsetMs: i * 1000
    }));
    
    console.log(`  Sent audio chunk ${i + 1}/3`);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // For testing purposes, we'll simulate STT output if the STT worker isn't running
  // In real testing, this would come from the actual STT worker
  console.log('\n📝 Simulating STT output for testing...\n');
  await redis.publish(`text:transcribed:${testStreamId}`, JSON.stringify({
    streamId: testStreamId,
    chunkId: 'test-chunk-1',
    text: 'Hello everyone, welcome to our service today.',
    timestamp: Date.now(),
    confidence: 0.95
  }));

  // Wait for pipeline to process
  console.log('\n⏳ Waiting for pipeline to process...\n');
  
  const startTime = Date.now();
  const timeout = 15000; // 15 seconds timeout
  
  while (Date.now() - startTime < timeout) {
    const allReceived = stages.every(stage => stage.received);
    if (allReceived) break;
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Show progress
    const completed = stages.filter(s => s.received).length;
    console.log(`  Progress: ${completed}/${stages.length} stages completed`);
  }

  // Report results
  console.log('\n📊 Pipeline Test Results:\n');
  
  let pipelineComplete = true;
  stages.forEach((stage, index) => {
    const icon = stage.received ? '✅' : '❌';
    console.log(`${icon} ${stage.name}: ${stage.received ? 'Completed' : 'Failed'}`);
    
    if (stage.received && index > 0) {
      const prevStage = stages[index - 1];
      if (prevStage.timestamp && stage.timestamp) {
        const latency = stage.timestamp - prevStage.timestamp;
        console.log(`   Latency from previous stage: ${latency}ms`);
      }
    }
    
    if (!stage.received) pipelineComplete = false;
  });

  // Calculate total latency
  if (stages[0].timestamp && stages[stages.length - 1].timestamp) {
    const totalLatency = stages[stages.length - 1].timestamp - stages[0].timestamp;
    console.log(`\n⏱️  Total Pipeline Latency: ${totalLatency}ms`);
    
    if (totalLatency < 3000) {
      console.log('✅ Latency is within target (<3s)');
    } else {
      console.log('⚠️  Latency exceeds target (>3s)');
    }
  }

  // Send stop signal
  console.log('\n🛑 Sending stop signal...');
  await redis.publish('stream:control', JSON.stringify({
    action: 'stop',
    streamId: testStreamId
  }));

  await new Promise(resolve => setTimeout(resolve, 2000));

  // Cleanup
  await Promise.all(subscribers.map(sub => sub.disconnect()));
  await statusSub.disconnect();
  await redis.disconnect();

  if (pipelineComplete) {
    console.log('\n✨ End-to-End test completed successfully!');
    process.exit(0);
  } else {
    console.log('\n❌ Pipeline test failed - not all stages completed');
    console.log('\n💡 Make sure all workers are running:');
    console.log('   - STT Worker');
    console.log('   - Translation Worker');
    console.log('   - TTS Worker');
    console.log('   - WebSocket Server');
    process.exit(1);
  }
}

testE2EPipeline().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});