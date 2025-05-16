import {
    Room,
    LocalAudioTrack,
    AudioSource,
    RoomEvent,
    AudioFrame,
    ConnectionState,
    TrackPublishOptions,
    RoomOptions,
  } from '@livekit/rtc-node';
  import { Lame } from 'node-lame';
  import { WaveFile } from 'wavefile';
  import { config } from './worker.config';
  
  const DEFAULT_CHANNELS = 1;
  const LIVEKIT_FRAME_DURATION_MS = 20; // 20ms audio frames
  
  export interface AudioPublishParameters {
    sampleRate: number;
    numChannels: number;
    samplesPerChannel: number;
  }
  
  export class LiveKitAudioPublisher {
    private room: Room | null = null;
    private audioSource: AudioSource | null = null;
    private audioTrack: LocalAudioTrack | null = null;
    private streamId: string;
    private participantIdentity: string;
    private publishParams: AudioPublishParameters | null = null;
  
    constructor(streamId: string) {
      this.streamId = streamId;
      this.participantIdentity = `amencast-audio-worker-${this.streamId}-${Date.now()}`.slice(0, 64);
    }
  
    
    private isConnected(): boolean {
        return this.room !== null && 
               (this.room.connectionState as unknown as string) === 'connected';
      }
    
  
    public async connect(token: string): Promise<void> {
      if (this.isConnected()) {
        console.log('[LiveKitAudioPublisher] Already connected to LiveKit room.');
        return;
      }
  
      this.room = new Room(); 
      
      this.room
        .on(RoomEvent.Connected, () => console.log(`[LiveKitAudioPublisher] EVENT: Room.event Connected to room: ${this.room?.name}`))
        .on(RoomEvent.Disconnected, (reason?: any) => console.log('[LiveKitAudioPublisher] EVENT: Room.event Disconnected from room', reason))
        .on(RoomEvent.Reconnecting, () => console.log('[LiveKitAudioPublisher] EVENT: Room.event Reconnecting to room'))
        .on(RoomEvent.Reconnected, () => console.log('[LiveKitAudioPublisher] EVENT: Room.event Reconnected to room'))
        .on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
          console.log(`[LiveKitAudioPublisher] EVENT: Room.event Connection state changed to: ${state}`);
          if ((state as unknown as string) === 'connected') {
            console.log('[LiveKitAudioPublisher] EVENT: Media connection established (ConnectionState is Connected).');
          }
        })
        .on(RoomEvent.ParticipantConnected, (participant) => {
            console.log(`[LiveKitAudioPublisher] EVENT: Room.event Participant connected: ${participant.identity}`);
        })
        .on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
            console.log(`[LiveKitAudioPublisher] EVENT: Room.event Track subscribed: ${track.sid} by ${participant.identity}`);
        });
  
      try {
        const connectOptions: RoomOptions = {
          autoSubscribe: false,
          dynacast: false,
        };
        console.log(`[LiveKitAudioPublisher] Attempting to connect to URL: ${config.livekit.url} with options:`, JSON.stringify(connectOptions));
        
        await this.room.connect(config.livekit.url, token, connectOptions);
        console.log(`[LiveKitAudioPublisher] Successfully connected to LiveKit room: ${this.room.name} as ${this.participantIdentity}`);
      } catch (error) {
        console.error('[LiveKitAudioPublisher] Connection error details:', error);
        try {
            // @ts-ignore 
            const pc = this.room?.engine?.publisher?.pc || this.room?.engine?.subscriber?.pc;
            if (pc) {
                console.log(`[LiveKitAudioPublisher] ICE gathering state: ${pc.iceGatheringState}`);
                console.log(`[LiveKitAudioPublisher] ICE connection state: ${pc.iceConnectionState}`);
                console.log(`[LiveKitAudioPublisher] Signaling state: ${pc.signalingState}`);
                console.log(`[LiveKitAudioPublisher] Connection state (from pc): ${pc.connectionState}`);
            } else {
                console.log('[LiveKitAudioPublisher] PeerConnection object not readily available for detailed ICE state logging.');
            }
        } catch (innerError) {
          console.error('[LiveKitAudioPublisher] Failed to get detailed PeerConnection states on error:', innerError);
        }
        this.room = null; 
        throw error;
      }
    }
  
    private async initializeAudioTrack(mp3Buffer: Buffer): Promise<void> {
      if (this.audioTrack) return;
  
      console.log('[LiveKitAudioPublisher] Initializing audio track. Decoding MP3...');
      const decoder = new Lame({
        output: 'buffer',
      }).setBuffer(mp3Buffer);
  
      try {
        const rawBuffer = await decoder.decode();
        const wavBuffer = new Uint8Array(rawBuffer as unknown as ArrayBuffer);
        const wav = new WaveFile(wavBuffer);

        const fmt: {
          sampleRate: number;
          numChannels: number;
          bitsPerSample: number;
        } = wav.fmt as any;
        
        const sampleRate = fmt.sampleRate;
        const numChannelsHeader = fmt.numChannels;
        const bitDepth = fmt.bitsPerSample;
  
        if (bitDepth !== 16) {
          console.warn(`[LiveKitAudioPublisher] WAV bit depth is ${bitDepth}, not 16. PCM data might not be Int16Array as expected.`);
        }
  
        if (numChannelsHeader !== DEFAULT_CHANNELS) {
          console.warn(`[LiveKitAudioPublisher] WAV has ${numChannelsHeader} channels. Will process as mono (${DEFAULT_CHANNELS}).`);
        }
  
        this.publishParams = {
          sampleRate: sampleRate,
          numChannels: DEFAULT_CHANNELS,
          samplesPerChannel: Math.floor(sampleRate * (LIVEKIT_FRAME_DURATION_MS / 1000)),
        };
  
        console.log(`[LiveKitAudioPublisher] WAV decoded. Format: ${sampleRate} Hz, ${numChannelsHeader} channels. LiveKit params: ${this.publishParams.sampleRate} Hz, ${this.publishParams.numChannels} ch, ${this.publishParams.samplesPerChannel} samples/frame.`);
  
        this.audioSource = new AudioSource(this.publishParams.sampleRate, this.publishParams.numChannels);
        this.audioTrack = LocalAudioTrack.createAudioTrack('amencast-spanish-audio', this.audioSource);
        
        if (!this.isConnected()) {
          throw new Error('LiveKit room is not connected. Cannot publish track.');
        }
  
        const publishOpts = new TrackPublishOptions();
        (publishOpts as any).source = 'microphone';
  
        if (!this.room || !this.room.localParticipant) {
          throw new Error('Local participant is not available on the room.');
        }
        await this.room.localParticipant.publishTrack(this.audioTrack, publishOpts);
        console.log('[LiveKitAudioPublisher] Audio track published.');
  
      } catch (error) {
        console.error('[LiveKitAudioPublisher] Error initializing audio track:', error);
        this.publishParams = null;
        this.audioSource = null;
        this.audioTrack = null;
        throw error;
      }
    }
  
    public async publishMp3Buffer(mp3Buffer: Buffer): Promise<void> {
      if (!this.isConnected()) {
        throw new Error('Not connected to LiveKit room. Cannot publish audio.');
      }
  
      if (!this.audioTrack || !this.audioSource || !this.publishParams) {
        await this.initializeAudioTrack(mp3Buffer);
        if (!this.audioTrack || !this.audioSource || !this.publishParams) { 
          throw new Error('Audio track failed to initialize after attempt.');
        }
      }
      
      const decoder = new Lame({ output: 'buffer' }).setBuffer(mp3Buffer);
      const rawBuffer = await decoder.decode();
      const wavBuffer = new Uint8Array(rawBuffer as unknown as ArrayBuffer);
      const wav = new WaveFile(wavBuffer);
      
      const fmt: {
        sampleRate: number;
        numChannels: number;
        bitsPerSample: number;
      } = wav.fmt as any;
  
      const currentSampleRate = fmt.sampleRate;
      if (currentSampleRate !== this.publishParams.sampleRate) {
        console.warn(`[LiveKitAudioPublisher] MP3 sample rate (${currentSampleRate}) differs from initialized track sample rate (${this.publishParams.sampleRate}). This could cause issues.`);
      }
  
      let pcmData: Int16Array;
      try {
        const rawSamples = (wav as any).getSamples();
        
        if (!rawSamples || typeof rawSamples !== 'object' || !('length' in rawSamples)) {
          throw new Error('Invalid PCM data from WAV file');
        }
        
        pcmData = new Int16Array(rawSamples.length);
        
        for (let i = 0; i < rawSamples.length; i++) {
          const sample = typeof rawSamples[i] === 'number' ? rawSamples[i] : 0;
          
          if (sample >= -1 && sample <= 1) {
            pcmData[i] = Math.max(-32768, Math.min(32767, Math.floor(sample * 32767)));
          } else {
            pcmData[i] = Math.max(-32768, Math.min(32767, Math.floor(sample)));
          }
        }
      } catch (error) {
        console.error('[LiveKitAudioPublisher] Error processing PCM data:', error);
        throw new Error('Failed to process PCM data from WAV file');
      }
  
      if (pcmData.length === 0) {
        console.warn('[LiveKitAudioPublisher] PCM data is empty after decoding WAV.');
        return; 
      }
  
      let offset = 0;
      const samplesPerFrameForTrack = this.publishParams.samplesPerChannel;
      const numChannelsForTrack = this.publishParams.numChannels;
      const totalSamplesInFullFrame = samplesPerFrameForTrack * numChannelsForTrack; 
  
      while (offset < pcmData.length) {
        const remainingSamplesInOutBuffer = pcmData.length - offset;
        let samplesToProcessThisFrame = Math.min(totalSamplesInFullFrame, remainingSamplesInOutBuffer);
        
        if ((samplesToProcessThisFrame % numChannelsForTrack !== 0) && (offset + samplesToProcessThisFrame < pcmData.length)) {
          samplesToProcessThisFrame = Math.floor(samplesToProcessThisFrame / numChannelsForTrack) * numChannelsForTrack;
        }
  
        if (samplesToProcessThisFrame === 0) break; 
  
        const frameInt16Samples = pcmData.subarray(offset, offset + samplesToProcessThisFrame);
        const samplesPerChannelInThisFrame = samplesToProcessThisFrame / numChannelsForTrack;
  
        if (samplesPerChannelInThisFrame <= 0 || !Number.isInteger(samplesPerChannelInThisFrame)) {
          console.warn(`[LiveKitAudioPublisher] Calculated invalid samplesPerChannelInThisFrame (${samplesPerChannelInThisFrame}). Original samples: ${samplesToProcessThisFrame}, Channels: ${numChannelsForTrack}. Skipping this frame.`);
          offset += samplesToProcessThisFrame;
          continue;
        }
  
        try {
          const frameData = new Int16Array(frameInt16Samples);
          
          const audioFrame = new AudioFrame(
            frameData,
            this.publishParams.sampleRate,
            numChannelsForTrack,
            samplesPerChannelInThisFrame
          );
  
          if (this.audioSource) {
            await this.audioSource.captureFrame(audioFrame);
          }
        } catch (frameError) {
          console.error('[LiveKitAudioPublisher] Error creating or capturing audio frame:', frameError);
        }
        
        offset += samplesToProcessThisFrame;
      }
    }
  
    public async disconnect(): Promise<void> {
      if (this.room) {
        console.log('[LiveKitAudioPublisher] Disconnecting from LiveKit room...');
        
        if (this.audioTrack) {
          try {
            const localParticipant = this.room.localParticipant;
            if (localParticipant) {
              if (this.audioTrack.sid) {
                try {
                  await localParticipant.unpublishTrack(this.audioTrack.sid);
                  console.log('[LiveKitAudioPublisher] Audio track unpublished by ID.');
                } catch (e) {
                  console.warn('[LiveKitAudioPublisher] Error unpublishing by track ID:', e);
                  
                  try {
                    await localParticipant.unpublishTrack(this.audioTrack as any);
                    console.log('[LiveKitAudioPublisher] Audio track unpublished by object reference.');
                  } catch (e2) {
                    console.error('[LiveKitAudioPublisher] Failed to unpublish track by any method:', e2);
                  }
                }
              }
            }
          } catch (unpublishError) {
            console.error('[LiveKitAudioPublisher] Error unpublishing track:', unpublishError);
          }
          
          try {
            const track = this.audioTrack as any;
            
            if (typeof track.stop === 'function') {
              track.stop();
              console.log('[LiveKitAudioPublisher] Audio track stopped.');
            } else if (typeof track.release === 'function') {
              track.release();
              console.log('[LiveKitAudioPublisher] Audio track released.');
            } else if (typeof track.dispose === 'function') {
              track.dispose();
              console.log('[LiveKitAudioPublisher] Audio track disposed.');
            } else {
              console.log('[LiveKitAudioPublisher] No track cleanup method found.');
            }
          } catch (cleanupError) {
            console.error('[LiveKitAudioPublisher] Track cleanup error:', cleanupError);
          }
        }
        
        try {
          await this.room.disconnect();
          console.log('[LiveKitAudioPublisher] Disconnected from LiveKit room.');
        } catch (disconnectError) {
          console.error('[LiveKitAudioPublisher] Error disconnecting from room:', disconnectError);
        }
        
        this.room = null;
        this.audioSource = null;
        this.audioTrack = null;
        this.publishParams = null;
      }
    }
  }