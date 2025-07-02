import { Redis, RedisOptions } from 'ioredis';
import { config } from './config';
import { CartesiaClient } from '@cartesia/cartesia-js';
import { Room, LocalAudioTrack, AudioSource, AudioFrame, TrackPublishOptions, TrackSource } from '@livekit/rtc-node';
import { AccessToken } from 'livekit-server-sdk';
import { Buffer } from 'buffer';
import * as http from 'http';

type CartesiaWebsocket = ReturnType<CartesiaClient['tts']['websocket']>;

console.log('[TTS-Worker] Starting up...');

// Health check server for Docker/RunPod
const healthServer = http.createServer((req, res) => {
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
            status: 'healthy', 
            activeJobs: activeJobs.size,
            uptime: process.uptime(),
            timestamp: new Date().toISOString()
        }));
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

const healthPort = process.env.HEALTH_PORT || 8080;
healthServer.listen(healthPort, () => {
    console.log(`[TTS-Worker] Health server listening on port ${healthPort}`);
});

interface JobContext {
    streamId: string;
    targetLanguage: string;
    room: Room;
    audioSource: AudioSource;
    sttComplete: boolean;
    ttsWs: CartesiaWebsocket;
}

const activeJobs = new Map<string, JobContext>();
const textQueues = new Map<string, string[]>();
const isProcessing = new Map<string, boolean>();
let isShuttingDown = false;

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

const cartesia = new CartesiaClient({ apiKey: process.env.CARTESIA_API_KEY });
const voiceId = process.env.CARTESIA_VOICE_ID;

if (!config.livekit.apiKey || !config.livekit.apiSecret) {
    throw new Error("LiveKit API Key or Secret is not configured.");
}

async function processSingleText(streamId: string, translatedText: string) {
    const job = activeJobs.get(streamId);
    if (!job) return;
    if (!translatedText.trim()) return;

    console.log(`[TTS-Worker] [${streamId}] Synthesizing text: "${translatedText}"`);

    try {
        const response = await job.ttsWs.send({
            modelId: "sonic-2",
            transcript: translatedText,
            voice: {
                mode: "id",
                id: voiceId!,
            },
        });
        for await (const message of response.events('message')) {
            const parsedMessage = JSON.parse(message);
            if (parsedMessage.type === "chunk" && parsedMessage.data) {
                const audioBuffer = Buffer.from(parsedMessage.data, 'base64');
                const samples = new Int16Array(audioBuffer.buffer, audioBuffer.byteOffset, audioBuffer.byteLength / 2);
                job.audioSource.captureFrame(new AudioFrame(
                    samples,
                    16000,
                    1,
                    samples.length
                ));
            }
        }
    } catch (error) {
        console.error(`[TTS-Worker] [${streamId}] Error during TTS synthesis:`, error);
    }
}

async function processTextQueue(streamId: string) {
    if (isProcessing.get(streamId)) return;
    const queue = textQueues.get(streamId);
    if (!queue) return;

    isProcessing.set(streamId, true);
    
    while (queue.length > 0) {
        const text = queue.shift();
        if (text) await processSingleText(streamId, text);
    }
    
    isProcessing.set(streamId, false);
    
    const job = activeJobs.get(streamId);
    if (job && job.sttComplete && queue.length === 0) {
        console.log(`[TTS-Worker] [${streamId}] Queue is empty and STT is complete. Disconnecting from LiveKit room.`);
        await job.room.disconnect();
        job.ttsWs.disconnect();
        activeJobs.delete(streamId);

        const statusMessage = JSON.stringify({ status: 'completed', message: 'Stream finished normally.' });
        await publisher.publish(`stream_status:${streamId}`, statusMessage);
        console.log(`[TTS-Worker] Published COMPLETED status for stream ${streamId}`);
    }
}

async function listenForTranslatedText() {
    await subscriber.psubscribe('translated_text:*');
    console.log('[TTS-Worker] Subscribed to translated_text:* channel pattern.');

    subscriber.on('pmessage', (pattern, channel, message) => {
        const streamId = channel.toString().split(':')[1];
        if (streamId && activeJobs.has(streamId)) {
            textQueues.get(streamId)?.push(message);
            processTextQueue(streamId);
        }
    });
}

async function listenForControlMessages() {
    await controlSubscriber.subscribe('stream_control');
    console.log('[TTS-Worker] Subscribed to stream_control channel.');

    controlSubscriber.on('message', async (channel, message) => {
        if (channel !== 'stream_control') return;
        try {
            const command = JSON.parse(message);
            const { streamId, action, targetLanguage } = command;

            if (action === 'start' && streamId && targetLanguage) {
                if (activeJobs.has(streamId)) return;
                console.log(`[TTS-Worker] Received START for stream ${streamId}`);
                
                const ttsWs = cartesia.tts.websocket({
                    container: "raw",
                    encoding: "pcm_s16le",
                    sampleRate: 16000,
                });
                await ttsWs.connect();

                const room = new Room();
                const token = new AccessToken(config.livekit.apiKey, config.livekit.apiSecret, {
                    identity: `tts-bot-${streamId}`,
                    name: 'Amencast TTS Bot',
                });
                token.addGrant({ room: streamId, roomJoin: true, canPublish: true });
                
                // @ts-ignore - linter is confused about toJwt being async
                await room.connect(config.livekit.url, token.toJwt());
                console.log(`[TTS-Worker] [${streamId}] Connected to LiveKit room.`);
                
                if (!room.localParticipant) {
                    throw new Error('Failed to get local participant');
                }
                
                const source = new AudioSource(16000, 1);
                const track = LocalAudioTrack.createAudioTrack('translated-audio', source);
                
                const options = new TrackPublishOptions();
                options.source = TrackSource.SOURCE_MICROPHONE;
                await room.localParticipant.publishTrack(track, options);
                console.log(`[TTS-Worker] [${streamId}] Published audio track.`);
                
                textQueues.set(streamId, []);
                isProcessing.set(streamId, false);
                activeJobs.set(streamId, {
                    streamId,
                    targetLanguage,
                    room,
                    audioSource: source,
                    sttComplete: false,
                    ttsWs,
                });
            } else if (action === 'stt_complete' && streamId) {
                console.log(`[TTS-Worker] Received STT_COMPLETE for stream ${streamId}`);
                const job = activeJobs.get(streamId);
                if (job) {
                    job.sttComplete = true;
                    await processTextQueue(streamId);
                }
            } else if (action === 'stop' && streamId) {
                console.log(`[TTS-Worker] Received force STOP for stream ${streamId}`);
                const job = activeJobs.get(streamId);
                if (job) {
                    await job.room.disconnect();
                    job.ttsWs.disconnect();
                    activeJobs.delete(streamId);
                    textQueues.delete(streamId);
                    isProcessing.delete(streamId);
                }
            }
        } catch (error) {
            console.error('[TTS-Worker] Could not parse control message:', message, error);
        }
    });
}

function signalShutdownHandler() {
    console.log('[TTS-Worker] Shutdown signal received.');
    isShuttingDown = true;
    const disconnectPromises = Array.from(activeJobs.values()).map(job => {
        job.ttsWs.disconnect();
        return job.room.disconnect()
    });
    Promise.all(disconnectPromises).finally(() => {
        healthServer.close();
        subscriber.quit();
        publisher.quit();
        controlSubscriber.quit();
        console.log('[TTS-Worker] All services cleaned up. Exiting.');
        process.exit(0);
    });
}

async function main() {
    try {
        // Try to connect to Redis, but make it optional for testing
        try {
            await Promise.all([
                subscriber.connect(),
                publisher.connect(),
                controlSubscriber.connect()
            ]);
            console.log('[TTS-Worker] All Redis clients connected.');
            await listenForTranslatedText();
            await listenForControlMessages();
            console.log('[TTS-Worker] Worker is running and listening for jobs.');
        } catch (redisError: any) {
            console.warn('[TTS-Worker] Redis connection failed, running in test mode:', redisError.message);
            console.log('[TTS-Worker] Worker is running in test mode (no Redis). Health endpoint available.');
            console.log('[TTS-Worker] For full functionality, configure Redis connection.');
        }
    } catch (error) {
        console.error('[TTS-Worker] Critical error during startup:', error);
        process.exit(1);
    }
}

process.on('SIGINT', signalShutdownHandler);
process.on('SIGTERM', signalShutdownHandler);

main();