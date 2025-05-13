import { AccessToken, RoomServiceClient, type VideoGrant } from 'livekit-server-sdk';
import { config } from './worker.config';

export class LiveKitTokenManager {
  private streamId: string;
  private apiKey: string;
  private apiSecret: string;
  private livekitUrl: string;
  private roomServiceClient: RoomServiceClient;

  constructor(streamId: string) {
    this.streamId = streamId;
    if (!config.livekit.apiKey || !config.livekit.apiSecret || !config.livekit.url) {
      throw new Error('LiveKit API key, secret, or URL is not configured in worker.config.');
    }
    this.apiKey = config.livekit.apiKey;
    this.apiSecret = config.livekit.apiSecret;
    this.livekitUrl = config.livekit.url;
    this.roomServiceClient = new RoomServiceClient(this.livekitUrl, this.apiKey, this.apiSecret);
  }

  /**
   * Generates a Join Token for an entity (e.g., the worker or a dedicated publishing agent)
   * that intends to publish tracks to the specified room.
   */
  public async getPublishingToken(participantIdentity?: string): Promise<string> {
    const identity = participantIdentity || `amencast-worker-${this.streamId}`.slice(0, 64);
    
    console.log(`[${this.streamId}] Generating LiveKit publishing token for identity: ${identity}`);
    
    const at = new AccessToken(this.apiKey, this.apiSecret, {
      identity: identity,
      ttl: '1h', // Token valid for 1 hour
      // name: `Participant ${identity}` // Optional: Can add a display name for the participant
    });

    const grantOptions: VideoGrant = { // VideoGrant is used for audio, video, and screen share permissions
      room: this.streamId,
      roomJoin: true,
      canPublish: true,
      canPublishData: true, 
      canSubscribe: false, // Worker typically doesn't need to subscribe to other tracks
    };
    at.addGrant(grantOptions);

    return at.toJwt();
  }

  // Optional: Method to check if a room exists using RoomServiceClient
  public async roomExists(): Promise<boolean> {
    try {
      // listRooms with specific room name is a way to check existence
      const rooms = await this.roomServiceClient.listRooms([this.streamId]);
      return rooms.length > 0;
    } catch (error) {
      console.error(`[${this.streamId}] Error checking if LiveKit room exists:`, error);
      return false; // Assume not exists or error occurred
    }
  }
}