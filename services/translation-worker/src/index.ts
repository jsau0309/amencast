import { Redis, RedisOptions } from 'ioredis';
import OpenAI from 'openai';
import { config } from './config';
import { getGlossaryPrompt, getLanguageInstructions } from './glossary';

console.log('[Translation-Worker] Starting up...');

// Interfaces
interface TranscriptMessage {
  streamId: string;
  chunkId: string;
  text: string;
  timestamp: number;
  confidence?: number;
}

interface TranslationResult {
  streamId: string;
  chunkId: string;
  sourceText: string;
  translatedText: string;
  timestamp: number;
  languageTarget: string;
}

interface StreamContext {
  streamId: string;
  languageTarget: string;
  previousSentences: string[];
  sentenceCount: number;
}

// Redis clients
const redisOptions: RedisOptions = {
  host: config.redis.host,
  port: config.redis.port,
  lazyConnect: true,
};
if (config.redis.password) redisOptions.password = config.redis.password;
if (config.redis.tlsEnabled) {
  redisOptions.tls = {};
}

const subRedisClient = new Redis(redisOptions);
const pubRedisClient = new Redis(redisOptions);

// OpenAI client
let openai: OpenAI | null = null;

// Active streams tracking with context
const activeStreams = new Map<string, StreamContext>();

let isShuttingDown = false;

/**
 * Initializes Redis clients and OpenAI
 */
async function initializeClients() {
  console.log('[Translation-Worker] Initializing clients...');
  
  subRedisClient.on('connect', () => console.log('[Translation-Worker] Subscriber Redis connected.'));
  subRedisClient.on('error', (err) => console.error('[Translation-Worker] Subscriber Redis error:', err));
  pubRedisClient.on('connect', () => console.log('[Translation-Worker] Publisher Redis connected.'));
  pubRedisClient.on('error', (err) => console.error('[Translation-Worker] Publisher Redis error:', err));

  // Initialize OpenAI
  if (config.openai.apiKey) {
    openai = new OpenAI({ apiKey: config.openai.apiKey });
    console.log('[Translation-Worker] OpenAI client initialized.');
  } else {
    throw new Error('OpenAI API key is required');
  }

  // Connect Redis clients
  await Promise.all([
    subRedisClient.connect().catch(err => { 
      console.error('[Translation-Worker] Failed to connect Subscriber Redis:', err); 
      throw err; 
    }),
    pubRedisClient.connect().catch(err => { 
      console.error('[Translation-Worker] Failed to connect Publisher Redis:', err); 
      throw err; 
    })
  ]);
  
  console.log('[Translation-Worker] All clients initialized successfully.');
}

/**
 * Handles incoming transcripts for translation
 */
async function handleTranscript(message: string, channel: string) {
  try {
    const transcript: TranscriptMessage = JSON.parse(message);
    const { streamId, text } = transcript;
    
    // Skip empty transcripts
    if (!text || text.trim() === '') {
      return;
    }
    
    // Get stream context
    let context = activeStreams.get(streamId);
    if (!context) {
      console.warn(`[Translation-Worker] No context for stream ${streamId}, skipping transcript`);
      return;
    }
    
    // Translate the text
    const translatedText = await translateText(text, context);
    
    if (translatedText) {
      // Update context with the source text
      updateContext(context, text);
      
      // Publish translation result
      const result: TranslationResult = {
        streamId,
        chunkId: transcript.chunkId,
        sourceText: text,
        translatedText,
        timestamp: Date.now(),
        languageTarget: context.languageTarget
      };
      
      await pubRedisClient.publish(
        `text:translated:${streamId}`,
        JSON.stringify(result)
      );
      
      console.log(`[Translation-Worker] Published translation for ${streamId}: "${text.substring(0, 50)}..." → "${translatedText.substring(0, 50)}..."`);
    }
    
  } catch (error) {
    console.error('[Translation-Worker] Error handling transcript:', error);
  }
}

/**
 * Translates text using OpenAI with context
 */
async function translateText(text: string, context: StreamContext): Promise<string | null> {
  if (!openai) return null;
  
  try {
    // Build the context prompt
    const contextPrompt = context.previousSentences.length > 0
      ? `Previous context:\n${context.previousSentences.join('\n')}\n\n`
      : '';
    
    // Get language-specific instructions and glossary
    const languageInstructions = getLanguageInstructions(context.languageTarget);
    const glossaryPrompt = getGlossaryPrompt(context.languageTarget);
    
    const systemPrompt = `You are a professional translator specializing in Christian sermon content.
${languageInstructions}

${glossaryPrompt}

Translation Guidelines:
- Maintain the speaker's tone and emotion
- Keep proper names and biblical references accurate
- Preserve emphasis and rhetorical devices
- Ensure natural flow in the target language
- DO NOT add explanations or notes
- Return ONLY the translated text`;

    const userPrompt = `${contextPrompt}Translate the following text to ${context.languageTarget}:\n"${text}"`;
    
    const completion = await openai.chat.completions.create({
      model: config.openai.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: config.translation.temperature,
      max_tokens: Math.ceil(text.length * 1.5) + 100, // Allow for expansion
    });
    
    const translatedText = completion.choices[0]?.message?.content?.trim();
    
    if (!translatedText) {
      console.warn('[Translation-Worker] Empty translation response');
      return null;
    }
    
    return translatedText;
    
  } catch (error) {
    console.error('[Translation-Worker] Translation error:', error);
    return null;
  }
}

/**
 * Updates the rolling context window
 */
function updateContext(context: StreamContext, newSentence: string) {
  context.previousSentences.push(newSentence);
  
  // Keep only the last N sentences
  if (context.previousSentences.length > config.translation.contextWindowSize) {
    context.previousSentences.shift();
  }
  
  context.sentenceCount++;
}

/**
 * Handles control messages
 */
async function handleControlMessage(message: string, channel: string) {
  try {
    const control = JSON.parse(message);
    const { action, streamId, targetLanguage } = control;
    
    console.log(`[Translation-Worker] Control message: ${action} for stream ${streamId}`);
    
    switch (action) {
      case 'start':
      case 'start_translation':
        // Initialize stream context
        if (!activeStreams.has(streamId)) {
          activeStreams.set(streamId, {
            streamId,
            languageTarget: targetLanguage || 'es', // Default to Spanish
            previousSentences: [],
            sentenceCount: 0
          });
          console.log(`[Translation-Worker] Started translation context for ${streamId} (${targetLanguage})`);
        }
        break;
        
      case 'stop':
      case 'force_stop':
      case 'translation_complete':
        // Clean up stream context
        if (activeStreams.has(streamId)) {
          const context = activeStreams.get(streamId)!;
          console.log(`[Translation-Worker] Stopping translation for ${streamId}. Processed ${context.sentenceCount} sentences.`);
          activeStreams.delete(streamId);
          
          // Notify completion
          await pubRedisClient.publish(
            `stream:status:${streamId}`,
            JSON.stringify({
              status: 'translation_complete',
              streamId,
              sentenceCount: context.sentenceCount,
              timestamp: Date.now()
            })
          );
        }
        break;
    }
  } catch (error) {
    console.error('[Translation-Worker] Error handling control message:', error);
  }
}

/**
 * Starts listening to Redis channels
 */
async function startListening() {
  console.log('[Translation-Worker] Starting to listen for transcripts...');

  // Subscribe to transcribed text pattern (for all streams)
  await subRedisClient.psubscribe('text:transcribed:*');
  
  // Subscribe to control channel
  await subRedisClient.subscribe('stream:control');

  // Handle messages
  subRedisClient.on('pmessage', async (pattern, channel, message) => {
    if (channel.startsWith('text:transcribed:')) {
      await handleTranscript(message, channel);
    }
  });

  subRedisClient.on('message', async (channel, message) => {
    if (channel === 'stream:control') {
      await handleControlMessage(message, channel);
    }
  });

  console.log('[Translation-Worker] Listening for transcripts...');
}

/**
 * Graceful shutdown handler
 */
async function shutdown() {
  if (isShuttingDown) return;
  console.log('[Translation-Worker] Shutting down...');
  isShuttingDown = true;

  // Log final statistics
  for (const [streamId, context] of activeStreams.entries()) {
    console.log(`[Translation-Worker] Stream ${streamId}: Processed ${context.sentenceCount} sentences`);
  }

  // Clear contexts
  activeStreams.clear();

  // Disconnect Redis
  const disconnectPromises = [];
  if (subRedisClient.status === 'ready') {
    disconnectPromises.push(subRedisClient.disconnect());
  }
  if (pubRedisClient.status === 'ready') {
    disconnectPromises.push(pubRedisClient.disconnect());
  }

  try {
    await Promise.all(disconnectPromises);
    console.log('[Translation-Worker] Redis clients disconnected.');
  } catch (error) {
    console.error('[Translation-Worker] Error during disconnect:', error);
  }

  console.log('[Translation-Worker] Shutdown complete.');
  process.exit(0);
}

/**
 * Main entry point
 */
async function main() {
  try {
    await initializeClients();
    await startListening();
    
    // Keep the process running
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    
  } catch (error) {
    console.error('[Translation-Worker] Critical error:', error);
    process.exit(1);
  }
}

// Start the worker
main();