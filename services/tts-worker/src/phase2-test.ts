import { Redis, RedisOptions } from 'ioredis';
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
const targetLanguage = 'es';
const testSentences = [
    "Hola, este es un mensaje de prueba.",
    "Esperamos que la síntesis de audio funcione correctamente.",
    "Esta es la frase final."
];

async function runTest() {
    console.log(`[Phase2-Test] Starting test for streamId: ${streamId}`);
    let receivedAudioChunks = 0;

    try {
        await publisher.connect();
        await subscriber.connect();
        console.log('[Phase2-Test] Redis clients connected.');

        const translatedAudioChannel = `translated_audio:${streamId}`;
        await subscriber.subscribe(translatedAudioChannel);
        console.log(`[Phase2-Test] Subscribed to ${translatedAudioChannel}`);

        subscriber.on('messageBuffer', (channel, message) => {
            if (channel.toString() === translatedAudioChannel) {
                receivedAudioChunks++;
                console.log(`[Phase2-Test] Received audio chunk #${receivedAudioChunks} of size ${message.length}`);
            }
        });

        // 1. Send START command to get the tts-worker ready
        const startCommand = {
            action: 'start',
            streamId: streamId,
            targetLanguage: targetLanguage,
        };
        await publisher.publish('stream_control', JSON.stringify(startCommand));
        console.log('[Phase2-Test] Sent START command.');
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for worker to init

        // 2. Publish translated text sentences
        const translatedTextChannel = `translated_text:${streamId}`;
        for (const sentence of testSentences) {
            console.log(`[Phase2-Test] Publishing text: "${sentence}"`);
            await publisher.publish(translatedTextChannel, sentence);
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait between sentences
        }

        // 3. Wait to receive audio
        console.log('[Phase2-Test] Waiting for 10 seconds to receive all audio chunks...');
        await new Promise(resolve => setTimeout(resolve, 10000));

        // 4. Send STOP command
        const stopCommand = { action: 'stop', streamId: streamId };
        await publisher.publish('stream_control', JSON.stringify(stopCommand));
        console.log('[Phase2-Test] Sent STOP command.');
        await new Promise(resolve => setTimeout(resolve, 2000));

    } catch (error) {
        console.error('[Phase2-Test] An error occurred:', error);
    } finally {
        console.log('[Phase2-Test] Test finished.');
        if (receivedAudioChunks > 0) {
            console.log(`[SUCCESS] Received ${receivedAudioChunks} audio chunks.`);
        } else {
            console.error('[FAILURE] Did not receive any audio chunks.');
        }

        await subscriber.quit();
        await publisher.quit();
        console.log('[Phase2-Test] Redis clients disconnected.');
        process.exit(receivedAudioChunks > 0 ? 0 : 1);
    }
}

runTest(); 