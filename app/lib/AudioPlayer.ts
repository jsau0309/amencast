/**
 * A class to handle seamless playback of a stream of raw audio chunks.
 * It uses the Web Audio API to decode and schedule audio buffers for playback,
 * ensuring continuous audio by managing a queue and pre-scheduling chunks.
 */
export class AudioPlayer {
    private audioContext: AudioContext | null = null;
    private bufferQueue: ArrayBuffer[] = [];
    private nextChunkTime: number = 0;
    private isPlaying: boolean = false;
    private isProcessing: boolean = false; // A lock to prevent concurrent processing of the queue
    private onPlaybackStateChange: (isPlaying: boolean) => void;
    private hasPlaybackStarted: boolean = false;
    private initialBufferThreshold: number = 2;

    constructor(options: { onPlaybackStateChange: (isPlaying: boolean) => void }) {
        this.onPlaybackStateChange = options.onPlaybackStateChange;
    }

    private _createWavHeader(dataLength: number): ArrayBuffer {
        const sampleRate = 16000;
        const numChannels = 1;
        const bitsPerSample = 32;
        const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
        const blockAlign = numChannels * (bitsPerSample / 8);
        const buffer = new ArrayBuffer(44);
        const view = new DataView(buffer);
        const writeString = (offset: number, str: string) => {
            for (let i = 0; i < str.length; i++) {
                view.setUint8(offset + i, str.charCodeAt(i));
            }
        };
        writeString(0, 'RIFF');
        view.setUint32(4, 36 + dataLength, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 3, true);
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, byteRate, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, bitsPerSample, true);
        writeString(36, 'data');
        view.setUint32(40, dataLength, true);
        return buffer;
    }

    private initAudioContext() {
        if (typeof window !== 'undefined') {
            if (!this.audioContext || this.audioContext.state === 'closed') {
                this.audioContext = new AudioContext();
                this.nextChunkTime = this.audioContext.currentTime;
                console.log("AudioContext initialized or re-initialized.");
            }
        }
    }

    /**
     * Adds a raw audio chunk to the playback queue.
     * @param {ArrayBuffer} chunk - The raw audio data (e.g., from a WebSocket).
     */
    addChunk(chunk: ArrayBuffer) {
        this.initAudioContext();
        this.bufferQueue.push(chunk);
        if (this.isPlaying && !this.isProcessing && this.bufferQueue.length >= this.initialBufferThreshold) {
            this.processQueue();
        }
    }

    /**
     * Starts or resumes playback of the audio queue.
     */
    play() {
        this.initAudioContext();
        if (this.isPlaying || !this.audioContext) return;

        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume().then(() => {
                console.log("AudioContext resumed successfully.");
                this.isPlaying = true;
                this.onPlaybackStateChange(true);
                if (!this.isProcessing && this.bufferQueue.length >= this.initialBufferThreshold) {
                    this.processQueue();
                }
            }).catch(e => console.error("Error resuming AudioContext:", e));
        } else {
            this.isPlaying = true;
            this.onPlaybackStateChange(true);
            if (!this.isProcessing && this.bufferQueue.length >= this.initialBufferThreshold) {
                this.processQueue();
            }
        }
    }

    /**
     * Pauses playback.
     */
    pause() {
        if (!this.isPlaying) return;
        this.isPlaying = false;
        this.isProcessing = false;
        this.bufferQueue = [];
        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close().then(() => {
                this.audioContext = null;
            });
        }
        this.hasPlaybackStarted = false;
        this.onPlaybackStateChange(false);
        console.log("AudioPlayer: Playback paused.");
    }
    
    /**
     * Stops playback and clears the entire queue and resets the audio context.
     */
    stop() {
        this.isPlaying = false;
        this.isProcessing = false;
        this.bufferQueue = [];
        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close().then(() => {
                this.audioContext = null;
            });
        }
        this.hasPlaybackStarted = false;
        this.onPlaybackStateChange(false);
        console.log("AudioPlayer: Playback stopped and queue cleared.");
    }

    /**
     * Processes the queue of audio chunks.
     * It decodes and schedules the next chunk for playback.
     * This function is self-recursive as long as there are chunks in the queue and playback is active.
     */
    private async processQueue() {
        if (!this.isPlaying || this.isProcessing || this.bufferQueue.length === 0 || !this.audioContext) {
            return;
        }
        this.isProcessing = true;
        const chunk = this.bufferQueue.shift();
        if (!chunk) {
            this.isProcessing = false;
            return;
        }

        if (!this.hasPlaybackStarted) {
            this.hasPlaybackStarted = true;
        }

        try {
            const header = this._createWavHeader(chunk.byteLength);
            const wavBlob = new Blob([header, chunk]);
            const wavArrayBuffer = await wavBlob.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(wavArrayBuffer);
            const source = this.audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(this.audioContext.destination);
            const scheduledTime = Math.max(this.nextChunkTime, this.audioContext.currentTime);
            source.start(scheduledTime);
            this.nextChunkTime = scheduledTime + audioBuffer.duration;
        } catch (error) {
            console.error("Error decoding or playing audio chunk:", error);
        } finally {
            this.isProcessing = false;
            if(this.isPlaying && this.bufferQueue.length > 0) {
                setTimeout(() => this.processQueue(), 0);
            }
        }
    }
} 