import { config as loadEnv } from 'dotenv';
import path from 'path';

// Load environment variables from the correct path
loadEnv({ path: path.join(process.cwd(), 'services', 'tts-worker', '.env') });

const livekitUrl = process.env.LIVEKIT_URL;

if (!livekitUrl) {
    console.error("LIVEKIT_URL is not set in your .env file.");
    process.exit(1);
}

// The SDK tries to hit an http/https endpoint to discover the best region.
// We will simulate that by replacing wss:// with https:// and appending /rtc
const url = livekitUrl.replace('wss://', 'https://').replace('ws://', 'http://') + '/rtc';

console.log(`--- Testing connection to: ${url} ---`);

async function testConnection() {
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                "request": "get_regions"
            })
        });

        console.log(`Status Code: ${response.status}`);
        console.log('--- Response Headers ---');
        console.log(response.headers);
        console.log('------------------------');

        const responseBody = await response.text();
        console.log('--- Raw Response Body ---');
        console.log(responseBody);
        console.log('-------------------------');

        // Try to parse as JSON to see if we get the same error
        try {
            JSON.parse(responseBody);
            console.log('SUCCESS: Response body is valid JSON.');
        } catch (e) {
            console.error('ERROR: Failed to parse response body as JSON. The response is not what LiveKit expects.');
        }

    } catch (error) {
        console.error('A critical network error occurred:', error);
    }
}

testConnection(); 