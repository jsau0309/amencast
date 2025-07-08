import { AssemblyAI } from 'assemblyai';
import { config } from './config';

// Define the shape of the callback function that will handle final transcripts.
type TranscriptCallback = (streamId: string, transcript: string) => void;
type CompletionCallback = (streamId: string, error?: Error) => void;

type StreamStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'stopping';

interface StreamState {
  transcriber: any;
  onTranscriptCallback: TranscriptCallback;
  onCompletionCallback: CompletionCallback;
  status: StreamStatus;
  reconnectAttempts: number;
  keepAliveInterval: NodeJS.Timeout | null;
  lastAudioSentTime: number;
}

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_MS = 1000;
const KEEP_ALIVE_INTERVAL_MS = 5000;
const SILENT_AUDIO_CHUNK = Buffer.alloc(3200, 0); // 100ms of silence at 16kHz 16-bit mono

/**
 * Manages stateful WebSocket connections to AssemblyAI's real-time transcription service.
 * This class abstracts the complexity of handling multiple, simultaneous audio streams.
 */
export class AssemblyAIStreamManager {
    private client: AssemblyAI;
    private activeStreams = new Map<string, StreamState>();

    constructor() {
        if (!config.assemblyai.apiKey) {
            throw new Error('[AssemblyAIStreamManager] API key is not configured.');
        }
        this.client = new AssemblyAI({ apiKey: config.assemblyai.apiKey });
    }

    /**
     * Creates a new transcriber instance, connects to AssemblyAI, and sets up listeners.
     * @param streamId A unique identifier for the audio stream.
     * @param onTranscriptCallback A callback function to be invoked with the final transcript.
     * @param onCompletionCallback A callback function to be invoked when the stream ends.
     */
    public async startStream(streamId: string, onTranscriptCallback: TranscriptCallback, onCompletionCallback: CompletionCallback): Promise<void> {
        if (this.activeStreams.has(streamId)) {
            console.warn(`[AssemblyAIStreamManager] Stream ${streamId} is already active.`);
            return;
        }
        console.log(`[AssemblyAIStreamManager] Starting stream: ${streamId}`);
        this.activeStreams.set(streamId, {
            transcriber: null,
            onTranscriptCallback,
            onCompletionCallback,
            status: 'idle',
            reconnectAttempts: 0,
            keepAliveInterval: null,
            lastAudioSentTime: Date.now(),
        });

        this.connectStream(streamId);
    }

    private async connectStream(streamId: string): Promise<void> {
        const streamState = this.activeStreams.get(streamId);
        if (!streamState || streamState.status === 'stopping' || streamState.status === 'connected') {
            console.log(`[AssemblyAIStreamManager] [${streamId}] Aborting connection attempt (status: ${streamState?.status}).`);
            return;
        }

        streamState.status = 'connecting';
        const transcriber = this.client.realtime.transcriber({ sampleRate: 16000 });

        transcriber.on('transcript.final', (transcript: { text: string; }) => {
            if (transcript.text) {
                console.log(`[AssemblyAIStreamManager] [${streamId}] Final transcript received: "${transcript.text}"`);
                streamState.onTranscriptCallback(streamId, transcript.text);
            }
        });

        transcriber.on('error', (error: Error) => {
            console.error(`[AssemblyAIStreamManager] [${streamId}] Transcriber error:`, error);
        });

        transcriber.on('close', (code: number, reason: string) => {
            console.log(`[AssemblyAIStreamManager] [${streamId}] Connection closed: ${code} ${reason}`);
            streamState.status = 'idle';
            this.handleDisconnect(streamId, code);
        });

        try {
            console.log(`[AssemblyAIStreamManager] [${streamId}] Attempting to connect...`);
            await transcriber.connect();
            console.log(`[AssemblyAIStreamManager] [${streamId}] Successfully connected.`);
            streamState.transcriber = transcriber;
            streamState.status = 'connected';
            streamState.reconnectAttempts = 0;
            streamState.lastAudioSentTime = Date.now();
            this.startKeepAlive(streamId);
        } catch (error) {
            console.error(`[AssemblyAIStreamManager] [${streamId}] Failed to connect:`, error);
            this.handleDisconnect(streamId, 4000);
        }
    }
    
    private handleDisconnect(streamId: string, code: number): void {
        const streamState = this.activeStreams.get(streamId);
        if (!streamState) return;

        this.stopKeepAlive(streamId);

        if (streamState.status === 'stopping') {
            console.log(`[AssemblyAIStreamManager] [${streamId}] Stream was commanded to stop. Not reconnecting.`);
            streamState.onCompletionCallback(streamId);
            this.activeStreams.delete(streamId);
            return;
        }

        if (code !== 1000 && code !== 1005) {
            if (streamState.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                streamState.reconnectAttempts++;
                streamState.status = 'reconnecting';
                console.log(`[AssemblyAIStreamManager] [${streamId}] Abnormal disconnect (code ${code}). Reconnecting in ${RECONNECT_DELAY_MS}ms. Attempt #${streamState.reconnectAttempts}`);
                setTimeout(() => this.connectStream(streamId), RECONNECT_DELAY_MS);
            } else {
                console.error(`[AssemblyAIStreamManager] [${streamId}] Max reconnect attempts reached. Signaling completion with error.`);
                streamState.onCompletionCallback(streamId, new Error(`Failed to reconnect after ${MAX_RECONNECT_ATTEMPTS} attempts.`));
                this.activeStreams.delete(streamId);
            }
        } else {
             console.log(`[AssemblyAIStreamManager] [${streamId}] Normal disconnect (code ${code}). Not reconnecting.`);
             this.activeStreams.delete(streamId);
        }
    }

    private startKeepAlive(streamId: string): void {
        const streamState = this.activeStreams.get(streamId);
        if (!streamState || streamState.keepAliveInterval) return;

        streamState.keepAliveInterval = setInterval(() => {
            if (Date.now() - streamState.lastAudioSentTime > KEEP_ALIVE_INTERVAL_MS) {
                if (streamState.transcriber && streamState.status === 'connected') {
                    streamState.transcriber.send(SILENT_AUDIO_CHUNK);
                }
            }
        }, KEEP_ALIVE_INTERVAL_MS);
    }

    private stopKeepAlive(streamId: string): void {
        const streamState = this.activeStreams.get(streamId);
        if (streamState && streamState.keepAliveInterval) {
            clearInterval(streamState.keepAliveInterval);
            streamState.keepAliveInterval = null;
        }
    }

    /**
     * Forwards a raw audio chunk to the correct transcriber instance.
     * @param streamId The unique identifier for the audio stream.
     * @param audioChunk The raw audio data (Buffer).
     */
    public sendAudio(streamId: string, audioChunk: Buffer): void {
        const streamState = this.activeStreams.get(streamId);
        if (!streamState || streamState.status !== 'connected' || !streamState.transcriber) {
            return;
        }
        streamState.transcriber.send(audioChunk);
        streamState.lastAudioSentTime = Date.now();
    }

    public async signalAudioStreamEnd(streamId: string): Promise<void> {
        const streamState = this.activeStreams.get(streamId);
        if (!streamState) {
            console.warn(`[AssemblyAIStreamManager] Attempted to signal end for an inactive stream: ${streamId}.`);
            return;
        }

        console.log(`[AssemblyAIStreamManager] Signaling end of audio for stream: ${streamId}. Waiting for final transcripts.`);
        streamState.status = 'stopping';
        this.stopKeepAlive(streamId);

        if (streamState.transcriber) {
            await streamState.transcriber.close();
        } else {
            console.log(`[AssemblyAIStreamManager] [${streamId}] No active transcriber, completing immediately.`);
            streamState.onCompletionCallback(streamId);
            this.activeStreams.delete(streamId);
        }
    }

    /**
     * Gracefully closes the WebSocket connection for a specific stream and cleans up resources.
     * @param streamId The unique identifier for the audio stream.
     */
    public async stopStream(streamId: string): Promise<void> {
        const streamState = this.activeStreams.get(streamId);
        if (!streamState) {
            console.warn(`[AssemblyAIStreamManager] Attempted to stop an inactive stream: ${streamId}.`);
            return;
        }
        
        console.log(`[AssemblyAIStreamManager] Force stopping stream: ${streamId}`);
        streamState.status = 'stopping';
        this.stopKeepAlive(streamId);

        if (streamState.transcriber) {
            await streamState.transcriber.close();
        }
        this.activeStreams.delete(streamId);
    }
} 