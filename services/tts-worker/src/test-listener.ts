import { Room, RoomEvent, RemoteTrack, RemoteTrackPublication, RemoteParticipant, TrackKind } from '@livekit/rtc-node';
import { AccessToken } from 'livekit-server-sdk';
import { config as loadEnv } from 'dotenv';
import path from 'path';

loadEnv({ path: path.join(process.cwd(), 'services', 'tts-worker', '.env') });

const livekitUrl = process.env.LIVEKIT_URL;
const apiKey = process.env.LIVEKIT_API_KEY;
const apiSecret = process.env.LIVEKIT_API_SECRET;
const streamId = process.argv[2] || 'test-stream';

if (!livekitUrl || !apiKey || !apiSecret) {
    console.error("LiveKit URL, API Key, or API Secret is not configured. Check your .env file.");
    process.exit(1);
}

console.log('--- Using LiveKit Config ---');
console.log('URL:', livekitUrl);
console.log('API Key:', apiKey ? `${apiKey.substring(0, 4)}...` : 'Not Found');
console.log('API Secret:', apiSecret ? '...loaded...' : 'Not Found');
console.log('--------------------------');

async function main() {
    const room = new Room();

    console.log('Connecting to LiveKit...');

    const token = new AccessToken(apiKey, apiSecret, {
        identity: `test-listener-${Date.now()}`,
        name: 'Test Listener',
    });
    token.addGrant({ room: streamId, roomJoin: true, canPublish: false, canSubscribe: true });

    room.on(RoomEvent.Disconnected, (reason) => {
        console.log('Listener: Disconnected from room:', reason);
        // If we disconnect for any reason, exit the script.
        process.exit(0);
    });

    room.on(RoomEvent.TrackSubscribed, (
        track: RemoteTrack,
        publication: RemoteTrackPublication,
        participant: RemoteParticipant
    ) => {
        console.log(`Subscribed to track: ${track.sid} from participant ${participant.identity}`);
        if (track.kind === TrackKind.KIND_AUDIO) {
            console.log('*** Successfully received audio track! ***');
            // In a real client, you would attach the track here to play it.
            // const element = track.attach();
            // document.body.appendChild(element);
            
            // For this test, we just confirm receipt and disconnect.
            setTimeout(() => room.disconnect(), 1000);
        }
    });

    try {
        if(livekitUrl){
            // @ts-ignore
            await room.connect(livekitUrl, token.toJwt());
            console.log(`Connected to room: ${streamId}. Waiting for audio track...`);
        } else {
            throw new Error("LIVEKIT_URL is not defined in your environment variables.");
        }
    } catch (error) {
        console.error('Failed to connect to LiveKit room:', error);
        process.exit(1);
    }

    // Timeout if no track is received after a while
    setTimeout(() => {
        console.error('Test timed out. No audio track received.');
        room.disconnect();
        process.exit(1);
    }, 30000); // 30 seconds
}

main().catch(error => {
    console.error(error);
    process.exit(1);
}); 