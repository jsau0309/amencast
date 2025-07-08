import Redis from 'ioredis';

// Test script for Translation Worker context handling

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD,
  tls: process.env.REDIS_TLS_ENABLED === 'true' ? {} : undefined,
});

const subscriber = redis.duplicate();
const testStreamId = `test-translation-context-${Date.now()}`;

const testSentences = [
  "Good morning, everyone. Today we're going to talk about faith.",
  "In the book of Romans, Paul writes about the importance of faith.",
  "He says that faith comes by hearing, and hearing by the word of God.",
  "This is found in Romans 10:17.",
  "Let's explore what this means for our daily lives."
];

async function testTranslationContext() {
  console.log('🧪 Starting Translation Context test...\n');

  // Subscribe to translations
  await subscriber.subscribe(`text:translated:${testStreamId}`);
  
  const translations: any[] = [];
  
  subscriber.on('message', (channel, message) => {
    const data = JSON.parse(message);
    translations.push(data);
    console.log(`✅ Translation ${translations.length}:`, data.translatedText);
  });

  // Wait for subscription
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Send control message to start
  console.log('📤 Starting translation stream...');
  await redis.publish('stream:control', JSON.stringify({
    action: 'start',
    streamId: testStreamId,
    targetLanguage: 'es'
  }));

  await new Promise(resolve => setTimeout(resolve, 500));

  // Send test sentences sequentially
  console.log('\n📝 Sending test sentences...\n');
  for (let i = 0; i < testSentences.length; i++) {
    console.log(`Sentence ${i + 1}: "${testSentences[i]}"`);
    
    await redis.publish(`text:transcribed:${testStreamId}`, JSON.stringify({
      streamId: testStreamId,
      chunkId: `chunk-${i}`,
      text: testSentences[i],
      timestamp: Date.now(),
      confidence: 0.95
    }));
    
    // Wait for translation
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // Check context preservation
  console.log('\n🔍 Checking context preservation...\n');
  
  if (translations.length === testSentences.length) {
    console.log('✅ All sentences translated');
    
    // Check if Bible reference was properly translated
    const bibleRefTranslation = translations.find(t => 
      t.sourceText.includes('Romans 10:17')
    );
    
    if (bibleRefTranslation) {
      console.log('✅ Bible reference translation:', bibleRefTranslation.translatedText);
      
      // Should contain "Romanos 10:17" in Spanish
      if (bibleRefTranslation.translatedText.includes('Romanos')) {
        console.log('✅ Bible book name properly translated');
      }
    }
  } else {
    console.log(`❌ Expected ${testSentences.length} translations, got ${translations.length}`);
  }

  // Stop stream
  console.log('\n📤 Stopping translation stream...');
  await redis.publish('stream:control', JSON.stringify({
    action: 'stop',
    streamId: testStreamId
  }));

  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('\n✨ Translation context test completed!');

  // Cleanup
  await subscriber.disconnect();
  await redis.disconnect();
  process.exit(0);
}

testTranslationContext().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});