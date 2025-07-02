import { RoomServiceClient, AccessToken } from 'livekit-server-sdk';
import { Room, RoomEvent, DataPacketKind, LocalParticipant, RemoteParticipant, RoomOptions } from '@livekit/rtc-node';
import { OpenAI } from 'openai';
import { ElevenLabsClient } from './elevenlabsClient';
import { config } from './worker.config';

// This interface is kept for documentation but not used in the actual implementation
interface DataOptions {
  reliability: 'reliable' | 'lossy';
}

interface TranslationRequest {
  type: 'translation_request';
  sourceText: string;
  sourceLanguage: string;
  targetLanguage: string;
  requestId?: string;
}

interface TranslationStatus {
  type: 'status_update';
  status: 'processing' | 'translating' | 'synthesizing' | 'streaming' | 'completed' | 'error';
  message?: string;
  requestId?: string;
  data?: any;
}

export class DirectWorker {
  private liveKitConfig: {
    url: string;
    apiKey: string;
    apiSecret: string;
  };
  private roomService: RoomServiceClient;
  private openai: OpenAI;
  private elevenLabs: ElevenLabsClient;
  private currentRoom: Room | null = null;
  private localParticipant: LocalParticipant | null = null;

  constructor() {
    // Initialize configurations
    this.liveKitConfig = {
      url: config.livekit.url,
      apiKey: config.livekit.apiKey,
      apiSecret: config.livekit.apiSecret,
    };

    // Initialize services
    this.roomService = new RoomServiceClient(
      this.liveKitConfig.url,
      this.liveKitConfig.apiKey,
      this.liveKitConfig.apiSecret
    );

    this.openai = new OpenAI({
      apiKey: config.openai.apiKey,
    });

    this.elevenLabs = new ElevenLabsClient(config.elevenlabs.apiKey);
  }

  async connect(roomName: string, workerIdentity: string = `gpu-worker-${Date.now()}`): Promise<void> {
    try {
      if (this.isConnected()) {
        console.log(`Already connected to room: ${this.currentRoom?.name}`);
        return;
      }

      console.log(`Attempting to connect to room: ${roomName} as ${workerIdentity}`);
      
      // Create a token for the worker using RoomServiceClient
      const at = new AccessToken(this.liveKitConfig.apiKey, this.liveKitConfig.apiSecret, {
        identity: workerIdentity,
        name: `GPU Worker ${workerIdentity}`,
        ttl: 24 * 60 * 60, // 24 hours in seconds
      });

      at.addGrant({
        room: roomName,
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true
      });

      const token = await at.toJwt();

      // Create and configure the room
      this.currentRoom = new Room();

      // Set up room event handlers
      this.setupRoomHandlers();

      // Connect to the room with required options
      const roomOptions: RoomOptions = {
        autoSubscribe: true,
        dynacast: true, // Enable dynamic video quality adjustment
      };

      await this.currentRoom.connect(this.liveKitConfig.url, token, roomOptions);
      
      // Get local participant after connection
      const localParticipant = this.currentRoom.localParticipant;
      if (!localParticipant) {
        throw new Error('Failed to get local participant after connection');
      }
      this.localParticipant = localParticipant;

      console.log(`Connected to room: ${roomName} as ${workerIdentity}`);
      console.log(`Local participant SID: ${this.localParticipant.sid}`);

    } catch (error) {
      console.error('Failed to connect to room:', error);
      this.currentRoom = null;
      this.localParticipant = null;
      throw error;
    }
  }

  private setupRoomHandlers(): void {
    if (!this.currentRoom) return;

    this.currentRoom
      .on(RoomEvent.Connected, () => {
        console.log('Connected to room:', this.currentRoom?.name);
      })
      .on(RoomEvent.Disconnected, () => {
        console.log('Disconnected from room');
        this.currentRoom = null;
        this.localParticipant = null;
      })
      .on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
        console.log('Participant connected:', participant.identity);
      })
      .on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
        console.log('Participant disconnected:', participant.identity);
      })
      .on(RoomEvent.DataReceived, async (payload: Uint8Array, participant?: RemoteParticipant) => {
        try {
          const decoder = new TextDecoder();
          const data = JSON.parse(decoder.decode(payload));
          console.log(`Received data from ${participant?.identity}:`, data);
          
          if (data.type === 'translation_request') {
            await this.handleTranslationRequest(data, participant);
          }
        } catch (error) {
          console.error('Error handling received data:', error);
          if (participant) {
            await this.sendError(participant, 'Failed to process request');
          }
        }
      });
  }

  private isConnected(): boolean {
    return this.currentRoom !== null && this.currentRoom.isConnected;
  }

  private async sendData(data: any, participant: RemoteParticipant): Promise<void> {
    if (!this.localParticipant || !this.isConnected()) {
      throw new Error('Not connected to room');
    }

    try {
      const encoder = new TextEncoder();
      const payload = encoder.encode(JSON.stringify(data));
      // @ts-ignore - Bypass type checking for this line since we know the API expects 'reliable'
      await this.localParticipant.publishData(payload, 'reliable');
    } catch (error) {
      console.error('Error sending data:', error);
      throw error;
    }
  }

  private async sendError(participant: RemoteParticipant, message: string): Promise<void> {
    await this.sendData({
      type: 'error',
      message,
      timestamp: Date.now()
    }, participant);
  }

  async disconnect(): Promise<void> {
    if (this.currentRoom) {
      await this.currentRoom.disconnect();
      this.currentRoom = null;
      this.localParticipant = null;
      console.log('Disconnected from room');
    }
  }

  private async handleTranslationRequest(request: TranslationRequest, participant?: RemoteParticipant): Promise<void> {
    const requestId = request.requestId || `req-${Date.now()}`;
    console.log(`Processing translation request ${requestId}:`, request);

    try {
      // Send initial status
      await this.sendStatus(participant, {
        type: 'status_update',
        status: 'processing',
        message: 'Starting translation process',
        requestId
      });

      // 1. Translate text using OpenAI
      await this.sendStatus(participant, {
        type: 'status_update',
        status: 'translating',
        message: 'Translating text',
        requestId
      });

      const translationResponse = await this.openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: `You are an expert translator. Translate the following ${request.sourceLanguage} text accurately and naturally into ${request.targetLanguage}. Provide only the translated text itself, without any additional explanations or quotation marks.`
          },
          {
            role: "user",
            content: request.sourceText
          }
        ]
      });

      // Check if we have any choices
      if (!translationResponse.choices?.length) {
        throw new Error("Translation failed: No choices returned");
      }

      // Get the first choice
      const firstChoice = translationResponse.choices[0];
      if (!firstChoice) {
        throw new Error("Translation failed: First choice is undefined");
      }

      // Get and validate the translated text
      const translatedText = firstChoice.message?.content?.trim();
      if (!translatedText) {
        throw new Error("Translation failed: No content returned");
      }

      console.log(`Request ${requestId}: Translated text:`, translatedText);

      // 2. Convert to speech using ElevenLabs
      await this.sendStatus(participant, {
        type: 'status_update',
        status: 'synthesizing',
        message: 'Converting to speech',
        requestId,
        data: { translatedText }
      });

      const audioStream = await this.elevenLabs.streamTTS(translatedText, {
        voice_id: config.elevenlabs.voiceId,
        model_id: config.elevenlabs.modelId
      });

      // 3. Stream audio back through LiveKit
      await this.sendStatus(participant, {
        type: 'status_update',
        status: 'streaming',
        message: 'Streaming audio',
        requestId
      });

      // For now, we'll send the audio data in chunks
      for await (const chunk of audioStream) {
        await this.sendData({
          type: 'audio_chunk',
          requestId,
          chunk: Buffer.from(chunk).toString('base64')
        }, participant!);
      }

      // Send completion status
      await this.sendStatus(participant, {
        type: 'status_update',
        status: 'completed',
        message: 'Translation completed',
        requestId,
        data: { translatedText }
      });

    } catch (error) {
      console.error(`Error processing translation request ${requestId}:`, error);
      await this.sendStatus(participant, {
        type: 'status_update',
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        requestId
      });
    }
  }

  private async sendStatus(participant: RemoteParticipant | undefined, status: TranslationStatus): Promise<void> {
    if (participant) {
      await this.sendData(status, participant);
    }
  }
}