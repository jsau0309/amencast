import { io, Socket } from "socket.io-client";

class AudioSocketManager {
  private static instance: AudioSocketManager;
  private socket: Socket;
  private audioContext: AudioContext | null = null;
  private audioQueue: AudioBuffer[] = [];
  private isPlaying = false;
  private currentStreamId: string | null = null;
  private onAudioChunk: ((chunk: ArrayBuffer) => void) | null = null;
  private onCompletion: ((error?: Error) => void) | null = null;


  private constructor() {
    const SOCKET_SERVER_URL = process.env.NEXT_PUBLIC_WEBSOCKET_URL || "http://localhost:3001";
    
    this.socket = io(SOCKET_SERVER_URL, {
      autoConnect: false,
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
      transports: ["websocket"],
    });

    this.setupEventListeners();
  }

  public static getInstance(): AudioSocketManager {
    if (!AudioSocketManager.instance) {
      AudioSocketManager.instance = new AudioSocketManager();
    }
    return AudioSocketManager.instance;
  }

  private setupEventListeners(): void {
    this.socket.on("connect", () => {
      console.log(`✅ [AudioSocket] Connected. Socket ID: ${this.socket.id}`);
      // If we were in the middle of a stream, re-join the room upon reconnection
      if (this.currentStreamId) {
        this.socket.emit('join-audio-stream', this.currentStreamId);
      }
    });

    this.socket.on("disconnect", (reason: string) => {
      console.log(`❌ [AudioSocket] Disconnected. Reason: ${reason}`);
    });

    this.socket.on("connect_error", (error: Error) => {
      console.error("❌ [AudioSocket] Connection Error:", error);
      if(this.onCompletion) {
        this.onCompletion(error);
      }
    });

    this.socket.on("audio_chunk", (data: { streamId: string; audioData: ArrayBuffer; }) => {
      if (data.streamId === this.currentStreamId && this.onAudioChunk) {
        this.onAudioChunk(data.audioData);
      }
    });

    this.socket.on("translation_completed", (data: { streamId: string; }) => {
        if (data.streamId === this.currentStreamId && this.onCompletion) {
            this.onCompletion();
        }
    });
  }

  public startAudioStream(streamId: string, onAudioChunk: (chunk: ArrayBuffer) => void, onCompletion: (error?: Error) => void): void {
    console.log(`🎵 [AudioSocket] Starting audio stream: ${streamId}`);
    this.currentStreamId = streamId;
    this.onAudioChunk = onAudioChunk;
    this.onCompletion = onCompletion;

    if(!this.socket.connected) {
        this.socket.connect();
    } else {
        // If already connected, immediately join the room
        this.socket.emit('join-audio-stream', streamId);
    }
  }

  public stopAudioStream(streamId: string): void {
    if (this.currentStreamId === streamId) {
      console.log(`🛑 [AudioSocket] Stopping audio stream: ${this.currentStreamId}`);
      this.socket.emit('leave-audio-stream', this.currentStreamId);
      this.currentStreamId = null;
      this.onAudioChunk = null;
      this.onCompletion = null;
    }
  }

  public getSocket(): Socket {
    return this.socket;
  }
}

export const audioSocketManager = AudioSocketManager.getInstance(); 