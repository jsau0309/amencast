import { Redis, RedisOptions } from 'ioredis';
import { config } from './config';
import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import { AssemblyAIStreamManager } from './AssemblyAIStreamManager';
import { buildGlossaryInjection } from './translator/glossary';

console.log('[STT-Translation-Worker] Starting up...');

// Define interfaces for our job context
interface JobContext {
    streamId: string;
    targetLanguage: string;
    stopping?: boolean; // A forceful stop command was received
}

// In-memory store for active job contexts.
const activeJobs = new Map<string, JobContext>();
const transcriptQueues = new Map<string, string[]>();
const isProcessing = new Map<string, boolean>();

// Initialize Redis clients
const redisOptions: RedisOptions = {
  host: config.redis.host,
  port: config.redis.port,
  username: 'default',
  lazyConnect: true,
};
if (config.redis.password) redisOptions.password = config.redis.password;
if (config.redis.tlsEnabled) redisOptions.tls = {};

const subscriber = new Redis(redisOptions);
const publisher = new Redis(redisOptions);
const controlSubscriber = new Redis(redisOptions);

// Initialize API clients
if (!config.openai.apiKey) {
    throw new Error("OPENAI_API_KEY is not set. The worker cannot start.");
}
const openai = new OpenAI({ apiKey: config.openai.apiKey });

let isShuttingDown = false;

// Initialize our new AssemblyAI Stream Manager
const streamManager = new AssemblyAIStreamManager();

// This function processes a single transcript. It contains the core translation and TTS logic.
async function processSingleTranscript(streamId: string, sourceText: string) {
    const job = activeJobs.get(streamId);
    if (!job) {
        // This can happen if the job is cleaned up while a transcript is in the queue.
        // It's safe to just skip processing in this case.
        console.warn(`[STT-Translation-Worker] [${streamId}] Skipped processing transcript because job is no longer active.`);
        return;
    }
    if (!sourceText.trim()) {
        // Don't log, as this is a common occurrence for pauses.
        return;
    }
    console.log(`[STT-Translation-Worker] [${streamId}] STT Result: "${sourceText}"`);

    try {
        const glossaryInjection = buildGlossaryInjection(job.targetLanguage);
        const systemPrompt = `You are an expert real-time translator for a live sermon. Your task is to translate the user's text from English to ${job.targetLanguage} as literally and accurately as possible.
${glossaryInjection}
**Your instructions are absolute:**
1.  **Preserve Original Terms:** Unless specified in the glossary, do NOT translate proper nouns (e.g., "Silicon Valley"), or other specific names. Keep them in their original English.
2.  **Translate Bible Verses:** All biblical text and references must be translated.
3.  **No Interpretation:** Do NOT interpret, paraphrase, or add any content that was not in the original text. Your role is to be a direct and precise conduit.
4.  **Maintain Tone:** The output must be formal and respectful, suitable for a religious setting.
5.  **Output:** Only return the translated text and nothing else.`;

        const translationResponse = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: sourceText }
            ],
            temperature: 0,
        });

        const translatedText = translationResponse.choices[0]?.message?.content?.trim();
        if (!translatedText) {
            console.warn(`[STT-Translation-Worker] [${streamId}] Translation returned empty text.`);
            return;
        }
        console.log(`[STT-Translation-Worker] [${streamId}] Translation Result: "${translatedText}"`);

        // NEW: Publish the translated text to Redis instead of sending to TTS worker.
        const translatedTextChannel = `translated_text:${streamId}`;
        await publisher.publish(translatedTextChannel, translatedText);
        console.log(`[STT-Translation-Worker] [${streamId}] Published translated text to ${translatedTextChannel}`);

    } catch (error) {
         console.error(`[STT-Translation-Worker] [${streamId}] Error during translation:`, error);
    }
}

// Processes the transcript queue for a given streamId to ensure sequential handling.
async function processTranscriptQueue(streamId: string) {
    if (isProcessing.get(streamId)) {
        return; // Already processing this queue.
    }

    const queue = transcriptQueues.get(streamId);
    if (!queue) return;

    // The new logic in AssemblyAIStreamManager handles completion, so we only need to check for a forced stop.
    if (queue.length === 0) {
        const job = activeJobs.get(streamId);
        if (job && job.stopping) {
            console.log(`[STT-Translation-Worker] [${streamId}] Queue is empty and stream is stopping. Performing final cleanup.`);
            
            // This is a forced stop, so we clean up immediately.
            activeJobs.delete(streamId);
            transcriptQueues.delete(streamId);
            isProcessing.delete(streamId);
        }
        return;
    }

    isProcessing.set(streamId, true);

    while (queue.length > 0) {
        const textToProcess = queue.shift();
        if (textToProcess) {
            await processSingleTranscript(streamId, textToProcess);
        }
    }

    isProcessing.set(streamId, false);

    // After processing, immediately check again in case the stop command was received during processing.
    await processTranscriptQueue(streamId);
}

// This function handles the final, transcribed text from AssemblyAI and adds it to the queue.
async function handleFinalTranscript(streamId: string, sourceText: string) {
    const queue = transcriptQueues.get(streamId);
    
    // It's possible to receive a final transcript from AssemblyAI after we have already
    // processed the queue and cleaned up the job. In this case, the queue will not exist.
    if (queue) {
        queue.push(sourceText);
        // We always try to process the queue immediately after adding an item.
        await processTranscriptQueue(streamId);
    } else {
        console.log(`[STT-Translation-Worker] [${streamId}] Job fully stopped. Final transcript discarded: "${sourceText}"`);
    }
}

async function listenForAudioChunks() {
    await subscriber.psubscribe('audio_chunks:*');
    console.log('[STT-Translation-Worker] Subscribed to audio_chunks:* channel pattern.');

    subscriber.on('pmessageBuffer', (pattern, channelBuffer, messageBuffer) => {
        if (pattern.toString() === 'audio_chunks:*') {
            const streamId = channelBuffer.toString().split(':')[1];
            if (streamId) {
                // Directly forward the audio chunk to the stream manager.
                streamManager.sendAudio(streamId, messageBuffer);
            }
        }
    });
}

async function listenForControlMessages() {
    await controlSubscriber.subscribe('stream_control');
    console.log('[STT-Translation-Worker] Subscribed to stream_control channel.');

    const onTranscriptionComplete = async (streamId: string, error?: Error) => {
        if (error) {
            console.error(`[STT-Translation-Worker] [${streamId}] Transcription completed with error:`, error.message);
        } else {
            console.log(`[STT-Translation-Worker] [${streamId}] Transcription completed successfully.`);
        }
        
        // This is now the single point of truth for a stream finishing normally.
        const completionCommand = {
            action: 'stt_complete',
            streamId: streamId,
        };
        await publisher.publish('stream_control', JSON.stringify(completionCommand));
        console.log(`[STT-Translation-Worker] Published STT_COMPLETE command for stream ${streamId}`);
        
        // The STT worker's job is done. We no longer publish the 'completed' status directly.
        // The TTS worker will do that after it finishes synthesizing.
    };

    controlSubscriber.on('message', async (channel, message) => {
        if (channel !== 'stream_control') return;

        try {
            const command = JSON.parse(message);
            const streamId = command.streamId;

            if (command.action === 'start' && streamId && command.targetLanguage) {
                if (activeJobs.has(streamId)) {
                    console.warn(`[STT-Translation-Worker] Received duplicate START command for stream ${streamId}. Ignoring.`);
                    return;
                }
                console.log(`[STT-Translation-Worker] Received START command for stream ${streamId} -> ${command.targetLanguage}`);
                
                // Initialize state for the new stream
                transcriptQueues.set(streamId, []);
                isProcessing.set(streamId, false);
                
                // Start the AssemblyAI stream and provide our handler as the callback
                await streamManager.startStream(streamId, handleFinalTranscript, onTranscriptionComplete);
                
                const job: JobContext = {
                    streamId: streamId,
                    targetLanguage: command.targetLanguage,
                };
                activeJobs.set(streamId, job);

            } else if (command.action === 'stop' && streamId) {
                console.log(`[STT-Translation-Worker] Received STOP command for stream ${streamId}`);
                const job = activeJobs.get(streamId);
                if (job) {
                    job.stopping = true;
                    // Forcefully stop the AssemblyAI stream.
                    await streamManager.stopStream(streamId);
                    // Attempt to process any remaining items in the queue.
                    await processTranscriptQueue(streamId);
                }
            } else if (command.action === 'ingestion_complete' && streamId) {
                console.log(`[STT-Translation-Worker] Received INGESTION_COMPLETE command for stream ${streamId}`);
                // Signal to the manager that no more audio is coming.
                // The manager will now wait for AssemblyAI to finish processing and then fire the completion callback.
                await streamManager.signalAudioStreamEnd(streamId);
            }
        } catch (error) {
            console.error('[STT-Translation-Worker] Could not parse control message:', message, error);
        }
    });
}

function signalShutdownHandler() {
    if (isShuttingDown) return;
    console.log('[STT-Translation-Worker] Shutdown signal received.');
    isShuttingDown = true;
    
    Promise.all([
        subscriber.quit(),
        publisher.quit(),
        controlSubscriber.quit(),
    ]).then(() => {
        console.log('[STT-Translation-Worker] Redis clients disconnected. Shutdown complete.');
        process.exit(0);
    }).catch(err => {
        console.error('[STT-Translation-Worker] Error during Redis disconnection:', err);
        process.exit(1);
    });

    setTimeout(() => {
        console.warn('[STT-Translation-Worker] Graceful shutdown timeout. Forcing exit.');
        process.exit(1);
    }, 5000);
}

async function main() {
    try {
        await Promise.all([
            subscriber.connect(),
            publisher.connect(),
            controlSubscriber.connect()
        ]);
        console.log('[STT-Translation-Worker] All Redis clients connected.');

        await listenForAudioChunks();
        await listenForControlMessages();

        console.log('[STT-Translation-Worker] Worker is running and listening for jobs.');

    } catch (error) {
        console.error('[STT-Translation-Worker] Critical error during startup:', error);
        process.exit(1);
    }
}

process.on('SIGINT', signalShutdownHandler);
process.on('SIGTERM', signalShutdownHandler);

main(); 