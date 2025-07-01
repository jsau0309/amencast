import { Room, RoomEvent } from '@livekit/rtc-node';
import { AccessToken } from 'livekit-server-sdk';
import { config as loadEnv } from 'dotenv';
import path from 'path';

loadEnv({ path: path.join(process.cwd(), 'services', 'tts-worker', '.env') });

const livekitUrl = process.env.LIVEKIT_URL;
const apiKey = process.env.LIVEKIT_API_KEY;
const apiSecret = process.env.LIVEKIT_API_SECRET;

async function main() {
    if (!livekitUrl || !apiKey || !apiSecret) {
        console.error("LiveKit URL, API Key, or API Secret is not configured. Check your .env file.");
        return;
    }

    console.log('--- Using LiveKit Config ---');
    console.log('URL:', livekitUrl);
    console.log('API Key:', apiKey ? `${apiKey.substring(0, 4)}...` : 'Not Found');
    console.log('--------------------------');

    const room = new Room();

    room.on(RoomEvent.Connected, () => {
        console.log('✅ SUCCESS: Connected to LiveKit room successfully!');
        room.disconnect();
    });

    room.on(RoomEvent.Disconnected, () => {
        console.log('Disconnected from room.');
        process.exit(0);
    });

    const token = new AccessToken(apiKey, apiSecret, {
        identity: `simple-test-${Date.now()}`,
    });
    token.addGrant({ room: 'test-connection-room', roomJoin: true, roomCreate: true });

    try {
        console.log('Attempting to connect with minimal script...');
        await room.connect(livekitUrl, await token.toJwt());
    } catch (error) {
        console.error('❌ FAILED: The minimal connection test failed with the same error.');
        console.error(error);
        process.exit(1);
    }
}

main(); 