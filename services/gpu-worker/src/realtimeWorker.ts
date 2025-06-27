import { Redis, RedisOptions } from 'ioredis';
import { config } from './config';
import OpenAI from 'openai';
import { Readable } from 'stream';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { CartesiaClient } from '@cartesia/cartesia-js';

console.log('[RealtimeWorker] Starting up...');

// Define interfaces for our job context
interface JobContext {
    streamId: string;
    targetLanguage: string;
    ttsSocket: any; 
    ttsContextId: string; 
    isFirstChunk: boolean;
    ttsResponse: any; // To store the response object from the first .send() call
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
const publisher = new Redis(redisOptions);
const controlSubscriber = new Redis(redisOptions);

// Initialize API clients
if (!config.openai.apiKey) {
    throw new Error("OPENAI_API_KEY is not set. The worker cannot start.");
}
const openai = new OpenAI({ apiKey: config.openai.apiKey });

if (!process.env.CARTESIA_API_KEY) {
    throw new Error("CARTESIA_API_KEY is not set. The worker cannot start.");
}
const cartesia = new CartesiaClient({ 
    apiKey: process.env.CARTESIA_API_KEY,
    cartesiaVersion: "2024-06-10"
});

if (!process.env.CARTESIA_VOICE_ID) {
    throw new Error("CARTESIA_VOICE_ID is not set. The worker cannot start.");
}
const voiceId = process.env.CARTESIA_VOICE_ID;

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

// Function to pre-process text for Cartesia TTS according to best practices
function preprocessTextForTTS(text: string): string {
    return text.replace(/"/g, ' ');
}

async function handleAudioChunk(channel: string, message: Buffer) {
    const streamId = channel.split(':')[1];
    if (!streamId) return; // Guard against invalid channel names

    const job = activeJobs.get(streamId);

    if (!job) {
        return; 
    }

    console.log(`[RealtimeWorker] [${streamId}] Received ${message.length} byte chunk for processing.`);
    
    const tempFilePath = path.join(os.tmpdir(), `amencast-audio-chunk-${uuidv4()}.wav`);

    try {
        const wavHeader = createWavHeader(message.length);
        const wavBuffer = Buffer.concat([wavHeader, message]);
        await fsp.writeFile(tempFilePath, wavBuffer);

        const transcription = await openai.audio.transcriptions.create({
            file: fs.createReadStream(tempFilePath),
            model: 'whisper-1',
        });

        const sourceText = transcription.text;
        if (!sourceText.trim()) {
            console.log(`[RealtimeWorker] [${streamId}] Whisper returned empty text.`);
            return;
        }
        console.log(`[RealtimeWorker] [${streamId}] STT Result: "${sourceText}"`);

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

        const processedText = preprocessTextForTTS(translatedText);
        
        console.log(`[RealtimeWorker] [${streamId}] Sending text to Cartesia WebSocket...`);

        if (job.isFirstChunk) {
            job.isFirstChunk = false; 
            const response = await job.ttsSocket.send({
                modelId: "sonic-2",
                transcript: processedText,
                voice: { mode: "id", id: voiceId },
                language: job.targetLanguage,
                contextId: job.ttsContextId,
                outputFormat: { container: "raw", encoding: "pcm_f32le", sampleRate: 16000 },
                continue: true,
            });
            job.ttsResponse = response; 

            // This loop runs in the background for the duration of the stream
            (async () => {
                try {
                    for await (const msg of job.ttsResponse.events("message")) {
                        const chunk = JSON.parse(msg as string);
                        if (chunk.type === "chunk" && chunk.data) {
                            const audioBuffer = Buffer.from(chunk.data, 'base64');
                            if (audioBuffer.length > 0) {
                                const translatedAudioChannel = `translated_audio:${streamId}`;
                                console.log(`[RealtimeWorker] [${streamId}] Publishing ${audioBuffer.length} bytes of translated audio.`);
                                await publisher.publish(translatedAudioChannel, audioBuffer);
                            }
                        }
                    }
                } catch (error) {
                    console.error(`[RealtimeWorker] [${streamId}] Cartesia WebSocket error:`, error);
                    // Avoid deleting the job here, as it might still be processing other chunks.
                }
            })();
        } else {
            // Per the SDK README, the .continue() method requires the full context.
            await job.ttsSocket.continue({
                contextId: job.ttsContextId,
                transcript: processedText,
                modelId: "sonic-2",
                voice: { mode: "id", id: voiceId },
                language: job.targetLanguage,
                outputFormat: { container: "raw", encoding: "pcm_f32le", sampleRate: 16000 },
                continue: true,
            });
        }
        
    } catch (error) {
        console.error(`[RealtimeWorker] [${streamId}] Error during processing:`, error);
    } finally {
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

    controlSubscriber.on('message', async (channel, message) => {
        if (channel !== 'stream_control') return;

        try {
            const command = JSON.parse(message);
            const streamId = command.streamId;

            if (command.action === 'start' && streamId && command.targetLanguage) {
                if (activeJobs.has(streamId)) {
                    console.warn(`[RealtimeWorker] Received duplicate START command for stream ${streamId}. Ignoring.`);
                    return;
                }
                console.log(`[RealtimeWorker] Received START command for stream ${streamId} -> ${command.targetLanguage}`);
                
                const ttsSocket = cartesia.tts.websocket(command.targetLanguage);
                await ttsSocket.connect();
                console.log(`[RealtimeWorker] [${streamId}] Cartesia WebSocket connected.`);
                
                const job: JobContext = {
                    streamId: streamId,
                    targetLanguage: command.targetLanguage,
                    ttsSocket: ttsSocket,
                    ttsContextId: uuidv4(),
                    isFirstChunk: true,
                    ttsResponse: null,
                };
                activeJobs.set(streamId, job);

            } else if (command.action === 'stop' && streamId) {
                console.log(`[RealtimeWorker] Received STOP command for stream ${streamId}`);
                const job = activeJobs.get(streamId);
                if (job && job.ttsSocket) {
                    // Finalize the stream and disconnect
                    if (!job.isFirstChunk && job.ttsResponse) {
                        await job.ttsSocket.send({ contextId: job.ttsContextId, transcript: "", continue: false });
                    }
                    job.ttsSocket.disconnect();
                    console.log(`[RealtimeWorker] [${streamId}] Cartesia WebSocket disconnected.`);
                    activeJobs.delete(streamId);
                }
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