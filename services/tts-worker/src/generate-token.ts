import { AccessToken } from 'livekit-server-sdk';
import { config as loadEnv } from 'dotenv';
import path from 'path';

loadEnv({ path: path.join(process.cwd(), 'services', 'tts-worker', '.env') });

const apiKey = process.env.LIVEKIT_API_KEY;
const apiSecret = process.env.LIVEKIT_API_SECRET;

async function generateToken() {
    if (!apiKey || !apiSecret) {
        console.error("API Key or Secret is not configured. Check your .env file.");
        return;
    }

    const at = new AccessToken(apiKey, apiSecret, {
        identity: `connection-test-${Date.now()}`,
        name: 'Connection Tester',
        ttl: '10m', // Token is valid for 10 minutes
    });
    
    at.addGrant({ room: 'connection-test-room', roomJoin: true, canPublish: true, canSubscribe: true, roomCreate: true });

    const token = await at.toJwt();
    console.log('--- Your LiveKit Test Token ---');
    console.log(token);
    console.log('---------------------------------');
    console.log('Copy the token above and paste it into the LiveKit Connection Tester page.');
}

generateToken(); 