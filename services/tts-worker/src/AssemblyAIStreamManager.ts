import { AssemblyAI } from 'assemblyai';
import { config } from './config';

// Define the shape of the callback function that will handle final transcripts.
type TranscriptCallback = (streamId: string, transcript: string) => void;

/**
 * Manages stateful WebSocket connections to AssemblyAI's real-time transcription service.
 * This class abstracts the complexity of handling multiple, simultaneous audio streams.
 */
export class AssemblyAIStreamManager {
    private client: AssemblyAI;
    private activeTranscribers = new Map<string, any>(); // Using 'any' for now, will refine with the correct SDK type.

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
     */
    public async startStream(streamId: string, onTranscriptCallback: TranscriptCallback): Promise<void> {
        if (this.activeTranscribers.has(streamId)) {
            console.warn(`[AssemblyAIStreamManager] Stream ${streamId} is already active.`);
            return;
        }

        console.log(`[AssemblyAIStreamManager] Starting stream: ${streamId}`);
        
        const transcriber = this.client.realtime.transcriber({
            sampleRate: 16000,
        });

        // Event handler for final transcripts
        transcriber.on('transcript.final', (transcript) => {
            if (transcript.text) {
                console.log(`[AssemblyAIStreamManager] [${streamId}] Final transcript received: "${transcript.text}"`);
                onTranscriptCallback(streamId, transcript.text);
            }
        });

        // Event handler for errors
        transcriber.on('error', (error: Error) => {
            console.error(`[AssemblyAIStreamManager] [${streamId}] Error:`, error);
            // On error, we should probably stop and clean up the stream.
            this.stopStream(streamId);
        });

        // Event handler for the connection closing
        transcriber.on('close', (code: number, reason: string) => {
            console.log(`[AssemblyAIStreamManager] [${streamId}] Connection closed: ${code} ${reason}`);
            // Ensure cleanup happens even if closed unexpectedly.
            this.activeTranscribers.delete(streamId);
        });

        try {
            await transcriber.connect();
            this.activeTranscribers.set(streamId, transcriber);
            console.log(`[AssemblyAIStreamManager] [${streamId}] Successfully connected.`);
        } catch (error) {
            console.error(`[AssemblyAIStreamManager] [${streamId}] Failed to connect:`, error);
        }
    }

    /**
     * Forwards a raw audio chunk to the correct transcriber instance.
     * @param streamId The unique identifier for the audio stream.
     * @param audioChunk The raw audio data (Buffer).
     */
    public sendAudio(streamId: string, audioChunk: Buffer): void {
        const transcriber = this.activeTranscribers.get(streamId);
        if (!transcriber) {
            // This warning is sufficient, no need to throw an error for a missing stream.
            // console.warn(`[AssemblyAIStreamManager] Received audio for inactive stream: ${streamId}. Ignoring.`);
            return;
        }
        
        // The SDK's send method handles the raw audio buffer.
        transcriber.send(audioChunk);
    }

    /**
     * Gracefully closes the WebSocket connection for a specific stream and cleans up resources.
     * @param streamId The unique identifier for the audio stream.
     */
    public async stopStream(streamId: string): Promise<void> {
        const transcriber = this.activeTranscribers.get(streamId);
        if (!transcriber) {
            console.warn(`[AssemblyAIStreamManager] Attempted to stop an inactive stream: ${streamId}.`);
            return;
        }

        console.log(`[AssemblyAIStreamManager] Stopping stream: ${streamId}`);
        await transcriber.close();
        
        // The 'close' event handler will handle deleting the key from the map.
    }
} 