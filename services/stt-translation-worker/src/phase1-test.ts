import { Redis, RedisOptions } from 'ioredis';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { config } from './config';

const redisOptions: RedisOptions = {
    host: config.redis.host,
    port: config.redis.port,
    username: 'default',
    lazyConnect: true,
};
if (config.redis.password) redisOptions.password = config.redis.password;
if (config.redis.tlsEnabled) redisOptions.tls = {};

const publisher = new Redis(redisOptions);
const subscriber = new Redis(redisOptions);

const streamId = uuidv4();
const targetLanguage = 'es'; // Spanish
const audioFilePath = path.join(__dirname, 'test-audio.wav');
const chunkSize = 4096; // Send 4KB chunks

async function runTest() {
    console.log(`[Phase1-Test] Starting test for streamId: ${streamId}`);
    let receivedMessageCount = 0;

    try {
        await publisher.connect();
        await subscriber.connect();
        console.log('[Phase1-Test] Redis clients connected.');

        const translatedTextChannel = `translated_text:${streamId}`;

        await subscriber.subscribe(translatedTextChannel);
        console.log(`[Phase1-Test] Subscribed to ${translatedTextChannel}`);

        subscriber.on('message', (channel, message) => {
            if (channel === translatedTextChannel) {
                receivedMessageCount++;
                console.log(`[Phase1-Test] Received translated text #${receivedMessageCount}: "${message}"`);
            }
        });

        // 1. Send START command
        const startCommand = {
            action: 'start',
            streamId: streamId,
            targetLanguage: targetLanguage,
        };
        await publisher.publish('stream_control', JSON.stringify(startCommand));
        console.log('[Phase1-Test] Sent START command.');

        // Allow some time for the worker to initialize
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 2. Stream audio chunks
        console.log(`[Phase1-Test] Streaming audio file: ${audioFilePath}`);
        const audioStream = fs.createReadStream(audioFilePath, { highWaterMark: chunkSize });
        const audioChunkChannel = `audio_chunks:${streamId}`;
        let chunkCount = 0;

        for await (const chunk of audioStream) {
            await publisher.publish(audioChunkChannel, chunk as Buffer);
            chunkCount++;
            // Small delay to simulate real-time streaming
            await new Promise(resolve => setTimeout(resolve, 100)); 
        }
        console.log(`[Phase1-Test] Finished streaming ${chunkCount} audio chunks.`);

        // 3. Wait to receive translations
        console.log('[Phase1-Test] Waiting for 20 seconds to receive all translations...');
        await new Promise(resolve => setTimeout(resolve, 20000));

        // 4. Send STOP command
        const stopCommand = {
            action: 'stop',
            streamId: streamId,
        };
        await publisher.publish('stream_control', JSON.stringify(stopCommand));
        console.log('[Phase1-Test] Sent STOP command.');
        
        // Wait a moment for final processing
        await new Promise(resolve => setTimeout(resolve, 2000));

    } catch (error) {
        console.error('[Phase1-Test] An error occurred:', error);
    } finally {
        console.log('[Phase1-Test] Test finished.');
        if (receivedMessageCount > 0) {
            console.log(`[SUCCESS] Received ${receivedMessageCount} translated text messages.`);
        } else {
            console.error('[FAILURE] Did not receive any translated text messages.');
        }

        await subscriber.quit();
        await publisher.quit();
        console.log('[Phase1-Test] Redis clients disconnected.');
        process.exit(receivedMessageCount > 0 ? 0 : 1);
    }
}

runTest(); 