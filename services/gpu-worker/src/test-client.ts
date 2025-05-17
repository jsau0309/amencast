import { Room, RoomEvent } from '@livekit/rtc-node';
import { AccessToken } from 'livekit-server-sdk';
import { config } from './worker.config';

/**
 * Connects to a LiveKit room as a test client, sends a translation request, and handles room events.
 *
 * This function generates an access token, connects to a predefined room, publishes a test translation request as data, listens for incoming data and connection events, and gracefully handles shutdown and errors.
 *
 * @remark The function waits 30 seconds after sending the test request before disconnecting, allowing time to receive responses.
 */
async function main() {
  try {
    const roomName = 'amencast-translation-room';
    const clientIdentity = `test-client-${Date.now()}`;

    // Create access token for the test client
    const at = new AccessToken(config.livekit.apiKey, config.livekit.apiSecret, {
      identity: clientIdentity,
      name: 'Test Client'
    });

    at.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true
    });

    const token = at.toJwt();

    // Connect to the room
    console.log(`Connecting to room ${roomName} as ${clientIdentity}...`);
    const room = new Room();

    // Set up event handlers before connecting
    console.log('Setting up event handlers...');

    room.on(RoomEvent.Connected, () => {
      console.log('Connected event triggered');
      console.log('Room connection state:', room.connectionState);
      console.log('Participants in room:', Array.from(room.remoteParticipants.values()).map(p => p.identity));
      sendTestRequest();
    });

    room.on(RoomEvent.Disconnected, () => {
      console.log('Disconnected from room');
      process.exit(0);
    });

    room.on(RoomEvent.ConnectionStateChanged, (state) => {
      console.log('Connection state changed:', state);
    });

    room.on(RoomEvent.DataReceived, (payload: Uint8Array, participant) => {
      console.log('Data received from participant:', participant?.identity);
      const decoder = new TextDecoder();
      const data = JSON.parse(decoder.decode(payload));
      console.log('Received data type:', data.type);
      console.log('Full received data:', data);

      // Handle audio chunks if received
      if (data.type === 'audio_chunk') {
        console.log('Received audio chunk, size:', data.chunk.length);
      }
    });

    // Connect to the room
    console.log('Attempting to connect to room...');
    await room.connect(config.livekit.url, token, {
      autoSubscribe: true,
      dynacast: true
    });
    console.log('Connect call completed');

    // Function to send a test translation request
    async function sendTestRequest() {
      try {
        console.log('Preparing test request...');
        const testRequest = {
          type: 'translation_request',
          sourceText: 'Hello, this is a test message. Please translate this to Spanish.',
          sourceLanguage: 'English',
          targetLanguage: 'Spanish',
          requestId: `test-${Date.now()}`
        };

        console.log('Creating test request:', testRequest);
        const encoder = new TextEncoder();
        const payload = encoder.encode(JSON.stringify(testRequest));
        
        console.log('Room connection state before sending:', room.connectionState);
        console.log('Connected participants:', Array.from(room.remoteParticipants.values()).map(p => p.identity));
        console.log('Local participant state:', {
          sid: room.localParticipant?.sid,
          identity: room.localParticipant?.identity,
          metadata: room.localParticipant?.metadata
        });

        if (!room.localParticipant) {
          throw new Error('Local participant not available');
        }

        console.log('Publishing test request...');
        await room.localParticipant.publishData(payload, { reliable: true });
        console.log('Test request sent successfully');

        // Add immediate confirmation check
        console.log('Checking if data was published:', {
          connectionState: room.connectionState,
          participantCount: room.remoteParticipants.size
        });

        // Wait for 30 seconds to receive responses
        setTimeout(() => {
          console.log('Test timeout reached. Final room state:', {
            connectionState: room.connectionState,
            participants: Array.from(room.remoteParticipants.values()).map(p => p.identity),
            participantSid: room.localParticipant?.sid
          });
          console.log('Test completed, disconnecting...');
          room.disconnect();
        }, 30000);
      } catch (error) {
        console.error('Error sending test request:', error);
        // Wait a bit and try to disconnect
        setTimeout(() => {
          console.log('Disconnecting after error...');
          room.disconnect();
        }, 5000);
      }
    }

    // Handle shutdown
    process.on('SIGINT', async () => {
      console.log('Shutting down...');
      await room.disconnect();
      process.exit(0);
    });

  } catch (error) {
    console.error('Error in test client:', error);
    process.exit(1);
  }
}

// Run the test client
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});