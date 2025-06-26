import { Redis, RedisOptions } from 'ioredis';
import { config } from './config';
import OpenAI from 'openai';
import { Readable } from 'stream';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';

console.log('[RealtimeWorker] Starting up...');

// Define interfaces for our job context
interface JobContext {
    streamId: string;
    targetLanguage: string;
}

// In-memory store for active job contexts.
const activeJobs = new Map<string, JobContext>();

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
const publisher = new Redis(redisOptions); // For Phase 4
const controlSubscriber = new Redis(redisOptions); // For handling start/stop commands

// Initialize API clients
if (!config.openai.apiKey) {
    throw new Error("OPENAI_API_KEY is not set. The worker cannot start.");
}
const openai = new OpenAI({ apiKey: config.openai.apiKey });

let isShuttingDown = false;

// Helper function to create a WAV header for a PCM audio buffer
function createWavHeader(dataLength: number): Buffer {
    const header = Buffer.alloc(44);
    const sampleRate = 16000;
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);

    // RIFF identifier
    header.write('RIFF', 0);
    // file length
    header.writeUInt32LE(36 + dataLength, 4);
    // WAVE identifier
    header.write('WAVE', 8);
    // fmt chunk identifier
    header.write('fmt ', 12);
    // fmt chunk length
    header.writeUInt32LE(16, 16);
    // sample format (1 for PCM)
    header.writeUInt16LE(1, 20);
    // number of channels
    header.writeUInt16LE(numChannels, 22);
    // sample rate
    header.writeUInt32LE(sampleRate, 24);
    // byte rate
    header.writeUInt32LE(byteRate, 28);
    // block align
    header.writeUInt16LE(blockAlign, 32);
    // bits per sample
    header.writeUInt16LE(bitsPerSample, 34);
    // data chunk identifier
    header.write('data', 36);
    // data chunk length
    header.writeUInt32LE(dataLength, 40);

    return header;
}

async function handleAudioChunk(channel: string, message: Buffer) {
    const streamId = channel.split(':')[1];
    if (!streamId) {
        console.error(`[RealtimeWorker] Received chunk on invalid channel: ${channel}`);
        return;
    }

    const job = activeJobs.get(streamId);
    if (!job) {
        console.warn(`[RealtimeWorker] [${streamId}] No active job context found. Ignoring chunk.`);
        return;
    }

    console.log(`[RealtimeWorker] [${streamId}] Received ${message.length} byte chunk for processing.`);
    
    // Define tempFilePath outside the try block to ensure it's accessible in finally
    const tempFilePath = path.join(os.tmpdir(), `amencast-audio-chunk-${uuidv4()}.wav`);

    try {
        // Create a full WAV file in memory by prepending the header
        const wavHeader = createWavHeader(message.length);
        const wavBuffer = Buffer.concat([wavHeader, message]);

        // Write buffer to a temporary file
        await fsp.writeFile(tempFilePath, wavBuffer);

        // Phase 2: Speech-to-Text (STT) with Whisper
        const transcription = await openai.audio.transcriptions.create({
            file: fs.createReadStream(tempFilePath),
            model: 'whisper-1',
        });

        const sourceText = transcription.text;

        // Log the result for our testing gate
        console.log(`[RealtimeWorker] [${streamId}] STT Result: "${sourceText}"`);

        if (!sourceText.trim()) {
            console.log(`[RealtimeWorker] [${streamId}] Whisper returned empty text. No further action.`);
            return;
        }

        // --- Phase 3: Translation ---
        console.log(`[RealtimeWorker] [${streamId}] Translating to ${job.targetLanguage}...`);
        const translationResponse = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [
                { role: 'system', content: `You are an expert translator. Translate the following text accurately into ${job.targetLanguage}.` },
                { role: 'user', content: sourceText }
            ],
            temperature: 0.3,
        });

        const translatedText = translationResponse.choices[0]?.message?.content?.trim();
        if (!translatedText) {
            console.warn(`[RealtimeWorker] [${streamId}] Translation returned empty text.`);
            return;
        }
        console.log(`[RealtimeWorker] [${streamId}] Translation Result: "${translatedText}"`);

        // Placeholder for Phase 4 (TTS)
        // await handleTTS(streamId, translatedText);

    } catch (error) {
        console.error(`[RealtimeWorker] [${streamId}] Error during STT processing:`, error);
    } finally {
        // Clean up the temporary file
        try {
            await fsp.unlink(tempFilePath);
        } catch (cleanupError) {
            console.error(`[RealtimeWorker] [${streamId}] Error cleaning up temp file ${tempFilePath}:`, cleanupError);
        }
    }
}

async function listenForAudioChunks() {
    await subscriber.psubscribe('audio_chunks:*');
    console.log('[RealtimeWorker] Subscribed to audio_chunks:* channel pattern.');

    subscriber.on('pmessageBuffer', (pattern, channelBuffer, messageBuffer) => {
        if (pattern.toString() === 'audio_chunks:*') {
            const channel = channelBuffer.toString();
            handleAudioChunk(channel, messageBuffer).catch(err => {
                console.error(`[RealtimeWorker] Unhandled error in handleAudioChunk for channel ${channel}:`, err);
            });
        }
    });
}

async function listenForControlMessages() {
    await controlSubscriber.subscribe('stream_control');
    console.log('[RealtimeWorker] Subscribed to stream_control channel.');

    controlSubscriber.on('message', (channel, message) => {
        if (channel !== 'stream_control') return;

        try {
            const command = JSON.parse(message);
            if (command.action === 'start' && command.streamId && command.targetLanguage) {
                console.log(`[RealtimeWorker] Received START command for stream ${command.streamId} -> ${command.targetLanguage}`);
                activeJobs.set(command.streamId, {
                    streamId: command.streamId,
                    targetLanguage: command.targetLanguage,
                });
            } else if (command.action === 'stop' && command.streamId) {
                console.log(`[RealtimeWorker] Received STOP command for stream ${command.streamId}`);
                activeJobs.delete(command.streamId);
            }
        } catch (error) {
            console.error('[RealtimeWorker] Could not parse control message:', message, error);
        }
    });
}

function signalShutdownHandler() {
    if (isShuttingDown) return;
    console.log('[RealtimeWorker] Shutdown signal received.');
    isShuttingDown = true;
    
    Promise.all([
        subscriber.quit(),
        publisher.quit(),
        controlSubscriber.quit(),
    ]).then(() => {
        console.log('[RealtimeWorker] Redis clients disconnected. Shutdown complete.');
        process.exit(0);
    }).catch(err => {
        console.error('[RealtimeWorker] Error during Redis disconnection:', err);
        process.exit(1);
    });

    setTimeout(() => {
        console.warn('[RealtimeWorker] Graceful shutdown timeout. Forcing exit.');
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
        console.log('[RealtimeWorker] All Redis clients connected.');

        await listenForAudioChunks();
        await listenForControlMessages();

        console.log('[RealtimeWorker] Worker is running and listening for jobs.');

    } catch (error) {
        console.error('[RealtimeWorker] Critical error during startup:', error);
        process.exit(1);
    }
}

process.on('SIGINT', signalShutdownHandler);
process.on('SIGTERM', signalShutdownHandler);

main(); 